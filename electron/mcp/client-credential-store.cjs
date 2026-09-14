"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const lockfile = require("proper-lockfile");
const {
  CONFIG_CONFLICT_CODE,
  durableCompareAndSwapWrite,
  readFileOrNull,
} = require("./durable-config-writer.cjs");

const CREDENTIAL_REGISTRY_VERSION = 1;
const MAX_WRITE_ATTEMPTS = 3;
const MAX_ACTIVE_TOKEN_HASHES = 2;
const CLIENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;

function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""), "utf8");
  const rightBuffer = Buffer.from(String(right ?? ""), "utf8");
  return leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function assertClientId(clientId) {
  if (typeof clientId !== "string" || !CLIENT_ID_PATTERN.test(clientId)) {
    throw new TypeError("A valid MCP client ID is required.");
  }
}

function emptyRegistry() {
  return { clients: {}, version: CREDENTIAL_REGISTRY_VERSION };
}

function parseRegistry(content) {
  if (content === null || content.trim() === "") return emptyRegistry();
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("Auris MCP client credential registry is not valid JSON.");
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.version !== CREDENTIAL_REGISTRY_VERSION ||
    !value.clients ||
    typeof value.clients !== "object" ||
    Array.isArray(value.clients)
  ) {
    throw new Error("Auris MCP client credential registry is invalid.");
  }
  return value;
}

function normalizeEntry(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray(value.tokenHashes) ||
    !value.tokenHashes.every((hash) => /^[0-9a-f]{64}$/u.test(hash))
  ) {
    return null;
  }
  return {
    createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
    tokenHashes: [...new Set(value.tokenHashes)].slice(-MAX_ACTIVE_TOKEN_HASHES),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

function createMcpClientCredentialStore({
  fileSystem,
  now = () => new Date(),
  randomToken = () => crypto.randomBytes(32).toString("hex"),
  registryPath,
} = {}) {
  if (typeof registryPath !== "string" || !registryPath) {
    throw new TypeError("MCP client credential registry path is required.");
  }
  const fileSystemApi = fileSystem ?? fs;

  async function acquireMutationLock() {
    await fileSystemApi.mkdir(path.dirname(registryPath), {
      mode: 0o700,
      recursive: true,
    });
    return lockfile.lock(registryPath, {
      realpath: false,
      retries: {
        factor: 1,
        maxTimeout: 25,
        minTimeout: 25,
        retries: 200,
      },
      stale: 10_000,
      update: 2_000,
    });
  }

  async function readState() {
    const content = await readFileOrNull(fileSystem, registryPath);
    return { content, registry: parseRegistry(content) };
  }

  async function writeMutation(mutate) {
    const releaseLock = await acquireMutationLock();
    try {
      for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
        const { content, registry } = await readState();
        const changed = mutate(registry);
        if (!changed) return false;
        try {
          await durableCompareAndSwapWrite({
            expectedContent: content,
            fileSystem: fileSystemApi,
            nextContent: `${JSON.stringify(registry, null, 2)}\n`,
            registryPath,
            targetPath: registryPath,
          });
          return true;
        } catch (error) {
          if (
            error?.code !== CONFIG_CONFLICT_CODE ||
            attempt === MAX_WRITE_ATTEMPTS
          ) {
            throw error;
          }
        }
      }
      return false;
    } finally {
      await releaseLock();
    }
  }

  async function verify(clientId, token) {
    try {
      assertClientId(clientId);
      if (typeof token !== "string" || token.length < 32) return null;
      const { registry } = await readState();
      const entry = normalizeEntry(registry.clients[clientId]);
      const candidateHash = hashToken(token);
      if (!entry?.tokenHashes.some((knownHash) => safeEqual(knownHash, candidateHash))) {
        return null;
      }
      return Object.freeze({
        id: clientId,
        kind: "installed-mcp-client",
        verified: true,
      });
    } catch {
      return null;
    }
  }

  async function issue(clientId, existingToken) {
    assertClientId(clientId);
    if (await verify(clientId, existingToken)) {
      return { clientId, token: existingToken };
    }
    const token = randomToken();
    if (typeof token !== "string" || token.length < 32) {
      throw new Error("MCP client credential generator returned an invalid token.");
    }
    const tokenHash = hashToken(token);
    const timestamp = now().toISOString();
    await writeMutation((registry) => {
      const previous = normalizeEntry(registry.clients[clientId]);
      registry.clients[clientId] = {
        createdAt: previous?.createdAt ?? timestamp,
        tokenHashes: [
          ...(previous?.tokenHashes ?? []).filter((hash) => hash !== tokenHash),
          tokenHash,
        ].slice(-MAX_ACTIVE_TOKEN_HASHES),
        updatedAt: timestamp,
      };
      return true;
    });
    return { clientId, token };
  }

  async function revoke(clientId) {
    assertClientId(clientId);
    return writeMutation((registry) => {
      if (!Object.prototype.hasOwnProperty.call(registry.clients, clientId)) return false;
      delete registry.clients[clientId];
      return true;
    });
  }

  return { issue, revoke, verify };
}

module.exports = {
  CREDENTIAL_REGISTRY_VERSION,
  createMcpClientCredentialStore,
  hashToken,
};
