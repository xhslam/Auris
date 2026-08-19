"use strict";

const fsSync = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { pathToFileURL } = require("node:url");

const HISTORY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS training_sessions (
    id TEXT PRIMARY KEY,
    source_type TEXT,
    title TEXT NOT NULL,
    original_text TEXT,
    normalized_text TEXT,
    status TEXT NOT NULL,
    voice_id TEXT,
    speed_default REAL,
    duration_ms INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS training_audio_assets (
    session_id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    content_type TEXT,
    duration_ms INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES training_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS training_sentences (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    FOREIGN KEY(session_id) REFERENCES training_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS training_word_tokens (
    id TEXT PRIMARY KEY,
    sentence_id TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    FOREIGN KEY(sentence_id) REFERENCES training_sentences(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assessment_records (
    id TEXT PRIMARY KEY,
    reference_text TEXT NOT NULL,
    locale TEXT NOT NULL,
    source_label TEXT NOT NULL,
    overall_score REAL NOT NULL,
    accuracy_score REAL NOT NULL,
    fluency_score REAL NOT NULL,
    completeness_score REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assessment_word_items (
    id TEXT PRIMARY KEY,
    assessment_id TEXT NOT NULL,
    word TEXT NOT NULL,
    accuracy_score REAL NOT NULL,
    error_type TEXT NOT NULL,
    FOREIGN KEY(assessment_id) REFERENCES assessment_records(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS local_history_metadata (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`;

function normalizeRecentSession(row) {
  return {
    id: row.id,
    status: row.status,
    title: row.title,
  };
}

function normalizePlayback(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input;
  const session = candidate.session;

  if (!session || typeof session !== "object" || typeof session.id !== "string") {
    return null;
  }

  return {
    sentences: Array.isArray(candidate.sentences)
      ? candidate.sentences.map((sentence) => ({
          endMs: Number(sentence.endMs ?? 0),
          id: String(sentence.id),
          orderIndex: Number(sentence.orderIndex ?? 0),
          sessionId: String(sentence.sessionId ?? session.id),
          startMs: Number(sentence.startMs ?? 0),
          text: String(sentence.text ?? ""),
        }))
      : [],
    session: {
      audioUrl:
        typeof session.audioUrl === "string" && session.audioUrl.trim()
          ? session.audioUrl
          : null,
      durationMs: typeof session.durationMs === "number" ? session.durationMs : null,
      id: session.id,
      speedDefault: typeof session.speedDefault === "number" ? session.speedDefault : 1,
      status: typeof session.status === "string" ? session.status : "ready",
      title:
        typeof session.title === "string" && session.title.trim()
          ? session.title.trim()
          : "Untitled Session",
      voiceId:
        typeof session.voiceId === "string" && session.voiceId.trim()
          ? session.voiceId.trim()
          : "alloy",
    },
    wordTokens: Array.isArray(candidate.wordTokens)
      ? candidate.wordTokens.map((token) => ({
          endMs: Number(token.endMs ?? 0),
          id: String(token.id),
          orderIndex: Number(token.orderIndex ?? 0),
          sentenceId: String(token.sentenceId ?? ""),
          startMs: Number(token.startMs ?? 0),
          text: String(token.text ?? ""),
        }))
      : [],
  };
}

function normalizeAssessmentRecord(record) {
  return {
    accuracyScore: Number(record.accuracyScore ?? 0),
    completenessScore: Number(record.completenessScore ?? 0),
    createdAt:
      typeof record.createdAt === "string" && record.createdAt.trim()
        ? record.createdAt
        : new Date().toISOString(),
    fluencyScore: Number(record.fluencyScore ?? 0),
    id: String(record.id),
    locale:
      typeof record.locale === "string" && record.locale.trim() ? record.locale : "en-US",
    overallScore: Number(record.overallScore ?? 0),
    referenceText: String(record.referenceText ?? ""),
    sourceLabel:
      typeof record.sourceLabel === "string" && record.sourceLabel.trim()
        ? record.sourceLabel
        : "Desktop",
    wordAssessments: Array.isArray(record.wordAssessments)
      ? record.wordAssessments.map((item, index) => ({
          accuracyScore: Number(item.accuracyScore ?? 0),
          errorType:
            typeof item.errorType === "string" && item.errorType.trim()
              ? item.errorType
              : "None",
          id:
            typeof item.id === "string" && item.id.trim()
              ? item.id
              : `${record.id}-word-${index}`,
          word: String(item.word ?? ""),
        }))
      : [],
  };
}

function getFileExtension(contentType) {
  if (typeof contentType !== "string") {
    return ".bin";
  }

  if (contentType.includes("wav")) {
    return ".wav";
  }

  if (contentType.includes("mpeg") || contentType.includes("mp3")) {
    return ".mp3";
  }

  if (contentType.includes("ogg")) {
    return ".ogg";
  }

  if (contentType.includes("webm")) {
    return ".webm";
  }

  return ".bin";
}

function readLocalFileUrl(filePath) {
  if (!filePath || !fsSync.existsSync(filePath)) {
    return null;
  }

  return pathToFileURL(filePath).toString();
}

function createLocalHistoryRepository({ databasePath, trainingAudioDirectory }) {
  fsSync.mkdirSync(path.dirname(databasePath), { recursive: true });
  fsSync.mkdirSync(trainingAudioDirectory, { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec(HISTORY_SCHEMA_SQL);
  database.exec("PRAGMA foreign_keys = ON;");

  const getMetadataStatement = database.prepare(
    "SELECT value FROM local_history_metadata WHERE key = ?;",
  );
  const upsertMetadataStatement = database.prepare(`
    INSERT INTO local_history_metadata (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `);

  const listRecentTrainingSessionsStatement = database.prepare(`
    SELECT id, status, title
    FROM training_sessions
    ORDER BY updated_at DESC;
  `);
  const getTrainingSessionStatement = database.prepare(`
    SELECT
      sessions.id,
      sessions.title,
      sessions.status,
      sessions.voice_id,
      sessions.speed_default,
      sessions.duration_ms,
      assets.file_path AS audio_file_path
    FROM training_sessions AS sessions
    LEFT JOIN training_audio_assets AS assets
      ON assets.session_id = sessions.id
    WHERE sessions.id = ?;
  `);
  const listTrainingSentencesStatement = database.prepare(`
    SELECT id, session_id, order_index, text, start_ms, end_ms
    FROM training_sentences
    WHERE session_id = ?
    ORDER BY order_index ASC;
  `);
  const listTrainingWordTokensStatement = database.prepare(`
    SELECT id, sentence_id, order_index, text, start_ms, end_ms
    FROM training_word_tokens
    WHERE sentence_id IN (
      SELECT id FROM training_sentences WHERE session_id = ?
    )
    ORDER BY sentence_id ASC, order_index ASC;
  `);
  const upsertTrainingSessionStatement = database.prepare(`
    INSERT INTO training_sessions (
      id,
      source_type,
      title,
      original_text,
      normalized_text,
      status,
      voice_id,
      speed_default,
      duration_ms,
      created_at,
      updated_at
    ) VALUES (
      :id,
      :source_type,
      :title,
      :original_text,
      :normalized_text,
      :status,
      :voice_id,
      :speed_default,
      :duration_ms,
      :created_at,
      :updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      source_type = excluded.source_type,
      title = excluded.title,
      original_text = excluded.original_text,
      normalized_text = excluded.normalized_text,
      status = excluded.status,
      voice_id = excluded.voice_id,
      speed_default = excluded.speed_default,
      duration_ms = excluded.duration_ms,
      updated_at = excluded.updated_at;
  `);
  const deleteTrainingSessionStatement = database.prepare(
    "DELETE FROM training_sessions WHERE id = ?;",
  );
  const deleteTrainingSentencesStatement = database.prepare(
    "DELETE FROM training_sentences WHERE session_id = ?;",
  );
  const deleteTrainingWordTokensBySessionStatement = database.prepare(`
    DELETE FROM training_word_tokens
    WHERE sentence_id IN (
      SELECT id FROM training_sentences WHERE session_id = ?
    );
  `);
  const upsertTrainingAudioAssetStatement = database.prepare(`
    INSERT INTO training_audio_assets (
      session_id,
      file_path,
      content_type,
      duration_ms,
      created_at
    ) VALUES (
      :session_id,
      :file_path,
      :content_type,
      :duration_ms,
      :created_at
    )
    ON CONFLICT(session_id) DO UPDATE SET
      file_path = excluded.file_path,
      content_type = excluded.content_type,
      duration_ms = excluded.duration_ms,
      created_at = excluded.created_at;
  `);
  const getTrainingAudioAssetStatement = database.prepare(
    "SELECT file_path FROM training_audio_assets WHERE session_id = ?;",
  );
  const insertTrainingSentenceStatement = database.prepare(`
    INSERT INTO training_sentences (
      id,
      session_id,
      order_index,
      text,
      start_ms,
      end_ms
    ) VALUES (?, ?, ?, ?, ?, ?);
  `);
  const insertTrainingWordTokenStatement = database.prepare(`
    INSERT INTO training_word_tokens (
      id,
      sentence_id,
      order_index,
      text,
      start_ms,
      end_ms
    ) VALUES (?, ?, ?, ?, ?, ?);
  `);

  const listAssessmentsStatement = database.prepare(`
    SELECT
      id,
      reference_text,
      locale,
      source_label,
      overall_score,
      accuracy_score,
      fluency_score,
      completeness_score,
      created_at
    FROM assessment_records
    ORDER BY created_at DESC;
  `);
  const listAssessmentWordItemsStatement = database.prepare(`
    SELECT id, assessment_id, word, accuracy_score, error_type
    FROM assessment_word_items
    WHERE assessment_id = ?
    ORDER BY rowid ASC;
  `);
  const upsertAssessmentStatement = database.prepare(`
    INSERT INTO assessment_records (
      id,
      reference_text,
      locale,
      source_label,
      overall_score,
      accuracy_score,
      fluency_score,
      completeness_score,
      created_at
    ) VALUES (
      :id,
      :reference_text,
      :locale,
      :source_label,
      :overall_score,
      :accuracy_score,
      :fluency_score,
      :completeness_score,
      :created_at
    )
    ON CONFLICT(id) DO UPDATE SET
      reference_text = excluded.reference_text,
      locale = excluded.locale,
      source_label = excluded.source_label,
      overall_score = excluded.overall_score,
      accuracy_score = excluded.accuracy_score,
      fluency_score = excluded.fluency_score,
      completeness_score = excluded.completeness_score,
      created_at = excluded.created_at;
  `);
  const deleteAssessmentWordItemsStatement = database.prepare(
    "DELETE FROM assessment_word_items WHERE assessment_id = ?;",
  );
  const deleteAssessmentStatement = database.prepare(
    "DELETE FROM assessment_records WHERE id = ?;",
  );
  const insertAssessmentWordItemStatement = database.prepare(`
    INSERT INTO assessment_word_items (
      id,
      assessment_id,
      word,
      accuracy_score,
      error_type
    ) VALUES (?, ?, ?, ?, ?);
  `);

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

  function writeTrainingAudioAsset(sessionId, audioAsset, durationMs) {
    if (!audioAsset?.bytes || !(audioAsset.bytes instanceof Uint8Array)) {
      return null;
    }

    const extension = getFileExtension(audioAsset.contentType);
    const targetPath = path.join(trainingAudioDirectory, `${sessionId}${extension}`);
    fsSync.writeFileSync(targetPath, Buffer.from(audioAsset.bytes));

    upsertTrainingAudioAssetStatement.run({
      content_type: audioAsset.contentType ?? null,
      created_at: new Date().toISOString(),
      duration_ms: typeof durationMs === "number" ? durationMs : null,
      file_path: targetPath,
      session_id: sessionId,
    });

    return targetPath;
  }

  function mapAssessmentRow(row) {
    return {
      accuracyScore: row.accuracy_score,
      completenessScore: row.completeness_score,
      createdAt: row.created_at,
      fluencyScore: row.fluency_score,
      id: row.id,
      locale: row.locale,
      overallScore: row.overall_score,
      referenceText: row.reference_text,
      sourceLabel: row.source_label,
      wordAssessments: listAssessmentWordItemsStatement.all(row.id).map((item) => ({
        accuracyScore: item.accuracy_score,
        errorType: item.error_type,
        id: item.id,
        word: item.word,
      })),
    };
  }

  function listRecentTrainingSessions() {
    return listRecentTrainingSessionsStatement.all().map(normalizeRecentSession);
  }

  function getTrainingPlayback(sessionId) {
    const sessionRow = getTrainingSessionStatement.get(sessionId);

    if (!sessionRow) {
      return null;
    }

    const sentences = listTrainingSentencesStatement.all(sessionId).map((sentence) => ({
      endMs: sentence.end_ms,
      id: sentence.id,
      orderIndex: sentence.order_index,
      sessionId: sentence.session_id,
      startMs: sentence.start_ms,
      text: sentence.text,
    }));
    const wordTokens = listTrainingWordTokensStatement.all(sessionId).map((token) => ({
      endMs: token.end_ms,
      id: token.id,
      orderIndex: token.order_index,
      sentenceId: token.sentence_id,
      startMs: token.start_ms,
      text: token.text,
    }));

    return {
      sentences,
      session: {
        audioUrl: readLocalFileUrl(sessionRow.audio_file_path),
        durationMs: sessionRow.duration_ms,
        id: sessionRow.id,
        speedDefault: sessionRow.speed_default,
        status: sessionRow.status,
        title: sessionRow.title,
        voiceId: sessionRow.voice_id,
      },
      wordTokens,
    };
  }

  function savePreparedTrainingSession(input) {
    const playback = normalizePlayback(input?.playback);

    if (!playback) {
      throw new Error("INVALID_TRAINING_PLAYBACK");
    }

    const createdAt =
      typeof input?.createdAt === "string" && input.createdAt.trim()
        ? input.createdAt
        : new Date().toISOString();
    const updatedAt = new Date().toISOString();

    withTransaction(() => {
      upsertTrainingSessionStatement.run({
        created_at: createdAt,
        duration_ms:
          typeof playback.session.durationMs === "number" ? playback.session.durationMs : null,
        id: playback.session.id,
        normalized_text:
          typeof input?.normalizedText === "string" ? input.normalizedText : input?.originalText ?? null,
        original_text: typeof input?.originalText === "string" ? input.originalText : null,
        source_type:
          typeof input?.sourceType === "string" && input.sourceType.trim()
            ? input.sourceType
            : "paste",
        speed_default:
          typeof playback.session.speedDefault === "number"
            ? playback.session.speedDefault
            : 1,
        status: playback.session.status,
        title:
          typeof input?.title === "string" && input.title.trim()
            ? input.title.trim()
            : playback.session.title,
        updated_at: updatedAt,
        voice_id: playback.session.voiceId ?? null,
      });

      deleteTrainingWordTokensBySessionStatement.run(playback.session.id);
      deleteTrainingSentencesStatement.run(playback.session.id);

      playback.sentences.forEach((sentence) => {
        insertTrainingSentenceStatement.run(
          sentence.id,
          playback.session.id,
          sentence.orderIndex,
          sentence.text,
          sentence.startMs,
          sentence.endMs,
        );
      });

      playback.wordTokens.forEach((token) => {
        insertTrainingWordTokenStatement.run(
          token.id,
          token.sentenceId,
          token.orderIndex,
          token.text,
          token.startMs,
          token.endMs,
        );
      });

      writeTrainingAudioAsset(
        playback.session.id,
        input?.audioAsset ?? null,
        playback.session.durationMs,
      );
    });
  }

  function deleteTrainingSession(sessionId) {
    const assetRow = getTrainingAudioAssetStatement.get(sessionId);

    withTransaction(() => {
      deleteTrainingSessionStatement.run(sessionId);
    });

    if (assetRow?.file_path && fsSync.existsSync(assetRow.file_path)) {
      fsSync.rmSync(assetRow.file_path, { force: true });
    }
  }

  function listAssessments() {
    return listAssessmentsStatement.all().map(mapAssessmentRow);
  }

  function persistAssessmentRecord(normalizedRecord) {
    upsertAssessmentStatement.run({
      accuracy_score: normalizedRecord.accuracyScore,
      completeness_score: normalizedRecord.completenessScore,
      created_at: normalizedRecord.createdAt,
      fluency_score: normalizedRecord.fluencyScore,
      id: normalizedRecord.id,
      locale: normalizedRecord.locale,
      overall_score: normalizedRecord.overallScore,
      reference_text: normalizedRecord.referenceText,
      source_label: normalizedRecord.sourceLabel,
    });

    deleteAssessmentWordItemsStatement.run(normalizedRecord.id);

    normalizedRecord.wordAssessments.forEach((item, index) => {
      insertAssessmentWordItemStatement.run(
        item.id ?? `${normalizedRecord.id}-word-${index}`,
        normalizedRecord.id,
        item.word,
        item.accuracyScore,
        item.errorType,
      );
    });
  }

  function deleteAssessment(assessmentId) {
    withTransaction(() => {
      deleteAssessmentWordItemsStatement.run(assessmentId);
      deleteAssessmentStatement.run(assessmentId);
    });

    return listAssessments();
  }

  function saveAssessment(record) {
    const normalizedRecord = normalizeAssessmentRecord(record);

    withTransaction(() => {
      persistAssessmentRecord(normalizedRecord);
    });

    return listAssessments();
  }

  function importLegacyAssessments(records) {
    const migratedAt = getMetadataStatement.get("assessment_history_legacy_migrated_at");

    if (migratedAt?.value) {
      return listAssessments();
    }

    withTransaction(() => {
      (Array.isArray(records) ? records : []).forEach((record) => {
        persistAssessmentRecord(normalizeAssessmentRecord(record));
      });

      upsertMetadataStatement.run(
        "assessment_history_legacy_migrated_at",
        new Date().toISOString(),
      );
    });

    return listAssessments();
  }

  return {
    close() {
      database.close();
    },
    deleteAssessment,
    deleteTrainingSession,
    getTrainingPlayback,
    importLegacyAssessments,
    listAssessments,
    listRecentTrainingSessions,
    saveAssessment,
    savePreparedTrainingSession,
  };
}

module.exports = {
  createLocalHistoryRepository,
};
