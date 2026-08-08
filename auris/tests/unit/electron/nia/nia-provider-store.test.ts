import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createKeychainSecretStore,
  NIA_PROVIDER_SECRET_NAMESPACE,
} = require("../../../../electron/security/keychain-secret-store.cjs");
const {
  createNiaProviderStore,
  NiaProviderStoreError,
} = require("../../../../electron/nia/nia-provider-store.cjs");

function createFakeSafeStorage({ available = true } = {}) {
  const vault = new Map<string, string>();
  return {
    decryptString(ciphertext: Buffer) {
      if (!available) throw new Error("unavailable");
      const key = ciphertext.toString("base64");
      const value = vault.get(key);
      if (value == null) throw new Error("missing");
      return value;
    },
    encryptString(plaintext: string) {
      if (!available) throw new Error("unavailable");
      const ciphertext = Buffer.from(
        Buffer.from(plaintext, "utf8").toString("base64"),
        "utf8",
      );
      vault.set(ciphertext.toString("base64"), plaintext);
      return ciphertext;
    },
    isEncryptionAvailable() {
      return available;
    },
  };
}

function createMemoryPersistence() {
  const entries = new Map<string, Buffer>();
  return {
    entries,
    async get(key: string) {
      return entries.has(key) ? Buffer.from(entries.get(key)!) : null;
    },
    async set(key: string, value: Buffer) {
      entries.set(key, Buffer.from(value));
    },
    async delete(key: string) {
      entries.delete(key);
    },
  };
}

const REST_CAPABILITIES = {
  streaming: true,
  toolModeDisable: true,
  cancellation: true,
  attachments: false,
  maxInputTokens: 128_000,
  maxOutputTokens: 8_192,
};

const CLI_CAPABILITIES = {
  ...REST_CAPABILITIES,
  independentToolAuthority: false,
};

