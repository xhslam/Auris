import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createDefaultRuntimeState, createRuntimeStateRepository } = require("../../../electron/runtime-state-db.cjs");

describe("runtime-state-db", () => {
  let tempDirectory: string | null = null;

  afterEach(async () => {
    if (tempDirectory) {
      await fs.rm(tempDirectory, { force: true, recursive: true });
      tempDirectory = null;
    }
  });

  async function createRepository() {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shadowing-runtime-state-"));
    const databasePath = path.join(tempDirectory, "runtime-state.db");
    return createRuntimeStateRepository(databasePath);
  }

  it("returns the default runtime state before any writes", async () => {
    const repository = await createRepository();

    expect(repository.getRuntimeState()).toEqual(createDefaultRuntimeState());
    expect(repository.getRuntimeState().aiDock).toEqual({
      activeProvider: "chatgpt",
      activeView: "provider",
      isOpen: false,
      panelWidth: 560,
    });

    repository.close();
  });

  it("persists workspace, route, and window bounds updates", async () => {
    const repository = await createRepository();

    const updatedState = repository.updateRuntimeState({
      lastRoute: "/notes",
      lastVisitedAt: "2026-03-26T00:00:00.000Z",
      lastWorkspace: "notes",
      aiDock: {
        activeProvider: "gemini",
        activeView: "history",
        isOpen: true,
        panelWidth: 640,
      },
      windowBounds: {
        height: 920,
        width: 1400,
        x: 24,
        y: 48,
      },
    });

    expect(updatedState.lastWorkspace).toBe("notes");
    expect(updatedState.lastRoute).toBe("/notes");
    expect(updatedState.aiDock).toEqual({
      activeProvider: "gemini",
      activeView: "history",
      isOpen: true,
      panelWidth: 640,
    });
    expect(updatedState.windowBounds).toEqual({
      height: 920,
      width: 1400,
      x: 24,
      y: 48,
    });
    expect(repository.getRuntimeState()).toMatchObject({
      lastRoute: "/notes",
      lastVisitedAt: "2026-03-26T00:00:00.000Z",
      lastWorkspace: "notes",
      aiDock: {
        activeProvider: "gemini",
        activeView: "history",
        isOpen: true,
        panelWidth: 640,
      },
      windowBounds: {
        height: 920,
        width: 1400,
        x: 24,
        y: 48,
      },
    });

    repository.close();
  });

  it("imports legacy runtime state only once", async () => {
    const repository = await createRepository();

    const importedState = repository.importLegacyRuntimeState({
      lastVisitedAt: "2026-03-25T12:00:00.000Z",
      lastWorkspace: "workspace",
    });

    expect(importedState.lastWorkspace).toBe("workspace");
    expect(importedState.lastVisitedAt).toBe("2026-03-25T12:00:00.000Z");
    expect(importedState.legacyRuntimeMigratedAt).toEqual(expect.any(String));

    const secondImport = repository.importLegacyRuntimeState({
      lastVisitedAt: "2026-03-26T12:00:00.000Z",
      lastWorkspace: "assessment",
    });

    expect(secondImport.lastWorkspace).toBe("workspace");
    expect(secondImport.lastVisitedAt).toBe("2026-03-25T12:00:00.000Z");

    repository.close();
  });
});
