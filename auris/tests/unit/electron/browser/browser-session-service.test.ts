import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createBrowserStateDatabase } = require(
  "../../../../electron/browser/browser-state-db.cjs",
);
const { createBrowserSessionCapabilities } = require(
  "../../../../electron/browser/browser-session-capabilities.cjs",
);
const { createBrowserSessionService } = require(
  "../../../../electron/browser/browser-session-service.cjs",
);
const { createKeychainSecretStore } = require(
  "../../../../electron/security/keychain-secret-store.cjs",
);

function createFakeSafeStorage() {
  const vault = new Map<string, string>();
  return {
    decryptString(ciphertext: Buffer) {
      const key = ciphertext.toString("base64");
      const value = vault.get(key);
      if (value == null) throw new Error("missing");
      return value;
    },
    encryptString(plaintext: string) {
      const ciphertext = Buffer.from(`enc:${Buffer.from(plaintext).toString("base64")}`, "utf8");
      vault.set(ciphertext.toString("base64"), plaintext);
      return ciphertext;
    },
    isEncryptionAvailable() {
      return true;
    },
  };
}

describe("browser session service", () => {
  let tempDirectory: string | null = null;
  let database: { close?: () => void } | null = null;

  afterEach(async () => {
    database?.close?.();
    database = null;
    if (tempDirectory) await fs.rm(tempDirectory, { force: true, recursive: true });
    tempDirectory = null;
  });

  async function createService(capabilityOverrides = {}) {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "auris-session-"));
    const databasePath = path.join(tempDirectory, "browser-state.db");
    database = createBrowserStateDatabase(databasePath);
    const capabilities = createBrowserSessionCapabilities({
      cookieReplay: true,
      localStorageReplay: true,
      namedProfiles: true,
      ...capabilityOverrides,
    });
    const cookies = [
      {
        domain: "example.com",
        expirationDate: Date.now() / 1000 + 3600,
        hostOnly: true,
        httpOnly: true,
        name: "sid",
        path: "/",
        sameSite: "strict",
        secure: true,
        value: "super-secret-cookie",
      },
    ];
    const setCookie = vi.fn(async () => undefined);
    const getCookies = vi.fn(async () => cookies);
    const runIsolatedStorageScript = vi.fn(async ({ args }: { args: { mode: string } }) => {
      if (args.mode === "capture") {
        return { items: [["token", "super-secret-storage"]], ok: true };
      }
      return { applied: true, ok: true };
    });
    const service = createBrowserSessionService({
      capabilities,
      database,
      getCookies,
      removeCookie: vi.fn(),
      runIsolatedStorageScript,
      secretStore: createKeychainSecretStore({ safeStorage: createFakeSafeStorage() }),
      setCookie,
    });
    return {
      capabilities,
      cookies,
      getCookies,
      runIsolatedStorageScript,
      service,
      setCookie,
    };
  }

  it("persists ciphertext only and returns opaque counts", async () => {
    const { service } = await createService();
    const summary = await service.save({
      committedOrigin: "https://example.com/app",
      name: "research.login",
      partitionSession: {},
      runContext: {},
    });
    expect(summary).toEqual({
      capabilities: {
        cookieReplay: true,
        localStorageReplay: true,
        namedProfiles: true,
      },
      cookieCount: 1,
      localStorageItemCount: 1,
      name: "research.login",
      originCount: 1,
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("super-secret");
    const ciphertext = service.readCiphertextOnly("research.login");
    expect(Buffer.isBuffer(ciphertext)).toBe(true);
    expect(ciphertext.toString("utf8")).not.toContain("super-secret");
    expect(service.inspect("research.login")).toMatchObject({
      cookieCount: 1,
      localStorageItemCount: 1,
      name: "research.login",
      origin: "https://example.com",
    });
    expect(JSON.stringify(service.inspect("research.login"))).not.toContain("super-secret");
  });

  it("validates named references, overwrites, deletes, and refuses corrupt ciphertext", async () => {
    const { service } = await createService();
    expect(() => service.forget("bad name")).toThrowError(
      expect.objectContaining({ code: "OPERATION_NOT_ALLOWED" }),
    );
    await service.save({
      committedOrigin: "https://example.com/",
      name: "profile-a",
      partitionSession: {},
      runContext: {},
    });
    await service.save({
      committedOrigin: "https://example.com/",
      name: "profile-a",
      partitionSession: {},
      runContext: {},
    });
    expect(service.storedCount()).toBe(1);
    expect(service.forget("profile-a")).toEqual({ forgotten: true, name: "profile-a" });
    expect(service.exists("profile-a")).toBe(false);
    await expect(service.load({
      committedOrigin: "https://example.com/",
      name: "missing",
      partitionSession: {},
      runContext: {},
      tabId: "tab-1",
      windowId: "window-1",
    })).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
  });

  it("binds origin, preserves cookie flags, and refuses cross-origin restore", async () => {
    const { service, setCookie, runIsolatedStorageScript } = await createService();
    await service.save({
      committedOrigin: "https://example.com/path",
      name: "bound",
      partitionSession: {},
      runContext: {},
    });
    await expect(service.load({
      committedOrigin: "https://evil.example/",
      name: "bound",
      partitionSession: {},
      runContext: {},
      tabId: "tab-1",
      windowId: "window-1",
    })).rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED" });

    await service.load({
      committedOrigin: "https://example.com/other",
      name: "bound",
      partitionSession: {},
      runContext: {},
      tabId: "tab-1",
      windowId: "window-1",
    });
    expect(setCookie).toHaveBeenCalledWith(expect.objectContaining({
      cookie: expect.objectContaining({
        httpOnly: true,
        name: "sid",
        sameSite: "strict",
        secure: true,
      }),
    }));
    expect(runIsolatedStorageScript).toHaveBeenCalledWith(expect.objectContaining({
      args: expect.objectContaining({ mode: "restore" }),
    }));
    const restoreArgs = runIsolatedStorageScript.mock.calls.find(
      (call: [{ args: { mode: string } }]) => call[0].args.mode === "restore",
    )?.[0]?.args;
    expect(JSON.stringify(restoreArgs)).toContain("super-secret-storage");
    expect(service.isSessionInjected("window-1", "tab-1")).toBe(true);
  });

  it("keeps independent capability gates and never returns secret material", async () => {
    const cookieOnly = await createService({
      cookieReplay: true,
      localStorageReplay: false,
      namedProfiles: true,
    });
    await expect(cookieOnly.service.save({
      committedOrigin: "https://example.com/",
      name: "cookies-only",
      partitionSession: {},
      runContext: {},
    })).resolves.toMatchObject({ cookieCount: 1, localStorageItemCount: 0 });
  });

  it("refuses save when named profiles and replay capabilities are unverified", async () => {
    const gated = await createService({
      cookieReplay: false,
      localStorageReplay: false,
      namedProfiles: false,
    });
    await expect(gated.service.save({
      committedOrigin: "https://example.com/",
      name: "blocked",
      partitionSession: {},
      runContext: {},
    })).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
  });

  it("does not expose list/read APIs for credential values", async () => {
    const { service } = await createService();
    await service.save({
      committedOrigin: "https://example.com/",
      name: "opaque",
      partitionSession: {},
      runContext: {},
    });
    expect(service).not.toHaveProperty("list");
    expect(service).not.toHaveProperty("read");
    expect(service).not.toHaveProperty("export");
    const loadResult = await service.load({
      committedOrigin: "https://example.com/",
      name: "opaque",
      partitionSession: {},
      runContext: {},
      tabId: "tab-2",
      windowId: "window-2",
    });
    expect(JSON.stringify(loadResult)).not.toContain("super-secret");
  });
});
