"use strict";

const crypto = require("node:crypto");
const fsSync = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { pathToFileURL } = require("node:url");

const DEFAULT_ANALYSIS_TASKS = ["transcript", "chaptering", "quality-ladder"];

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS video_items (
    id TEXT PRIMARY KEY,
    source_path TEXT NOT NULL UNIQUE,
    source_file_name TEXT NOT NULL,
    title TEXT NOT NULL,
    extension TEXT NOT NULL,
    mime_type TEXT,
    file_size_bytes INTEGER,
    duration_ms INTEGER,
    width INTEGER,
    height INTEGER,
    import_state TEXT NOT NULL,
    playback_strategy TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS video_variants (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    variant_key TEXT NOT NULL,
    label TEXT NOT NULL,
    kind TEXT NOT NULL,
    storage_path TEXT,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(video_id, variant_key),
    FOREIGN KEY(video_id) REFERENCES video_items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS video_thumbnails (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(video_id, kind),
    FOREIGN KEY(video_id) REFERENCES video_items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS video_analysis_jobs (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(video_id, task_type),
    FOREIGN KEY(video_id) REFERENCES video_items(id) ON DELETE CASCADE
  );
`;

function createVideoId(sourcePath) {
  return crypto.createHash("sha1").update(path.resolve(sourcePath)).digest("hex");
}

function normalizeMimeType(extension) {
  switch (extension) {
    case ".avi":
      return "video/x-msvideo";
    case ".flv":
      return "video/x-flv";
    case ".m4v":
      return "video/x-m4v";
    case ".mkv":
      return "video/x-matroska";
    case ".mov":
      return "video/quicktime";
    case ".mp4":
      return "video/mp4";
    case ".m2ts":
    case ".ts":
      return "video/mp2t";
    case ".ogv":
      return "video/ogg";
    case ".webm":
      return "video/webm";
    case ".wmv":
      return "video/x-ms-wmv";
    default:
      return null;
  }
}

function getThumbnailExtension(contentType) {
  if (typeof contentType !== "string") {
    return ".bin";
  }

  if (contentType.includes("png")) {
    return ".png";
  }

  if (contentType.includes("webp")) {
    return ".webp";
  }

  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return ".jpg";
  }

  return ".bin";
}

function filePathToUrl(filePath) {
  if (!filePath || !fsSync.existsSync(filePath)) {
    return null;
  }

  return pathToFileURL(filePath).toString();
}

function createDirectoryInfo(libraryPath, directories) {
  return {
    analysisDirectory: directories.analysisDirectory,
    directoryName: path.basename(libraryPath),
    hasLibrary: true,
    libraryPath,
    storageMode: "reference",
    thumbnailsDirectory: directories.thumbnailsDirectory,
    transcodesDirectory: directories.transcodesDirectory,
  };
}

function createVideoLibraryRepository({ databasePath, libraryDataPath, libraryPath }) {
  let libraryStats;

  try {
    libraryStats = fsSync.statSync(libraryPath);
  } catch {
    const error = new Error("The selected video folder is unavailable.");
    error.code = "VIDEO_LIBRARY_SOURCE_UNAVAILABLE";
    throw error;
  }

  if (!libraryStats.isDirectory()) {
    const error = new Error("The selected video path is not a folder.");
    error.code = "VIDEO_LIBRARY_SOURCE_UNAVAILABLE";
    throw error;
  }

  fsSync.mkdirSync(libraryDataPath, { recursive: true });
  fsSync.mkdirSync(path.dirname(databasePath), { recursive: true });

  const directories = {
    analysisDirectory: path.join(libraryDataPath, "analysis"),
    thumbnailsDirectory: path.join(libraryDataPath, "thumbnails"),
    transcodesDirectory: path.join(libraryDataPath, "transcodes"),
  };

  fsSync.mkdirSync(directories.analysisDirectory, { recursive: true });
  fsSync.mkdirSync(directories.thumbnailsDirectory, { recursive: true });
  fsSync.mkdirSync(directories.transcodesDirectory, { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec(SCHEMA_SQL);
  database.exec("PRAGMA foreign_keys = ON;");

  const listVideoItemsStatement = database.prepare(`
    SELECT
      items.id,
      items.source_path,
      items.source_file_name,
      items.title,
      items.extension,
      items.mime_type,
      items.file_size_bytes,
      items.duration_ms,
      items.width,
      items.height,
      items.import_state,
      items.playback_strategy,
      items.created_at,
      items.updated_at,
      poster.file_path AS thumbnail_path,
      COALESCE((
        SELECT COUNT(*)
        FROM video_variants AS variants
        WHERE variants.video_id = items.id
      ), 0) AS variant_count,
      COALESCE((
        SELECT CASE
          WHEN EXISTS (
            SELECT 1 FROM video_analysis_jobs AS jobs
            WHERE jobs.video_id = items.id AND jobs.status = 'failed'
          ) THEN 'failed'
          WHEN EXISTS (
            SELECT 1 FROM video_analysis_jobs AS jobs
            WHERE jobs.video_id = items.id AND jobs.status = 'running'
          ) THEN 'running'
          WHEN EXISTS (
            SELECT 1 FROM video_analysis_jobs AS jobs
            WHERE jobs.video_id = items.id AND jobs.status = 'queued'
          ) THEN 'queued'
          WHEN EXISTS (
            SELECT 1 FROM video_analysis_jobs AS jobs
            WHERE jobs.video_id = items.id AND jobs.status = 'completed'
          ) THEN 'completed'
          ELSE 'idle'
        END
      ), 'idle') AS analysis_status
    FROM video_items AS items
    LEFT JOIN video_thumbnails AS poster
      ON poster.video_id = items.id
      AND poster.kind = 'poster'
    ORDER BY items.updated_at DESC;
  `);
  const getVideoItemStatement = database.prepare(`
    SELECT
      items.id,
      items.source_path,
      items.source_file_name,
      items.title,
      items.extension,
      items.mime_type,
      items.file_size_bytes,
      items.duration_ms,
      items.width,
      items.height,
      items.import_state,
      items.playback_strategy,
      items.created_at,
      items.updated_at,
      poster.file_path AS thumbnail_path,
      COALESCE((
        SELECT COUNT(*)
        FROM video_variants AS variants
        WHERE variants.video_id = items.id
      ), 0) AS variant_count,
      COALESCE((
        SELECT CASE
          WHEN EXISTS (
            SELECT 1 FROM video_analysis_jobs AS jobs
            WHERE jobs.video_id = items.id AND jobs.status = 'failed'
          ) THEN 'failed'
          WHEN EXISTS (
            SELECT 1 FROM video_analysis_jobs AS jobs
            WHERE jobs.video_id = items.id AND jobs.status = 'running'
          ) THEN 'running'
          WHEN EXISTS (
            SELECT 1 FROM video_analysis_jobs AS jobs
            WHERE jobs.video_id = items.id AND jobs.status = 'queued'
          ) THEN 'queued'
          WHEN EXISTS (
            SELECT 1 FROM video_analysis_jobs AS jobs
            WHERE jobs.video_id = items.id AND jobs.status = 'completed'
          ) THEN 'completed'
          ELSE 'idle'
        END
      ), 'idle') AS analysis_status
    FROM video_items AS items
    LEFT JOIN video_thumbnails AS poster
      ON poster.video_id = items.id
      AND poster.kind = 'poster'
    WHERE items.id = ?;
  `);
  const listVideoVariantsStatement = database.prepare(`
    SELECT
      id,
      label,
      kind,
      storage_path,
      mime_type,
      width,
      height,
      duration_ms,
      status
    FROM video_variants
    WHERE video_id = ?
    ORDER BY variant_key ASC;
  `);
  const listAnalysisJobsStatement = database.prepare(`
    SELECT id, task_type, status, message, created_at, updated_at
    FROM video_analysis_jobs
    WHERE video_id = ?
    ORDER BY task_type ASC;
  `);
  const listVideoSourcesStatement = database.prepare(`
    SELECT id, source_path
    FROM video_items
    ORDER BY updated_at DESC;
  `);
  const getPosterStatement = database.prepare(`
    SELECT file_path
    FROM video_thumbnails
    WHERE video_id = ? AND kind = 'poster';
  `);
  const upsertVideoItemStatement = database.prepare(`
    INSERT INTO video_items (
      id,
      source_path,
      source_file_name,
      title,
      extension,
      mime_type,
      file_size_bytes,
      duration_ms,
      width,
      height,
      import_state,
      playback_strategy,
      created_at,
      updated_at
    ) VALUES (
      :id,
      :source_path,
      :source_file_name,
      :title,
      :extension,
      :mime_type,
      :file_size_bytes,
      :duration_ms,
      :width,
      :height,
      :import_state,
      :playback_strategy,
      :created_at,
      :updated_at
    )
    ON CONFLICT(source_path) DO UPDATE SET
      source_file_name = excluded.source_file_name,
      title = excluded.title,
      extension = excluded.extension,
      mime_type = excluded.mime_type,
      file_size_bytes = excluded.file_size_bytes,
      import_state = excluded.import_state,
      updated_at = excluded.updated_at;
  `);
  const upsertVariantStatement = database.prepare(`
    INSERT INTO video_variants (
      id,
      video_id,
      variant_key,
      label,
      kind,
      storage_path,
      mime_type,
      width,
      height,
      duration_ms,
      status,
      created_at,
      updated_at
    ) VALUES (
      :id,
      :video_id,
      :variant_key,
      :label,
      :kind,
      :storage_path,
      :mime_type,
      :width,
      :height,
      :duration_ms,
      :status,
      :created_at,
      :updated_at
    )
    ON CONFLICT(video_id, variant_key) DO UPDATE SET
      label = excluded.label,
      kind = excluded.kind,
      storage_path = excluded.storage_path,
      mime_type = excluded.mime_type,
      width = excluded.width,
      height = excluded.height,
      duration_ms = excluded.duration_ms,
      status = excluded.status,
      updated_at = excluded.updated_at;
  `);
  const upsertAnalysisJobStatement = database.prepare(`
    INSERT INTO video_analysis_jobs (
      id,
      video_id,
      task_type,
      status,
      message,
      created_at,
      updated_at
    ) VALUES (
      :id,
      :video_id,
      :task_type,
      :status,
      :message,
      :created_at,
      :updated_at
    )
    ON CONFLICT(video_id, task_type) DO UPDATE SET
      updated_at = excluded.updated_at;
  `);
  const upsertThumbnailStatement = database.prepare(`
    INSERT INTO video_thumbnails (
      id,
      video_id,
      kind,
      file_path,
      created_at,
      updated_at
    ) VALUES (
      :id,
      :video_id,
      :kind,
      :file_path,
      :created_at,
      :updated_at
    )
    ON CONFLICT(video_id, kind) DO UPDATE SET
      file_path = excluded.file_path,
      updated_at = excluded.updated_at;
  `);
  const updateItemMetadataStatement = database.prepare(`
    UPDATE video_items
    SET duration_ms = :duration_ms,
        width = :width,
        height = :height,
        updated_at = :updated_at
    WHERE id = :id;
  `);
  const updateSourceVariantMetadataStatement = database.prepare(`
    UPDATE video_variants
    SET duration_ms = :duration_ms,
        width = :width,
        height = :height,
        updated_at = :updated_at
    WHERE video_id = :video_id
      AND variant_key = 'source';
  `);
  const updateVideoFileStateStatement = database.prepare(`
    UPDATE video_items
    SET file_size_bytes = :file_size_bytes,
        import_state = :import_state,
        updated_at = :updated_at
    WHERE id = :id;
  `);

  function mapVideoRow(row) {
    return {
      analysisStatus: row.analysis_status,
      durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null,
      extension: row.extension,
      fileSizeBytes: typeof row.file_size_bytes === "number" ? row.file_size_bytes : null,
      height: typeof row.height === "number" ? row.height : null,
      id: row.id,
      importState: row.import_state,
      importedAt: row.created_at,
      mimeType: row.mime_type,
      playbackStrategy: row.playback_strategy,
      posterUrl: filePathToUrl(row.thumbnail_path),
      sourceFileName: row.source_file_name,
      sourcePath: row.source_path,
      sourceUrl: filePathToUrl(row.source_path),
      title: row.title,
      updatedAt: row.updated_at,
      variantCount: Number(row.variant_count ?? 0),
      width: typeof row.width === "number" ? row.width : null,
    };
  }

  function listVideoItems() {
    return listVideoItemsStatement.all().map(mapVideoRow);
  }

  function getSnapshot() {
    return {
      directory: createDirectoryInfo(libraryPath, directories),
      items: listVideoItems(),
    };
  }

  function getVideoDetails(videoId) {
    const row = getVideoItemStatement.get(videoId);

    if (!row) {
      return null;
    }

    return {
      analysisJobs: listAnalysisJobsStatement.all(videoId).map((job) => ({
        createdAt: job.created_at,
        id: job.id,
        message: job.message,
        status: job.status,
        taskType: job.task_type,
        updatedAt: job.updated_at,
      })),
      variants: listVideoVariantsStatement.all(videoId).map((variant) => ({
        durationMs: typeof variant.duration_ms === "number" ? variant.duration_ms : null,
        height: typeof variant.height === "number" ? variant.height : null,
        id: variant.id,
        kind: variant.kind,
        label: variant.label,
        mimeType: variant.mime_type,
        playbackUrl: filePathToUrl(variant.storage_path),
        status: variant.status,
        storagePath: variant.storage_path,
        width: typeof variant.width === "number" ? variant.width : null,
      })),
      video: mapVideoRow(row),
    };
  }

  function withTransaction(callback) {
    database.exec("BEGIN");

    try {
      const result = callback();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function ensureSourceVariant(videoId, sourcePath, mimeType) {
    const timestamp = new Date().toISOString();

    upsertVariantStatement.run({
      created_at: timestamp,
      duration_ms: null,
      height: null,
      id: `${videoId}-source`,
      kind: "source",
      label: "原始",
      mime_type: mimeType,
      status: "ready",
      storage_path: sourcePath,
      updated_at: timestamp,
      variant_key: "source",
      video_id: videoId,
      width: null,
    });
  }

  function ensureAnalysisJobs(videoId) {
    const timestamp = new Date().toISOString();

    DEFAULT_ANALYSIS_TASKS.forEach((taskType) => {
      upsertAnalysisJobStatement.run({
        created_at: timestamp,
        id: `${videoId}-${taskType}`,
        message: null,
        status: "idle",
        task_type: taskType,
        updated_at: timestamp,
        video_id: videoId,
      });
    });
  }

  function importVideoFiles(filePaths) {
    const candidates = Array.isArray(filePaths) ? filePaths : [];

    withTransaction(() => {
      candidates.forEach((candidatePath) => {
        if (typeof candidatePath !== "string" || !candidatePath.trim()) {
          return;
        }

        const sourcePath = path.resolve(candidatePath);

        if (!fsSync.existsSync(sourcePath)) {
          return;
        }

        const stats = fsSync.statSync(sourcePath);

        if (!stats.isFile()) {
          return;
        }

        const extension = path.extname(sourcePath).toLowerCase();
        const videoId = createVideoId(sourcePath);
        const timestamp = new Date().toISOString();

        upsertVideoItemStatement.run({
          created_at: timestamp,
          duration_ms: null,
          extension,
          file_size_bytes: stats.size,
          height: null,
          id: videoId,
          import_state: "ready",
          mime_type: normalizeMimeType(extension),
          playback_strategy: "source-preferred",
          source_file_name: path.basename(sourcePath),
          source_path: sourcePath,
          title: path.basename(sourcePath, extension),
          updated_at: timestamp,
          width: null,
        });

        ensureSourceVariant(videoId, sourcePath, normalizeMimeType(extension));
        ensureAnalysisJobs(videoId);
      });
    });

    return getSnapshot();
  }

  function updateSourceMetadata(videoId, metadata) {
    const nextMetadata = metadata && typeof metadata === "object" ? metadata : {};
    const updatedAt = new Date().toISOString();

    withTransaction(() => {
      updateItemMetadataStatement.run({
        duration_ms:
          typeof nextMetadata.durationMs === "number" ? nextMetadata.durationMs : null,
        height: typeof nextMetadata.height === "number" ? nextMetadata.height : null,
        id: videoId,
        updated_at: updatedAt,
        width: typeof nextMetadata.width === "number" ? nextMetadata.width : null,
      });
      updateSourceVariantMetadataStatement.run({
        duration_ms:
          typeof nextMetadata.durationMs === "number" ? nextMetadata.durationMs : null,
        height: typeof nextMetadata.height === "number" ? nextMetadata.height : null,
        updated_at: updatedAt,
        video_id: videoId,
        width: typeof nextMetadata.width === "number" ? nextMetadata.width : null,
      });
    });

    return getVideoDetails(videoId);
  }

  function saveThumbnail(videoId, thumbnail) {
    if (
      !thumbnail ||
      typeof thumbnail !== "object" ||
      !(thumbnail.bytes instanceof Uint8Array)
    ) {
      throw new Error("INVALID_VIDEO_THUMBNAIL");
    }

    const existingPoster = getPosterStatement.get(videoId);
    const extension = getThumbnailExtension(thumbnail.contentType);
    const targetPath = path.join(directories.thumbnailsDirectory, `${videoId}${extension}`);
    const updatedAt = new Date().toISOString();

    fsSync.writeFileSync(targetPath, Buffer.from(thumbnail.bytes));

    withTransaction(() => {
      upsertThumbnailStatement.run({
        created_at: updatedAt,
        file_path: targetPath,
        id: `${videoId}-poster`,
        kind: "poster",
        updated_at: updatedAt,
        video_id: videoId,
      });
    });

    if (
      existingPoster &&
      existingPoster.file_path &&
      existingPoster.file_path !== targetPath &&
      fsSync.existsSync(existingPoster.file_path)
    ) {
      fsSync.rmSync(existingPoster.file_path, { force: true });
    }

    return getVideoDetails(videoId);
  }

  function refreshLibrary() {
    withTransaction(() => {
      listVideoSourcesStatement.all().forEach((item) => {
        const exists = fsSync.existsSync(item.source_path);
        const stats = exists ? fsSync.statSync(item.source_path) : null;

        updateVideoFileStateStatement.run({
          file_size_bytes: stats && stats.isFile() ? stats.size : null,
          id: item.id,
          import_state: exists ? "ready" : "missing",
          updated_at: new Date().toISOString(),
        });
      });
    });

    return getSnapshot();
  }

  return {
    close() {
      database.close();
    },
    getSnapshot,
    getVideoDetails,
    importVideoFiles,
    refreshLibrary,
    saveThumbnail,
    updateSourceMetadata,
  };
}

module.exports = {
  createVideoLibraryRepository,
};
