import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  __setLocalPersistenceRootForTests,
  readLocalAudioAsset,
  readLocalSessionStore,
  writeLocalAudioAsset,
  writeLocalSessionStore,
} from "@/server/repositories/local-persistence";

describe("local persistence", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "shadowing-local-store-"));
    __setLocalPersistenceRootForTests(tempRoot);
  });

  afterEach(async () => {
    __setLocalPersistenceRootForTests(null);
    await rm(tempRoot, { force: true, recursive: true });
  });

  it("persists and reloads session store data from disk", async () => {
    await writeLocalSessionStore({
      sentences: [
        {
          endMs: 1000,
          id: "sentence-1",
          orderIndex: 0,
          sessionId: "session-1",
          startMs: 0,
          text: "Hello world",
        },
      ],
      sessions: [
        {
          audioUrl: null,
          createdAt: "2026-03-18T00:00:00.000Z",
          durationMs: 1000,
          id: "session-1",
          normalizedText: "Hello world",
          originalText: "Hello world",
          sourceType: "paste",
          speedDefault: 1,
          status: "ready",
          title: "Demo session",
          updatedAt: "2026-03-18T00:00:00.000Z",
          userId: "demo-user",
          voiceId: "alloy",
        },
      ],
      wordTokens: [
        {
          endMs: 500,
          id: "word-1",
          orderIndex: 0,
          sentenceId: "sentence-1",
          startMs: 0,
          text: "Hello",
        },
      ],
    });

    const store = await readLocalSessionStore();

    expect(store.sessions).toHaveLength(1);
    expect(store.sentences).toHaveLength(1);
    expect(store.wordTokens).toHaveLength(1);
  });

  it("persists and reloads audio assets from disk", async () => {
    await writeLocalAudioAsset({
      contentType: "audio/mpeg",
      fileExtension: "mp3",
      sessionId: "session-1",
      audioBuffer: Buffer.from("shadowing"),
    });

    const asset = await readLocalAudioAsset("session-1");

    expect(asset).not.toBeNull();
    expect(asset?.contentType).toBe("audio/mpeg");
    expect(asset?.audioBuffer.toString()).toBe("shadowing");
  });
});
