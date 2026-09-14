"use strict";

/**
 * Fixed audited CLI adapter registry for Nia.
 *
 * Detection searches only documented executable names — never a user path.
 * Generation argv is fixed; prompts are supplied via stdin by the CLI provider.
 */

const { NIA_CLI_ADAPTER_IDS } = require("./nia-provider-store.cjs");

const NIA_CLI_REGISTRY_ERROR_CODES = Object.freeze([
  "UNKNOWN_CLI_ADAPTER",
  "USER_EXECUTABLE_REJECTED",
  "DETECTION_FAILED",
]);

class NiaCliRegistryError extends Error {
  constructor(code, message, details) {
    if (!NIA_CLI_REGISTRY_ERROR_CODES.includes(code)) {
      throw new TypeError(`Unknown Nia CLI registry error code: ${code}`);
    }
    super(message);
    this.name = "NiaCliRegistryError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function registryError(code, message, details) {
  return new NiaCliRegistryError(code, message, details);
}

const DOCUMENTED_EXECUTABLE_NAMES = Object.freeze({
  claude: Object.freeze(["claude"]),
  codex: Object.freeze(["codex"]),
  gemini: Object.freeze(["gemini"]),
});

/**
 * Fixed generation-only argv. Prompt is NEVER included — it goes on stdin.
 * toolModeDisable reflects whether the adapter has a documented non-agentic mode.
 */
const ADAPTERS = Object.freeze({
  claude: Object.freeze({
    id: "claude",
    label: "Claude",
    executableNames: DOCUMENTED_EXECUTABLE_NAMES.claude,
    // Print mode with text output; tools disabled via empty allow-list when supported.
    generateArgv: Object.freeze(["-p", "--output-format", "text", "--tools", ""]),
    toolModeDisable: true,
    generationOnly: true,
    versionArgv: Object.freeze(["--version"]),
  }),
  codex: Object.freeze({
    id: "codex",
    label: "Codex",
    executableNames: DOCUMENTED_EXECUTABLE_NAMES.codex,
    // Codex exec remains agentic; tool mode cannot be reliably disabled.
    generateArgv: Object.freeze(["exec", "--skip-git-repo-check", "-"]),
    toolModeDisable: false,
    generationOnly: false,
    versionArgv: Object.freeze(["--version"]),
  }),
  gemini: Object.freeze({
    id: "gemini",
    label: "Gemini",
    executableNames: DOCUMENTED_EXECUTABLE_NAMES.gemini,
    generateArgv: Object.freeze(["-p"]),
    toolModeDisable: true,
    generationOnly: true,
    versionArgv: Object.freeze(["--version"]),
  }),
});

function getCliAdapter(adapterId) {
  if (!NIA_CLI_ADAPTER_IDS.includes(adapterId) || !ADAPTERS[adapterId]) {
    throw registryError("UNKNOWN_CLI_ADAPTER", `Unknown CLI adapter: ${String(adapterId)}`);
  }
  return ADAPTERS[adapterId];
}

function listCliAdapters() {
  return NIA_CLI_ADAPTER_IDS.map((id) => ADAPTERS[id]);
}

function assertNoUserExecutablePath(candidate) {
  if (candidate == null) return;
  if (typeof candidate !== "string") {
    throw registryError("USER_EXECUTABLE_REJECTED", "User executable paths are rejected.");
  }
  if (
    candidate.includes("/") ||
    candidate.includes("\\") ||
    candidate.includes("..") ||
    candidate.includes("~")
  ) {
    throw registryError("USER_EXECUTABLE_REJECTED", "User executable paths are rejected.");
  }
  const allowed = new Set(
    Object.values(DOCUMENTED_EXECUTABLE_NAMES).flatMap((names) => [...names]),
  );
  if (!allowed.has(candidate)) {
    throw registryError("USER_EXECUTABLE_REJECTED", "User executable paths are rejected.");
  }
}

function createNiaCliRegistry({ whichImpl = null, spawnSyncImpl = null } = {}) {
  const which =
    typeof whichImpl === "function"
      ? whichImpl
      : (name) => {
          const { spawnSync } = require("node:child_process");
          const whichBin = process.platform === "win32" ? "where" : "/usr/bin/which";
          const result = (spawnSyncImpl || spawnSync)(whichBin, [name], {
            encoding: "utf8",
            shell: false,
            env: { PATH: process.env.PATH || "" },
            timeout: 5_000,
          });
          if (result.status !== 0) return null;
          const line = String(result.stdout || "")
            .split(/\r?\n/u)
            .map((entry) => entry.trim())
            .find(Boolean);
          return line || null;
        };

  function detectAdapter(adapterId) {
    const adapter = getCliAdapter(adapterId);
    for (const name of adapter.executableNames) {
      assertNoUserExecutablePath(name);
      const resolved = which(name);
      if (typeof resolved === "string" && resolved.length > 0) {
        let version = null;
        try {
          const { spawnSync } = require("node:child_process");
          const result = (spawnSyncImpl || spawnSync)(resolved, [...adapter.versionArgv], {
            encoding: "utf8",
            shell: false,
            timeout: 5_000,
            env: buildMinimalDetectionEnv(),
          });
          if (result.status === 0) {
            version = String(result.stdout || result.stderr || "")
              .trim()
              .slice(0, 120);
          }
        } catch {
          version = null;
        }
        return Object.freeze({
          adapterId,
          available: true,
          command: name,
          path: resolved,
          version,
          generationOnly: adapter.generationOnly,
          toolModeDisable: adapter.toolModeDisable,
          agentic: adapter.toolModeDisable !== true,
          argv: adapter.generateArgv,
        });
      }
    }
    return Object.freeze({
      adapterId,
      available: false,
      command: adapter.executableNames[0],
      path: null,
      version: null,
      generationOnly: adapter.generationOnly,
      toolModeDisable: adapter.toolModeDisable,
      agentic: adapter.toolModeDisable !== true,
      argv: adapter.generateArgv,
    });
  }

  function detectAll() {
    return listCliAdapters().map((adapter) => detectAdapter(adapter.id));
  }

  return Object.freeze({
    detectAdapter,
    detectAll,
    getCliAdapter,
    listCliAdapters,
  });
}

function buildMinimalDetectionEnv() {
  const allow = ["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "HOME", "USERPROFILE", "LANG", "LC_ALL"];
  const env = {};
  for (const key of allow) {
    if (typeof process.env[key] === "string") env[key] = process.env[key];
  }
  return env;
}

module.exports = {
  ADAPTERS,
  DOCUMENTED_EXECUTABLE_NAMES,
  NIA_CLI_REGISTRY_ERROR_CODES,
  NiaCliRegistryError,
  assertNoUserExecutablePath,
  createNiaCliRegistry,
  getCliAdapter,
  listCliAdapters,
};
