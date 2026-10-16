import {
  __setAudioStorageBackendForTests,
  storeAudioAsset,
} from "@/features/storage/audio-storage";

describe("audio storage backend selection", () => {
  afterEach(() => {
    __setAudioStorageBackendForTests(null);
  });

  it("delegates audio persistence to the injected backend", async () => {
    const backend = {
      deleteAudioAsset: vi.fn(async () => undefined),
      storeAudioAsset: vi.fn().mockResolvedValue("/api/audio/session-1"),
    };

    __setAudioStorageBackendForTests(backend);

    const result = await storeAudioAsset({
      sessionId: "session-1",
      audioBuffer: Buffer.from("test"),
      contentType: "audio/wav",
    });

    expect(result).toBe("/api/audio/session-1");
    expect(backend.storeAudioAsset).toHaveBeenCalledWith({
      sessionId: "session-1",
      audioBuffer: Buffer.from("test"),
      contentType: "audio/wav",
    });
  });
});
