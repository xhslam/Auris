"use client";

import { useState } from "react";
import type {
  NiaApplyMode,
  NiaApplyProposal,
  NiaDocumentContext,
  NiaSelectionContext,
} from "@/features/nia/nia-context";

export function NiaApplyReview({
  content,
  context,
  onApply,
  onDiscard,
}: {
  content: string;
  context: NiaSelectionContext | NiaDocumentContext;
  onApply: (proposal: NiaApplyProposal) => { ok: boolean; reason?: string } | void;
  onDiscard: () => void;
}) {
  const [mode, setMode] = useState<NiaApplyMode>(
    context.kind === "notes_selection" ? "replace_selection" : "replace_document",
  );
  const [message, setMessage] = useState<string | null>(null);
  return (
    <section aria-label="Review Nia apply proposal" className="nia-apply-review">
      <h4>Review before applying</h4>
      <pre>{content}</pre>
      <label>
        Apply mode
        <select onChange={(event) => setMode(event.target.value as NiaApplyMode)} value={mode}>
          {context.kind === "notes_selection" ? <option value="replace_selection">Replace selection</option> : null}
          <option value="insert_at_cursor">Insert at cursor</option>
          <option value="replace_document">Replace document</option>
        </select>
      </label>
      <button
        onClick={() => {
          const result = onApply({ content, context, mode });
          if (result && !result.ok) setMessage(result.reason || "Unable to apply.");
        }}
        type="button"
      >Apply</button>
      <button onClick={onDiscard} type="button">Discard</button>
      {message ? <p role="alert">{message}</p> : null}
    </section>
  );
}
