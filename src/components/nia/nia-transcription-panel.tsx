"use client";

import { useEffect, useRef, useState } from "react";
import type { NiaCompanionTurn } from "@/features/nia/nia-companion-answers";
import { getNiaCompanionHostBridge } from "@/features/nia/nia-companion-bridge";
import "./nia-transcription.css";

type Line = { id: string; text: string; at: number; partial?: boolean };

export function NiaTranscriptionPanel({ state, muted, history = [], historyTitle, onStart }: { state: string; muted: boolean; history?: readonly NiaCompanionTurn[]; historyTitle?: string; onStart?: () => void }) {
  const [consent, setConsent] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = ["opening", "listening", "attending", "thinking", "speaking", "working"].includes(state);
  const output = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bridge = getNiaCompanionHostBridge(window);
    if (!bridge) return;
    const listener = (raw: unknown) => {
      const event = raw as { type?: string; report?: { type?: string; itemId?: string; text?: string; at?: number; cut?: boolean; message?: string } };
      if (event?.type !== "report" || !event.report) return;
      const report = event.report;
      const id = report.itemId;
      if (report.type === "hearing" && id) setDrafts((old) => ({ ...old, [id]: report.text ?? "" }));
      if (report.type === "heard" && id) {
        setDrafts((old) => { const next = { ...old }; delete next[id]; return next; });
        setLines((old) => old.some((line) => line.id === id) ? old : [...old.slice(-499), { id, text: report.text ?? "", at: report.at ?? Date.now(), partial: report.cut }]);
      }
      if (report.type === "failed") setError(report.message ?? "转写连接失败，请结束后重新开始。");
    };
    bridge.subscribe(listener);
    return () => { bridge.unsubscribe(listener); };
  }, []);

  useEffect(() => { output.current?.scrollTo?.({ top: output.current.scrollHeight }); }, [lines, drafts]);

  const invoke = async (command: "wake" | "rest" | "mute") => {
    const bridge = getNiaCompanionHostBridge(window);
    if (!bridge) { setError("实时转写仅在桌面应用中可用。"); return; }
    if (command === "wake") { setLines([]); setDrafts({}); onStart?.(); }
    setBusy(true);
    setError("");
    try {
      const result = await bridge.invoke(command, command === "wake" ? { mode: "transcription" } : { muted: !muted });
      if (command === "wake" && result === false) setError("无法启动转写，请检查 Codex 登录与语音服务连接。");
    } catch { setError("操作失败，请检查桌面语音连接后重试。"); }
    finally { setBusy(false); }
  };

  const showHistory = !active && history.length > 0;

  return <section className="nia-transcription" aria-label="实时转写">
    <div className="nia-transcription__toolbar">
      <div><strong>{showHistory ? historyTitle || "转写记录" : "实时转写"}</strong><span role="status">{active ? (muted ? "已暂停" : state === "opening" ? "正在连接…" : "正在转写") : "未录音"}</span></div>
      <div>{active ? <>
        <button type="button" disabled={busy || state === "opening"} onClick={() => void invoke("mute")}>{muted ? "继续转写" : "暂停"}</button>
        <button type="button" disabled={busy} onClick={() => void invoke("rest")}>结束转写</button>
      </> : <button id="nia-start-transcription" type="button" disabled={!consent || busy} onClick={() => void invoke("wake")}>开始转写</button>}</div>
    </div>
    {!active && <label className="nia-transcription__consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />同意云端识别，已征得在场谈话者同意；本机只保存文字，不保存录音。</label>}
    {error && <p role="alert">{error}</p>}
    <div ref={output} className="nia-transcription__output" aria-label="本次实时转写文字" role="log" aria-live="polite" aria-relevant="additions text">
      {!showHistory && !lines.length && !Object.keys(drafts).length && <div className="nia-transcription__empty"><strong>只记录，不打扰</strong><span>开始转写，或从左侧选择一段记录</span></div>}
      {showHistory && history.map((line) => <p key={line.id}><time>{new Date(line.at).toLocaleTimeString("zh-CN", { hour12: false })}</time><span>{line.text}{line.cut ? <small>（未确认片段）</small> : null}</span></p>)}
      {!showHistory && lines.map((line) => <p key={line.id}><time>{new Date(line.at).toLocaleTimeString("zh-CN", { hour12: false })}</time><span>{line.text}{line.partial && <small>（结束时的未确认片段）</small>}</span></p>)}
      {Object.entries(drafts).map(([id, text]) => <p key={id} className="nia-transcription__draft"><span>{text}</span></p>)}
    </div>

  </section>;
}
