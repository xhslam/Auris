"use strict";

const fsSync = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_PROMPT_LIBRARY = [
  {
    category: "Shadowing",
    content: "Turn this article into a shadowing drill with 5 chunks and pause markers.",
    tags: ["shadowing", "practice"],
    title: "Build Shadowing Drill",
    variables: ["difficulty"],
  },
  {
    category: "Writing",
    content: "Rewrite this paragraph in concise, natural English while preserving meaning.",
    tags: ["rewrite", "writing"],
    title: "Rewrite Paragraph",
    variables: ["tone"],
  },
  {
    category: "Study",
    content: "Summarize the key ideas as a study note with bullets and one memory hook.",
    tags: ["summary", "study"],
    title: "Create Study Notes",
    variables: ["audience"],
  },
  {
    category: "Vocabulary",
    content: "Extract important vocabulary with definitions, collocations, and one example sentence each.",
    tags: ["vocabulary", "lexicon"],
    title: "Extract Vocabulary",
    variables: ["level"],
  },
  {
    category: "Feedback",
    content: "Review this writing like a strict but kind English coach and suggest the top 5 improvements.",
    tags: ["feedback", "coach"],
    title: "Writing Coach Review",
    variables: ["goal"],
  },
];

const AI_LIBRARY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS ai_prompt_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    variables_json TEXT NOT NULL,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    last_used INTEGER,
    use_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    notes TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    url TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    modified_at INTEGER NOT NULL
  );
