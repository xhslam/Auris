"use strict";

const crypto = require("node:crypto");
const {
  constants: fsConstants,
  createReadStream,
} = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_TRASH_ENTRY_LIMIT = 100;

async function pathExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

function assertRelativePath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw new Error("A valid relative vault path is required.");
  }
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.startsWith("/") || path.posix.isAbsolute(normalized)) {
    throw new Error("The requested file path escapes the current vault.");
  }
  return normalized;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function nearestExistingAncestor(candidate, boundary) {
  let current = candidate;
  while (!(await pathExists(current))) {
    const parent = path.dirname(current);
    if (parent === current || !isInside(boundary, parent)) {
      return boundary;
    }
    current = parent;
  }
  return current;
}

async function recordCreatedEntry(createdEntries, kind, createdPath) {
  const stat = await fs.lstat(createdPath);
  createdEntries.push({
    dev: stat.dev,
    ino: stat.ino,
    kind,
    path: createdPath,
  });
}

async function createdEntriesRemainOwned(createdEntries) {
  for (const entry of createdEntries) {
    const current = await fs.lstat(entry.path).catch(() => null);
    if (
      !current ||
      current.dev !== entry.dev ||
      current.ino !== entry.ino
    ) {
      return false;
    }
  }
  return true;
}

async function rollbackCreatedEntries(createdEntries) {
  for (const entry of [...createdEntries].reverse()) {
    try {
      const current = await fs.lstat(entry.path);
      if (current.dev !== entry.dev || current.ino !== entry.ino) {
        continue;
      }
      if (entry.kind === "directory") {
        await fs.rmdir(entry.path);
      } else {
        await fs.rm(entry.path, { force: true });
      }
    } catch {
      // Leave replaced or non-empty paths intact: they can contain data created
      // by another process after our exclusive reservation.
    }
  }
}

async function copyFileFromHandleExclusive(
  sourcePath,
  targetPath,
  beforeFileOpen,
) {
  await beforeFileOpen?.({ sourcePath, targetPath });
  const noFollow = fsConstants.O_NOFOLLOW ?? 0;
  const sourceHandle = await fs.open(
    sourcePath,
    fsConstants.O_RDONLY | noFollow,
  );
  let targetHandle;
  let createdTarget = false;
  let targetIdentity = null;
  try {
    const sourceStat = await sourceHandle.stat();
    if (!sourceStat.isFile()) {
      throw new Error("Only regular files can be copied as files.");
    }
    targetHandle = await fs.open(targetPath, "wx", sourceStat.mode);
    createdTarget = true;
    const targetStat = await targetHandle.stat();
    targetIdentity = { dev: targetStat.dev, ino: targetStat.ino };
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await sourceHandle.read(
        buffer,
        0,
        buffer.length,
        position,
      );
      if (bytesRead === 0) break;
      await targetHandle.write(buffer, 0, bytesRead, position);
      position += bytesRead;
    }
    await targetHandle.sync();
  } catch (error) {
    await targetHandle?.close().catch(() => undefined);
    targetHandle = undefined;
    if (createdTarget && targetIdentity) {
      const current = await fs.lstat(targetPath).catch(() => null);
      if (
        current &&
        current.dev === targetIdentity.dev &&
        current.ino === targetIdentity.ino
      ) {
        await fs.rm(targetPath, { force: true }).catch(() => undefined);
      }
    }
    throw error;
  } finally {
    await targetHandle?.close().catch(() => undefined);
    await sourceHandle.close().catch(() => undefined);
  }
}

