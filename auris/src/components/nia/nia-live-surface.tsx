"use client";
import { useNiaLiveSession } from "@/features/nia/use-nia-live-session";
export function NiaLiveSurface() {
  const live = useNiaLiveSession();
  const active = live.status === "requesting_microphone" || live.status === "connecting" || live.status === "connected";
  return <section aria-label="Nia GPT Live" className="nia-live">
    <div><span>GPT Live · 实时语音</span><strong>{live.status === "connected" ? "Nia is listening" : "Talk with Nia"}</strong><small>Microphone stays local to this Live session and stops when you end it.</small></div>
    <div className="nia-live__controls">{active ? <><button disabled={live.status !== "connected"} onClick={live.toggleMute} type="button">{live.isMuted ? "Unmute · 取消静音" : "Mute · 静音"}</button><button onClick={live.stop} type="button">End Live · 结束</button></> : <button onClick={() => void live.start()} type="button">Start Live · 开始语音</button>}</div>
    {live.status === "requesting_microphone" ? <p aria-live="polite">Requesting microphone permission…</p> : null}
    {live.status === "connecting" ? <p aria-live="polite">Connecting with a short-lived session credential…</p> : null}
    {live.error ? <p className="nia-live__error" role="alert">{live.error} Text chat remains available through your configured REST or CLI provider.</p> : null}
    {live.transcript ? <p aria-label="Nia Live transcript" className="nia-live__transcript">{live.transcript}</p> : null}
  </section>;
}
