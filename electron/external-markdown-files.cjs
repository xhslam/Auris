const path = require("node:path");
const crypto = require("node:crypto");
const { TextDecoder } = require("node:util");

const SUPPORTED_MARKDOWN_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mdown",
  ".mkd",
  ".mkdn",
  ".mdx",
]);
const MAX_EXTERNAL_MARKDOWN_BYTES = 20 * 1024 * 1024;

function collectMarkdownOpenPaths(args, workingDirectory = process.cwd()) {
  const paths = [];
  const seen = new Set();

  for (const candidate of args ?? []) {
    if (typeof candidate !== "string" || candidate.startsWith("-")) continue;
    if (!SUPPORTED_MARKDOWN_EXTENSIONS.has(path.extname(candidate).toLowerCase())) continue;

    const absolutePath = path.resolve(workingDirectory, candidate);
    const key = process.platform === "win32" ? absolutePath.toLowerCase() : absolutePath;
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(absolutePath);
  }

  return paths;
}

function createExternalMarkdownFiles({ fs, writeFileAtomically }) {
  const filesById = new Map();
  const idsByPath = new Map();
  const openingByPath = new Map();
  let subscriber = null;

  function toPayload(record) {
    return {
      fileName: path.basename(record.path),
      id: record.id,
      mtime: record.mtime,
      path: record.path,
      rawSource: record.rawSource,
      savedSource: record.savedSource,
    };
  }

  function publish(record) {
    const payload = toPayload(record);
    if (subscriber) subscriber(payload);
    return payload;
  }

  async function open(rawPath) {
    if (typeof rawPath !== "string" || !rawPath.trim()) return null;
    const resolvedPath = await fs.realpath(path.resolve(rawPath));
    if (!SUPPORTED_MARKDOWN_EXTENSIONS.has(path.extname(resolvedPath).toLowerCase())) return null;

    const pending = openingByPath.get(resolvedPath);
    if (pending) return pending;

    const openPromise = readAndOpen(resolvedPath);
    openingByPath.set(resolvedPath, openPromise);
    try {
      return await openPromise;
    } finally {
      openingByPath.delete(resolvedPath);
    }
  }

  async function readAndOpen(resolvedPath) {
    const existingId = idsByPath.get(resolvedPath);
    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_EXTERNAL_MARKDOWN_BYTES) {
      throw new Error("EXTERNAL_MARKDOWN_FILE_TOO_LARGE");
    }

    const bytes = await fs.readFile(resolvedPath);
    if (bytes.byteLength > MAX_EXTERNAL_MARKDOWN_BYTES) {
      throw new Error("EXTERNAL_MARKDOWN_FILE_TOO_LARGE");
    }
    let rawSource;
    try {
      rawSource = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new Error("EXTERNAL_MARKDOWN_FILE_NOT_UTF8");
    }
    if (rawSource.includes("\u0000")) {
      throw new Error("EXTERNAL_MARKDOWN_FILE_NOT_TEXT");
    }

    const currentHash = hash(rawSource);
    const existing = existingId ? filesById.get(existingId) : null;
    if (existing) {
      if (existing.rawSource === existing.savedSource && currentHash !== existing.sourceHash) {
        existing.rawSource = rawSource;
        existing.savedSource = rawSource;
        existing.sourceHash = currentHash;
        existing.bufferRevision += 1;
      }
      existing.mtime = stat.mtime.toISOString();
      return publish(existing);
    }

    const record = {
      id: crypto.randomUUID(),
      mtime: stat.mtime.toISOString(),
      path: resolvedPath,
      rawSource,
      savedSource: rawSource,
      sourceHash: currentHash,
      bufferRevision: 0,
    };
    filesById.set(record.id, record);
    idsByPath.set(record.path, record.id);
    return publish(record);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("A file-open listener is required.");
    subscriber = listener;
    return [...filesById.values()].map(toPayload);
  }

  function unsubscribe(listener) {
    if (subscriber === listener) subscriber = null;
  }

  async function save(id, rawSource, overwriteExternalChanges = false, expectedDiskHash = null) {
    const record = filesById.get(id);
    if (!record) throw new Error("EXTERNAL_MARKDOWN_FILE_NOT_OPEN");
    if (typeof rawSource !== "string") throw new TypeError("Markdown content must be text.");
    if (Buffer.byteLength(rawSource, "utf8") > MAX_EXTERNAL_MARKDOWN_BYTES) {
      throw new Error("EXTERNAL_MARKDOWN_FILE_TOO_LARGE");
    }

    const savedRevision = record.bufferRevision;
    const current = await fs.readFile(record.path);
    const currentSource = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(current);
    const currentHash = hash(currentSource);
    if (currentHash !== record.sourceHash && !overwriteExternalChanges) {
      throw new Error(`EXTERNAL_MARKDOWN_FILE_CHANGED_ON_DISK:${currentHash}`);
    }
    if (overwriteExternalChanges && (!expectedDiskHash || currentHash !== expectedDiskHash)) {
      throw new Error(`EXTERNAL_MARKDOWN_FILE_CHANGED_ON_DISK:${currentHash}`);
    }
    if (rawSource !== currentSource) {
      await writeFileAtomically(record.path, rawSource, "utf8");
    }

    const stat = await fs.stat(record.path);
    if (record.bufferRevision === savedRevision) record.rawSource = rawSource;
    record.savedSource = rawSource;
    record.sourceHash = hash(rawSource);
    record.mtime = stat.mtime.toISOString();
    return { mtime: record.mtime };
  }

  function updateBuffer(id, rawSource) {
    const record = filesById.get(id);
    if (!record) throw new Error("EXTERNAL_MARKDOWN_FILE_NOT_OPEN");
    if (typeof rawSource !== "string") throw new TypeError("Markdown content must be text.");
    if (Buffer.byteLength(rawSource, "utf8") > MAX_EXTERNAL_MARKDOWN_BYTES) {
      throw new Error("EXTERNAL_MARKDOWN_FILE_TOO_LARGE");
    }
    record.rawSource = rawSource;
    record.bufferRevision += 1;
  }

  function close(id) {
    const record = filesById.get(id);
    if (!record) return false;
    filesById.delete(id);
    idsByPath.delete(record.path);
    return true;
  }

  function getPath(id) {
    return filesById.get(id)?.path ?? null;
  }

  return { close, getPath, open, save, subscribe, unsubscribe, updateBuffer };
}

function hash(source) {
  return crypto.createHash("sha256").update(source, "utf8").digest("hex");
}

module.exports = {
  MAX_EXTERNAL_MARKDOWN_BYTES,
  SUPPORTED_MARKDOWN_EXTENSIONS,
  collectMarkdownOpenPaths,
  createExternalMarkdownFiles,
};
