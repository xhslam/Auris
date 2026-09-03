import { describe, expect, it } from "vitest";
import {
  createNiaRealtimeSessionUpdate,
  parseNiaRealtimeServerEvent,
} from "@/features/nia/nia-realtime-protocol";

describe("Nia Realtime protocol", () => {
  it("uses the GA session shape verified by Mochi", () => {
    expect(createNiaRealtimeSessionUpdate({ voice: "ballad" })).toEqual({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: "You are Nia, Auris's concise learning assistant. Respect explicit user choices, never claim browser or note access unless a separate approved tool session provides it, and keep spoken responses brief by default.",
        output_modalities: ["audio"],
        audio: {
          output: { voice: "ballad" },
          input: {
            noise_reduction: { type: "far_field" },
            turn_detection: { type: "semantic_vad" },
            transcription: { model: "gpt-transcribe" },
          },
        },
        tool_choice: "none",
      },
    });
  });

  it("parses the observed user and assistant transcript event names", () => {
    expect(parseNiaRealtimeServerEvent(JSON.stringify({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item-user",
      transcript: "what the user said",
    }))).toEqual({ kind: "heard", itemId: "item-user", transcript: "what the user said" });

    expect(parseNiaRealtimeServerEvent(JSON.stringify({
      type: "response.output_audio_transcript.done",
      response_id: "resp-1",
      item_id: "item-nia",
      transcript: "what Nia said",
    }))).toEqual({
      kind: "said",
      itemId: "item-nia",
      responseId: "resp-1",
      transcript: "what Nia said",
    });
  });

  it("keeps the item/response join and both audio completion verdicts", () => {
    expect(parseNiaRealtimeServerEvent(JSON.stringify({
      type: "response.output_item.added",
      response_id: "resp-1",
      item: { id: "item-nia", phase: "final_answer" },
    }))).toEqual({ kind: "item-added", itemId: "item-nia", responseId: "resp-1" });
    expect(parseNiaRealtimeServerEvent(JSON.stringify({
      type: "conversation.item.truncated",
      item_id: "item-nia",
      audio_end_ms: 14180,
    }))).toEqual({ kind: "truncated", itemId: "item-nia" });
    expect(parseNiaRealtimeServerEvent(JSON.stringify({
      type: "output_audio_buffer.stopped",
      response_id: "resp-1",
    }))).toEqual({ kind: "audio-buffer", phase: "stopped", responseId: "resp-1" });
  });

  it("reports malformed known transcript frames instead of silently dropping them", () => {
    expect(parseNiaRealtimeServerEvent(JSON.stringify({
      type: "response.output_audio_transcript.done",
    }))).toEqual({
      kind: "malformed",
      missing: ["transcript", "response_id", "item_id"],
      type: "response.output_audio_transcript.done",
    });
  });
});
