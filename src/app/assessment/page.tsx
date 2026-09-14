"use client";

import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import Link from "next/link";

export default function AssessmentPage() {
  return (
    <DesktopAppFrame activeWorkspace="home" title="发音评估" subtitle="" persistActiveWorkspace={false}>
    <main style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: 24, color: "var(--app-text)", background: "var(--app-bg)", fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" }}>
      <section aria-label="发音评估" style={{ width: "min(100%, 620px)", padding: 36, border: "1px solid var(--app-line)", borderRadius: 18, background: "var(--app-surface)", boxShadow: "0 24px 70px rgba(0,0,0,.35)" }}>
        <p style={{ margin: 0, color: "var(--accent)", fontSize: 12, fontWeight: 700, letterSpacing: ".16em" }}>AURIS · PRONUNCIATION</p>
        <h1 style={{ margin: "16px 0 10px", fontFamily: "Georgia, 'Noto Serif SC', serif", fontSize: 36, fontWeight: 500 }}>发音评估</h1>
        <p style={{ margin: 0, color: "var(--app-muted)", fontSize: 15, lineHeight: 1.7 }}>进入视频学习页后，选择句子即可录制声音并查看发音评估结果。</p>
        <Link href="/video" style={{ display: "inline-flex", marginTop: 26, padding: "10px 14px", border: "1px solid var(--accent)", borderRadius: 9, color: "var(--accent-ink)", background: "var(--accent)", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>前往视频学习</Link>
      </section>
    </main>
    </DesktopAppFrame>
  );
}
