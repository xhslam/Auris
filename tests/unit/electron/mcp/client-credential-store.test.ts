import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createMcpClientCredentialStore, hashToken } = require(
  "../../../../electron/mcp/client-credential-store.cjs",
);

const directories: string[] = [];

async function createStore(tokens: string[]) {
  const directory = await mkdtemp(path.join(tmpdir(), "auris-mcp-clients-"));
  directories.push(directory);
  const registryPath = path.join(directory, "auris-mcp-clients.json");
  const store = createMcpClientCredentialStore({
    now: () => new Date("2026-07-29T06:00:00.000Z"),
    randomToken: () => {
      const token = tokens.shift();
      if (!token) throw new Error("test token exhausted");
      return token;
    },
    registryPath,
  });
  return { registryPath, store };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("MCP client credential store", () => {
  it("stores only token hashes with private permissions and verifies a principal", async () => {
    const token = "a".repeat(64);
    const { registryPath, store } = await createStore([token]);
    expect(await store.issue("codex-cli")).toEqual({
      clientId: "codex-cli",
      token,
    });

    const raw = await readFile(registryPath, "utf8");
    expect(raw).not.toContain(token);
    expect(JSON.parse(raw).clients["codex-cli"].tokenHashes).toEqual([
      hashToken(token),
    ]);
    expect((await stat(registryPath)).mode & 0o777).toBe(0o600);
    await expect(store.verify("codex-cli", token)).resolves.toMatchObject({
      id: "codex-cli",
      kind: "installed-mcp-client",
      verified: true,
    });
    await expect(store.verify("codex-cli", "wrong".repeat(16))).resolves.toBeNull();
  });

  it("reuses a valid installed token and revokes it on removal", async () => {
    const token = "b".repeat(64);
    const { store } = await createStore([token]);
    await store.issue("claude-code");
    await expect(store.issue("claude-code", token)).resolves.toEqual({
      clientId: "claude-code",
      token,
    });
    await store.revoke("claude-code");
    await expect(store.verify("claude-code", token)).resolves.toBeNull();
  });

  it("serializes concurrent registry mutations across store instances", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "auris-mcp-clients-race-"));
    directories.push(directory);
    const registryPath = path.join(directory, "auris-mcp-clients.json");
    const first = createMcpClientCredentialStore({
      randomToken: () => "e".repeat(64),
      registryPath,
    });
    const second = createMcpClientCredentialStore({
      randomToken: () => "f".repeat(64),
      registryPath,
    });

    await Promise.all([
      first.issue("claude-code"),
      second.issue("codex-cli"),
    ]);

    await expect(first.verify("claude-code", "e".repeat(64))).resolves.not.toBeNull();
    await expect(second.verify("codex-cli", "f".repeat(64))).resolves.not.toBeNull();
  });

  it("does not resurrect a revoked client during a concurrent issuance", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "auris-mcp-revoke-race-"));
    directories.push(directory);
    const registryPath = path.join(directory, "auris-mcp-clients.json");
    const claudeToken = "1".repeat(64);
    const codexToken = "2".repeat(64);
    const first = createMcpClientCredentialStore({
      randomToken: () => claudeToken,
      registryPath,
    });
    const second = createMcpClientCredentialStore({
      randomToken: () => codexToken,
      registryPath,
    });
    await first.issue("claude-code");

    await Promise.all([
      first.revoke("claude-code"),
      second.issue("codex-cli"),
    ]);

    await expect(first.verify("claude-code", claudeToken)).resolves.toBeNull();
    await expect(second.verify("codex-cli", codexToken)).resolves.not.toBeNull();
  });

  it("keeps the previous token valid during a bounded rotation window", async () => {
    const first = "c".repeat(64);
    const second = "d".repeat(64);
    const { store } = await createStore([first, second]);
    await store.issue("claude-desktop");
    await store.issue("claude-desktop", "invalid".repeat(10));
    await expect(store.verify("claude-desktop", first)).resolves.not.toBeNull();
    await expect(store.verify("claude-desktop", second)).resolves.not.toBeNull();
  });
});
