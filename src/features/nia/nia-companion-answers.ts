/**
 * Single source of truth IPC request/response answers table for Nia companion.
 *
 * Derived from Mochi's src/shared/answers.ts at commit 4c1d6f0.
 *
 * ## The defect this replaces
 * `ipcMain.handle` returns `unknown` and renderer `ipcRenderer.invoke` also returns `unknown`.
 * In the past, both ends maintained independent type declarations or relied on manual casts
 * (e.g. `as Conversation[]`, `as Partial<ConversationDetail>`), leading to silent type drift
 * when field names or shapes changed.
 *
 * By declaring the exact return shape for each command in one unified table, both the
 * renderer bridge and the main process dispatcher/handlers share a single compile-time
 * contract.
 */

export interface NiaCompanionSnapshot {
  readonly state: string;
  readonly muted?: boolean;
  readonly visible?: boolean;
  readonly [key: string]: unknown;
}

export interface NiaCompanionConversationSummary {
  readonly id: string;
  readonly startedAt: string;
  readonly endedAt?: string | null;
  readonly opening?: string | null;
  readonly personaId?: string;
  readonly source?: string;
  readonly subject?: string | null;
  readonly turnCount?: number;
}

export interface NiaCompanionTurn {
  readonly at: string;
  readonly id: string;
  readonly speaker: "user" | "companion" | "nia" | "system" | (string & {});
  readonly text: string;
  readonly cut?: number | boolean;
  readonly responseId?: string | null;
  readonly itemId?: string | null;
}

export interface NiaCompanionToolUse {
  readonly at: string;
  readonly callId: string;
  readonly name: string;
  readonly status: string;
}

export interface NiaCompanionConversationDetail {
  readonly tools: readonly NiaCompanionToolUse[];
  readonly turns: readonly NiaCompanionTurn[];
}

export interface NiaCompanionSearchHit {
  readonly at: string;
  readonly conversationId: string;
  readonly speaker: "user" | "companion" | "nia" | "system" | (string & {});
  readonly startedAt: string;
  readonly text: string;
  readonly turnId: string;
  readonly cut?: number | boolean;
  readonly subject?: string | null;
}

export interface NiaVoiceError {
  readonly code: string;
  readonly message: string;
  readonly recovery?: string;
  readonly [key: string]: unknown;
}

export type NiaVoiceOpened =
  | { readonly ok: true; readonly sessionId: string; readonly expiresAt: number | null; readonly model: string }
  | { readonly ok: false; readonly error?: NiaVoiceError };

export type NiaVoiceAnswer =
  | { readonly ok: true; readonly answer: string }
  | { readonly ok: false; readonly error?: NiaVoiceError };

/**
 * Return types for host window companion commands (`shadowing:nia-companion:host-command`).
 */
export interface NiaCompanionHostAnswers {
  readonly snapshot: NiaCompanionSnapshot;
  readonly conversations: readonly NiaCompanionConversationSummary[];
  readonly "conversation-turns": readonly NiaCompanionTurn[];
  readonly "conversation-detail": NiaCompanionConversationDetail;
  readonly "conversation-search": readonly NiaCompanionSearchHit[];
  readonly "conversation-saving": boolean;
  readonly wake: unknown;
  readonly rest: unknown;
  readonly mute: boolean;
  readonly "companion-visibility": boolean;
  readonly text: unknown;
}

export type NiaCompanionHostCommand = keyof NiaCompanionHostAnswers;

export interface NiaCompanionHostPayloads {
  readonly snapshot: Record<string, unknown> | undefined;
  readonly conversations: Record<string, unknown> | undefined;
  readonly "conversation-turns": { readonly conversationId: string };
  readonly "conversation-detail": { readonly conversationId: string };
  readonly "conversation-search": { readonly query: string };
  readonly "conversation-saving": { readonly enabled: boolean };
  readonly wake: Record<string, unknown> | undefined;
  readonly rest: Record<string, unknown> | undefined;
  readonly mute: { readonly muted: boolean };
  readonly "companion-visibility": { readonly visible: boolean };
  readonly text: { readonly text: string };
}

/**
 * Return types for companion window commands (`auris:nia-companion:command`).
 */
export interface NiaCompanionWindowAnswers {
  readonly snapshot: NiaCompanionSnapshot;
  readonly "open-session": NiaVoiceOpened;
  readonly sdp: NiaVoiceAnswer;
  readonly "pointer-capture": boolean;
  readonly "drag-begin": boolean;
  readonly "drag-to": boolean;
  readonly "drag-end": boolean;
  readonly "open-nia": boolean | void;
  readonly wake: boolean | void;
  readonly menu: boolean | void;
}

export type NiaCompanionWindowCommand = keyof NiaCompanionWindowAnswers;
