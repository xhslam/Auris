"use client";

import { useEffect, useMemo, useState } from "react";

const focusDuration = 25 * 60;

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export default function FocusPage() {
  const [remaining, setRemaining] = useState(focusDuration);
  const [running, setRunning] = useState(false);
  const progress = useMemo(() => ((focusDuration - remaining) / focusDuration) * 100, [remaining]);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [remaining, running]);

  useEffect(() => {
    if (remaining === 0) setRunning(false);
  }, [remaining]);

  const reset = () => {
    setRunning(false);
    setRemaining(focusDuration);
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, color: "#e7e1d5", background: "radial-gradient(circle at 50% 20%, #292823 0%, #121313 55%, #0b0c0c 100%)", fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" }}>
      <section aria-label="Pomodoro 专注计时" style={{ width: "min(100%, 520px)", padding: "36px", border: "1px solid rgba(213, 185, 110, .36)", borderRadius: 18, background: "rgba(29, 30, 29, .88)", boxShadow: "0 24px 70px rgba(0,0,0,.35)" }}>
        <p style={{ margin: 0, color: "#bba66c", fontSize: 12, fontWeight: 700, letterSpacing: ".16em" }}>POMODORO · 专注计时</p>
        <h1 style={{ margin: "18px 0 6px", fontFamily: "Georgia, 'Noto Serif SC', serif", fontSize: "clamp(72px, 18vw, 120px)", fontWeight: 500, letterSpacing: "-.05em", lineHeight: .9 }}>{formatRemaining(remaining)}</h1>
        <p style={{ margin: "18px 0 24px", color: "#aaa79d", fontSize: 15 }}>专注 25 分钟，给当前任务一段不被打断的时间。</p>
        <div aria-label="专注进度" style={{ height: 7, overflow: "hidden", borderRadius: 999, background: "rgba(218, 195, 126, .14)" }}>
          <span style={{ display: "block", width: `${progress}%`, height: "100%", borderRadius: "inherit", background: "linear-gradient(90deg, #9c7b3b, #e1c676)", transition: "width 200ms linear" }} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
          <button onClick={() => setRunning((value) => !value)} type="button" style={{ flex: 1, padding: "11px 16px", border: "1px solid #c9ac60", borderRadius: 9, color: "#201c12", background: "#dec176", fontSize: 14, fontWeight: 700 }}>{remaining === 0 ? "已完成" : running ? "暂停" : "开始专注"}</button>
          <button onClick={reset} type="button" style={{ padding: "11px 16px", border: "1px solid rgba(196, 189, 171, .35)", borderRadius: 9, color: "#d2cdc0", background: "transparent", fontSize: 14 }}>重置</button>
        </div>
      </section>
    </main>
  );
}
