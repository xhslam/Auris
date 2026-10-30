import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const { createTerminalSessionCatalog } = require("../../../electron/terminal-session-catalog.cjs");

const descriptor = (id: string, scope = "vault-a") => ({ id, cwd: "C:\\vault", shell: "C:\\Windows\\System32\\cmd.exe", cols: 80, rows: 24, workspaceInstanceId: scope });
function harness() {
  const live: Array<Record<string, unknown>> = [];
  const store = { load: vi.fn(() => [descriptor("restored-1"), descriptor("restored-2", "vault-b")]), save: vi.fn((records: unknown[]) => records) };
  const manager = { listSessions: vi.fn(() => live), createSession: vi.fn() };
  return { live, store, manager, catalog: createTerminalSessionCatalog({ store, manager }) };
}

describe("terminal-session-catalog", () => {
  it("persists a live session's manual title without changing process records", () => {
    const { catalog, live, store } = harness();
    live.push({ ...descriptor("live-title"), backend: "pty" });
    expect(catalog.rename("live-title", "  前端修复\n ")).toBe("前端修复");
    expect(catalog.list().find((item: { id: string }) => item.id === "live-title").customTitle).toBe("前端修复");
    catalog.persist();
    expect(store.save).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "live-title", customTitle: "前端修复" })]));
    expect(live[0]).not.toHaveProperty("customTitle");
  });

  it("retains the title while a dormant record is attached and clears it without resurrecting the saved name", () => {
    const { store, manager, live } = harness();
    store.load.mockImplementation(() => [{ ...descriptor("restored-1"), customTitle: "old title" }]);
    const catalog = createTerminalSessionCatalog({ store, manager });
    expect(catalog.get("restored-1").customTitle).toBe("old title");
    catalog.rename("restored-1", null);
    expect(catalog.get("restored-1").customTitle).toBeNull();
    live.push({ ...descriptor("restored-1"), backend: "pty" });
    catalog.created(live[0]);
    expect(catalog.withTitle(live[0]).customTitle).toBeNull();
    catalog.persist();
    expect(store.save).toHaveBeenCalledWith([expect.objectContaining({ id: "restored-1", customTitle: null })]);
  });

  it("carries a manual title onto a new restarted session id and removes closed metadata", () => {
    const { catalog, live } = harness();
    const running = { ...descriptor("restart-new"), backend: "pty", customTitle: "测试验证" };
    live.push(running); catalog.created(running);
    expect(catalog.withTitle({ id: "restart-new" }).customTitle).toBe("测试验证");
    catalog.remove("restart-new");
    expect(catalog.withTitle({ id: "restart-new" })).not.toHaveProperty("customTitle");
  });

  it("lists dormant recovery descriptors without spawning any shell", () => {
    const { catalog, store, manager } = harness();
    expect(catalog.list()).toEqual([
      expect.objectContaining({ id: "restored-1", backend: null, ptyPackage: null, output: "" }),
      expect.objectContaining({ id: "restored-2", backend: null }),
    ]);
    catalog.list();
    expect(store.load).toHaveBeenCalledTimes(1);
    expect(manager.createSession).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("replaces only an activated descriptor and preserves other workspace descriptors", () => {
    const { catalog, live, store } = harness();
    expect(catalog.get("restored-1")).toMatchObject(descriptor("restored-1"));
    const running = { ...descriptor("restored-1"), backend: "pty", output: "ready", outputSequence: 1 };
    live.push(running);
    catalog.created(running);
    expect(catalog.list()).toHaveLength(2);
    catalog.persist();
    expect(store.save).toHaveBeenCalledWith([descriptor("restored-2", "vault-b"), running]);
  });

  it("can close a dormant tab without creating a PTY", () => {
    const { catalog, manager } = harness();
    catalog.remove("restored-1");
    expect(catalog.list().map((record: { id: string }) => record.id)).toEqual(["restored-2"]);
    expect(manager.createSession).not.toHaveBeenCalled();
  });

  it("does not resurrect an exited live session from its dormant descriptor", () => {
    const { catalog, live } = harness();
    const running = { ...descriptor("restored-1"), backend: "pty" };
    live.push(running);
    catalog.created(running);
    live.length = 0;
    catalog.remove("restored-1");
    expect(catalog.get("restored-1")).toBeUndefined();
    expect(catalog.list().map((record: { id: string }) => record.id)).toEqual(["restored-2"]);
  });
});
