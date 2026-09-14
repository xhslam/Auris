"use client";

import { useCallback, useEffect, useState } from "react";
import { getNiaCompanionHostBridge } from "@/features/nia/nia-companion-bridge";

type Conversation = {
  endedAt?: string | null;
  id: string;
  opening?: string | null;
  startedAt: string;
  subject?: string | null;
  turnCount?: number;
};

type ConversationPanelStatus = "loading" | "ready" | "unavailable" | "error";

function conversationTitle(conversation: Conversation) {
  return conversation.subject?.trim()
    || conversation.opening?.trim()
    || "这段对话没有留下可显示的开场语";
}

function conversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const itemDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayLabel = itemDayStart === dayStart
    ? "今天"
    : itemDayStart === dayStart - 86_400_000
      ? "昨天"
      : date.toLocaleDateString("zh-CN", { day: "numeric", month: "numeric" });
  const clock = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
  });
  return `${dayLabel} ${clock}`;
}

export function NiaConversationPanel({
  onOpenArchive,
}: {
  onOpenArchive: (conversationId?: string) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [status, setStatus] = useState<ConversationPanelStatus>("loading");

  const loadConversations = useCallback(() => {
    const bridge = typeof window === "undefined" ? null : getNiaCompanionHostBridge(window);
    if (!bridge) {
      setStatus("unavailable");
      return;
    }
    setStatus("loading");
    void bridge.invoke("conversations").then((value) => {
      const next = Array.isArray(value) ? value as Conversation[] : [];
      setConversations([...next].sort((left, right) => (
        new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()
      )).slice(0, 8));
      setStatus("ready");
    }).catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  return (
    <section className="nia-workspace__inspector-content nia-workspace__conversation-panel">
      <div className="nia-workspace__section-title nia-workspace__conversation-heading">
        <div><span>最近会话</span><small>本机保存的真实对话</small></div>
        <b>{status === "ready" ? conversations.length : "—"}</b>
      </div>

      {status === "loading" ? <p className="nia-workspace__empty">正在读取本机会话…</p> : null}
      {status === "unavailable" ? <p className="nia-workspace__empty">会话记录只在 Auris 桌面版中可用。</p> : null}
      {status === "error" ? <div className="nia-workspace__conversation-state"><p>暂时无法读取会话数据库。</p><button onClick={loadConversations} type="button">重新读取</button></div> : null}
      {status === "ready" && conversations.length === 0 ? <div className="nia-workspace__conversation-state"><p>还没有保存的会话。和 Nia 完成一次对话后，记录会出现在这里。</p></div> : null}

      {conversations.length > 0 ? <ul aria-label="最近的 Nia 会话" className="nia-workspace__conversation-list">
        {conversations.map((conversation) => <li key={conversation.id}><button
          className="nia-workspace__conversation-row"
          onClick={() => onOpenArchive(conversation.id)}
          type="button"
        >
          <span className="nia-workspace__conversation-marker" aria-hidden="true" />
          <span className="nia-workspace__conversation-copy">
            <strong>{conversationTitle(conversation)}</strong>
            <small>{conversationTime(conversation.startedAt)} · {conversation.turnCount ?? 0} 轮</small>
          </span>
          <i aria-hidden="true">›</i>
        </button></li>)}
      </ul> : null}

      <button className="nia-workspace__conversation-all" onClick={() => onOpenArchive()} type="button">
        <span><strong>查看完整记录</strong><small>按日期浏览与搜索全部对话</small></span><i aria-hidden="true">›</i>
      </button>
    </section>
  );
}
