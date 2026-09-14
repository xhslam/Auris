import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createLocalHistoryRepository } = require("../../../electron/local-history-db.cjs");

function createPlayback() {
  return {
    sentences: [
      {
        endMs: 1200,
        id: "sentence-1",
        orderIndex: 0,
        sessionId: "session-1",
        startMs: 0,
        text: "Learning a language is rhythm.",
      },
    ],
    session: {
      audioUrl: "/api/audio/session-1",
      durationMs: 1200,
      id: "session-1",
      speedDefault: 1,
      status: "ready",
      title: "Desktop Quick Review",
      voiceId: "alloy",
    },
    wordTokens: [
      {
        endMs: 300,
        id: "word-1",
        orderIndex: 0,
        sentenceId: "sentence-1",
        startMs: 0,
        text: "Learning",
      },
    ],
  };
}

function createAssessment(id: string, createdAt: string) {
  return {
    accuracyScore: 91,
    completenessScore: 97,
    createdAt,
    fluencyScore: 93,
    id,
    locale: "en-US",
    overallScore: 94,
    referenceText: "Desktop pronunciation feedback",
    sourceLabel: "Desktop",
    wordAssessments: [{ accuracyScore: 90, errorType: "None", word: "Desktop" }],
  };
}

describe("local-history-db", () => {
  let tempDirectory: string | null = null;

  afterEach(async () => {
    if (tempDirectory) {
      await fs.rm(tempDirectory, { force: true, recursive: true });
      tempDirectory = null;
    }
  });

  async function createRepository() {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shadowing-local-history-"));
    return createLocalHistoryRepository({
      databasePath: path.join(tempDirectory, "local-history.db"),
      trainingAudioDirectory: path.join(tempDirectory, "training-audio"),
    });
  }

  it("persists prepared training playback with local audio assets", async () => {
    const repository = await createRepository();

    repository.savePreparedTrainingSession({
      audioAsset: {
        bytes: new Uint8Array([82, 73, 70, 70, 1, 2, 3]),
        contentType: "audio/wav",
      },
      originalText: "Learning a language is rhythm.",
      playback: createPlayback(),
      sourceType: "paste",
      title: "Desktop Quick Review",
    });

    expect(repository.listRecentTrainingSessions()).toEqual([
      {
        id: "session-1",
        status: "ready",
        title: "Desktop Quick Review",
      },
    ]);

    expect(repository.getTrainingPlayback("session-1")).toMatchObject({
      sentences: [
        expect.objectContaining({
          id: "sentence-1",
          text: "Learning a language is rhythm.",
        }),
      ],
      session: expect.objectContaining({
        audioUrl: expect.stringMatching(/^file:/),
        id: "session-1",
        title: "Desktop Quick Review",
      }),
    });

    repository.close();
  });

  it("deletes saved training sessions and their local audio assets", async () => {
    const repository = await createRepository();

    repository.savePreparedTrainingSession({
      audioAsset: {
        bytes: new Uint8Array([82, 73, 70, 70]),
        contentType: "audio/wav",
      },
      originalText: "Learning a language is rhythm.",
      playback: createPlayback(),
      sourceType: "paste",
      title: "Desktop Quick Review",
    });

    const storedPlayback = repository.getTrainingPlayback("session-1");
    expect(storedPlayback?.session.audioUrl).toEqual(expect.stringMatching(/^file:/));

    repository.deleteTrainingSession("session-1");

    expect(repository.listRecentTrainingSessions()).toEqual([]);
    expect(repository.getTrainingPlayback("session-1")).toBeNull();

    repository.close();
  });

  it("deletes an assessment together with its word-level feedback", async () => {
    const repository = await createRepository();

    repository.saveAssessment(createAssessment("assessment-1", "2026-03-26T01:00:00.000Z"));
    repository.saveAssessment(createAssessment("assessment-2", "2026-03-26T02:00:00.000Z"));

    const remaining = repository.deleteAssessment("assessment-2");

    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: "assessment-1" });
    expect(repository.listAssessments()).toEqual([
      expect.objectContaining({
        id: "assessment-1",
        wordAssessments: [expect.objectContaining({
          accuracyScore: 90,
          errorType: "None",
          word: "Desktop",
        })],
      }),
    ]);

    repository.close();
  });

  it("imports legacy assessment history only once", async () => {
    const repository = await createRepository();

    expect(repository.importLegacyAssessments([createAssessment("assessment-1", "2026-03-26T01:00:00.000Z")])).toHaveLength(1);
    expect(repository.importLegacyAssessments([createAssessment("assessment-2", "2026-03-26T02:00:00.000Z")])).toHaveLength(1);
    expect(repository.listAssessments()[0]).toMatchObject({
      id: "assessment-1",
      referenceText: "Desktop pronunciation feedback",
    });

    repository.close();
  });
});
