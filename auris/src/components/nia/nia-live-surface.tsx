"use client";
import { useNiaLiveSession } from "@/features/nia/use-nia-live-session";
export function NiaLiveSurface() {
  const live = useNiaLiveSession();
  const active = live.status === "requesting_microphone" || live.status === "connecting" || live.status === "connected";
  return <section aria-label="Nia GPT Live" className="nia-live">
    <div><span>GPT Live · 实时语音</span><strong>{live.status === "connected" ? "Nia 正在聆听" : "和 Nia 实时对话"}</strong><small>麦克风只在本次实时会话中使用，结束会话后立即停止。</small></div>
    <div className="nia-live__controls">{active ? <><button disabled={live.status !== "connected"} onClick={live.toggleMute} type="button">{live.isMuted ? "取消静音" : "静音"}</button><button onClick={live.stop} type="button">结束语音</button></> : <button onClick={() => void live.start()} type="button">开始语音</button>}</div>
    {live.status === "requesting_microphone" ? <p aria-live="polite">正在请求麦克风权限…</p> : null}
    {live.status === "connecting" ? <p aria-live="polite">正在使用临时凭据连接 GPT Live…</p> : null}
    {live.error ? <p className="nia-live__error" role="alert">{live.error}</p> : null}
    {live.transcript ? <p aria-label="Nia Live transcript" className="nia-live__transcript">{live.transcript}</p> : null}
  </section>;
}
