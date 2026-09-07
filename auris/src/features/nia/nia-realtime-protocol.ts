import type { NiaLiveVoice } from "@/features/nia/nia-live-session-config";

export const NIA_REALTIME_TRANSCRIPTION_MODEL = "gpt-transcribe";
export const NIA_REALTIME_INSTRUCTIONS = "You are Nia, Auris's concise learning assistant. Respect explicit user choices, never claim browser or note access unless a separate approved tool session provides it, and keep spoken responses brief by default.";

export type NiaRealtimeServerEvent =
  | { kind: "session-created"; expiresAt: number | null }
  | { kind: "session-updated" }
  | { kind: "heard"; transcript: string; itemId: string }
  | { kind: "saying"; delta: string; responseId: string }
  | { kind: "said"; transcript: string; responseId: string; itemId: string }
  | { kind: "item-added"; responseId: string; itemId: string }
  | { kind: "truncated"; itemId: string }
  | { kind: "audio-buffer"; phase: "started" | "stopped" | "cleared"; responseId: string }
  | { kind: "tool"; name: string; callId: string }
  | { kind: "response-created" | "response-done" }
  | { kind: "error"; code: string; message: string }
  | { kind: "malformed"; type: string; missing: string[] }
  | { kind: "other"; type: string }
  | { kind: "unreadable" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function missingStrings(value: Record<string, unknown>, fields: readonly string[]) {
  return fields.filter((field) => typeof value[field] !== "string");
}

export const NIA_TURN_EAGERNESS = ["auto", "low", "medium", "high"] as const;
export type NiaTurnEagerness = (typeof NIA_TURN_EAGERNESS)[number];

export interface NiaTurnTaking {
  readonly eagerness?: NiaTurnEagerness;
  readonly interruptible?: boolean;
}

export function isNiaTurnEagerness(value: unknown): value is NiaTurnEagerness {
  return typeof value === "string" && (NIA_TURN_EAGERNESS as readonly string[]).includes(value);
}

export function readNiaTurnEagerness(value: unknown): NiaTurnEagerness {
  return isNiaTurnEagerness(value) ? value : "auto";
}

export function readNiaInterruptible(value: unknown): boolean {
  return value !== false;
}

export function createNiaTurnDetectionConfig(turnTaking?: NiaTurnTaking): {
  readonly type: "semantic_vad";
  readonly eagerness?: NiaTurnEagerness;
  readonly interrupt_response: boolean;
} {
  const eagerness = readNiaTurnEagerness(turnTaking?.eagerness);
  const interruptible = readNiaInterruptible(turnTaking?.interruptible);
  return eagerness === "auto"
    ? { type: "semantic_vad", interrupt_response: interruptible }
    : { type: "semantic_vad", eagerness, interrupt_response: interruptible };
}

export function createNiaRealtimeSessionUpdate({
  voice = "ballad",
  turnTaking,
}: {
  voice?: NiaLiveVoice;
  turnTaking?: NiaTurnTaking;
} = {}) {
  return {
    type: "session.update",
    session: {
      type: "realtime",
      instructions: NIA_REALTIME_INSTRUCTIONS,
      output_modalities: ["audio"],
      audio: {
        output: { voice },
        input: {
          noise_reduction: { type: "far_field" },
          turn_detection: createNiaTurnDetectionConfig(turnTaking),
          transcription: { model: NIA_REALTIME_TRANSCRIPTION_MODEL },
        },
      },
      tool_choice: "none",
    },
  } as const;
}

export function parseNiaRealtimeServerEvent(raw: unknown): NiaRealtimeServerEvent {
  let value: unknown;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { kind: "unreadable" };
  }
  if (!isRecord(value) || typeof value.type !== "string") return { kind: "unreadable" };
  const type = value.type;

  if (type === "session.created") {
    const session = isRecord(value.session) ? value.session : null;
    const expiresAt = typeof session?.expires_at === "number" ? session.expires_at * 1000 : null;
    return { kind: "session-created", expiresAt };
  }
  if (type === "session.updated") return { kind: "session-updated" };

  if (type === "conversation.item.input_audio_transcription.completed") {
    const missing = missingStrings(value, ["transcript", "item_id"]);
    if (missing.length) return { kind: "malformed", type, missing };
    return { kind: "heard", transcript: value.transcript as string, itemId: value.item_id as string };
  }

  if (type === "response.output_audio_transcript.delta") {
    const missing = missingStrings(value, ["delta", "response_id"]);
    if (missing.length) return { kind: "malformed", type, missing };
    return { kind: "saying", delta: value.delta as string, responseId: value.response_id as string };
  }

  if (type === "response.output_audio.delta") {
    const missing = missingStrings(value, ["response_id"]);
    if (missing.length) return { kind: "malformed", type, missing };
    return { kind: "saying", delta: "", responseId: value.response_id as string };
  }

  if (type === "response.output_audio_transcript.done" || type === "response.output_text.done") {
    const textField = type === "response.output_text.done" ? "text" : "transcript";
    const missing = missingStrings(value, [textField, "response_id", "item_id"]);
    if (missing.length) return { kind: "malformed", type, missing };
    return {
      kind: "said",
      transcript: value[textField] as string,
      responseId: value.response_id as string,
      itemId: value.item_id as string,
    };
  }

  if (type === "response.output_item.added") {
    const item = isRecord(value.item) ? value.item : null;
    const missing = [
      ...(typeof value.response_id === "string" ? [] : ["response_id"]),
      ...(typeof item?.id === "string" ? [] : ["item.id"]),
    ];
    if (missing.length) return { kind: "malformed", type, missing };
    return { kind: "item-added", responseId: value.response_id as string, itemId: item?.id as string };
  }

  if (type === "conversation.item.truncated") {
    const missing = missingStrings(value, ["item_id"]);
    if (missing.length) return { kind: "malformed", type, missing };
    return { kind: "truncated", itemId: value.item_id as string };
  }

  const audioPhase = {
    "output_audio_buffer.started": "started",
    "output_audio_buffer.stopped": "stopped",
    "output_audio_buffer.cleared": "cleared",
  }[type] as "started" | "stopped" | "cleared" | undefined;
  if (audioPhase) {
    const missing = missingStrings(value, ["response_id"]);
    if (missing.length) return { kind: "malformed", type, missing };
    return { kind: "audio-buffer", phase: audioPhase, responseId: value.response_id as string };
  }

  if (type === "response.function_call_arguments.done") {
    const missing = missingStrings(value, ["name", "call_id"]);
    if (missing.length) return { kind: "malformed", type, missing };
    return { kind: "tool", name: value.name as string, callId: value.call_id as string };
  }
  if (type === "response.created") return { kind: "response-created" };
  if (type === "response.done") return { kind: "response-done" };
  if (type === "error") {
    const detail = isRecord(value.error) ? value.error : null;
    return {
      kind: "error",
      code: typeof detail?.code === "string" ? detail.code : "REALTIME_EVENT_ERROR",
      message: typeof detail?.message === "string" ? detail.message : "Realtime returned an error.",
    };
  }
  return { kind: "other", type };
}
