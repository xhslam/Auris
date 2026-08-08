"use strict";

const { createBrowserStateDatabase } = require("./browser-state-db.cjs");

const DEFAULT_BOUNDS = Object.freeze({ height: 800, width: 1200 });
const MAX_URL_LENGTH = 2_048;
const MAX_TITLE_LENGTH = 512;

function createBrowserStateRepository(databasePath, { now = () => new Date().toISOString() } = {}) {
  const database = createBrowserStateDatabase(databasePath);
  const listBookmarksStatement = database.prepare(`
    SELECT url, title FROM browser_bookmarks ORDER BY rowid ASC;
  `);
  const upsertBookmarkStatement = database.prepare(`
    INSERT INTO browser_bookmarks (url, title, created_at, updated_at)
    VALUES (:url, :title, :now, :now)
    ON CONFLICT(url) DO UPDATE SET
      title = excluded.title,
      updated_at = excluded.updated_at;
  `);
  const removeBookmarkStatement = database.prepare(
    "DELETE FROM browser_bookmarks WHERE url = ?;",
  );
  const insertWindowStatement = database.prepare(`
    INSERT INTO browser_window_state (
      slot, window_x, window_y, window_width, window_height, updated_at
    ) VALUES (
      :slot, :window_x, :window_y, :window_width, :window_height, :updated_at
    );
  `);
  const insertTabStatement = database.prepare(`
    INSERT INTO browser_retained_tabs (
      window_slot, position, url, title, automation_mode, was_active
    ) VALUES (
      :window_slot, :position, :url, :title, 'Human', :was_active
    );
  `);

  function listBookmarks() {
    return listBookmarksStatement.all()
      .map((row) => normalizeBookmark(row))
      .filter(Boolean);
  }

  function upsertBookmark(value) {
    const bookmark = normalizeBookmark(value);
    if (!bookmark) throw new TypeError("Invalid browser bookmark");
    upsertBookmarkStatement.run({ ...bookmark, now: now() });
    return bookmark;
  }

  function removeBookmark(url) {
    if (typeof url !== "string") return false;
    return removeBookmarkStatement.run(url).changes > 0;
  }

  function saveWindows(windows) {
    const entries = Array.isArray(windows) ? windows : [];
    database.exec("BEGIN IMMEDIATE;");
    try {
      database.exec("DELETE FROM browser_retained_tabs; DELETE FROM browser_window_state;");
      entries.forEach((entry, slot) => {
        const bounds = normalizeStoredBounds(entry?.bounds);
        insertWindowStatement.run({
          slot,
          updated_at: now(),
          window_height: bounds?.height ?? null,
          window_width: bounds?.width ?? null,
          window_x: bounds?.x ?? null,
          window_y: bounds?.y ?? null,
        });
        const retainedTabs = normalizeRetainedTabs(entry);
        retainedTabs.forEach((tab, position) => {
          insertTabStatement.run({
            position,
            title: tab.title,
            url: tab.url,
            was_active: tab.active ? 1 : 0,
            window_slot: slot,
          });
        });
      });
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
  }

  function loadWindows({ displays = [], defaultBounds = DEFAULT_BOUNDS } = {}) {
    const windowRows = database.prepare(`
      SELECT slot, window_x, window_y, window_width, window_height
      FROM browser_window_state ORDER BY slot ASC;
    `).all();
    const tabStatement = database.prepare(`
      SELECT position, url, title, automation_mode, was_active
      FROM browser_retained_tabs
      WHERE window_slot = ?
      ORDER BY position ASC;
    `);
    return windowRows.map((row) => {
      const tabs = tabStatement.all(row.slot)
        .map(normalizeRestoredTab)
        .filter(Boolean);
      let foundActive = false;
      const normalizedTabs = tabs.map((tab) => {
        const active = tab.active && !foundActive;
        if (active) foundActive = true;
        return { ...tab, active };
      });
      return {
        bounds: normalizeRestoreBounds({
          height: row.window_height,
          width: row.window_width,
          x: row.window_x,
          y: row.window_y,
        }, displays, defaultBounds),
        tabs: normalizedTabs,
      };
    });
  }

  return Object.freeze({
    close: () => database.close(),
    getDatabase: () => database,
    listBookmarks,
    loadWindows,
    removeBookmark,
    saveWindows,
    upsertBookmark,
  });
}

function normalizeBookmark(value) {
  const url = normalizeWebUrl(value?.url);
  if (!url) return null;
  return {
    title: normalizeTitle(value?.title, url),
    url,
  };
}

function normalizeWebUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.hostname === ""
      || parsed.username !== ""
      || parsed.password !== ""
    ) return null;
    return value;
  } catch {
    return null;
  }
}

