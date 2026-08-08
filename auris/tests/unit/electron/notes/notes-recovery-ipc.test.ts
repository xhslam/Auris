import { describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NOTES_RECOVERY_COMMAND_CHANNEL, createNotesRecoveryIpc } = require("../../../../electron/notes/notes-recovery-ipc.cjs");

function createFixture() {
  const handlers = new Map<string, (event: unknown, input: unknown) => unknown>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (event: unknown, input: unknown) => unknown) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  };
  const store = {
    captureDraft: vi.fn(async () => true),
    captureWorkspace: vi.fn(async () => true),
    clearDraft: vi.fn(async () => undefined),
    importLegacy: vi.fn(async () => ({ imported: true })),
    listDrafts: vi.fn(async () => [{ path: "a.md" }]),
    listHistory: vi.fn(async () => [{ id: "v1" }]),
    loadWorkspace: vi.fn(async () => ({ schemaVersion: 2 })),
    recordHistory: vi.fn(async () => ({ id: "v1" })),
  };
  const requireTrustedSender = vi.fn();
  const registration = createNotesRecoveryIpc({
    ipcMain,
    requireTrustedSender,
    store,
  });
  const invoke = (input: unknown, event = { sender: "desktop" }) =>
    handlers.get(NOTES_RECOVERY_COMMAND_CHANNEL)?.(event, input);
  return { invoke, ipcMain, registration, requireTrustedSender, store };
}

describe("notes recovery IPC", () => {
  it("routes the bounded action union after sender validation", async () => {
    const fixture = createFixture();
    const event = { sender: "desktop" };

    await expect(
      fixture.invoke(
        {
          action: "capture-draft",
          draft: { path: "a.md", rawSource: "draft", vaultRoot: "/vault" },
        },
        event,
      ),
    ).resolves.toBe(true);
    await expect(
      fixture.invoke({
        action: "list-history",
        path: "a.md",
        vaultRoot: "/vault",
      }),
    ).resolves.toEqual([{ id: "v1" }]);
    await expect(
      fixture.invoke({
        action: "capture-workspace",
        vaultRoot: "/vault",
        workspace: { activePath: "a.md" },
      }),
    ).resolves.toBe(true);
    await expect(
      fixture.invoke({
        action: "load-workspace",
        vaultRoot: "/vault",
      }),
    ).resolves.toEqual({ schemaVersion: 2 });

    expect(fixture.requireTrustedSender).toHaveBeenCalledWith(event);
    expect(fixture.store.captureDraft).toHaveBeenCalledWith({
      path: "a.md",
      rawSource: "draft",
      vaultRoot: "/vault",
    });
    expect(fixture.store.captureWorkspace).toHaveBeenCalledWith({
      vaultRoot: "/vault",
      workspace: { activePath: "a.md" },
    });
  });

  it("rejects an untrusted sender before reading recovery data", async () => {
    const fixture = createFixture();
    fixture.requireTrustedSender.mockImplementation(() => {
      throw new Error("untrusted sender");
    });

    await expect(
      fixture.invoke({ action: "list-drafts", vaultRoot: "/vault" }),
    ).rejects.toThrow("untrusted sender");
    expect(fixture.store.listDrafts).not.toHaveBeenCalled();
  });

  it("rejects unknown commands without calling the store", async () => {
    const fixture = createFixture();

    await expect(
      fixture.invoke({ action: "delete-everything" }),
    ).rejects.toThrow(/Unsupported notes recovery action/);
    expect(fixture.store.captureDraft).not.toHaveBeenCalled();
  });

  it("removes its handler on dispose", () => {
    const fixture = createFixture();

    fixture.registration.dispose();

    expect(fixture.ipcMain.removeHandler).toHaveBeenCalledWith(
      NOTES_RECOVERY_COMMAND_CHANNEL,
    );
  });
});
