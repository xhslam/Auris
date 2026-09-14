"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  getNiaCompanionHostBridge,
  type NiaCompanionConversationDetail as ConversationDetail,
  type NiaCompanionConversationSummary as Conversation,
  type NiaCompanionSearchHit as SearchHit,
  type NiaCompanionToolUse as ToolUse,
} from "@/features/nia/nia-companion-bridge";

function startOfLocalDay(value: string | number) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function monthIndex(value: string | number) {
  const date = new Date(value);
  return date.getFullYear() * 12 + date.getMonth();
}

function fromMonthIndex(value: number) {
  return { year: Math.floor(value / 12), month: value % 12 };
}

function clock(value: string, withSeconds = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    hourCycle: "h23",
    hour12: false,
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  });
}

function durationLabel(startedAt: string, endedAt?: string | null) {
  if (endedAt === undefined) return "时长未知";
  if (endedAt === null) return "进行中";
  const span = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(span) || span < 0) return "时长未知";
  const minutes = Math.max(1, Math.round(span / 60_000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString("zh-CN", { month: "long", year: "numeric" });
}

function dayHeading(value: number) {
  return new Date(value).toLocaleDateString("zh-CN", { day: "numeric", month: "long", weekday: "long" });
}

function daysInMonth(year: number, month: number) {
  return Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => ({
    day: index + 1,
    value: new Date(year, month, index + 1).getTime(),
  }));
}

function openingLabel(conversation: Conversation) {
  if (conversation.subject?.trim()) return conversation.subject.trim();
  if (conversation.opening?.trim()) return `“${conversation.opening.trim()}”`;
  return "这段对话没有留下可显示的开场语";
}

function uniqueToolSummary(tools: readonly ToolUse[]) {
  const counts = new Map<string, number>();
  for (const tool of tools) counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ count, name }));
}

