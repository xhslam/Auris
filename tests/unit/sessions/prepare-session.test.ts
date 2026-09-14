import { describe, expect, it } from "vitest";
import { __setWindowsTtsSynthesizerForTests } from "@/features/audio/local-windows-tts";
import { prepareSessionPlayback } from "@/features/sessions/prepare-session";
import { createEmptySessionRecord } from "@/server/repositories/session-repository";

describe("prepareSessionPlayback", () => {
  afterEach(() => {
    __setWindowsTtsSynthesizerForTests(null);
  });

  it("prepares timing artifacts and stores a local fallback audio file", async () => {
    __setWindowsTtsSynthesizerForTests(async () => Buffer.from("fake-wav"));

    const session = await createEmptySessionRecord({
      userId: "user-prepare",
      sourceType: "paste",
      title: "Shadowing Test",
      originalText: "Learning a language. Builds confidence.",
      normalizedText: "Learning a language. Builds confidence.",
    });

    const prepared = await prepareSessionPlayback({
      sessionId: session.id,
      speechEnginePreference: "cloud_only",
      text: session.normalizedText,
      voiceId: "alloy",
      voiceProfileId: "openai-male",
    });

    expect(prepared.status).toBe("ready");
    expect(prepared.audioUrl).toBe(`/api/audio/${session.id}`);
    expect(prepared.durationMs).toBeGreaterThan(0);
    expect(prepared.sentences.length).toBeGreaterThan(0);
    expect(prepared.wordTokens.length).toBeGreaterThan(0);
    expect(prepared.voiceId).toBe("openai-male");
  });
});
