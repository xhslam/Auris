#!/usr/bin/env node

/**
 * 清理 Auris 视频库遗留的空 analysis / transcodes 目录。
 *
 * 默认只预演；实际删除必须同时传入 --apply 和
 * AURIS_EMPTY_VIDEO_ARTIFACT_CLEANUP=confirm。
 *
 * 安全约束：
 * - 仅处理明确的视频源根目录及 Auris/Electron 私有 video-libraries 根目录；
 * - 只处理名称恰为 analysis 或 transcodes 的普通空目录；
 * - 拒绝符号链接、非目录、非空目录和根目录以外的路径；
 * - Auris Electron 正在运行时拒绝执行实际删除。
 */

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const APPLY_FLAG = "--apply";
const CONFIRMATION_ENV = "AURIS_EMPTY_VIDEO_ARTIFACT_CLEANUP";
const CONFIRMATION_VALUE = "confirm";
const MANAGED_NAMES = new Set(["analysis", "transcodes"]);
const homeDirectory = process.env.HOME;

if (!homeDirectory) {
  throw new Error("HOME is required to locate local video-library directories.");
}

const sourceRoot = path.join(homeDirectory, "Documents", "视频区");
const allowedRoots = [
  sourceRoot,
  path.join(homeDirectory, "Library", "Application Support", "auris", "video-libraries"),
  path.join(homeDirectory, "Library", "Application Support", "Electron", "video-libraries"),
]
  .filter((root) => fs.existsSync(root))
  .map((root) => fs.realpathSync(root));

const shouldApply = process.argv.includes(APPLY_FLAG);

function isWithinRoot(candidate, root) {
  const relativePath = path.relative(root, candidate);
  return relativePath === "" || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== "..");
}

function hasRunningAurisElectron() {
  const processes = childProcess.execFileSync("/bin/ps", ["-ax", "-o", "command="], {
    encoding: "utf8",
  });

  return processes
    .split("\n")
    .some((command) => command.includes("/大学markdown/auris/electron/") && command.includes("Electron"));
}

function listCandidates(root) {
  const results = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (!entry.isDirectory()) {
        continue;
      }

      if (MANAGED_NAMES.has(entry.name)) {
        results.push(absolutePath);
        continue;
      }

      walk(absolutePath);
    }
  }

  walk(root);
  return results;
}

function inspectCandidate(candidate) {
  const resolvedCandidate = fs.realpathSync(candidate);
  const parentRoot = allowedRoots.find((root) => isWithinRoot(resolvedCandidate, root));

  if (!parentRoot) {
    return { candidate, reason: "outside-allowlist", safe: false };
  }

  const stats = fs.lstatSync(resolvedCandidate);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    return { candidate, reason: "not-a-normal-directory", safe: false };
  }

  if (!MANAGED_NAMES.has(path.basename(resolvedCandidate))) {
    return { candidate, reason: "unexpected-name", safe: false };
  }

  const entries = fs.readdirSync(resolvedCandidate);
  if (entries.length > 0) {
    return { candidate, reason: `non-empty:${entries.length}`, safe: false };
  }

  return { candidate: resolvedCandidate, reason: "empty-allowlisted-directory", safe: true };
}

const inspected = allowedRoots.flatMap((root) => listCandidates(root).map(inspectCandidate));
const safeTargets = inspected.filter((item) => item.safe);
const blockedTargets = inspected.filter((item) => !item.safe);

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  allowedRoots,
  safeTargets,
  blockedTargets,
}, null, 2));

if (!shouldApply) {
  process.exit(0);
}

if (process.env[CONFIRMATION_ENV] !== CONFIRMATION_VALUE) {
  throw new Error(`Refusing deletion: set ${CONFIRMATION_ENV}=${CONFIRMATION_VALUE} with ${APPLY_FLAG}.`);
}

if (hasRunningAurisElectron()) {
  throw new Error("Refusing deletion while the local Auris Electron process is running. Close Auris and retry.");
}

for (const target of safeTargets) {
  fs.rmdirSync(target.candidate);
}

console.log(JSON.stringify({ deleted: safeTargets.map((item) => item.candidate) }, null, 2));
