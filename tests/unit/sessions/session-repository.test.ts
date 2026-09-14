import type {
  SentenceRecord,
  SessionRecord,
  WordTokenRecord,
} from "@/features/sessions/session.types";
import {
  __setSessionRepositoryBackendForTests,
  createEmptySessionRecord,
  deleteSessionRecord,
  getSessionArtifacts,
  getSessionById,
  listRecentSessionsByUser,
  savePreparedSessionArtifacts,
} from "@/server/repositories/session-repository";

function createSessionFixture(): SessionRecord {
  return {
    id: "session-1",
    userId: "user-1",
    sourceType: "paste",
    title: "Persisted Session",
    originalText: "Original text",
    normalizedText: "Original text",
    status: "draft",
    voiceId: "alloy",
    speedDefault: 1,
    audioUrl: null,
    durationMs: null,
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z",
  };
}

describe("session repository backend selection", () => {
  afterEach(() => {
    __setSessionRepositoryBackendForTests(null);
  });

  it("delegates all session operations to the injected backend", async () => {
    const session = createSessionFixture();
    const sentences: SentenceRecord[] = [
      {
        id: "sentence-1",
        sessionId: session.id,
        orderIndex: 0,
        text: "Original text",
        startMs: 0,
        endMs: 900,
      },
    ];
    const wordTokens: WordTokenRecord[] = [
      {
        id: "word-1",
        sentenceId: "sentence-1",
        orderIndex: 0,
        text: "Original",
        startMs: 0,
        endMs: 450,
      },
    ];

    const backend = {
      createEmptySessionRecord: vi.fn().mockResolvedValue(session),
      deleteSessionRecord: vi.fn().mockResolvedValue(undefined),
      getSessionArtifacts: vi.fn().mockResolvedValue({ sentences, wordTokens }),
      getSessionById: vi.fn().mockResolvedValue(session),
      listRecentSessionsByUser: vi.fn().mockResolvedValue([session]),
      savePreparedSessionArtifacts: vi
        .fn()
        .mockResolvedValue({ ...session, status: "ready" }),
    };

    __setSessionRepositoryBackendForTests(backend);

    await createEmptySessionRecord({
      userId: session.userId,
      sourceType: session.sourceType,
      title: session.title,
      originalText: session.originalText,
    });
    await deleteSessionRecord(session.id);
    await savePreparedSessionArtifacts({
      sessionId: session.id,
      status: "ready",
      audioUrl: "/api/audio/session-1",
      durationMs: 900,
      sentences,
      wordTokens,
    });
    await listRecentSessionsByUser(session.userId);
    await getSessionById(session.id);
    await getSessionArtifacts(session.id);

    expect(backend.createEmptySessionRecord).toHaveBeenCalled();
    expect(backend.deleteSessionRecord).toHaveBeenCalledWith(session.id);
    expect(backend.savePreparedSessionArtifacts).toHaveBeenCalled();
    expect(backend.listRecentSessionsByUser).toHaveBeenCalledWith(session.userId);
    expect(backend.getSessionById).toHaveBeenCalledWith(session.id);
    expect(backend.getSessionArtifacts).toHaveBeenCalledWith(session.id);
  });
});
