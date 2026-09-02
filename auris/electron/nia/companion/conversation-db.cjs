"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const MAX_TEXT = 20_000;
const MAX_QUERY = 200;
const MAX_RESULTS = 100;
const OPEN_CONNECTIONS = new Set();

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  PRAGMA secure_delete = ON;
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    persona_id TEXT NOT NULL,
    source TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    subject TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_persona_started
    ON conversations (persona_id, started_at DESC);
  CREATE TABLE IF NOT EXISTS turns (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    speaker TEXT NOT NULL CHECK (speaker IN ('user', 'nia', 'system')),
    text TEXT NOT NULL,
    at TEXT NOT NULL,
    cut INTEGER NOT NULL DEFAULT 0,
    response_id TEXT,
    item_id TEXT,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_turns_conversation_at
    ON turns (conversation_id, at ASC, id ASC);
  CREATE TABLE IF NOT EXISTS tool_uses (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    call_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_tools_conversation_at
    ON tool_uses (conversation_id, at ASC, id ASC);
  CREATE TABLE IF NOT EXISTS conversation_context_refs (
    conversation_id TEXT NOT NULL,
    ref_type TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    PRIMARY KEY (conversation_id, ref_type, ref_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
`;

function requireText(value, label, max = MAX_TEXT) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim().slice(0, max);
}

function iso(value, label) {
  const at = value === undefined ? Date.now() : value;
  if (typeof at === "string") {
    const parsed = Date.parse(at);
    if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be an ISO date.`);
    return new Date(parsed).toISOString();
  }
  if (typeof at !== "number" || !Number.isFinite(at)) throw new TypeError(`${label} must be a timestamp.`);
  return new Date(at).toISOString();
}

function createConversationStore({ databasePath, now = Date.now } = {}) {
  if (typeof databasePath !== "string" || databasePath.length === 0) {
    throw new TypeError("A conversation database path is required.");
  }
  if (typeof now !== "function") throw new TypeError("Conversation clock must be a function.");
  const resolvedPath = path.resolve(databasePath);
  if (OPEN_CONNECTIONS.has(resolvedPath)) throw new Error("Conversation database is already open.");
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const database = new DatabaseSync(resolvedPath);
  OPEN_CONNECTIONS.add(resolvedPath);
  try {
    database.exec(SCHEMA);
    database.exec("PRAGMA journal_mode = WAL;");
  } catch (error) {
    database.close();
    OPEN_CONNECTIONS.delete(resolvedPath);
    throw error;
  }

  const beginStatement = database.prepare(`
    INSERT INTO conversations (id, persona_id, source, started_at)
    VALUES (?, ?, ?, ?)
  `);
  const endStatement = database.prepare(`
    UPDATE conversations SET ended_at = COALESCE(ended_at, ?) WHERE id = ? AND ended_at IS NULL
  `);
  const sayStatement = database.prepare(`
    INSERT INTO turns (id, conversation_id, speaker, text, at, cut, response_id, item_id)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM conversations WHERE id = ?)
  `);
  const toolStatement = database.prepare(`
    INSERT INTO tool_uses (id, conversation_id, call_id, name, status, at)
    SELECT ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM conversations WHERE id = ?)
  `);

  function list({ personaId, limit = MAX_RESULTS } = {}) {
    const persona = requireText(personaId, "personaId", 120);
    const safeLimit = Math.max(1, Math.min(MAX_RESULTS, Number(limit) || MAX_RESULTS));
    return database.prepare(`
      SELECT c.id, c.persona_id AS personaId, c.source, c.started_at AS startedAt,
        c.ended_at AS endedAt, c.subject,
        (SELECT COUNT(*) FROM turns t WHERE t.conversation_id = c.id) AS turnCount,
        (SELECT t.text FROM turns t WHERE t.conversation_id = c.id ORDER BY t.at ASC, t.id ASC LIMIT 1) AS opening
      FROM conversations c WHERE c.persona_id = ?
      ORDER BY c.started_at DESC, c.id DESC LIMIT ?
    `).all(persona, safeLimit);
  }

  function turns({ personaId, conversationId } = {}) {
    const persona = requireText(personaId, "personaId", 120);
    const id = requireText(conversationId, "conversationId", 120);
    return database.prepare(`
      SELECT t.id, t.speaker, t.text, t.at, t.cut, t.response_id AS responseId, t.item_id AS itemId
      FROM turns t JOIN conversations c ON c.id = t.conversation_id
      WHERE t.conversation_id = ? AND c.persona_id = ?
      ORDER BY t.at ASC, t.id ASC
    `).all(id, persona);
  }

  function search({ personaId, query, limit = 40 } = {}) {
    const persona = requireText(personaId, "personaId", 120);
    const needle = requireText(query, "query", MAX_QUERY).toLocaleLowerCase();
    const safeLimit = Math.max(1, Math.min(MAX_RESULTS, Number(limit) || 40));
    return database.prepare(`
      SELECT c.id AS conversationId, c.started_at AS startedAt, c.subject,
        t.id AS turnId, t.speaker, t.text, t.at, t.cut
      FROM turns t JOIN conversations c ON c.id = t.conversation_id
      WHERE c.persona_id = ? AND lower(t.text) LIKE ?
      ORDER BY t.at DESC, t.id DESC LIMIT ?
    `).all(persona, `%${needle}%`, safeLimit);
  }

  function recoverOpen({ endedAt } = {}) {
    const stamp = iso(endedAt ?? now(), "endedAt");
    const result = database.prepare("UPDATE conversations SET ended_at = ? WHERE ended_at IS NULL").run(stamp);
    return Number(result.changes ?? 0);
  }

  function exportFor({ personaId } = {}) {
    const persona = requireText(personaId, "personaId", 120);
    return list({ personaId: persona, limit: MAX_RESULTS }).map((conversation) => ({
      ...conversation,
      turns: turns({ personaId: persona, conversationId: conversation.id }),
      tools: database.prepare(`
        SELECT call_id AS callId, name, status, at FROM tool_uses
        WHERE conversation_id = ? ORDER BY at ASC, id ASC
      `).all(conversation.id),
    }));
  }

  function deleteConversation({ personaId, conversationId } = {}) {
    const persona = requireText(personaId, "personaId", 120);
    const id = requireText(conversationId, "conversationId", 120);
    const result = database.prepare("DELETE FROM conversations WHERE id = ? AND persona_id = ?").run(id, persona);
    database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    return Number(result.changes ?? 0) > 0;
  }

  function close() {
    if (!database) return;
    try { database.exec("PRAGMA wal_checkpoint(TRUNCATE);"); } catch { /* best effort */ }
    database.close();
    OPEN_CONNECTIONS.delete(resolvedPath);
  }

  function begin({ personaId, source = "realtime", startedAt } = {}) {
    const persona = requireText(personaId, "personaId", 120);
    const origin = requireText(source, "source", 80);
    const id = crypto.randomUUID();
    beginStatement.run(id, persona, origin, iso(startedAt ?? now(), "startedAt"));
    return id;
  }

  function say({ conversationId, speaker, text, at, cut = false, responseId = null, itemId = null } = {}) {
    const id = requireText(conversationId, "conversationId", 120);
    if (!["user", "nia", "system"].includes(speaker)) throw new TypeError("Invalid conversation speaker.");
    if (typeof text !== "string") throw new TypeError("Turn text must be a string.");
    const value = text.slice(0, MAX_TEXT);
    if (value.trim() === "" && !cut) return false;
    const result = sayStatement.run(
      crypto.randomUUID(), id, speaker, value, iso(at ?? now(), "at"), cut ? 1 : 0,
      typeof responseId === "string" ? responseId.slice(0, 160) : null,
      typeof itemId === "string" ? itemId.slice(0, 160) : null,
      id,
    );
    return Number(result.changes ?? 0) > 0;
  }

  function tool({ conversationId, callId, name, status = "arrived", at } = {}) {
    const id = requireText(conversationId, "conversationId", 120);
    const call = requireText(callId, "callId", 160);
    const toolName = requireText(name, "name", 160);
    const result = toolStatement.run(crypto.randomUUID(), id, call, toolName, requireText(status, "status", 60), iso(at ?? now(), "at"), id);
    return Number(result.changes ?? 0) > 0;
  }

  return Object.freeze({ begin, close, deleteConversation, end: (conversationId, endedAt) => endStatement.run(iso(endedAt ?? now(), "endedAt"), requireText(conversationId, "conversationId", 120)), exportFor, list, recoverOpen, say, search, tool, turns });
}

module.exports = { createConversationStore };