function normalizeTitle(value, url) {
  const title = typeof value === "string" ? value.trim().slice(0, MAX_TITLE_LENGTH) : "";
  if (title !== "") return title;
  try {
    return new URL(url).hostname.slice(0, MAX_TITLE_LENGTH) || "未命名页面";
  } catch {
    return "未命名页面";
  }
}

function normalizeRetainedTabs(windowState) {
  const tabs = Array.isArray(windowState?.tabs) ? windowState.tabs : [];
  return tabs.flatMap((tab) => {
    if (tab?.retained !== true || tab?.automationMode !== "Human") return [];
    const url = normalizeWebUrl(tab.url);
    if (!url) return [];
    return [{
      active: tab.active === true || tab.tabId === windowState?.activeTabId,
      title: normalizeTitle(tab.title, url),
      url,
    }];
  });
}

function normalizeRestoredTab(row) {
  if (row?.automation_mode !== "Human") return null;
  const url = normalizeWebUrl(row.url);
  if (!url) return null;
  return {
    active: row.was_active === 1,
    automationMode: "Human",
    retained: true,
    title: normalizeTitle(row.title, url),
    url,
  };
}

function normalizeStoredBounds(value) {
  if (!value || typeof value !== "object") return null;
  if (
    !Number.isFinite(value.width)
    || !Number.isFinite(value.height)
    || value.width < 320
    || value.height < 240
  ) return null;
  return {
    height: Math.round(value.height),
    width: Math.round(value.width),
    ...(Number.isFinite(value.x) ? { x: Math.round(value.x) } : {}),
    ...(Number.isFinite(value.y) ? { y: Math.round(value.y) } : {}),
  };
}

function normalizeRestoreBounds(value, displays, defaultBounds = DEFAULT_BOUNDS) {
  const fallback = normalizeStoredBounds(defaultBounds) ?? DEFAULT_BOUNDS;
  const stored = normalizeStoredBounds(value);
  const workAreas = (Array.isArray(displays) ? displays : [])
    .map((display) => normalizeWorkArea(display?.workArea))
    .filter(Boolean);
  if (!stored || workAreas.length === 0 || !Number.isFinite(stored.x) || !Number.isFinite(stored.y)) {
    return { height: fallback.height, width: fallback.width };
  }
  const target = workAreas.find((area) => rectanglesIntersect(stored, area));
  if (!target) return { height: fallback.height, width: fallback.width };
  const width = Math.min(stored.width, target.width);
  const height = Math.min(stored.height, target.height);
  return {
    height,
    width,
    x: clamp(stored.x, target.x, target.x + target.width - width),
    y: clamp(stored.y, target.y, target.y + target.height - height),
  };
}

function normalizeWorkArea(value) {
  if (
    !value
    || !Number.isFinite(value.x)
    || !Number.isFinite(value.y)
    || !Number.isFinite(value.width)
    || !Number.isFinite(value.height)
    || value.width < 320
    || value.height < 240
  ) return null;
  return {
    height: Math.round(value.height),
    width: Math.round(value.width),
    x: Math.round(value.x),
    y: Math.round(value.y),
  };
}

function rectanglesIntersect(left, right) {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

module.exports = {
  DEFAULT_BROWSER_BOUNDS: DEFAULT_BOUNDS,
  createBrowserStateRepository,
  normalizeBrowserRestoreBounds: normalizeRestoreBounds,
};