`;

const AI_PROVIDER_IDS = ["chatgpt", "gemini", "google", "deepseek"];

function normalizeProvider(value) {
  return AI_PROVIDER_IDS.includes(value) ? value : "chatgpt";
}

function normalizeString(value, fallback = "", maximumLength = 20_000) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximumLength) : fallback;
}

function normalizeArray(value, maximumItems = 20, maximumItemLength = 50) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => normalizeString(String(entry ?? ""), "", maximumItemLength))
        .filter(Boolean),
    ),
  ).slice(0, maximumItems);
}

function parseJsonArray(value) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    return normalizeArray(JSON.parse(value));
  } catch {
    return [];
  }
}

function deriveTitle(candidateTitle, content, fallback) {
  const normalizedTitle = normalizeString(candidateTitle, "", 180);

  if (normalizedTitle) {
    return normalizedTitle;
  }

  const firstLine = normalizeString(content.split("\n")[0] ?? "", "", 180);
  return firstLine || fallback;
}

function normalizePromptInput(input) {
  const now = Date.now();
  const content = normalizeString(input?.content, "", 50_000);

  if (!content) {
    return null;
  }

  return {
    category: normalizeString(input?.category, "General", 80),
    content,
    createdAt:
      typeof input?.createdAt === "number" && Number.isFinite(input.createdAt)
        ? Math.round(input.createdAt)
        : now,
    isFavorite: Boolean(input?.isFavorite),
    lastUsed:
      typeof input?.lastUsed === "number" && Number.isFinite(input.lastUsed)
        ? Math.round(input.lastUsed)
        : null,
    tags: normalizeArray(input?.tags),
    title: deriveTitle(input?.title, content, "Untitled Prompt"),
    updatedAt: now,
    useCount:
      typeof input?.useCount === "number" && Number.isFinite(input.useCount)
        ? Math.max(0, Math.round(input.useCount))
        : 0,
    variables: normalizeArray(input?.variables, 20, 40),
  };
}

function normalizeHistoryInput(input) {
  const now = Date.now();
  const content = normalizeString(input?.content, "", 100_000);

  if (!content) {
    return null;
  }

  const timestamp =
    typeof input?.timestamp === "number" && Number.isFinite(input.timestamp)
      ? Math.round(input.timestamp)
      : now;

  return {
    content,
    conversationId: normalizeString(input?.conversationId, "", 400),
    isFavorite: Boolean(input?.isFavorite),
    modifiedAt:
      typeof input?.modifiedAt === "number" && Number.isFinite(input.modifiedAt)
        ? Math.round(input.modifiedAt)
        : now,
    notes: normalizeString(input?.notes, "", 5_000),
    provider: normalizeProvider(input?.provider),
    tags: normalizeArray(input?.tags),
    timestamp,
    title: deriveTitle(input?.title, content, "Untitled Conversation"),
    url: normalizeString(input?.url, "", 2_000),
  };
}

function mapPromptRow(row) {
  return {
    category: row.category,
    content: row.content,
    id: row.id,
    isFavorite: row.is_favorite === 1,
    lastUsed: typeof row.last_used === "number" ? row.last_used : null,
    tags: parseJsonArray(row.tags_json),
    title: row.title,
    useCount: row.use_count,
    variables: parseJsonArray(row.variables_json),
  };
}

function mapHistoryRow(row) {
  return {
    content: row.content,
    conversationId: row.conversation_id,
    id: row.id,
    isFavorite: row.is_favorite === 1,
    modifiedAt: row.modified_at,
    notes: row.notes,
    provider: normalizeProvider(row.provider),
    tags: parseJsonArray(row.tags_json),
    timestamp: row.timestamp,
    title: row.title,
    url: row.url,
  };
}

function createAiLibraryRepository(databasePath) {
  fsSync.mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec(AI_LIBRARY_SCHEMA_SQL);

  const listPromptsStatement = database.prepare(`
    SELECT *
    FROM ai_prompt_library
    ORDER BY is_favorite DESC, COALESCE(last_used, 0) DESC, updated_at DESC, title COLLATE NOCASE ASC;
  `);
  const getPromptStatement = database.prepare(
    "SELECT * FROM ai_prompt_library WHERE id = ?;",
  );
  const insertPromptStatement = database.prepare(`
    INSERT INTO ai_prompt_library (
      title,
      content,
      category,
      tags_json,
      variables_json,
      is_favorite,
      last_used,
      use_count,
      created_at,
      updated_at
    ) VALUES (
      :title,
      :content,
      :category,
      :tags_json,
      :variables_json,
      :is_favorite,
      :last_used,
      :use_count,
      :created_at,
      :updated_at
    );
  `);
  const updatePromptStatement = database.prepare(`
    UPDATE ai_prompt_library
    SET
      title = :title,
      content = :content,
      category = :category,
      tags_json = :tags_json,
      variables_json = :variables_json,
      is_favorite = :is_favorite,
      last_used = :last_used,
      use_count = :use_count,
      created_at = :created_at,
      updated_at = :updated_at
    WHERE id = :id;
  `);
  const deletePromptStatement = database.prepare(
    "DELETE FROM ai_prompt_library WHERE id = ?;",
  );

  const listHistoryStatement = database.prepare(`
    SELECT *
    FROM ai_chat_history
    ORDER BY timestamp DESC, modified_at DESC;
  `);
  const getHistoryStatement = database.prepare(
    "SELECT * FROM ai_chat_history WHERE id = ?;",
  );
  const insertHistoryStatement = database.prepare(`
    INSERT INTO ai_chat_history (
      conversation_id,
      provider,
      title,
      content,
      notes,
      tags_json,
      is_favorite,
      url,
      timestamp,
      modified_at
    ) VALUES (
      :conversation_id,
      :provider,
      :title,
      :content,
      :notes,
      :tags_json,
      :is_favorite,
      :url,
      :timestamp,
      :modified_at
    );
  `);
  const updateHistoryStatement = database.prepare(`
    UPDATE ai_chat_history
    SET
      conversation_id = :conversation_id,
      provider = :provider,
      title = :title,
      content = :content,
      notes = :notes,
      tags_json = :tags_json,
      is_favorite = :is_favorite,
      url = :url,
      timestamp = :timestamp,
      modified_at = :modified_at
    WHERE id = :id;
  `);
  const deleteHistoryStatement = database.prepare(
    "DELETE FROM ai_chat_history WHERE id = ?;",
  );

  function listPrompts() {
    return listPromptsStatement.all().map(mapPromptRow);
  }

  function savePrompt(input) {
    const normalized = normalizePromptInput(input);

    if (!normalized) {
      return null;
    }

    const result = insertPromptStatement.run({
      category: normalized.category,
      content: normalized.content,
      created_at: normalized.createdAt,
      is_favorite: normalized.isFavorite ? 1 : 0,
      last_used: normalized.lastUsed,
      tags_json: JSON.stringify(normalized.tags),
      title: normalized.title,
      updated_at: normalized.updatedAt,
      use_count: normalized.useCount,
      variables_json: JSON.stringify(normalized.variables),
    });

    return getPrompt(result.lastInsertRowid);
  }

  function getPrompt(id) {
    const row = getPromptStatement.get(id);
    return row ? mapPromptRow(row) : null;
  }

  function updatePrompt(id, input) {
    const current = getPrompt(id);

    if (!current) {
      return null;
    }

    const normalized = normalizePromptInput({
      ...current,
      ...input,
      createdAt: Date.now(),
    });

    if (!normalized) {
      return null;
    }

    updatePromptStatement.run({
      category: normalized.category,
      content: normalized.content,
      created_at:
        typeof input?.createdAt === "number" && Number.isFinite(input.createdAt)
          ? Math.round(input.createdAt)
          : Date.now(),
      id,
      is_favorite: normalized.isFavorite ? 1 : 0,
      last_used: normalized.lastUsed,
      tags_json: JSON.stringify(normalized.tags),
      title: normalized.title,
      updated_at: normalized.updatedAt,
      use_count: normalized.useCount,
      variables_json: JSON.stringify(normalized.variables),
    });

    return getPrompt(id);
  }

  function deletePrompt(id) {
    deletePromptStatement.run(id);
    return listPrompts();
  }

  function searchPrompts(query) {
    const normalizedQuery = normalizeString(query).toLowerCase();

    if (!normalizedQuery) {
      return listPrompts();
    }

    return listPrompts().filter((record) =>
      [record.title, record.content, record.category, ...record.tags, ...record.variables]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }

  function exportPrompts() {
    return {
      exportDate: new Date().toISOString(),
      prompts: listPrompts(),
      version: "1.0",
    };
  }

  function importPrompts(payload, mergeStrategy = "skip") {
    const promptRecords = Array.isArray(payload?.prompts) ? payload.prompts : [];
    const result = {
      errors: [],
      imported: 0,
      skipped: 0,
    };

    promptRecords.forEach((record) => {
      try {
        const normalizedTitle = normalizeString(record?.title).toLowerCase();
        const existingPrompt = listPrompts().find(
          (item) => item.title.toLowerCase() === normalizedTitle,
        );

        if (existingPrompt && mergeStrategy === "skip") {
          result.skipped += 1;
          return;
        }

        if (existingPrompt && mergeStrategy === "overwrite") {
          updatePrompt(existingPrompt.id, record);
        } else {
          savePrompt(record);
        }

        result.imported += 1;
      } catch (error) {
        result.errors.push({
          error: error instanceof Error ? error.message : String(error),
          item: normalizeString(record?.title, "Untitled Prompt"),
        });
      }
    });

    return result;
  }

  function importDefaultPromptLibrary() {
    return importPrompts({ prompts: DEFAULT_PROMPT_LIBRARY }, "skip");
  }

  function listHistory() {
    return listHistoryStatement.all().map(mapHistoryRow);
  }

  function getHistory(id) {
    const row = getHistoryStatement.get(id);
    return row ? mapHistoryRow(row) : null;
  }

  function saveHistory(input) {
    const normalized = normalizeHistoryInput(input);

    if (!normalized) {
      return null;
    }

    const result = insertHistoryStatement.run({
      content: normalized.content,
      conversation_id: normalized.conversationId,
      is_favorite: normalized.isFavorite ? 1 : 0,
      modified_at: normalized.modifiedAt,
      notes: normalized.notes,
      provider: normalized.provider,
      tags_json: JSON.stringify(normalized.tags),
      timestamp: normalized.timestamp,
      title: normalized.title,
      url: normalized.url,
    });

    return getHistory(result.lastInsertRowid);
  }

  function updateHistory(id, input) {
    const current = getHistory(id);

    if (!current) {
      return null;
    }

    const normalized = normalizeHistoryInput({
      ...current,
      ...input,
    });

    if (!normalized) {
      return null;
    }

    updateHistoryStatement.run({
      content: normalized.content,
      conversation_id: normalized.conversationId,
      id,
      is_favorite: normalized.isFavorite ? 1 : 0,
      modified_at: normalized.modifiedAt,
      notes: normalized.notes,
      provider: normalized.provider,
      tags_json: JSON.stringify(normalized.tags),
      timestamp: normalized.timestamp,
      title: normalized.title,
      url: normalized.url,
    });

    return getHistory(id);
  }

  function deleteHistory(id) {
    deleteHistoryStatement.run(id);
    return listHistory();
  }

  function searchHistory(query) {
    const normalizedQuery = normalizeString(query).toLowerCase();

    if (!normalizedQuery) {
      return listHistory();
    }

    return listHistory().filter((record) =>
      [record.title, record.content, record.notes, record.provider, ...record.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }

  function toggleHistoryFavorite(id) {
    const current = getHistory(id);

    if (!current) {
      return null;
    }

    return updateHistory(id, {
      isFavorite: !current.isFavorite,
      modifiedAt: Date.now(),
    });
  }

  function exportHistory() {
    return {
      conversations: listHistory(),
      exportDate: new Date().toISOString(),
      version: "1.0",
    };
  }

  function importHistory(payload, mergeStrategy = "skip") {
    const conversationRecords = Array.isArray(payload?.conversations)
      ? payload.conversations
      : [];
    const result = {
      errors: [],
      imported: 0,
      skipped: 0,
    };

    conversationRecords.forEach((record) => {
      try {
        const existingRecord = listHistory().find((item) => {
          if (record?.conversationId && item.conversationId) {
            return item.conversationId === record.conversationId;
          }

          return (
            item.title === normalizeString(record?.title, "Untitled Conversation") &&
            Math.abs(item.timestamp - Number(record?.timestamp ?? 0)) < 60_000
          );
        });

        if (existingRecord && mergeStrategy === "skip") {
          result.skipped += 1;
          return;
        }

        if (existingRecord && mergeStrategy === "overwrite") {
          updateHistory(existingRecord.id, record);
        } else {
          saveHistory(record);
        }

        result.imported += 1;
      } catch (error) {
        result.errors.push({
          error: error instanceof Error ? error.message : String(error),
          item: normalizeString(record?.title, "Untitled Conversation"),
        });
      }
    });

    return result;
  }

  return {
    close() {
      database.close();
    },
    deleteHistory,
    deletePrompt,
    exportHistory,
    exportPrompts,
    importDefaultPromptLibrary,
    importHistory,
    importPrompts,
    listHistory,
    listPrompts,
    saveHistory,
    savePrompt,
    searchHistory,
    searchPrompts,
    toggleHistoryFavorite,
    updatePrompt,
  };
}

module.exports = {
  createAiLibraryRepository,
};
