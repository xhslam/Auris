import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPluginHost } from "@/platform/desktop/plugin-host";

async function createTempPluginRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "shadowing-plugin-host-"));
}

async function writePlugin(
  pluginRoot: string,
  pluginId: string,
  manifest: Record<string, unknown>,
  moduleSource: string,
) {
  const directoryPath = path.join(pluginRoot, pluginId);
  await fs.mkdir(directoryPath, { recursive: true });
  await fs.writeFile(
    path.join(directoryPath, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
  await fs.writeFile(path.join(directoryPath, "main.js"), moduleSource, "utf8");
}

describe("plugin host", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__dailyReviewRuns;
  });

  it("loads enabled plugins and runs their registered commands", async () => {
    const pluginsDirectory = await createTempPluginRoot();

    await writePlugin(
      pluginsDirectory,
      "daily-review",
      {
        id: "daily-review",
        name: "Daily Review",
        version: "1.0.0",
      },
      [
        "module.exports.activate = (api) => {",
        "  api.registerCommand({",
        "    id: 'daily-review.open',",
        "    title: 'Open Daily Review',",
        "    run: async () => {",
        "      globalThis.__dailyReviewRuns = (globalThis.__dailyReviewRuns ?? 0) + 1;",
        "    },",
        "  });",
        "};",
      ].join("\n"),
    );

    const host = createPluginHost({
      loadEnabledState: async () => ({}),
      pluginsDirectory,
      saveEnabledState: async () => undefined,
    });

    await host.reload();

    expect(host.listPlugins()).toEqual([
      expect.objectContaining({
        enabled: true,
        errorMessage: null,
        manifest: expect.objectContaining({
          id: "daily-review",
          name: "Daily Review",
        }),
      }),
    ]);
    expect(host.listCommands()).toEqual([
      {
        id: "daily-review.open",
        title: "Open Daily Review",
      },
    ]);

    await expect(host.runCommand("daily-review.open")).resolves.toEqual({ executed: true });
    expect((globalThis as Record<string, unknown>).__dailyReviewRuns).toBe(1);

    await fs.rm(pluginsDirectory, { force: true, recursive: true });
  });

  it("disables a plugin and removes its commands from the host", async () => {
    const pluginsDirectory = await createTempPluginRoot();
    const saveEnabledState = vi.fn(async () => undefined);

    await writePlugin(
      pluginsDirectory,
      "daily-review",
      {
        id: "daily-review",
        name: "Daily Review",
        version: "1.0.0",
      },
      [
        "module.exports.activate = (api) => {",
        "  api.registerCommand({",
        "    id: 'daily-review.open',",
        "    title: 'Open Daily Review',",
        "    run: async () => undefined,",
        "  });",
        "};",
      ].join("\n"),
    );

    const host = createPluginHost({
      loadEnabledState: async () => ({}),
      pluginsDirectory,
      saveEnabledState,
    });

    await host.reload();
    const plugins = await host.setPluginEnabled("daily-review", false);

    expect(saveEnabledState).toHaveBeenCalledWith({
      "daily-review": false,
    });
    expect(plugins[0]?.enabled).toBe(false);
    expect(host.listCommands()).toEqual([]);
    await expect(host.runCommand("daily-review.open")).resolves.toEqual({ executed: false });

    await fs.rm(pluginsDirectory, { force: true, recursive: true });
  });

  it("isolates plugin load failures without crashing the host", async () => {
    const pluginsDirectory = await createTempPluginRoot();

    await writePlugin(
      pluginsDirectory,
      "broken-plugin",
      {
        id: "broken-plugin",
        name: "Broken Plugin",
        version: "1.0.0",
      },
      "module.exports.activate = () => { throw new Error('boom'); };",
    );

    const host = createPluginHost({
      loadEnabledState: async () => ({}),
      pluginsDirectory,
      saveEnabledState: async () => undefined,
    });

    await host.reload();

    expect(host.listCommands()).toEqual([]);
    expect(host.listPlugins()[0]).toEqual(
      expect.objectContaining({
        enabled: true,
        errorMessage: expect.stringContaining("boom"),
        manifest: expect.objectContaining({
          id: "broken-plugin",
        }),
      }),
    );

    await fs.rm(pluginsDirectory, { force: true, recursive: true });
  });
});
