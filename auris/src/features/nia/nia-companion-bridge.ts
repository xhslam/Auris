"use client";

import type {
  NiaCompanionConversationDetail,
  NiaCompanionConversationSummary,
  NiaCompanionHostAnswers,
  NiaCompanionHostCommand,
  NiaCompanionHostPayloads,
  NiaCompanionSearchHit,
  NiaCompanionSnapshot,
  NiaCompanionToolUse,
  NiaCompanionTurn,
  NiaVoiceAnswer,
  NiaVoiceError,
  NiaVoiceOpened,
} from "./nia-companion-answers";

export type {
  NiaCompanionConversationDetail,
  NiaCompanionConversationSummary,
  NiaCompanionHostAnswers,
  NiaCompanionHostCommand,
  NiaCompanionHostPayloads,
  NiaCompanionSearchHit,
  NiaCompanionSnapshot,
  NiaCompanionToolUse,
  NiaCompanionTurn,
  NiaVoiceAnswer,
  NiaVoiceError,
  NiaVoiceOpened,
};

export type NiaCompanionHostEvent =
  | { type: "snapshot"; snapshot: { state?: string; muted?: boolean; visible?: boolean } }
  | { type: "visibility"; visible: boolean }
  | { type: "report"; report: { type?: string; text?: string; message?: string; error?: { message?: string } } };

export type NiaCompanionHostBridge = {
  invoke: <C extends NiaCompanionHostCommand>(
    command: C,
    payload?: NiaCompanionHostPayloads[C] | Record<string, unknown>,
  ) => Promise<NiaCompanionHostAnswers[C]>;
  subscribe: (listener: (event: unknown) => void) => boolean;
  unsubscribe: (listener: (event: unknown) => void) => boolean;
};

type HostWindow = Window & {
  shadowingDesktop?: { niaCompanion?: NiaCompanionHostBridge };
};

export function getNiaCompanionHostBridge(host: Window = window): NiaCompanionHostBridge | null {
  return (host as HostWindow).shadowingDesktop?.niaCompanion ?? null;
}
