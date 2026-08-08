"use client";

import { useEffect, useState } from "react";

export function WorkflowRecorderPanel({
  onStart = () => undefined,
  onStop = () => undefined,
  onRecordingComplete,
  subscribe,
}: {
  onStart?: () => void;
  onStop?: () => void | string | null;
  onRecordingComplete?: (markdown: string) => void;
  subscribe?: (listener: (event: unknown) => void) => () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  useEffect(() => subscribe?.(() => setEventCount((count) => count + 1)), [subscribe]);
  return (
    <section aria-label="Workflow recorder" className="nia-workflow-recorder">
      <strong>Recorder · 录制</strong>
      <p>Typed values become opaque inputs by default. Stop hands compiled Markdown to Workflows when available.</p>
      <span>{eventCount} trusted events</span>
      {recording ? (
        <button onClick={() => {
          setRecording(false);
          const markdown = onStop();
          if (typeof markdown === "string" && markdown.trim() && onRecordingComplete) {
            onRecordingComplete(markdown);
          }
        }} type="button">Stop · 停止录制</button>
      ) : (
        <button onClick={() => { setRecording(true); setEventCount(0); onStart(); }} type="button">Start · 开始录制</button>
      )}
    </section>
  );
}
