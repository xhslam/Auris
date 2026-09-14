"use strict";

const fsSync = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const BROWSER_STATE_SCHEMA_VERSION = 4;

function createBrowserStateDatabase(databasePath) {
  fsSync.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS browser_bookmarks (
      url TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS browser_window_state (
      slot INTEGER PRIMARY KEY,
      window_x INTEGER,
      window_y INTEGER,
      window_width INTEGER,
      window_height INTEGER,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS browser_retained_tabs (
      window_slot INTEGER NOT NULL,
      position INTEGER NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      automation_mode TEXT NOT NULL,
      was_active INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (window_slot, position),
      FOREIGN KEY (window_slot) REFERENCES browser_window_state(slot) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS browser_session_refs (
      name TEXT PRIMARY KEY,
      origin TEXT NOT NULL,
      ciphertext BLOB NOT NULL,
      cookie_count INTEGER NOT NULL DEFAULT 0,
      origin_count INTEGER NOT NULL DEFAULT 0,
      local_storage_item_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS browser_audit_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at TEXT NOT NULL,
      owner_kind TEXT NOT NULL,
      connection_hash TEXT NOT NULL,
      run_hash TEXT NOT NULL DEFAULT '',
      window_id TEXT NOT NULL DEFAULT '',
      tab_id TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL DEFAULT '',
      operation TEXT NOT NULL,
      decision TEXT NOT NULL,
      approval_kind TEXT NOT NULL,
      outcome TEXT NOT NULL
    );
  `);
  ensureColumn(database, "browser_bookmarks", "created_at", "TEXT");
  ensureColumn(database, "browser_bookmarks", "updated_at", "TEXT");
  database.exec(`PRAGMA user_version = ${BROWSER_STATE_SCHEMA_VERSION};`);
  return database;
}

function ensureColumn(database, tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName});`).all();
  if (columns.some((column) => column.name === columnName)) return;
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
}

module.exports = {
  BROWSER_STATE_SCHEMA_VERSION,
  createBrowserStateDatabase,
};
