"use strict";

const fsSync = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_ROUTE = "/";
const DEFAULT_WORKSPACE = "home";
const DEFAULT_AI_DOCK_STATE = {
  activeProvider: "chatgpt",
  activeView: "provider",
  isOpen: false,
  panelWidth: 560,
};

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS app_runtime_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    ai_dock_active_provider TEXT,
    ai_dock_active_view TEXT,
    ai_dock_is_open INTEGER,
    ai_dock_panel_width INTEGER,
    last_workspace TEXT NOT NULL,
    last_route TEXT NOT NULL,
    last_visited_at TEXT,
    primary_resume_type TEXT,
    primary_resume_id TEXT,
    window_x INTEGER,
    window_y INTEGER,
    window_width INTEGER,
    window_height INTEGER,
    updated_at TEXT NOT NULL,
    legacy_runtime_migrated_at TEXT
  );
`;

function normalizeRoutePath(value) {
  return typeof value === "string" && value.startsWith("/") ? value : DEFAULT_ROUTE;
}

function normalizeWorkspace(value) {
  return value === "workspace" || value === "notes" || value === "assessment" || value === "home"
    ? value
    : DEFAULT_WORKSPACE;
}

function normalizeWindowBounds(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value;

  if (typeof candidate.width !== "number" || typeof candidate.height !== "number") {
    return null;
  }

  return {
    height: candidate.height,
    width: candidate.width,
    x: typeof candidate.x === "number" ? candidate.x : undefined,
    y: typeof candidate.y === "number" ? candidate.y : undefined,
  };
}

function normalizeResumeTargetType(value) {
  return value === "training" || value === "assessment" || value === "note" ? value : null;
}

function normalizeAiDockView(value) {
  return value === "provider" || value === "prompts" || value === "history"
    ? value
    : DEFAULT_AI_DOCK_STATE.activeView;
}

function normalizeAiProviderId(value) {
  return value === "chatgpt" ||
    value === "gemini" ||
    value === "google" ||
    value === "deepseek"
    ? value
    : DEFAULT_AI_DOCK_STATE.activeProvider;
}

function normalizeAiDockState(value) {
  if (!value || typeof value !== "object") {
    return DEFAULT_AI_DOCK_STATE;
  }

  const candidate = value;

  return {
    activeProvider: normalizeAiProviderId(candidate.activeProvider),
    activeView: normalizeAiDockView(candidate.activeView),
    isOpen:
      typeof candidate.isOpen === "boolean"
        ? candidate.isOpen
        : DEFAULT_AI_DOCK_STATE.isOpen,
    panelWidth:
      typeof candidate.panelWidth === "number" && candidate.panelWidth > 0
        ? Math.round(candidate.panelWidth)
        : DEFAULT_AI_DOCK_STATE.panelWidth,
  };
}

function createDefaultRuntimeState() {
  return {
    aiDock: DEFAULT_AI_DOCK_STATE,
    legacyRuntimeMigratedAt: null,
    lastRoute: DEFAULT_ROUTE,
    lastVisitedAt: null,
    lastWorkspace: DEFAULT_WORKSPACE,
    primaryResumeId: null,
    primaryResumeType: null,
    updatedAt: null,
    windowBounds: null,
  };
}

function normalizeRuntimeState(value) {
  if (!value || typeof value !== "object") {
    return createDefaultRuntimeState();
  }

  const candidate = value;

  return {
    aiDock: normalizeAiDockState(candidate.aiDock),
    legacyRuntimeMigratedAt:
      typeof candidate.legacyRuntimeMigratedAt === "string" &&
      candidate.legacyRuntimeMigratedAt.trim()
        ? candidate.legacyRuntimeMigratedAt
        : null,
    lastRoute: normalizeRoutePath(candidate.lastRoute),
    lastVisitedAt:
      typeof candidate.lastVisitedAt === "string" && candidate.lastVisitedAt.trim()
        ? candidate.lastVisitedAt
        : null,
    lastWorkspace: normalizeWorkspace(candidate.lastWorkspace),
    primaryResumeId:
      typeof candidate.primaryResumeId === "string" && candidate.primaryResumeId.trim()
        ? candidate.primaryResumeId
        : null,
    primaryResumeType: normalizeResumeTargetType(candidate.primaryResumeType),
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt.trim()
        ? candidate.updatedAt
        : null,
    windowBounds: normalizeWindowBounds(candidate.windowBounds),
  };
}

function mapRowToRuntimeState(row) {
  return normalizeRuntimeState({
    aiDock: {
      activeProvider: row.ai_dock_active_provider,
      activeView: row.ai_dock_active_view,
      isOpen: row.ai_dock_is_open === 1,
      panelWidth: row.ai_dock_panel_width,
    },
    legacyRuntimeMigratedAt: row.legacy_runtime_migrated_at,
    lastRoute: row.last_route,
    lastVisitedAt: row.last_visited_at,
    lastWorkspace: row.last_workspace,
    primaryResumeId: row.primary_resume_id,
    primaryResumeType: row.primary_resume_type,
    updatedAt: row.updated_at,
    windowBounds:
      typeof row.window_width === "number" && typeof row.window_height === "number"
        ? {
            height: row.window_height,
            width: row.window_width,
            x: typeof row.window_x === "number" ? row.window_x : undefined,
            y: typeof row.window_y === "number" ? row.window_y : undefined,
          }
        : null,
  });
}

function mapRuntimeStateToParams(runtimeState) {
  return {
    ai_dock_active_provider: runtimeState.aiDock.activeProvider,
    ai_dock_active_view: runtimeState.aiDock.activeView,
    ai_dock_is_open: runtimeState.aiDock.isOpen ? 1 : 0,
    ai_dock_panel_width: runtimeState.aiDock.panelWidth,
    legacy_runtime_migrated_at: runtimeState.legacyRuntimeMigratedAt,
    last_route: runtimeState.lastRoute,
    last_visited_at: runtimeState.lastVisitedAt,
    last_workspace: runtimeState.lastWorkspace,
    primary_resume_id: runtimeState.primaryResumeId,
    primary_resume_type: runtimeState.primaryResumeType,
    updated_at: runtimeState.updatedAt ?? new Date().toISOString(),
    window_height: runtimeState.windowBounds?.height ?? null,
    window_width: runtimeState.windowBounds?.width ?? null,
    window_x: runtimeState.windowBounds?.x ?? null,
    window_y: runtimeState.windowBounds?.y ?? null,
  };
}

function createRuntimeStateRepository(databasePath) {
  fsSync.mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec(SCHEMA_SQL);
  ensureColumn(database, "app_runtime_state", "ai_dock_active_provider", "TEXT");
  ensureColumn(database, "app_runtime_state", "ai_dock_active_view", "TEXT");
  ensureColumn(database, "app_runtime_state", "ai_dock_is_open", "INTEGER");
  ensureColumn(database, "app_runtime_state", "ai_dock_panel_width", "INTEGER");
  ensureColumn(database, "app_runtime_state", "primary_resume_type", "TEXT");
  ensureColumn(database, "app_runtime_state", "primary_resume_id", "TEXT");

  const selectStatement = database.prepare("SELECT * FROM app_runtime_state WHERE id = 1;");
  const upsertStatement = database.prepare(`
    INSERT INTO app_runtime_state (
      id,
      ai_dock_active_provider,
      ai_dock_active_view,
      ai_dock_is_open,
      ai_dock_panel_width,
      last_workspace,
      last_route,
      last_visited_at,
      primary_resume_type,
      primary_resume_id,
      window_x,
      window_y,
      window_width,
      window_height,
      updated_at,
      legacy_runtime_migrated_at
    ) VALUES (
      1,
      :ai_dock_active_provider,
      :ai_dock_active_view,
      :ai_dock_is_open,
      :ai_dock_panel_width,
      :last_workspace,
      :last_route,
      :last_visited_at,
      :primary_resume_type,
      :primary_resume_id,
      :window_x,
      :window_y,
      :window_width,
      :window_height,
      :updated_at,
      :legacy_runtime_migrated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      ai_dock_active_provider = excluded.ai_dock_active_provider,
      ai_dock_active_view = excluded.ai_dock_active_view,
      ai_dock_is_open = excluded.ai_dock_is_open,
      ai_dock_panel_width = excluded.ai_dock_panel_width,
      last_workspace = excluded.last_workspace,
      last_route = excluded.last_route,
      last_visited_at = excluded.last_visited_at,
      primary_resume_type = excluded.primary_resume_type,
      primary_resume_id = excluded.primary_resume_id,
      window_x = excluded.window_x,
      window_y = excluded.window_y,
      window_width = excluded.window_width,
      window_height = excluded.window_height,
      updated_at = excluded.updated_at,
      legacy_runtime_migrated_at = excluded.legacy_runtime_migrated_at;
  `);

  function getRuntimeState() {
    const row = selectStatement.get();
    return row ? mapRowToRuntimeState(row) : createDefaultRuntimeState();
  }

  function updateRuntimeState(patch) {
    const nextState = normalizeRuntimeState({
      ...getRuntimeState(),
      ...patch,
      updatedAt: new Date().toISOString(),
    });

    upsertStatement.run(mapRuntimeStateToParams(nextState));
    return nextState;
  }

  function importLegacyRuntimeState(legacyState) {
    const currentState = getRuntimeState();

    if (currentState.legacyRuntimeMigratedAt) {
      return currentState;
    }

    return updateRuntimeState({
      lastVisitedAt: legacyState?.lastVisitedAt ?? currentState.lastVisitedAt,
      lastWorkspace: normalizeWorkspace(legacyState?.lastWorkspace),
      legacyRuntimeMigratedAt: new Date().toISOString(),
    });
  }

  return {
    close() {
      database.close();
    },
    getRuntimeState,
    importLegacyRuntimeState,
    updateRuntimeState,
  };
}

function ensureColumn(database, tableName, columnName, columnDefinition) {
  const existingColumns = database
    .prepare(`PRAGMA table_info(${tableName});`)
    .all()
    .map((row) => row.name);

  if (existingColumns.includes(columnName)) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
}

module.exports = {
  createDefaultRuntimeState,
  createRuntimeStateRepository,
};
