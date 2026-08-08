"use client";

import { useState } from "react";

export function NiaComposer({
  disabled = false,
  isStreaming = false,
  onStop,
  onSubmit,
}: {
  disabled?: boolean;
  isStreaming?: boolean;
  onStop: () => void;
  onSubmit: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  return (
    <form
      className="nia-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!prompt.trim() || disabled || isStreaming) return;
        onSubmit(prompt);
        setPrompt("");
      }}
    >
      <label className="nia-composer__label" htmlFor="nia-prompt">Ask Nia · 提问</label>
      <textarea
        aria-label="Nia prompt"
        disabled={disabled}
        id="nia-prompt"
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Ask, rewrite, summarize, or plan…"
        rows={4}
        value={prompt}
      />
      <div className="nia-composer__actions">
        {isStreaming ? (
          <button onClick={onStop} type="button">Stop · 停止</button>
        ) : (
          <button disabled={disabled || !prompt.trim()} type="submit">Send · 发送</button>
        )}
      </div>
    </form>
  );
}