describe("createNiaProviderStore", () => {
  let tempDirectory: string;
  let persistence: ReturnType<typeof createMemoryPersistence>;

  beforeEach(async () => {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "auris-nia-provider-"));
    persistence = createMemoryPersistence();
  });

  afterEach(async () => {
    await fs.rm(tempDirectory, { force: true, recursive: true });
  });

  function createStore() {
    const secretStore = createKeychainSecretStore({
      safeStorage: createFakeSafeStorage(),
      persistence,
    });
    return createNiaProviderStore({
      baseDir: tempDirectory,
      secretStore,
    });
  }

  describe("REST and CLI definitions", () => {
    it("upserts REST and CLI providers with bounded defaults and enabled state", async () => {
      const store = createStore();
      const rest = await store.upsertRestProvider({
        id: "anthropic-default",
        kind: "rest",
        protocol: "anthropic",
        label: "Anthropic",
        enabled: true,
        endpoint: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-5",
        supportedModels: ["claude-sonnet-4-5", "claude-haiku-4-5"],
        capabilities: REST_CAPABILITIES,
      });
      const cli = await store.upsertCliProvider({
        id: "claude-cli",
        kind: "cli",
        adapterId: "claude",
        label: "Claude CLI",
        enabled: false,
        defaultModel: "claude-sonnet-4-5",
        supportedModels: ["claude-sonnet-4-5"],
        capabilities: CLI_CAPABILITIES,
      });

      expect(rest.enabled).toBe(true);
      expect(rest.bounds.timeoutMs).toBeGreaterThan(0);
      expect(cli.enabled).toBe(false);
      expect(cli.adapterId).toBe("claude");

      const listed = await store.listProviders();
      expect(listed.map((entry: { id: string }) => entry.id).sort()).toEqual([
        "anthropic-default",
        "claude-cli",
      ]);
    });

    it("rejects hostile CLI and REST configuration knobs", async () => {
      const store = createStore();

      await expect(
        store.upsertCliProvider({
          id: "claude-cli",
          kind: "cli",
          adapterId: "claude",
          label: "Claude CLI",
          enabled: true,
          defaultModel: "claude-sonnet-4-5",
          supportedModels: ["claude-sonnet-4-5"],
          capabilities: CLI_CAPABILITIES,
          executablePath: "/tmp/evil",
        }),
      ).rejects.toMatchObject({ code: "USER_EXECUTABLE_REJECTED" });

      await expect(
        store.upsertRestProvider({
          id: "remote-http",
          kind: "rest",
          protocol: "openai-compatible",
          label: "Remote",
          enabled: true,
          endpoint: "http://api.example.com",
          defaultModel: "gpt-4o",
          supportedModels: ["gpt-4o"],
          capabilities: REST_CAPABILITIES,
        }),
      ).rejects.toMatchObject({ code: "NON_HTTPS_ENDPOINT_REJECTED" });

      await expect(
        store.upsertRestProvider({
          id: "creds",
          kind: "rest",
          protocol: "openai",
          label: "OpenAI",
          enabled: true,
          endpoint: "https://user:token@api.openai.com",
          defaultModel: "gpt-4o",
          supportedModels: ["gpt-4o"],
          capabilities: REST_CAPABILITIES,
        }),
      ).rejects.toMatchObject({ code: "URL_CREDENTIAL_REJECTED" });

      await expect(
        store.upsertRestProvider({
          id: "unknown-cap",
          kind: "rest",
          protocol: "openai",
          label: "OpenAI",
          enabled: true,
          endpoint: "https://api.openai.com",
          defaultModel: "gpt-4o",
          supportedModels: ["gpt-4o"],
          capabilities: { ...REST_CAPABILITIES, shellExec: true },
        }),
      ).rejects.toMatchObject({ code: "UNKNOWN_CAPABILITY" });
    });
  });

  describe("active default selection", () => {
    it("enforces exactly one active default provider and switches atomically", async () => {
      const store = createStore();
      await store.upsertRestProvider({
        id: "a",
        kind: "rest",
        protocol: "anthropic",
        label: "A",
        enabled: true,
        endpoint: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-5",
        supportedModels: ["claude-sonnet-4-5"],
        capabilities: REST_CAPABILITIES,
      });
      await store.upsertRestProvider({
        id: "b",
        kind: "rest",
        protocol: "openai",
        label: "B",
        enabled: true,
        endpoint: "https://api.openai.com",
        defaultModel: "gpt-4o",
        supportedModels: ["gpt-4o"],
        capabilities: REST_CAPABILITIES,
      });

      await store.setActiveDefault("a");
      expect(await store.getActiveProviderId()).toBe("a");

      await store.setActiveDefault("b");
      expect(await store.getActiveProviderId()).toBe("b");

      const snapshot = await store.readPersistedConfig();
      expect(snapshot.activeProviderId).toBe("b");
      expect(snapshot.providers.filter((entry: { id: string }) => entry.id === "a")).toHaveLength(1);
    });

    it("rejects activating a missing or disabled provider", async () => {
      const store = createStore();
      await store.upsertRestProvider({
        id: "disabled",
        kind: "rest",
        protocol: "anthropic",
        label: "Disabled",
        enabled: false,
        endpoint: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-5",
        supportedModels: ["claude-sonnet-4-5"],
        capabilities: REST_CAPABILITIES,
      });

      await expect(store.setActiveDefault("missing")).rejects.toMatchObject({
        code: "PROVIDER_NOT_FOUND",
      });
      await expect(store.setActiveDefault("disabled")).rejects.toMatchObject({
        code: "PROVIDER_DISABLED",
      });
    });

    it("allows a definition model override only for supported models", async () => {
      const store = createStore();
      await store.upsertRestProvider({
        id: "anthropic-default",
        kind: "rest",
        protocol: "anthropic",
        label: "Anthropic",
        enabled: true,
        endpoint: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-5",
        supportedModels: ["claude-sonnet-4-5", "claude-haiku-4-5"],
        capabilities: REST_CAPABILITIES,
      });
      await store.setActiveDefault("anthropic-default");

      expect(
        await store.resolveModelOverride({
          providerId: "anthropic-default",
          modelOverride: "claude-haiku-4-5",
        }),
      ).toEqual({ model: "claude-haiku-4-5", overridden: true });

      await expect(
        store.resolveModelOverride({
          providerId: "anthropic-default",
          modelOverride: "gpt-4o",
        }),
      ).rejects.toMatchObject({ code: "MODEL_NOT_SUPPORTED" });
    });
  });

  describe("secret lifecycle", () => {
    it("keeps REST keys process-memory-only by default", async () => {
      const store = createStore();
      await store.upsertRestProvider({
        id: "anthropic-default",
        kind: "rest",
        protocol: "anthropic",
        label: "Anthropic",
        enabled: true,
        endpoint: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-5",
        supportedModels: ["claude-sonnet-4-5"],
        capabilities: REST_CAPABILITIES,
      });

      await store.setSessionApiKey("anthropic-default", "sk-live-secret-value");
      expect(store.getSessionApiKey("anthropic-default")).toBe("sk-live-secret-value");

      const persisted = await store.readPersistedConfig();
      const serialized = JSON.stringify(persisted);
      expect(serialized).not.toContain("sk-live-secret-value");
      expect(serialized).not.toMatch(/"apiKey"|"api_key"|"token"|"accessToken"|"password"|"secret"/);
      expect(persisted.providers[0].rememberOnThisMac).toBe(false);
      expect(persisted.providers[0].secretRef).toBeNull();
      expect(persistence.entries.size).toBe(0);

      const diskFiles = await fs.readdir(tempDirectory);
      for (const name of diskFiles) {
        const content = await fs.readFile(path.join(tempDirectory, name), "utf8");
        expect(content).not.toContain("sk-live-secret-value");
      }
    });

    it("writes an opaque Keychain reference only after explicit rememberOnThisMac", async () => {
      const store = createStore();
      await store.upsertRestProvider({
        id: "anthropic-default",
        kind: "rest",
        protocol: "anthropic",
        label: "Anthropic",
        enabled: true,
        endpoint: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-5",
        supportedModels: ["claude-sonnet-4-5"],
        capabilities: REST_CAPABILITIES,
      });
      await store.setSessionApiKey("anthropic-default", "sk-live-secret-value");

      const remembered = await store.rememberOnThisMac("anthropic-default", true);
      expect(remembered.rememberOnThisMac).toBe(true);
      expect(remembered.secretRef).toEqual(
        expect.objectContaining({
          kind: "keychain-ref",
          namespace: NIA_PROVIDER_SECRET_NAMESPACE,
        }),
      );
      expect(JSON.stringify(remembered)).not.toContain("sk-live-secret-value");
      expect(persistence.entries.size).toBe(1);

      const ciphertext = [...persistence.entries.values()][0]!;
      expect(ciphertext.toString("utf8")).not.toContain("sk-live-secret-value");

      const persisted = await store.readPersistedConfig();
      expect(persisted.providers[0].rememberOnThisMac).toBe(true);
      expect(persisted.providers[0].secretRef).toEqual(remembered.secretRef);
      expect(JSON.stringify(persisted)).not.toContain("sk-live-secret-value");
    });

    it("deletes the Keychain secret when remember is turned off", async () => {
      const store = createStore();
      await store.upsertRestProvider({
        id: "anthropic-default",
        kind: "rest",
        protocol: "anthropic",
        label: "Anthropic",
        enabled: true,
        endpoint: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-5",
        supportedModels: ["claude-sonnet-4-5"],
        capabilities: REST_CAPABILITIES,
      });
      await store.setSessionApiKey("anthropic-default", "sk-live-secret-value");
      await store.rememberOnThisMac("anthropic-default", true);
      expect(persistence.entries.size).toBe(1);

      const forgotten = await store.rememberOnThisMac("anthropic-default", false);
      expect(forgotten.rememberOnThisMac).toBe(false);
      expect(forgotten.secretRef).toBeNull();
      expect(persistence.entries.size).toBe(0);

      // Session key may remain in memory; persisted config must not remember.
      const persisted = await store.readPersistedConfig();
      expect(persisted.providers[0].rememberOnThisMac).toBe(false);
      expect(persisted.providers[0].secretRef).toBeNull();
    });

    it("never infers rememberOnThisMac from a previously found Keychain entry", async () => {
      const store = createStore();
      await store.upsertRestProvider({
        id: "anthropic-default",
        kind: "rest",
        protocol: "anthropic",
        label: "Anthropic",
        enabled: true,
        endpoint: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-5",
        supportedModels: ["claude-sonnet-4-5"],
        capabilities: REST_CAPABILITIES,
      });
      await store.setSessionApiKey("anthropic-default", "sk-live-secret-value");
      await store.rememberOnThisMac("anthropic-default", true);

      // Simulate a corrupt/forged config that clears remember while leaving a vault entry.
      const configPath = path.join(tempDirectory, "providers.json");
      const raw = JSON.parse(await fs.readFile(configPath, "utf8"));
      raw.providers[0].rememberOnThisMac = false;
      raw.providers[0].secretRef = null;
      await fs.writeFile(configPath, JSON.stringify(raw), "utf8");

      const reloaded = createNiaProviderStore({
        baseDir: tempDirectory,
        secretStore: createKeychainSecretStore({
          safeStorage: createFakeSafeStorage(),
          persistence,
        }),
      });
      const provider = await reloaded.getProvider("anthropic-default");
      expect(provider.rememberOnThisMac).toBe(false);
      expect(provider.secretRef).toBeNull();
      // Orphan vault entry must not flip remember back on.
      expect(persistence.entries.size).toBe(1);
    });
  });

  describe("persistence and corrupt normalization", () => {
    it("persists provider metadata separately from secrets", async () => {
      const store = createStore();
      await store.upsertRestProvider({
        id: "anthropic-default",
        kind: "rest",
        protocol: "anthropic",
        label: "Anthropic",
        enabled: true,
        endpoint: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-5",
        supportedModels: ["claude-sonnet-4-5"],
        capabilities: REST_CAPABILITIES,
      });
      await store.setSessionApiKey("anthropic-default", "sk-live-secret-value");
      await store.rememberOnThisMac("anthropic-default", true);

      const configPath = path.join(tempDirectory, "providers.json");
      const configText = await fs.readFile(configPath, "utf8");
      expect(configText).toContain("anthropic-default");
      expect(configText).toContain("keychain-ref");
      expect(configText).not.toContain("sk-live-secret-value");
      expect(configText).not.toMatch(/"apiKey"|"token"|"password"/);
    });

    it("normalizes corrupt on-disk config fail-closed", async () => {
      const configPath = path.join(tempDirectory, "providers.json");
      await fs.writeFile(
        configPath,
        JSON.stringify({
          activeProviderId: "ghost",
          providers: [
            {
              id: "ok",
              kind: "rest",
              protocol: "anthropic",
              label: "OK",
              enabled: true,
              endpoint: "https://api.anthropic.com",
              defaultModel: "claude-sonnet-4-5",
              supportedModels: ["claude-sonnet-4-5"],
              capabilities: REST_CAPABILITIES,
              apiKey: "sk-should-be-stripped",
              rememberOnThisMac: true,
            },
            {
              id: "bad",
              kind: "cli",
              adapterId: "not-a-real-adapter",
              label: "Bad",
              enabled: true,
            },
            {
              id: "http-bad",
              kind: "rest",
              protocol: "openai",
              label: "HTTP",
              enabled: true,
              endpoint: "http://api.openai.com",
              defaultModel: "gpt-4o",
              supportedModels: ["gpt-4o"],
              capabilities: REST_CAPABILITIES,
            },
          ],
        }),
        "utf8",
      );

      const store = createStore();
      const snapshot = await store.readPersistedConfig();
      expect(snapshot.activeProviderId).toBeNull();
      expect(snapshot.providers).toHaveLength(1);
      expect(snapshot.providers[0].id).toBe("ok");
      expect(snapshot.providers[0].rememberOnThisMac).toBe(false);
      expect(snapshot.providers[0].secretRef).toBeNull();
      expect(JSON.stringify(snapshot)).not.toContain("sk-should-be-stripped");
      expect(snapshot.providers[0]).not.toHaveProperty("apiKey");
    });

    it("reports model capabilities truthfully on stored providers", async () => {
      const store = createStore();
      const provider = await store.upsertRestProvider({
        id: "anthropic-default",
        kind: "rest",
        protocol: "anthropic",
        label: "Anthropic",
        enabled: true,
        endpoint: "https://api.anthropic.com",
        defaultModel: "claude-sonnet-4-5",
        supportedModels: ["claude-sonnet-4-5"],
        capabilities: {
          streaming: true,
          toolModeDisable: true,
          cancellation: true,
          attachments: true,
          maxInputTokens: 200_000,
          maxOutputTokens: 16_000,
        },
      });

      expect(provider.capabilities).toEqual({
        streaming: true,
        toolModeDisable: true,
        cancellation: true,
        attachments: true,
        maxInputTokens: 200_000,
        maxOutputTokens: 16_000,
      });
    });

    it("requires baseDir and secretStore", () => {
      expect(() => createNiaProviderStore({})).toThrow(NiaProviderStoreError);
      expect(() => createNiaProviderStore({ baseDir: tempDirectory })).toThrow(
        NiaProviderStoreError,
      );
    });
  });
});

