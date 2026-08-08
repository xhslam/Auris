import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createVideoLibraryRepository } = require("../../../electron/video-library-db.cjs");

describe("video-library-db", () => {
  let tempDirectory: string | null = null;

  afterEach(async () => {
    if (tempDirectory) {
      await fs.rm(tempDirectory, { force: true, recursive: true });
      tempDirectory = null;
    }
  });

  async function createRepository() {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shadowing-video-library-"));
    const libraryPath = path.join(tempDirectory, "video-library");
    const libraryDataPath = path.join(tempDirectory, "app-data");
    const databasePath = path.join(libraryDataPath, "shadowing-video-library.db");

    await fs.mkdir(libraryPath);

    return {
      libraryDataPath,
      libraryPath,
      repository: createVideoLibraryRepository({
        databasePath,
        libraryDataPath,
        libraryPath,
      }),
    };
  }

  it("keeps generated database and cache files outside the selected source directory", async () => {
    const { libraryDataPath, libraryPath, repository } = await createRepository();
    const directory = repository.getSnapshot().directory;

    repository.close();

    expect(await fs.readdir(libraryPath)).toEqual([]);
    expect(await fs.readdir(libraryDataPath)).toEqual([
      "analysis",
      "shadowing-video-library.db",
      "thumbnails",
      "transcodes",
    ]);
    expect(directory).toMatchObject({
      analysisDirectory: path.join(libraryDataPath, "analysis"),
      libraryPath,
      thumbnailsDirectory: path.join(libraryDataPath, "thumbnails"),
      transcodesDirectory: path.join(libraryDataPath, "transcodes"),
    });

  });

  it("rejects a missing source directory without recreating it", async () => {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shadowing-video-library-"));
    const libraryPath = path.join(tempDirectory, "missing-source");
    const libraryDataPath = path.join(tempDirectory, "app-data");
    let repository: ReturnType<typeof createVideoLibraryRepository> | null = null;
    let creationError: unknown = null;

    try {
      repository = createVideoLibraryRepository({
        databasePath: path.join(libraryDataPath, "shadowing-video-library.db"),
        libraryDataPath,
        libraryPath,
      });
    } catch (error) {
      creationError = error;
    } finally {
      repository?.close();
    }

    expect(creationError).toMatchObject({ code: "VIDEO_LIBRARY_SOURCE_UNAVAILABLE" });
    await expect(fs.access(libraryPath)).rejects.toThrow();
  });

  it("imports local videos as referenced library items with source variants and idle analysis jobs", async () => {
    const { libraryPath, repository } = await createRepository();
    const sourcePath = path.join(tempDirectory!, "lesson-one.mp4");

    await fs.writeFile(sourcePath, "fake-video");

    const snapshot = repository.importVideoFiles([sourcePath]);

    expect(snapshot.directory).toMatchObject({
      directoryName: "video-library",
      hasLibrary: true,
      libraryPath,
      storageMode: "reference",
    });
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({
      extension: ".mp4",
      importState: "ready",
      playbackStrategy: "source-preferred",
      sourcePath,
      sourceUrl: expect.stringContaining("file:///"),
      title: "lesson-one",
      variantCount: 1,
    });

    const detail = repository.getVideoDetails(snapshot.items[0].id);

    expect(detail?.variants).toEqual([
      expect.objectContaining({
        kind: "source",
        label: "原始",
        status: "ready",
        storagePath: sourcePath,
      }),
    ]);
    expect(detail?.analysisJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "idle",
          taskType: "transcript",
        }),
        expect.objectContaining({
          status: "idle",
          taskType: "quality-ladder",
        }),
      ]),
    );

    repository.close();
  });

  it("persists thumbnails and metadata back onto the referenced source item", async () => {
    const { repository } = await createRepository();
    const sourcePath = path.join(tempDirectory!, "lecture.mov");

    await fs.writeFile(sourcePath, "fake-video");

    const snapshot = repository.importVideoFiles([sourcePath]);
    const videoId = snapshot.items[0].id;

    repository.updateSourceMetadata(videoId, {
      durationMs: 14_400_000,
      height: 1080,
      width: 1920,
    });
    repository.saveThumbnail(videoId, {
      bytes: new Uint8Array([137, 80, 78, 71]),
      contentType: "image/png",
    });

    const detail = repository.getVideoDetails(videoId);

    expect(detail?.video).toMatchObject({
      durationMs: 14_400_000,
      height: 1080,
      posterUrl: expect.stringContaining("file:///"),
      width: 1920,
    });
    expect(detail?.variants[0]).toMatchObject({
      durationMs: 14_400_000,
      height: 1080,
      width: 1920,
    });

    repository.close();
  });

  it("marks videos as missing after a rescan when the original source file disappears", async () => {
    const { repository } = await createRepository();
    const sourcePath = path.join(tempDirectory!, "archive.webm");

    await fs.writeFile(sourcePath, "fake-video");

    const snapshot = repository.importVideoFiles([sourcePath]);
    await fs.rm(sourcePath, { force: true });

    const rescanned = repository.refreshLibrary();

    expect(rescanned.items[0]).toMatchObject({
      id: snapshot.items[0].id,
      importState: "missing",
    });

    repository.close();
  });
});
