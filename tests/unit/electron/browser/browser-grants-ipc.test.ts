import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  BROWSER_GRANTS_CHANGED_CHANNEL,
  BROWSER_GRANTS_REVOKE_CHANNEL,
  BROWSER_GRANTS_SNAPSHOT_CHANNEL,
  createBrowserGrantsIpc,
} = require("../../../../electron/browser/browser-grants-ipc.cjs");
const {
  createBrowserGrantManager,
} = require("../../../../electron/browser/browser-grants.cjs");

function createFixture(grantAuthority: ReturnType<typeof createBrowserGrantManager> | null) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
  };
  const requireTrustedDesktopEvent = vi.fn();
  const sender = {
    isDestroyed: () => false,
    send: vi.fn(),
  };
  const ipc = createBrowserGrantsIpc({
    grantAuthority,
    ipcMain,
    requireTrustedDesktopEvent,
    webContentsFromEvent: () => sender,
  });
  ipc.register();
  return {
    handlers,
    invoke(channel: string, ...args: unknown[]) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`missing ${channel}`);
      return handler({ sender }, ...args);
    },
    ipc,
    requireTrustedDesktopEvent,
    sender,
  };
}

describe("browser grants IPC", () => {
  it("exposes read/revoke-only channels and binds them to the trusted desktop renderer", () => {
    const grants = createBrowserGrantManager();
    const created = grants.grantStanding({
      operation: "navigate",
      origin: "https://example.com",
    });
    const fixture = createFixture(grants);

    expect(fixture.invoke(BROWSER_GRANTS_SNAPSHOT_CHANNEL)).toMatchObject({
      available: true,
      standingGrants: [{ grantId: created.grantId, origin: "https://example.com" }],
    });
    expect(fixture.requireTrustedDesktopEvent).toHaveBeenCalled();

    const revoked = fixture.invoke(BROWSER_GRANTS_REVOKE_CHANNEL, created.grantId);
    expect(revoked).toMatchObject({
      revoked: true,
      snapshot: { standingGrants: [], available: true },
    });
    expect(grants.hasStandingGrant("https://example.com", "navigate")).toBe(false);
  });

  it("publishes live snapshots and reports unavailable authority without inventing grants", async () => {
    const grants = createBrowserGrantManager();
    const fixture = createFixture(grants);
    fixture.invoke(BROWSER_GRANTS_SNAPSHOT_CHANNEL);
    grants.grantStanding({ operation: "click", origin: "https://docs.example" });
    await Promise.resolve();
    expect(fixture.sender.send).toHaveBeenCalledWith(
      BROWSER_GRANTS_CHANGED_CHANNEL,
      expect.objectContaining({ available: true }),
    );

    const unavailable = createFixture(null);
    expect(unavailable.invoke(BROWSER_GRANTS_SNAPSHOT_CHANNEL)).toEqual({
      attachments: [],
      available: false,
      standingGrants: [],
    });
    await expect(
      Promise.resolve().then(() =>
        unavailable.invoke(BROWSER_GRANTS_REVOKE_CHANNEL, "standing-missing"),
      ),
    ).rejects.toThrow(/unavailable/i);
  });
});