describe("keychain namespaced Nia secrets", () => {
  it("stores and deletes opaque Nia-namespace references without exposing plaintext", async () => {
    const persistence = createMemoryPersistence();
    const store = createKeychainSecretStore({
      safeStorage: createFakeSafeStorage(),
      persistence,
    });

    const ref = await store.putNamespacedSecret(
      { namespace: NIA_PROVIDER_SECRET_NAMESPACE, account: "anthropic-default" },
      "sk-live-secret-value",
    );
    expect(ref).toEqual({
      kind: "keychain-ref",
      namespace: NIA_PROVIDER_SECRET_NAMESPACE,
      account: "anthropic-default",
    });
    expect(JSON.stringify(ref)).not.toContain("sk-live-secret-value");

    const plaintext = await store.getNamespacedSecret(ref);
    expect(plaintext.toString("utf8")).toBe("sk-live-secret-value");

    await store.deleteNamespacedSecret(ref);
    await expect(store.getNamespacedSecret(ref)).rejects.toMatchObject({
      code: "CAPABILITY_NOT_VERIFIED",
    });
  });

  it("rejects non-Nia namespaces for the Nia helper path", async () => {
    const store = createKeychainSecretStore({
      safeStorage: createFakeSafeStorage(),
      persistence: createMemoryPersistence(),
    });
    await expect(
      store.putNamespacedSecret(
        { namespace: "browser-session", account: "x" },
        "secret",
      ),
    ).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
  });
});
