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

function hash(source) {
  return crypto.createHash("sha256").update(source, "utf8").digest("hex");
}

function decodeAndValidateMarkdown(bytes, stat) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("EXTERNAL_MARKDOWN_FILE_NOT_UTF8");
  }
  if (text.includes("\u0000")) {
    throw new Error("EXTERNAL_MARKDOWN_FILE_NOT_TEXT");
  }
  return {
    text,
    size: bytes.byteLength,
    mtime:
      stat?.mtime instanceof Date
        ? stat.mtime.toISOString()
        : stat?.mtime
          ? String(stat.mtime)
          : new Date().toISOString(),
    hash: hash(text),
  };
}

async function readBoundedMarkdownText(fs, filePath, maxBytes = MAX_EXTERNAL_MARKDOWN_BYTES) {
  if (typeof fs.open === "function") {
    let fileHandle = null;
    try {
      fileHandle = await fs.open(filePath, "r");
      const stat = await fileHandle.stat();
      if (!stat.isFile()) {
        throw new Error("EXTERNAL_MARKDOWN_FILE_NOT_FILE");
      }
      if (stat.size > maxBytes) {
        throw new Error("EXTERNAL_MARKDOWN_FILE_TOO_LARGE");
      }
      const buffer = Buffer.alloc(maxBytes + 1);
      const { bytesRead } = await fileHandle.read(buffer, 0, maxBytes + 1, 0);
      if (bytesRead > maxBytes) {
        throw new Error("EXTERNAL_MARKDOWN_FILE_TOO_LARGE");
      }
      const actualBytes = buffer.subarray(0, bytesRead);
      return decodeAndValidateMarkdown(actualBytes, stat);
    } finally {
      if (fileHandle) {
        await fileHandle.close().catch(() => undefined);
      }
    }
  }

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error("EXTERNAL_MARKDOWN_FILE_NOT_FILE");
  if (stat.size > maxBytes) throw new Error("EXTERNAL_MARKDOWN_FILE_TOO_LARGE");
  const bytes = await fs.readFile(filePath);
  if (bytes.byteLength > maxBytes) throw new Error("EXTERNAL_MARKDOWN_FILE_TOO_LARGE");
  return decodeAndValidateMarkdown(bytes, stat);
}

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
  const idsByDevIno = new Map();
  const openingByPath = new Map();
  const savingByPath = new Map();
  const subscribers = new Set();

  function toPayload(record, diskInfo = null) {
    return {
      fileName: path.basename(record.path),
      id: record.id,
      mtime: record.mtime,
      path: record.path,
      rawSource: record.rawSource,
      savedSource: record.savedSource,
      sourceHash: record.sourceHash,
      diskHash: diskInfo?.hash ?? record.sourceHash,
      diskSource: diskInfo?.text ?? record.savedSource,
    };
  }

  function publish(record, diskInfo = null) {
    const payload = toPayload(record, diskInfo);
    for (const subscriber of subscribers) {
      try {
        subscriber(payload);
      } catch {
        // Ignore subscriber errors to allow remaining subscribers to proceed
      }
    }
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
    const diskContent = await readBoundedMarkdownText(fs, resolvedPath);
    const stat = typeof fs.lstat === "function" ? await fs.lstat(resolvedPath) : null;
    const devInoKey = stat?.dev && stat?.ino ? `${stat.dev}:${stat.ino}` : null;

    const existingId =
      idsByPath.get(resolvedPath) || (devInoKey ? idsByDevIno.get(devInoKey) : null);
    const existing = existingId ? filesById.get(existingId) : null;

    if (existing) {
      existing.mtime = diskContent.mtime;
      return publish(existing, diskContent);
    }

    const record = {
      id: crypto.randomUUID(),
      mtime: diskContent.mtime,
      path: resolvedPath,
      devInoKey,
      rawSource: diskContent.text,
      savedSource: diskContent.text,
      sourceHash: diskContent.hash,
      bufferRevision: 0,
    };

    filesById.set(record.id, record);
    idsByPath.set(record.path, record.id);
    if (devInoKey) {
      idsByDevIno.set(devInoKey, record.id);
    }

    return publish(record);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("A file-open listener is required.");
    subscribers.add(listener);
    return [...filesById.values()].map((r) => toPayload(r));
  }

  function unsubscribe(listener) {
    subscribers.delete(listener);
  }

  function acceptCleanBaseline(id, rawSource, diskHash) {
    const record = filesById.get(id);
    if (!record) return false;
    record.rawSource = rawSource;
    record.savedSource = rawSource;
    record.sourceHash = diskHash;
    record.bufferRevision += 1;
    return true;
  }

  async function save(id, rawSource, overwriteExternalChanges = false, expectedDiskHash = null) {
    const record = filesById.get(id);
    if (!record) throw new Error("EXTERNAL_MARKDOWN_FILE_NOT_OPEN");
    if (typeof rawSource !== "string") throw new TypeError("Markdown content must be text.");
    if (Buffer.byteLength(rawSource, "utf8") > MAX_EXTERNAL_MARKDOWN_BYTES) {
      throw new Error("EXTERNAL_MARKDOWN_FILE_TOO_LARGE");
    }

    const currentQueue = savingByPath.get(record.path) ?? Promise.resolve();
    const savePromise = currentQueue.then(() =>
      executeSave(record, rawSource, overwriteExternalChanges, expectedDiskHash),
    );
    savingByPath.set(
      record.path,
      savePromise.catch(() => undefined),
    );
    return await savePromise;
  }

  async function executeSave(record, rawSource, overwriteExternalChanges, expectedDiskHash) {
    const savedRevision = record.bufferRevision;

    if (typeof fs.lstat === "function") {
      const lstat = await fs.lstat(record.path);
      if (lstat.isSymbolicLink()) {
        throw new Error("EXTERNAL_MARKDOWN_FILE_SYMLINK_REPLACED");
      }
    }

    const currentDisk = await readBoundedMarkdownText(fs, record.path);
    const currentHash = currentDisk.hash;
    const currentSource = currentDisk.text;

    if (currentHash !== record.sourceHash && !overwriteExternalChanges) {
      throw new Error(`EXTERNAL_MARKDOWN_FILE_CHANGED_ON_DISK:${currentHash}`);
    }
    if (overwriteExternalChanges && (!expectedDiskHash || currentHash !== expectedDiskHash)) {
      throw new Error(`EXTERNAL_MARKDOWN_FILE_CHANGED_ON_DISK:${currentHash}`);
    }

    if (rawSource !== currentSource) {
      await writeFileAtomically(
        record.path,
        rawSource,
        "utf8",
        async (resolvedTarget) => {
          if (typeof fs.lstat === "function") {
            const finalLstat = await fs.lstat(resolvedTarget);
            if (finalLstat.isSymbolicLink()) {
              throw new Error("EXTERNAL_MARKDOWN_FILE_SYMLINK_REPLACED");
            }
          }
          const latest = await readBoundedMarkdownText(fs, resolvedTarget);
          if (latest.hash !== currentHash) {
            throw new Error(`EXTERNAL_MARKDOWN_FILE_CHANGED_ON_DISK:${latest.hash}`);
          }
        },
      );
    }

    const stat = await fs.stat(record.path);
    if (record.bufferRevision === savedRevision) record.rawSource = rawSource;
    record.savedSource = rawSource;
    record.sourceHash = hash(rawSource);
    record.mtime =
      stat.mtime instanceof Date
        ? stat.mtime.toISOString()
        : stat.mtime
          ? String(stat.mtime)
          : new Date().toISOString();
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
    if (record.devInoKey) {
      idsByDevIno.delete(record.devInoKey);
    }
    return true;
  }

  function getPath(id) {
    return filesById.get(id)?.path ?? null;
  }

  return {
    acceptCleanBaseline,
    close,
    getPath,
    open,
    save,
    subscribe,
    unsubscribe,
    updateBuffer,
  };
}

module.exports = {
  MAX_EXTERNAL_MARKDOWN_BYTES,
  SUPPORTED_MARKDOWN_EXTENSIONS,
  collectMarkdownOpenPaths,
  createExternalMarkdownFiles,
  decodeAndValidateMarkdown,
  hash,
  readBoundedMarkdownText,
};
