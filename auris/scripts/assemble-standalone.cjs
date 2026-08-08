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
  const result = Object.freeze({
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

module.exports = { StandaloneAssemblyError, assembleStandalone };
