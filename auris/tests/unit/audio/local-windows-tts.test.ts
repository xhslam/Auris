import {
  __setWindowsTtsSynthesizerForTests,
  synthesizeWithWindowsTts,
} from "@/features/audio/local-windows-tts";

describe("synthesizeWithWindowsTts", () => {
  afterEach(() => {
    __setWindowsTtsSynthesizerForTests(null);
  });

  it("returns a wav audio buffer from the injected synthesizer", async () => {
    __setWindowsTtsSynthesizerForTests(async () => Buffer.from("fake-wav"));

    const result = await synthesizeWithWindowsTts({
      text: "Learning a language is not only about vocabulary.",
      voiceId: "alloy",
    });

    expect(result).toMatchObject({
      audioBuffer: Buffer.from("fake-wav"),
      contentType: "audio/wav",
    });
  });
});