export function NiaConversationArchive({
  initialConversationId = null,
  onClose,
}: {
  initialConversationId?: string | null;
  onClose: () => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [detail, setDetail] = useState<ConversationDetail>({ tools: [], turns: [] });
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [month, setMonth] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchReady, setSearchReady] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [detailLoading, setDetailLoading] = useState(false);
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
  const detailRequest = useRef(0);
  const bridge = typeof window === "undefined" ? null : getNiaCompanionHostBridge(window);

  useEffect(() => {
    if (!bridge) {
      setStatus("unavailable");
      return;
    }
    let active = true;
    void bridge.invoke("conversations").then((value) => {
      if (!active) return;
      const next = Array.isArray(value) ? value : [];
      setConversations(next);
      const initialConversation = initialConversationId
        ? next.find((item) => item.id === initialConversationId) ?? null
        : null;
      const today = startOfLocalDay(Date.now());
      const todayHasConversation = next.some((item) => startOfLocalDay(item.startedAt) === today);
      const openingDay = initialConversation
        ? startOfLocalDay(initialConversation.startedAt)
        : todayHasConversation ? today : next[0] ? startOfLocalDay(next[0].startedAt) : today;
      setSelectedDay(openingDay);
      const openingMonth = new Date(openingDay);
      setMonth({ year: openingMonth.getFullYear(), month: openingMonth.getMonth() });
      setStatus("ready");
      if (initialConversation) {
        const request = detailRequest.current + 1;
        detailRequest.current = request;
        setSelectedConversation(initialConversation);
        setDetailLoading(true);
        void bridge.invoke("conversation-detail", { conversationId: initialConversation.id }).then((detailValue) => {
          if (!active || detailRequest.current !== request) return;
          const detailResult = detailValue && typeof detailValue === "object" ? detailValue : { tools: [], turns: [] };
          setDetail({
            tools: Array.isArray(detailResult.tools) ? detailResult.tools : [],
            turns: Array.isArray(detailResult.turns) ? detailResult.turns : [],
          });
        }).catch(() => {
          if (active && detailRequest.current === request) setDetail({ tools: [], turns: [] });
        }).finally(() => {
          if (active && detailRequest.current === request) setDetailLoading(false);
        });
      }
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [bridge, initialConversationId]);

  useEffect(() => {
    const term = query.trim();
    setSearchReady(false);
    if (!term || !bridge) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void bridge.invoke("conversation-search", { query: term }).then((value) => {
        setHits(Array.isArray(value) ? value : []);
        setSearchReady(true);
      }).catch(() => {
        setHits([]);
        setSearchReady(true);
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [bridge, query]);

  const dayCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const conversation of conversations) {
      const day = startOfLocalDay(conversation.startedAt);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
  }, [conversations]);

  const months = useMemo(() => [...new Set(conversations.map((item) => monthIndex(item.startedAt)))].sort((a, b) => a - b), [conversations]);
  const currentMonthIndex = month.year * 12 + month.month;
  const previousMonth = [...months].reverse().find((value) => value < currentMonthIndex) ?? null;
  const nextMonth = months.find((value) => value > currentMonthIndex) ?? null;
  const visibleConversations = useMemo(() => conversations.filter((item) => selectedDay !== null && startOfLocalDay(item.startedAt) === selectedDay), [conversations, selectedDay]);
  const monthConversationCount = conversations.filter((item) => monthIndex(item.startedAt) === currentMonthIndex).length;
  const toolSummary = useMemo(() => uniqueToolSummary(detail.tools), [detail.tools]);
  const interruptions = detail.turns.filter((turn) => turn.speaker === "nia" && Boolean(turn.cut)).length;

  const chooseConversation = (conversation: Conversation) => {
    if (!bridge) return;
    const request = detailRequest.current + 1;
    detailRequest.current = request;
    setSelectedConversation(conversation);
    setDetail({ tools: [], turns: [] });
    setDetailLoading(true);
    void bridge.invoke("conversation-detail", { conversationId: conversation.id }).then((value) => {
      if (detailRequest.current !== request) return;
      const next = value && typeof value === "object" ? value as Partial<ConversationDetail> : {};
      setDetail({ tools: Array.isArray(next.tools) ? next.tools : [], turns: Array.isArray(next.turns) ? next.turns : [] });
    }).catch(() => {
      if (detailRequest.current === request) setDetail({ tools: [], turns: [] });
    }).finally(() => {
      if (detailRequest.current === request) setDetailLoading(false);
    });
  };

  const chooseHit = (hit: SearchHit) => {
    const found = conversations.find((item) => item.id === hit.conversationId) ?? {
      id: hit.conversationId,
      opening: hit.text,
      startedAt: hit.startedAt,
      subject: hit.subject ?? null,
    };
    const day = startOfLocalDay(hit.startedAt);
    const date = new Date(day);
    setSelectedDay(day);
    setMonth({ year: date.getFullYear(), month: date.getMonth() });
    chooseConversation(found);
  };

  return (
    <section aria-label="Nia 会话归档" className="nia-archive">
      <header className="nia-archive__masthead">
        <div className="nia-archive__title">
          <button aria-label="返回 Nia" onClick={onClose} type="button">‹</button>
          <div><span>本机归档 · SQLITE</span><h1>会话记录</h1><p>只保存真正发生过的对话；一次无人说话的唤醒不会留下空记录。</p></div>
        </div>
        <label className="nia-archive__search"><span aria-hidden="true">⌕</span><input aria-label="搜索全部 Nia 对话" onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Nia 和你说过的全部内容" type="search" value={query} /></label>
      </header>

      <div className="nia-archive__calendar">
        <div className="nia-archive__month-nav">
          <button aria-label="上一个有对话的月份" disabled={previousMonth === null} onClick={() => previousMonth !== null && setMonth(fromMonthIndex(previousMonth))} type="button">‹</button>
          <strong>{monthLabel(month.year, month.month)}</strong>
          <button aria-label="下一个有对话的月份" disabled={nextMonth === null} onClick={() => nextMonth !== null && setMonth(fromMonthIndex(nextMonth))} type="button">›</button>
        </div>
        <div className="nia-archive__days" role="list" style={{ "--nia-archive-days": daysInMonth(month.year, month.month).length } as CSSProperties}>
          {daysInMonth(month.year, month.month).map((day) => {
            const count = dayCounts.get(day.value) ?? 0;
            return <button aria-current={day.value === selectedDay ? "date" : undefined} aria-label={`${month.month + 1}月${day.day}日，${count} 次对话`} disabled={count === 0} key={day.value} onClick={() => { setSelectedDay(day.value); setSelectedConversation(null); setDetail({ tools: [], turns: [] }); }} role="listitem" type="button"><span>{day.day}</span>{count > 0 ? <i /> : null}</button>;
          })}
        </div>
      </div>

      <div className="nia-archive__content">
        <aside className="nia-archive__list" aria-label={query.trim() ? "搜索结果" : "当天的会话"}>
          <div className="nia-archive__list-heading"><strong>{query.trim() ? "搜索结果" : selectedDay !== null ? dayHeading(selectedDay) : "会话"}</strong><span>{query.trim() ? hits.length : visibleConversations.length}</span></div>
          {status === "loading" ? <p className="nia-archive__empty">正在读取本机会话…</p> : null}
          {status === "unavailable" ? <p className="nia-archive__empty">会话归档只在 Auris 桌面版中可用。</p> : null}
          {status === "error" ? <p className="nia-archive__empty">暂时无法读取会话数据库。</p> : null}
          {query.trim() ? (
            searchReady && hits.length === 0 ? <p className="nia-archive__empty">没有找到匹配的内容。</p> : hits.map((hit) => <button aria-current={selectedConversation?.id === hit.conversationId} className="nia-archive__entry" key={hit.turnId} onClick={() => chooseHit(hit)} type="button"><strong>{hit.subject?.trim() || hit.text}</strong><span>{clock(hit.at)} · {hit.speaker === "user" ? "你" : "Nia"}</span></button>)
          ) : (
            status === "ready" && visibleConversations.length === 0 ? <p className="nia-archive__empty">这个月还没有可读取的会话。</p> : visibleConversations.map((conversation) => <button aria-current={selectedConversation?.id === conversation.id} className="nia-archive__entry" key={conversation.id} onClick={() => chooseConversation(conversation)} type="button"><strong>{openingLabel(conversation)}</strong><span>{clock(conversation.startedAt)} · ◌ {conversation.turnCount ?? 0} 轮 · ◷ {durationLabel(conversation.startedAt, conversation.endedAt)}</span></button>)
          )}
        </aside>

        <article className="nia-archive__transcript" aria-label="会话内容">
          {!selectedConversation ? <div className="nia-archive__transcript-empty"><span className="nia-archive__mini-avatar" aria-hidden="true"><i /><i /></span><p>从左侧选择一段会话，或者搜索 Nia 说过的内容。</p></div> : null}
          {selectedConversation ? <>
            <header className="nia-archive__conversation-head"><strong>{clock(selectedConversation.startedAt)}</strong><span>{detail.turns.length || selectedConversation.turnCount || 0} 轮 · {durationLabel(selectedConversation.startedAt, selectedConversation.endedAt)} · {interruptions ? `${interruptions} 次被打断` : "完整结束"}</span>{toolSummary.length ? <div>{toolSummary.map((tool) => <i key={tool.name}>{tool.name}{tool.count > 1 ? ` ×${tool.count}` : ""}</i>)}</div> : <small>本次对话没有调用工具</small>}</header>
            {detailLoading ? <p className="nia-archive__empty">正在读取会话内容…</p> : null}
            {!detailLoading && detail.turns.length === 0 ? <p className="nia-archive__empty">这段会话没有留下可显示的内容。</p> : null}
            <div className="nia-archive__turns">{detail.turns.map((turn) => <div className={`nia-archive__turn nia-archive__turn--${turn.speaker}`} key={turn.id}>{turn.speaker === "nia" ? <span className="nia-archive__mini-avatar" aria-hidden="true"><i /><i /></span> : null}<div><p>{turn.text || "（内容在结束前被截断）"}</p>{turn.speaker !== "user" ? <small>{turn.cut ? <b>被打断</b> : null}<span>{clock(turn.at, true)}</span><button onClick={() => { void navigator.clipboard?.writeText(turn.text); setCopiedTurnId(turn.id); }} type="button">{copiedTurnId === turn.id ? "已复制" : "复制"}</button></small> : null}</div></div>)}</div>
          </> : null}
        </article>
      </div>

      <footer className="nia-archive__footer"><span>{monthConversationCount} 次对话 · {monthLabel(month.year, month.month)}</span><span>● 本地 SQLite 保存</span></footer>
    </section>
  );
}