async function copyTreeExclusive(
  sourcePath,
  targetPath,
  createdEntries,
  beforeFileOpen,
) {
  const sourceStat = await fs.lstat(sourcePath);
  if (sourceStat.isSymbolicLink()) {
    throw new Error("Symbolic links cannot be copied or moved.");
  }
  if (!sourceStat.isDirectory()) {
    await copyFileFromHandleExclusive(
      sourcePath,
      targetPath,
      beforeFileOpen,
    );
    await recordCreatedEntry(createdEntries, "file", targetPath);
    return;
  }

  await fs.mkdir(targetPath);
  await recordCreatedEntry(createdEntries, "directory", targetPath);
  const entries = (await fs.readdir(sourcePath, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  for (const entry of entries) {
    await copyTreeExclusive(
      path.join(sourcePath, entry.name),
      path.join(targetPath, entry.name),
      createdEntries,
      beforeFileOpen,
    );
  }
}

async function copyNoClobber(sourcePath, targetPath, beforeFileOpen) {
  const createdEntries = [];
  try {
    await copyTreeExclusive(
      sourcePath,
      targetPath,
      createdEntries,
      beforeFileOpen,
    );
    return createdEntries;
  } catch (error) {
    await rollbackCreatedEntries(createdEntries);
    throw error;
  }
}

async function updateFingerprint(hash, rootPath, relativePath = "") {
  const currentPath = relativePath
    ? path.join(rootPath, relativePath)
    : rootPath;
  const stat = await fs.lstat(currentPath);
  if (stat.isSymbolicLink()) {
    throw new Error("Symbolic links cannot be copied or moved.");
  }
  hash.update(`${relativePath}\0${stat.isDirectory() ? "d" : "f"}\0`);
  if (!stat.isDirectory()) {
    for await (const chunk of createReadStream(currentPath)) {
      hash.update(chunk);
    }
    return;
  }

  const entries = (await fs.readdir(currentPath)).sort();
  for (const entry of entries) {
    await updateFingerprint(
      hash,
      rootPath,
      relativePath ? path.join(relativePath, entry) : entry,
    );
  }
}

async function fingerprintTree(rootPath) {
  const hash = crypto.createHash("sha256");
  await updateFingerprint(hash, rootPath);
  return hash.digest("hex");
}

async function restoreStagedSource(stagedPath, sourcePath) {
  if (!(await pathExists(stagedPath))) return;
  if (await pathExists(sourcePath)) {
    const stagedStat = await fs.lstat(stagedPath);
    const extension = stagedStat.isDirectory() ? "" : path.extname(sourcePath);
    const basename = path.basename(sourcePath, extension);
    const recoveryPath = path.join(
      path.dirname(sourcePath),
      `${basename} (Auris recovered ${Date.now()})${extension}`,
    );
    await fs.rename(stagedPath, recoveryPath);
    throw new Error(
      `The source path was occupied during the move; original data was recovered to ${recoveryPath}`,
    );
  }
  await fs.rename(stagedPath, sourcePath);
}

async function moveNoClobber(
  sourcePath,
  targetPath,
  afterCopy,
  beforeFileOpen,
  allowHardLink = true,
) {
  const stagedPath = path.join(
    path.dirname(sourcePath),
    `.${path.basename(sourcePath)}.auris-moving-${crypto
      .randomBytes(8)
      .toString("hex")}`,
  );
  await fs.rename(sourcePath, stagedPath);
  let createdEntries = [];
  try {
    const stagedStat = await fs.lstat(stagedPath);
    const targetParentStat = await fs.lstat(path.dirname(targetPath));
    if (
      allowHardLink &&
      stagedStat.isFile() &&
      stagedStat.dev === targetParentStat.dev
    ) {
      await fs.link(stagedPath, targetPath);
      await recordCreatedEntry(createdEntries, "file", targetPath);
      await afterCopy?.({
        originalSourcePath: sourcePath,
        sourcePath: stagedPath,
        targetPath,
      });
      if (await pathExists(sourcePath)) {
        await rollbackCreatedEntries(createdEntries);
        createdEntries = [];
        throw new Error("The source path was recreated while it was being moved.");
      }
      if (!(await createdEntriesRemainOwned(createdEntries))) {
        throw new Error("The destination changed while it was being moved.");
      }
      await fs.rm(stagedPath, { force: true });
      return;
    }

    const beforeFingerprint = await fingerprintTree(stagedPath);
    createdEntries = await copyNoClobber(
      stagedPath,
      targetPath,
      beforeFileOpen,
    );
    await afterCopy?.({
      originalSourcePath: sourcePath,
      sourcePath: stagedPath,
      targetPath,
    });
    const afterFingerprint = await fingerprintTree(stagedPath);
    if (afterFingerprint !== beforeFingerprint) {
      await rollbackCreatedEntries(createdEntries);
      createdEntries = [];
      throw new Error("The source changed while it was being moved.");
    }
    const destinationFingerprint = await fingerprintTree(targetPath);
    if (destinationFingerprint !== beforeFingerprint) {
      createdEntries = [];
      throw new Error("The destination changed while it was being moved.");
    }
    if (await pathExists(sourcePath)) {
      await rollbackCreatedEntries(createdEntries);
      createdEntries = [];
      throw new Error("The source path was recreated while it was being moved.");
    }
    if (!(await createdEntriesRemainOwned(createdEntries))) {
      throw new Error("The destination changed while it was being moved.");
    }
    await fs.rm(stagedPath, { force: true, recursive: true });
  } catch (error) {
    if (createdEntries.length > 0) {
      await rollbackCreatedEntries(createdEntries);
    }
    try {
      await restoreStagedSource(stagedPath, sourcePath);
    } catch (restoreError) {
      throw new Error(
        `${error?.message ?? error} ${restoreError?.message ?? restoreError}`,
      );
    }
    throw error;
  }
}

function createVaultFileOperations({
  afterCopy,
  beforeFileOpen,
  beforePruneTrash,
  maxTrashEntries = DEFAULT_TRASH_ENTRY_LIMIT,
  trashRoot,
  vaultRoot,
}) {
  if (!vaultRoot || !trashRoot) {
    throw new TypeError("Vault operations require vaultRoot and trashRoot.");
  }

  const lexicalVaultRoot = path.resolve(vaultRoot);
  const lexicalTrashRoot = path.resolve(trashRoot);

  async function getRealVaultRoot() {
    return fs.realpath(lexicalVaultRoot);
  }

  async function resolve(relativePath) {
    const safeRelativePath = assertRelativePath(relativePath);
    const absoluteTarget = path.resolve(lexicalVaultRoot, safeRelativePath);
    if (!isInside(lexicalVaultRoot, absoluteTarget)) {
      throw new Error("The requested file path escapes the current vault.");
    }

    const realVaultRoot = await getRealVaultRoot();
    const ancestor = await nearestExistingAncestor(
      absoluteTarget,
      lexicalVaultRoot,
    );
    const realAncestor = await fs.realpath(ancestor);
    if (!isInside(realVaultRoot, realAncestor)) {
      throw new Error("The requested file path escapes the current vault.");
    }

    if (await pathExists(absoluteTarget)) {
      const realTarget = await fs.realpath(absoluteTarget);
      if (!isInside(realVaultRoot, realTarget)) {
        throw new Error("The requested file path escapes the current vault.");
      }
    }

    return absoluteTarget;
  }

  async function assertDestinationAvailable(relativePath) {
    const destination = await resolve(relativePath);
    if (await pathExists(destination)) {
      throw new Error("A file or folder already exists at the destination.");
    }
    return destination;
  }

  async function copy(fromPath, toPath) {
    const source = await resolve(fromPath);
    if (!(await pathExists(source))) {
      throw new Error("The source file or folder does not exist.");
    }
    const destination = await assertDestinationAvailable(toPath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await copyNoClobber(source, destination, beforeFileOpen);
  }

  async function move(fromPath, toPath) {
    const source = await resolve(fromPath);
    if (!(await pathExists(source))) {
      throw new Error("The source file or folder does not exist.");
    }
    const destination = await assertDestinationAvailable(toPath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await moveNoClobber(
      source,
      destination,
      afterCopy,
      beforeFileOpen,
    );
  }

  async function pruneTrash() {
    await beforePruneTrash?.();
    const names = (await fs.readdir(lexicalTrashRoot)).sort().reverse();
    await Promise.all(
      names
        .slice(Math.max(0, maxTrashEntries))
        .map((name) =>
          fs.rm(path.join(lexicalTrashRoot, name), {
            force: true,
            recursive: true,
          }),
        ),
    );
  }

  async function trash(relativePath) {
    const source = await resolve(relativePath);
    if (!(await pathExists(source))) return null;

    const safeRelativePath = assertRelativePath(relativePath);
    const id = `${String(Date.now()).padStart(13, "0")}-${crypto
      .randomBytes(6)
      .toString("hex")}`;
    const entryRoot = path.join(lexicalTrashRoot, id);
    const contentPath = path.join(entryRoot, "content");
    await fs.mkdir(entryRoot, { recursive: true, mode: 0o700 });
    await fs.writeFile(
      path.join(entryRoot, "metadata.json"),
      JSON.stringify({
        deletedAt: new Date().toISOString(),
        originalPath: safeRelativePath,
        vaultRoot: await getRealVaultRoot(),
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    try {
      await moveNoClobber(
        source,
        contentPath,
        afterCopy,
        beforeFileOpen,
      );
    } catch (error) {
      await fs.rm(path.join(entryRoot, "metadata.json"), { force: true });
      try {
        await fs.rmdir(entryRoot);
      } catch {
        // Preserve any concurrently created content rather than deleting it.
      }
      throw error;
    }
    await pruneTrash().catch(() => undefined);
    return id;
  }

  async function restoreLatest() {
    if (!(await pathExists(lexicalTrashRoot))) return null;
    const entryNames = (await fs.readdir(lexicalTrashRoot)).sort().reverse();
    const realVaultRoot = await getRealVaultRoot();

    for (const entryName of entryNames) {
      const entryRoot = path.join(lexicalTrashRoot, entryName);
      let restoreStarted = false;
      try {
        const metadata = JSON.parse(
          await fs.readFile(path.join(entryRoot, "metadata.json"), "utf8"),
        );
        if (metadata.vaultRoot !== realVaultRoot) continue;

        const destination = await resolve(metadata.originalPath);
        if (await pathExists(destination)) {
          throw new Error("The original path is already occupied.");
        }
        const contentPath = path.join(entryRoot, "content");
        if (!(await pathExists(contentPath))) continue;

        await fs.mkdir(path.dirname(destination), { recursive: true });
        restoreStarted = true;
        await moveNoClobber(
          contentPath,
          destination,
          afterCopy,
          beforeFileOpen,
          false,
        );
        await fs.rm(entryRoot, { force: true, recursive: true });
        return assertRelativePath(metadata.originalPath);
      } catch (error) {
        if (
          restoreStarted ||
          error?.message === "The original path is already occupied."
        ) {
          throw error;
        }
      }
    }
    return null;
  }

  async function reveal(relativePath) {
    const target = await resolve(relativePath);
    if (!(await pathExists(target))) {
      throw new Error("The file or folder does not exist.");
    }
    return target;
  }

  return Object.freeze({ copy, move, resolve, restoreLatest, reveal, trash });
}

module.exports = {
  DEFAULT_TRASH_ENTRY_LIMIT,
  createVaultFileOperations,
};
