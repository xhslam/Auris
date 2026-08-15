"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHANNEL_PATTERN = /^shadowing:[a-z0-9-]+(?::[a-z0-9-]+)+$/;

function collectLiteralChannels(source, pattern) {
  if (typeof source !== "string") {
    throw new TypeError("IPC source must be a string.");
  }
  const channels = new Set();
  let match;
  while ((match = pattern.exec(source))) {
    const channel = match[1];
    if (CHANNEL_PATTERN.test(channel)) channels.add(channel);
  }
  return [...channels].sort();
}

function collectElectronSources(directory) {
  const sources = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...collectElectronSources(target));
      continue;
    }
    if (!entry.isFile() || !/\.(?:cjs|mjs|js)$/.test(entry.name)) continue;
    if (entry.name === "preload.cjs") continue;
    sources.push(fs.readFileSync(target, "utf8"));
  }
  return sources;
}

function collectHandlerChannels(source) {
  const channels = new Set(
    collectLiteralChannels(source, /\bipcMain\.handle\(\s*["'](shadowing:[^"']+)["']/g),
  );
  const constants = new Map();
  const constantPattern = /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*["'](shadowing:[^"']+)["']/g;
  let match;
  while ((match = constantPattern.exec(source))) {
    if (CHANNEL_PATTERN.test(match[2])) constants.set(match[1], match[2]);
  }
  const constantHandlerPattern = /\bipcMain\.handle\(\s*([A-Z][A-Z0-9_]*)\b/g;
  while ((match = constantHandlerPattern.exec(source))) {
    const channel = constants.get(match[1]);
    if (channel) channels.add(channel);
  }
  return [...channels].sort();
}

function collectIpcContract(preloadSource, handlerSource) {
  const invokes = collectLiteralChannels(
    preloadSource,
    /\binvoke\(\s*["'](shadowing:[^"']+)["']/g,
  );
  const handlers = collectHandlerChannels(handlerSource);
  const handlerSet = new Set(handlers);
  const missingHandlers = invokes.filter((channel) => !handlerSet.has(channel));
  return Object.freeze({ handlers, invokes, missingHandlers });
}

function assertDesktopIpcContract(contract) {
  if (!contract || !Array.isArray(contract.missingHandlers)) {
    throw new TypeError("IPC contract must contain missingHandlers.");
  }
  if (contract.missingHandlers.length) {
    throw new Error(
      `Preload IPC channels missing ipcMain handlers: ${contract.missingHandlers.join(", ")}`,
    );
  }
  return contract;
}

function verifyDesktopIpcContract(projectRoot = process.cwd()) {
  const electronRoot = path.join(projectRoot, "electron");
  const preloadPath = path.join(electronRoot, "preload.cjs");
  const contract = collectIpcContract(
    fs.readFileSync(preloadPath, "utf8"),
    collectElectronSources(electronRoot).join("\n"),
  );
  assertDesktopIpcContract(contract);
  return contract;
}

if (require.main === module) {
  try {
    const contract = verifyDesktopIpcContract();
    process.stdout.write(
      `Desktop IPC contract OK: ${contract.invokes.length} invokes, ${contract.handlers.length} handlers.\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  CHANNEL_PATTERN,
  assertDesktopIpcContract,
  collectElectronSources,
  collectHandlerChannels,
  collectIpcContract,
  collectLiteralChannels,
  verifyDesktopIpcContract,
};
