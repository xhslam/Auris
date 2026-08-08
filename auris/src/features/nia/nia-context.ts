import { createNotesMcpRevision } from "@/features/notes/workbench/notes-mcp-contract";
import type { NotesEditorSelectionState } from "@/features/notes/editor/editor-types";

export const NIA_CONTEXT_LIMITS = Object.freeze({
  maxTextChars: 32_000,
  maxTitleChars: 240,
  maxUrlChars: 2_048,
});

type NiaContextBase = Readonly<{
  provenance: "explicit_selection" | "explicit_document" | "explicit_browser_reference" | "workflow_step";
}>;

export type NiaSelectionContext = NiaContextBase & Readonly<{
  kind: "notes_selection";
  path: string;
  revision: string;
  selection: NotesEditorSelectionState;
  text: string;
}>;

export type NiaDocumentContext = NiaContextBase & Readonly<{
  kind: "notes_document";
  path: string;
  revision: string;
  text: string;
}>;

export type NiaBrowserContext = NiaContextBase & Readonly<{
  kind: "browser_reference";
  title: string;
  url: string;
}>;

export type NiaWorkflowStepContext = NiaContextBase & Readonly<{
  kind: "workflow_step";
  runId: string;
  stepId: string;
  text: string;
}>;

export type NiaContext =
  | NiaSelectionContext
  | NiaDocumentContext
  | NiaBrowserContext
  | NiaWorkflowStepContext;

export type NiaApplyMode = "replace_selection" | "insert_at_cursor" | "replace_document";

export type NiaApplyProposal = Readonly<{
  content: string;
  context: NiaSelectionContext | NiaDocumentContext;
  mode: NiaApplyMode;
}>;

function boundedText(value: string, limit: number = NIA_CONTEXT_LIMITS.maxTextChars) {
  if (typeof value !== "string") throw new TypeError("Nia context text must be a string.");
  if (value.length > limit) throw new RangeError(`Nia context exceeds ${limit} characters.`);
  return value;
}

function boundedIdentifier(value: string, label: string) {
  const normalized = boundedText(value, 512).trim();
  if (!normalized || normalized.includes("\0")) throw new TypeError(`${label} is invalid.`);
  return normalized;
}

export function createNotesSelectionContext(input: {
  path: string;
  source: string;
  selection: NotesEditorSelectionState | null;
}): NiaSelectionContext | null {
  if (!input.selection || !input.selection.text || input.selection.from === input.selection.to) return null;
  const text = boundedText(input.selection.text);
  return Object.freeze({
    kind: "notes_selection",
    path: boundedIdentifier(input.path, "Note path"),
    revision: createNotesMcpRevision(input.source),
    selection: Object.freeze({ ...input.selection }),
    text,
    provenance: "explicit_selection",
  });
}

export function createNotesDocumentContext(input: {
  path: string;
  source: string;
}): NiaDocumentContext {
  return Object.freeze({
    kind: "notes_document",
    path: boundedIdentifier(input.path, "Note path"),
    revision: createNotesMcpRevision(input.source),
    text: boundedText(input.source),
    provenance: "explicit_document",
  });
}

export function createBrowserReferenceContext(input: {
  title?: string | null;
  url: string;
}): NiaBrowserContext {
  const parsed = new URL(input.url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError("Only HTTP(S) browser references may be attached.");
  }
  parsed.username = "";
  parsed.password = "";
  return Object.freeze({
    kind: "browser_reference",
    title: boundedText(input.title?.trim() || parsed.hostname, NIA_CONTEXT_LIMITS.maxTitleChars),
    url: boundedText(parsed.toString(), NIA_CONTEXT_LIMITS.maxUrlChars),
    provenance: "explicit_browser_reference",
  });
}

export function createWorkflowStepContext(input: {
  runId: string;
  stepId: string;
  text: string;
}): NiaWorkflowStepContext {
  return Object.freeze({
    kind: "workflow_step",
    runId: boundedIdentifier(input.runId, "Workflow run ID"),
    stepId: boundedIdentifier(input.stepId, "Workflow step ID"),
    text: boundedText(input.text),
    provenance: "workflow_step",
  });
}

export function formatNiaContextForPrompt(context: NiaContext) {
  if (context.kind === "browser_reference") {
    return `[Explicit browser reference]\nTitle: ${context.title}\nURL: ${context.url}`;
  }
  if (context.kind === "workflow_step") {
    return `[Workflow step ${context.runId}/${context.stepId}]\n${context.text}`;
  }
  return `[${context.kind === "notes_selection" ? "Explicit note selection" : "Explicit note document"}]\nPath: ${context.path}\nRevision: ${context.revision}\n${context.text}`;
}

export function validateNiaApplyProposal(
  proposal: NiaApplyProposal,
  current: { path: string; source: string; selection: NotesEditorSelectionState | null },
) {
  if (proposal.context.path !== current.path) {
    return Object.freeze({ ok: false as const, reason: "Open the original target note before applying." });
  }
  if (proposal.context.revision !== createNotesMcpRevision(current.source)) {
    return Object.freeze({ ok: false as const, reason: "The note changed. Review the response again." });
  }
  if (proposal.mode === "replace_selection") {
    const expected = proposal.context.kind === "notes_selection" ? proposal.context.selection : null;
    if (
      !expected ||
      !current.selection ||
      expected.from !== current.selection.from ||
      expected.to !== current.selection.to ||
      expected.text !== current.selection.text
    ) {
      return Object.freeze({ ok: false as const, reason: "The selection changed. Review it again." });
    }
  }
  boundedText(proposal.content);
  return Object.freeze({ ok: true as const });
}
