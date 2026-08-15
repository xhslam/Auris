export const NIA_LIVE_MODEL = "gpt-realtime-2.1";
export const NIA_LIVE_VOICES = ["marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"] as const;
export type NiaLiveVoice = typeof NIA_LIVE_VOICES[number];
export type NiaLiveSessionRequest = Readonly<{ clientInstanceId: string; voice?: NiaLiveVoice }>;

export function isNiaLiveVoice(value: unknown): value is NiaLiveVoice {
  return typeof value === "string" && (NIA_LIVE_VOICES as readonly string[]).includes(value);
}
export function assertNiaLiveClientInstanceId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) throw new TypeError("Invalid Live client instance identifier.");
  return value;
}
export function createNiaLiveSessionPayload(input: NiaLiveSessionRequest) {
  const clientInstanceId = assertNiaLiveClientInstanceId(input.clientInstanceId);
  const voice = input.voice && isNiaLiveVoice(input.voice) ? input.voice : "marin";
  return Object.freeze({
    clientInstanceId,
    body: Object.freeze({
      expires_after: { anchor: "created_at", seconds: 300 },
      session: {
        type: "realtime",
        model: NIA_LIVE_MODEL,
        audio: {
          input: {
            noise_reduction: { type: "near_field" },
            turn_detection: { type: "server_vad", create_response: true, interrupt_response: true, silence_duration_ms: 650 },
          },
          output: { voice },
        },
        instructions: "You are Nia, Auris's concise learning assistant. Respect explicit user choices, never claim browser or note access unless a separate approved tool session provides it, and keep spoken responses brief by default.",
        max_output_tokens: 420,
        output_modalities: ["audio"],
        reasoning: { effort: "low" },
        tool_choice: "none",
      },
    }),
  });
}
