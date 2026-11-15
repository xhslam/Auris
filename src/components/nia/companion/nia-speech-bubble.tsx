import React, { useMemo } from "react";
import { wordAt } from "./bubble-pace";
import { wrap } from "./bubble-wrap";

export type NiaSpeechBubbleProps = {
  text: string;
  cursor: number;
  visible: boolean;
  onDismiss?: () => void;
};

export function NiaSpeechBubble({
  text,
  cursor,
  visible,
  onDismiss,
}: NiaSpeechBubbleProps) {
  const wrapped = useMemo(() => wrap(text), [text]);

  // Compute word boundary around the current cursor position
  const span = useMemo(() => {
    if (!text || cursor < 0) return { from: 0, to: 0 };
    return wordAt(text, Math.min(cursor, Math.max(0, text.length - 1)));
  }, [text, cursor]);

  const saidText = text.slice(0, span.from);
  const sayingText = text.slice(span.from, span.to);
  const aheadText = text.slice(span.to);

  return (
    <div
      className="nia-speech-bubble-anchor"
      aria-hidden={!visible}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      <div
        className="nia-speech-bubble"
        data-visible={visible ? "true" : "false"}
        {...(visible ? { "data-nia-companion-hit-region": "speech-bubble" } : {})}
        role="region"
        aria-label="Nia 说话内容"
      >
        <div className="nia-speech-bubble__body">
          {wrapped.lines.length > 0 ? (
            <div className="nia-speech-bubble__content">
              <span className="nia-speech-bubble__said">{saidText}</span>
              <span className="nia-speech-bubble__saying">{sayingText}</span>
              <span className="nia-speech-bubble__ahead">{aheadText}</span>
            </div>
          ) : (
            <div className="nia-speech-bubble__content">
              <span className="nia-speech-bubble__saying">...</span>
            </div>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            className="nia-speech-bubble__close"
            onClick={onDismiss}
            aria-label="关闭气泡"
            {...(visible ? { "data-nia-companion-hit-region": "speech-bubble-close" } : {})}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
