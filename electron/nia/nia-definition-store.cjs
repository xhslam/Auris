"use strict";

/**
 * Canonical/legacy-aware Nia definition storage.
 *
 * The store never trusts a renderer-supplied normalized AST as authority:
 * every raw Markdown source — whether an immutable built-in or a
 * user-installed file read back from disk — is (re)parsed through the
 * packaged `nia-definition-contract.cjs` before it is ever returned from
 * `list()` / `get()` / `resolveUsesRef()`. Installed definitions are written
 * to a filesystem location injected by the caller (outside the source tree
 * at runtime; a temp directory in tests) using temp-file-plus-rename atomic
 * writes, keyed by a canonical identity that is always displayed as Nia
 * regardless of the original `nia: v1` / `genie: v1` / unversioned Genie
 * source format.
 */

const { createHash } = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");

const {
  parseNiaDefinitionMarkdown,
  reparseTrustedSource,
  serializeNiaDefinitionMarkdown,
  normalizeUsesRef,
} = require("../shared/nia-definition-contract.cjs");

const NIA_DEFINITION_STORE_ERROR_CODES = Object.freeze([
  "INVALID_BASE_DIR",
  "INVALID_BUILTIN",
  "NAME_REQUIRED",
  "NAME_TOO_LONG",
  "INVALID_FILENAME_HINT",
  "PATH_TRAVERSAL_REJECTED",
  "INVALID_REF",
  "DEFINITION_CONFLICT",
  "BUILTIN_PROTECTED",
  "NOT_FOUND",
]);

const MAX_CANONICAL_NAME_LENGTH = 128;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
const INDEX_FILE_NAME = "index.json";
const DEFINITIONS_DIR_NAME = "definitions";

