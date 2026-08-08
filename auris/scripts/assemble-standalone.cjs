#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

class StandaloneAssemblyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StandaloneAssemblyError";
    this.code = code;
  }
}

function assertInside(candidate, boundary) {
  const target = path.resolve(candidate);
  const root = path.resolve(boundary);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new StandaloneAssemblyError(
      "PATH_ESCAPE",
      `Path escapes build root: ${target}`,
    );
  }
  return target;
}

function replaceGeneratedDirectory(source, destination, buildRoot) {
  const safeDestination = assertInside(destination, buildRoot);
  if (!fs.existsSync(source)) return false;
  fs.rmSync(safeDestination, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(safeDestination), { recursive: true });
  fs.cpSync(source, safeDestination, { dereference: false, recursive: true });
  return true;
}

function isPrivateArtifactName(name) {
  return name === ".shadowing-data" || name === ".env" || name.startsWith(".env.");
}

function findPrivateArtifacts(directory, scanRoot = directory, found = []) {
  const safeDirectory = assertInside(directory, scanRoot);
  if (!fs.existsSync(safeDirectory)) return found;

  const entries = fs
    .readdirSync(safeDirectory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const candidate = assertInside(path.join(safeDirectory, entry.name), scanRoot);
    if (isPrivateArtifactName(entry.name)) {
      found.push(path.relative(scanRoot, candidate));
      continue;
    }
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      findPrivateArtifacts(candidate, scanRoot, found);
    }
  }
  return found;
}

function removePrivateArtifacts(directory, buildRoot, removed = []) {
  const safeDirectory = assertInside(directory, buildRoot);
  if (!fs.existsSync(safeDirectory)) return removed;

  for (const entry of fs.readdirSync(safeDirectory, { withFileTypes: true })) {
    const candidate = assertInside(path.join(safeDirectory, entry.name), buildRoot);
    if (isPrivateArtifactName(entry.name)) {
      fs.rmSync(candidate, { force: true, recursive: true });
      removed.push(path.relative(buildRoot, candidate));
      continue;
    }
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      removePrivateArtifacts(candidate, buildRoot, removed);
    }
  }
  return removed;
}

function assembleStandalone({
  projectRoot = path.resolve(__dirname, ".."),
} = {}) {
  const root = path.resolve(projectRoot);
  const nextRoot = path.join(root, ".next");
  const standaloneRoot = path.join(nextRoot, "standalone");
  const serverPath = path.join(standaloneRoot, "server.js");
  if (!fs.existsSync(serverPath)) {
    throw new StandaloneAssemblyError(
      "STANDALONE_MISSING",
      "Next standalone output is missing. Run `npm run build` first.",
    );
  }

  const staticCopied = replaceGeneratedDirectory(
    path.join(nextRoot, "static"),
    path.join(standaloneRoot, ".next", "static"),
    nextRoot,
  );
  const publicCopied = replaceGeneratedDirectory(
    path.join(root, "public"),
    path.join(standaloneRoot, "public"),
    nextRoot,
  );
  const privateArtifactsRemoved = removePrivateArtifacts(
    standaloneRoot,
    nextRoot,
  );
  const result = Object.freeze({
    privateArtifactsRemoved,
    publicCopied,
    serverPath,
    standaloneRoot,
    staticCopied,
  });
  process.stdout.write(`[assemble-standalone] ${JSON.stringify(result)}\n`);
  return result;
}

if (require.main === module) {
  try {
    assembleStandalone();
  } catch (error) {
    process.stderr.write(
      `[assemble-standalone] ${error?.code ?? "FAILED"}: ${error?.message ?? error}\n`,
    );
    process.exitCode = 1;
  }
}

module.exports = {
  StandaloneAssemblyError,
  assembleStandalone,
  findPrivateArtifacts,
};
