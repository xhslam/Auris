"use client";

export type NiaCompanionHostEvent =
  | { type: "snapshot"; snapshot: { state?: string; muted?: boolean } }
  | { type: "report"; report: { type?: string; text?: string; message?: string; error?: { message?: string } } };

export type NiaCompanionHostBridge = {
  invoke: (command: "snapshot" | "wake" | "rest" | "mute" | "text", payload?: Record<string, unknown>) => Promise<unknown>;
  subscribe: (listener: (event: unknown) => void) => boolean;
  unsubscribe: (listener: (event: unknown) => void) => boolean;
};

type HostWindow = Window & {
  shadowingDesktop?: { niaCompanion?: NiaCompanionHostBridge };
};

export function getNiaCompanionHostBridge(host: Window = window): NiaCompanionHostBridge | null {
  return (host as HostWindow).shadowingDesktop?.niaCompanion ?? null;
}