class NiaDefinitionStoreError extends Error {
  constructor(code, message, details) {
    if (!NIA_DEFINITION_STORE_ERROR_CODES.includes(code)) {
      throw new TypeError(`Unknown Nia definition store error code: ${code}`);
    }
    super(message);
    this.name = "NiaDefinitionStoreError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function storeError(code, message, details) {
  return new NiaDefinitionStoreError(code, message, details);
}

function assertNoTraversal(value) {
  if (value.includes("..") || value.includes("/") || value.includes("\\") || value.includes("\u0000")) {
    throw storeError(
      "PATH_TRAVERSAL_REJECTED",
      "Path traversal or separator characters are not allowed in a Nia definition name.",
    );
  }
}

/**
 * Canonical identity normalization: Unicode-normalize (NFKC) and casefold
 * (lowercase) so that differently-cased or differently-normalized names
 * (composed vs. decomposed accents, etc.) collide on the same identity
 * instead of silently coexisting as distinct definitions.
 */
function normalizeCanonicalName(rawName) {
  if (typeof rawName !== "string" || rawName.length === 0) {
    throw storeError("NAME_REQUIRED", "A Nia definition canonical name is required.");
  }
  const normalized = rawName.normalize("NFKC").toLowerCase().trim();
  if (normalized.length === 0) {
    throw storeError("NAME_REQUIRED", "A Nia definition canonical name is required.");
  }
  if (normalized.length > MAX_CANONICAL_NAME_LENGTH) {
    throw storeError(
      "NAME_TOO_LONG",
      `Nia definition name exceeds the ${MAX_CANONICAL_NAME_LENGTH} character limit.`,
    );
  }
  if (CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw storeError("INVALID_FILENAME_HINT", "Nia definition name contains control characters.");
  }
  assertNoTraversal(normalized);
  return normalized;
}

function canonicalNameFromFilenameHint(filenameHint) {
  if (typeof filenameHint !== "string" || filenameHint.length === 0) {
    throw storeError("INVALID_FILENAME_HINT", "A filenameHint is required when a definition has no explicit id.");
  }
  if (filenameHint.includes("\u0000") || CONTROL_CHARACTER_PATTERN.test(filenameHint)) {
    throw storeError("INVALID_FILENAME_HINT", "filenameHint contains control characters.");
  }
  const normalizedHint = filenameHint.normalize("NFKC");
  if (normalizedHint.includes("..") || normalizedHint.includes("/") || normalizedHint.includes("\\")) {
    throw storeError(
      "PATH_TRAVERSAL_REJECTED",
      "filenameHint must not contain path separators or traversal sequences.",
    );
  }
  const extension = path.extname(normalizedHint);
  const stem = extension.length > 0 ? normalizedHint.slice(0, -extension.length) : normalizedHint;
  return normalizeCanonicalName(stem);
}

function canonicalNameFromAst(ast, filenameHint) {
  if (typeof ast.id === "string" && ast.id.length > 0) {
    return normalizeCanonicalName(ast.id);
  }
  return canonicalNameFromFilenameHint(filenameHint);
}

function fileIdForCanonicalName(canonicalName) {
  return createHash("sha256").update(canonicalName, "utf8").digest("hex");
}

function definitionsDirectory(baseDir) {
  return path.join(baseDir, DEFINITIONS_DIR_NAME);
}

function indexFilePath(baseDir) {
  return path.join(baseDir, INDEX_FILE_NAME);
}

async function atomicWriteFile(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fsp.writeFile(tempPath, content, "utf8");
  await fsp.rename(tempPath, filePath);
}

async function readIndex(baseDir) {
  try {
    const raw = await fsp.readFile(indexFilePath(baseDir), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.entries !== "object" || parsed.entries === null) {
      return { entries: {}, version: 1 };
    }
    return { entries: { ...parsed.entries }, version: 1 };
  } catch (error) {
    if (error && error.code === "ENOENT") return { entries: {}, version: 1 };
    throw error;
  }
}

async function writeIndex(baseDir, index) {
  await atomicWriteFile(indexFilePath(baseDir), `${JSON.stringify({ entries: index.entries, version: 1 }, null, 2)}\n`);
}

function buildDescriptor({ ast, canonicalId, installedAt, provenance }) {
  return Object.freeze({
    // Provenance/labels always display as Nia, even when the underlying
    // source is a legacy Genie file; `sourceCompatibility` is retained only
    // as internal diagnostic metadata, never surfaced as a family name.
    label: "Nia",
    canonicalId,
    provenance,
    sourceCompatibility: ast.sourceCompatibility,
    description: ast.description,
    scope: ast.scope,
    ...(ast.category !== undefined ? { category: ast.category } : {}),
    ...(ast.model !== undefined ? { model: ast.model } : {}),
    ...(ast.action !== undefined ? { action: ast.action } : {}),
    ...(ast.context !== undefined ? { context: ast.context } : {}),
    ...(ast.approval !== undefined ? { approval: ast.approval } : {}),
    ...(ast.input !== undefined ? { input: ast.input } : {}),
    ...(ast.output !== undefined ? { output: ast.output } : {}),
    ...(ast.tags !== undefined ? { tags: ast.tags } : {}),
    body: ast.body,
    ...(ast.diagnostics !== undefined ? { diagnostics: ast.diagnostics } : {}),
    ...(installedAt !== undefined ? { installedAt } : {}),
  });
}

function createNiaDefinitionStore({ baseDir, builtins = [] } = {}) {
  if (typeof baseDir !== "string" || baseDir.length === 0) {
    throw storeError("INVALID_BASE_DIR", "createNiaDefinitionStore requires a baseDir string.");
  }
  if (!Array.isArray(builtins)) {
    throw new TypeError("builtins must be an array of { name, source } entries.");
  }

  const builtinDescriptors = new Map();
  for (const entry of builtins) {
    if (!entry || typeof entry !== "object" || typeof entry.source !== "string") {
      throw storeError("INVALID_BUILTIN", "Each built-in definition requires a { name, source } shape.");
    }
    const canonicalId = normalizeCanonicalName(entry.name);
    if (builtinDescriptors.has(canonicalId)) {
      throw storeError(
        "DEFINITION_CONFLICT",
        `Duplicate built-in Nia definition name "${canonicalId}".`,
        { canonicalId },
      );
    }
    // Authoritative reparse: built-ins are code-shipped, but the store never
    // treats any pre-parsed object as trusted — only raw source is parsed.
    const ast = parseNiaDefinitionMarkdown(entry.source);
    builtinDescriptors.set(canonicalId, buildDescriptor({ ast, canonicalId, provenance: "built-in" }));
  }

  async function readInstalledDescriptor(canonicalId, entry) {
    const filePath = path.join(definitionsDirectory(baseDir), `${entry.fileId}.md`);
    let raw;
    try {
      raw = await fsp.readFile(filePath, "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      throw error;
    }
    const ast = reparseTrustedSource(raw);
    return buildDescriptor({ ast, canonicalId, installedAt: entry.installedAt, provenance: "installed" });
  }

  async function resolveCanonicalIdFromRef(ref) {
    if (ref && typeof ref === "object" && ref.family === "nia" && typeof ref.name === "string") {
      return ref.name;
    }
    if (typeof ref === "string") {
      if (ref.includes("/")) {
        return normalizeUsesRef(ref).name;
      }
      return normalizeCanonicalName(ref);
    }
    throw storeError("INVALID_REF", "A Nia definition reference must be a string or a normalized step ref.");
  }

  async function list() {
    const index = await readIndex(baseDir);
    const installed = [];
    for (const [canonicalId, entry] of Object.entries(index.entries)) {
      const descriptor = await readInstalledDescriptor(canonicalId, entry);
      if (descriptor) installed.push(descriptor);
    }
    const combined = [...builtinDescriptors.values(), ...installed];
    combined.sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
    return Object.freeze(combined);
  }

  async function get(ref) {
    const canonicalId = await resolveCanonicalIdFromRef(ref);
    const builtin = builtinDescriptors.get(canonicalId);
    if (builtin) return builtin;
    const index = await readIndex(baseDir);
    const entry = index.entries[canonicalId];
    if (!entry) return null;
    return readInstalledDescriptor(canonicalId, entry);
  }

  async function resolveUsesRef(refString) {
    const normalizedRef = normalizeUsesRef(refString);
    const descriptor = await get(normalizedRef);
    if (!descriptor) {
      throw storeError(
        "NOT_FOUND",
        `No Nia definition found for reference "${refString}".`,
        { ref: normalizedRef },
      );
    }
    // `normalizedRef.family` is always "nia" even for a legacy `genie/<name>`
    // input; the resolved reference/label never re-emits a `genie/*` family.
    return Object.freeze({ ...descriptor, ref: normalizedRef });
  }

  async function install(rawMarkdown, options = {}) {
    const { filenameHint } = options;
    // Only a literal raw Markdown string is ever accepted and parsed; a
    // pre-parsed/renderer-normalized object is rejected by the contract's
    // own SOURCE_NOT_RAW_MARKDOWN check inside parseNiaDefinitionMarkdown.
    const ast = parseNiaDefinitionMarkdown(rawMarkdown);
    const canonicalId = canonicalNameFromAst(ast, filenameHint);

    if (builtinDescriptors.has(canonicalId)) {
      throw storeError(
        "BUILTIN_PROTECTED",
        `"${canonicalId}" is a built-in Nia definition and cannot be overwritten.`,
        { canonicalId },
      );
    }

    const index = await readIndex(baseDir);
    if (index.entries[canonicalId]) {
      throw storeError(
        "DEFINITION_CONFLICT",
        `A Nia definition named "${canonicalId}" is already installed.`,
        { canonicalId },
      );
    }

    const fileId = fileIdForCanonicalName(canonicalId);
    const filePath = path.join(definitionsDirectory(baseDir), `${fileId}.md`);
    await atomicWriteFile(filePath, rawMarkdown);

    const installedAt = new Date().toISOString();
    index.entries[canonicalId] = { fileId, installedAt };
    await writeIndex(baseDir, index);

    return buildDescriptor({ ast, canonicalId, installedAt, provenance: "installed" });
  }

  async function uninstall(canonicalIdInput) {
    const canonicalId = typeof canonicalIdInput === "string" && canonicalIdInput.includes("/")
      ? normalizeUsesRef(canonicalIdInput).name
      : normalizeCanonicalName(canonicalIdInput);

    if (builtinDescriptors.has(canonicalId)) {
      throw storeError(
        "BUILTIN_PROTECTED",
        `"${canonicalId}" is a built-in Nia definition and cannot be uninstalled.`,
        { canonicalId },
      );
    }

    const index = await readIndex(baseDir);
    const entry = index.entries[canonicalId];
    if (!entry) {
      throw storeError(
        "NOT_FOUND",
        `No installed Nia definition named "${canonicalId}" was found.`,
        { canonicalId },
      );
    }

    delete index.entries[canonicalId];
    await writeIndex(baseDir, index);

    const filePath = path.join(definitionsDirectory(baseDir), `${entry.fileId}.md`);
    await fsp.rm(filePath, { force: true });

    return Object.freeze({ canonicalId, uninstalled: true });
  }

  async function exportCanonical(ref) {
    const descriptor = typeof ref === "string" && ref.includes("/")
      ? await resolveUsesRef(ref)
      : await get(ref);
    if (!descriptor) {
      throw storeError("NOT_FOUND", `No Nia definition found for "${String(ref)}".`);
    }
    // Only canonical `nia: v1` fields are ever serialized; sourceCompatibility
    // and diagnostics markers from a legacy import are never re-emitted.
    return serializeNiaDefinitionMarkdown({
      version: "v1",
      sourceCompatibility: descriptor.sourceCompatibility,
      description: descriptor.description,
      scope: descriptor.scope,
      ...(descriptor.category !== undefined ? { category: descriptor.category } : {}),
      ...(descriptor.model !== undefined ? { model: descriptor.model } : {}),
      ...(descriptor.action !== undefined ? { action: descriptor.action } : {}),
      ...(descriptor.context !== undefined ? { context: descriptor.context } : {}),
      ...(descriptor.approval !== undefined ? { approval: descriptor.approval } : {}),
      ...(descriptor.input !== undefined ? { input: descriptor.input } : {}),
      ...(descriptor.output !== undefined ? { output: descriptor.output } : {}),
      ...(descriptor.tags !== undefined ? { tags: descriptor.tags } : {}),
      body: descriptor.body,
    });
  }

  return Object.freeze({
    exportCanonical,
    get,
    install,
    list,
    resolveUsesRef,
    uninstall,
  });
}

module.exports = {
  NIA_DEFINITION_STORE_ERROR_CODES,
  NiaDefinitionStoreError,
  createNiaDefinitionStore,
  normalizeCanonicalName,
};
