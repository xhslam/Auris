"use client";

import { useEffect, useState } from "react";
import { getNiaCompanionHostBridge } from "@/features/nia/nia-companion-bridge";

type Conversation = { id: string; startedAt: string; endedAt?: string | null; opening?: string | null; turnCount?: number };
type Turn = { id: string; speaker: string; text: string; at: string; cut?: number };

function labelFor(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function NiaCompanionHistory() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const bridge = getNiaCompanionHostBridge(window);
    if (!bridge) return;
    void bridge.invoke("conversations").then((value) => {
      if (Array.isArray(value)) setItems(value as Conversation[]);
    }).catch(() => undefined);
  }, []);

  const select = (id: string) => {
    const bridge = getNiaCompanionHostBridge(window);
    setSelected(id);
    if (!bridge) return;
    void bridge.invoke("conversation-turns", { conversationId: id }).then((value) => {
      if (Array.isArray(value)) setTurns(value as Turn[]);
    }).catch(() => setTurns([]));
  };

  return (
    <section aria-label="Nia companion history" className="nia-standalone__history">
      <button aria-expanded={open} className="nia-standalone__history-toggle" onClick={() => setOpen((value) => !value)} type="button">
        <span><strong>Companion sessions · 陪伴会话</strong><small>Conversations are saved locally like Mochi.</small></span>
        <b>{open ? "收起" : `${items.length} 条`}</b>
      </button>
      {open ? <div className="nia-standalone__history-body">
        <div className="nia-standalone__history-list">
          {items.length === 0 ? <small>还没有已保存的陪伴会话。</small> : items.map((item) => <button aria-pressed={selected === item.id} key={item.id} onClick={() => select(item.id)} type="button"><span>{labelFor(item.startedAt)}</span><strong>{item.opening || "空会话"}</strong><small>{item.turnCount ?? 0} 条消息</small></button>)}
        </div>
        {selected ? <div className="nia-standalone__history-turns">{turns.map((turn) => <p className={`nia-standalone__history-turn nia-standalone__history-turn--${turn.speaker}`} key={turn.id}><b>{turn.speaker === "user" ? "你" : turn.speaker === "nia" ? "Nia" : "系统"}</b><span>{turn.text || "（被截断）"}</span></p>)}</div> : null}
      </div> : null}
    </section>
  );
}

