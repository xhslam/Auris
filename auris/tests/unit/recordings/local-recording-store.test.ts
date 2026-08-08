import {
  __setLocalRecordingStorageBackendForTests,
  saveLocalRecording,
  deleteLocalRecording,
  listLocalRecordings,
} from "@/features/recordings/local-recording-store";

describe("local recording storage backend selection", () => {
  afterEach(() => {
    __setLocalRecordingStorageBackendForTests(null);
  });

  it("delegates recording persistence to the injected backend", async () => {
    const blob = new Blob(["voice"], { type: "audio/webm" });
    const backend = {
      deleteRecording: vi.fn().mockResolvedValue(undefined),
      listRecordings: vi.fn().mockResolvedValue([]),
      saveRecording: vi.fn().mockResolvedValue(undefined),
    };

    __setLocalRecordingStorageBackendForTests(backend);

    await saveLocalRecording({
      blob,
      createdAt: "2026-03-18T00:00:00.000Z",
      durationMs: 1200,
      id: "rec-1",
      mimeType: "audio/webm",
      title: "Practice take",
    });
    await listLocalRecordings();
    await deleteLocalRecording("rec-1");

    expect(backend.saveRecording).toHaveBeenCalledWith({
      blob,
      createdAt: "2026-03-18T00:00:00.000Z",
      durationMs: 1200,
      id: "rec-1",
      mimeType: "audio/webm",
      title: "Practice take",
    });
    expect(backend.listRecordings).toHaveBeenCalled();
    expect(backend.deleteRecording).toHaveBeenCalledWith("rec-1");
  });
});
