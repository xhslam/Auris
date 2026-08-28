#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const NEXT_RUNTIME_PACKAGE = "next";

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

function packagePath(root, packageName) {
  return path.join(root, "node_modules", ...packageName.split("/"));
}

function resolveInstalledPackage(root, packageName, fromDirectory = root) {
  let current = path.resolve(fromDirectory);
  const projectRoot = path.resolve(root);

  while (current === projectRoot || current.startsWith(`${projectRoot}${path.sep}`)) {
    const candidate = packagePath(current, packageName);
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
    if (current === projectRoot) break;
    current = path.dirname(current);
  }

  return null;
}

function copyRequiredStandaloneRuntimePackages(root, standaloneRoot) {
  const nextDirectory = resolveInstalledPackage(root, NEXT_RUNTIME_PACKAGE);
  if (!nextDirectory) return [];

  const nextPackage = JSON.parse(
    fs.readFileSync(path.join(nextDirectory, "package.json"), "utf8"),
  );
  const copied = new Set();
  const queued = Object.keys(nextPackage.dependencies || {}).map((name) => ({
    fromDirectory: nextDirectory,
    name,
  }));

  while (queued.length > 0) {
    const dependency = queued.shift();
    if (!dependency || copied.has(dependency.name)) continue;

    const source = resolveInstalledPackage(
      root,
      dependency.name,
      dependency.fromDirectory,
    );
    if (!source) {
      throw new StandaloneAssemblyError(
        "RUNTIME_DEPENDENCY_MISSING",
        `Next runtime dependency is missing: ${dependency.name}`,
      );
    }

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(source, "package.json"), "utf8"),
    );
    const destination = packagePath(standaloneRoot, dependency.name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { dereference: false, force: true, recursive: true });
    copied.add(dependency.name);

    for (const name of Object.keys(packageJson.dependencies || {})) {
      queued.push({ fromDirectory: source, name });
    }
  }

  return [...copied].sort((left, right) => left.localeCompare(right));
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
  const copiedRuntimePackages = copyRequiredStandaloneRuntimePackages(
    root,
    standaloneRoot,
  );
  const privateArtifactsRemoved = removePrivateArtifacts(
    standaloneRoot,
    nextRoot,
  );
  const result = Object.freeze({
    copiedRuntimePackages,
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
  copyRequiredStandaloneRuntimePackages,
  NEXT_RUNTIME_PACKAGE,
  resolveInstalledPackage,
  StandaloneAssemblyError,
  assembleStandalone,
  findPrivateArtifacts,
};
