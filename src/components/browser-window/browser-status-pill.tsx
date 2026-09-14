type BrowserStatusPillProps = {
  crashMode?: "ok" | "auto" | "manual-only";
  lifecycle?: "creating" | "ready" | "hibernated" | "crashed";
  mode?: "Human" | "AiSandbox" | "AiShared";
};

const MODE_LABELS: Readonly<Record<"Human" | "AiSandbox" | "AiShared", string>> = Object.freeze({
  AiSandbox: "AI 沙盒",
  AiShared: "AI 共用",
  Human: "人工浏览",
});

export function BrowserStatusPill({
  crashMode = "ok",
  lifecycle = "ready",
  mode = "Human",
}: BrowserStatusPillProps) {
  const label = lifecycle === "crashed"
    ? (crashMode === "manual-only" ? "已崩溃" : "恢复中")
    : lifecycle === "hibernated"
      ? "已休眠"
      : MODE_LABELS[mode];
  const dataMode = lifecycle === "crashed" || lifecycle === "hibernated"
    ? lifecycle
    : mode;
  return (
    <span className="browser-status-pill" data-mode={dataMode}>
      <span aria-hidden="true" className="browser-status-pill__dot" />
      {label}
    </span>
  );
}
