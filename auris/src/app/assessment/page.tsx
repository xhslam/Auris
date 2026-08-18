import Link from "next/link";

export default function AssessmentPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, color: "#e7e1d5", background: "radial-gradient(circle at 50% 20%, #292823 0%, #121313 55%, #0b0c0c 100%)", fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" }}>
      <section aria-label="发音评估" style={{ width: "min(100%, 620px)", padding: 36, border: "1px solid rgba(213, 185, 110, .36)", borderRadius: 18, background: "rgba(29, 30, 29, .88)", boxShadow: "0 24px 70px rgba(0,0,0,.35)" }}>
        <p style={{ margin: 0, color: "#bba66c", fontSize: 12, fontWeight: 700, letterSpacing: ".16em" }}>AURIS · PRONUNCIATION</p>
        <h1 style={{ margin: "16px 0 10px", fontFamily: "Georgia, 'Noto Serif SC', serif", fontSize: 36, fontWeight: 500 }}>发音评估</h1>
        <p style={{ margin: 0, color: "#aaa79d", fontSize: 15, lineHeight: 1.7 }}>进入视频学习页后，选择句子即可录制声音并查看发音评估结果。</p>
        <Link href="/video" style={{ display: "inline-flex", marginTop: 26, padding: "10px 14px", border: "1px solid #c9ac60", borderRadius: 9, color: "#201c12", background: "#dec176", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>前往视频学习</Link>
      </section>
    </main>
  );
}
