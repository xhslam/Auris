import { formatNiaContextForPrompt, type NiaContext } from "@/features/nia/nia-context";

export const NIA_CONTEXT_CARD_LIMIT = 8;

export type NiaContextCardOrigin =
  | "browser"
  | "command"
  | "home"
  | "note"
  | "reading"
  | "video"
  | "voice";

export type NiaContextCardKind = "note" | "browser" | "reading" | "video" | "workflow";

export type NiaContextCard = Readonly<{
  attachedAt: number;
  context: NiaContext;
  id: string;
  kind: NiaContextCardKind;
  origin: NiaContextCardOrigin;
  summary: string;
  title: string;
}>;

function cardKind(context: NiaContext): NiaContextCardKind {
  if (context.kind === "browser_reference") return "browser";
  if (context.kind === "reading_reference") return "reading";
  if (context.kind === "video_reference") return "video";
  if (context.kind === "workflow_step") return "workflow";
  return "note";
}

function stableIdentity(context: NiaContext) {
  if (context.kind === "browser_reference") return context.url;
  if (context.kind === "notes_selection") return `${context.path}:${context.revision}:${context.selection.from}:${context.selection.to}`;
  if (context.kind === "notes_document") return `${context.path}:${context.revision}`;
  if (context.kind === "reading_reference") return `${context.sourceId}:${context.location ?? ""}`;
  if (context.kind === "video_reference") return `${context.videoId}:${context.positionMs ?? ""}`;
  return `${context.runId}:${context.stepId}`;
}

export function describeNiaContextCard(context: NiaContext) {
  if (context.kind === "browser_reference") {
    return Object.freeze({ kind: "browser" as const, summary: context.url, title: context.title });
  }
  if (context.kind === "notes_selection") {
    return Object.freeze({ kind: "note" as const, summary: `Selected text · ${context.path}`, title: context.path });
  }
  if (context.kind === "notes_document") {
    return Object.freeze({ kind: "note" as const, summary: `Document revision · ${context.revision.slice(0, 10)}`, title: context.path });
  }
  if (context.kind === "reading_reference") {
    return Object.freeze({ kind: "reading" as const, summary: context.location ? `Reading · ${context.location}` : "Reading material", title: context.title });
  }
  if (context.kind === "video_reference") {
    return Object.freeze({ kind: "video" as const, summary: context.positionMs == null ? "Video reference" : `Video · ${Math.floor(context.positionMs / 1000)}s`, title: context.title });
  }
  return Object.freeze({ kind: "workflow" as const, summary: `Run ${context.runId} · step ${context.stepId}`, title: "Workflow result" });
}

export function createNiaContextCard(input: {
  attachedAt?: number;
  context: NiaContext;
  origin: NiaContextCardOrigin;
}): NiaContextCard {
  const description = describeNiaContextCard(input.context);
  const identity = encodeURIComponent(stableIdentity(input.context)).slice(0, 420);
  return Object.freeze({
    attachedAt: input.attachedAt ?? Date.now(),
    context: input.context,
    id: `nia-context:${description.kind}:${identity}`,
    kind: description.kind,
    origin: input.origin,
    summary: description.summary,
    title: description.title,
  });
}

/** De-duplicate by stable provenance identity while keeping the most recently attached card active. */
export function formatNiaContextCardsForPrompt(cards: readonly NiaContextCard[], activeCardId: string | null, limit = 12_000) {
  const otherCards = cards.filter((card) => card.id !== activeCardId);
  if (!otherCards.length) return "";
  const body = otherCards.map((card) => `[Additional explicit context card: ${card.kind}]\n${formatNiaContextForPrompt(card.context)}`).join("\n\n---\n\n");
  return body.slice(0, limit);
}

export function upsertNiaContextCard(
  cards: readonly NiaContextCard[],
  incoming: NiaContextCard,
  limit: number = NIA_CONTEXT_CARD_LIMIT,
) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : NIA_CONTEXT_CARD_LIMIT;
  return Object.freeze([...cards.filter((card) => card.id !== incoming.id), incoming].slice(-safeLimit));
}
