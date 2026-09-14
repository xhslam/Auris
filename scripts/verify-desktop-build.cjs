#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function findApp(directory) {
  if (!fs.existsSync(directory)) return null;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name.endsWith(".app")) return candidate;
    if (entry.isDirectory()) {
      const nested = findApp(candidate);
      if (nested) return nested;
    }
  }
  return null;
}

if (process.platform !== "darwin") {
  process.stderr.write("desktop:build:verify currently requires macOS.\n");
  process.exit(1);
}

run(process.platform === "win32" ? "npm.cmd" : "npm", [
  "run",
  "desktop:island:build",
]);
run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"]);
run(process.platform === "win32" ? "npm.cmd" : "npm", [
  "run",
  "desktop:assemble",
]);
run(path.join(projectRoot, "node_modules", ".bin", "electron-builder"), [
  "--mac",
  "--dir",
  "--publish",
  "never",
]);
const appPath = findApp(path.join(projectRoot, "release"));
if (!appPath) {
  process.stderr.write(
    "desktop:build:verify could not find an unpacked .app.\n",
  );
  process.exit(1);
}
const islandHelperPath = path.join(
  appPath,
  "Contents",
  "Resources",
  "native",
  "desktop-island",
  "AurisDesktopIslandHelper",
);
try {
  fs.accessSync(islandHelperPath, fs.constants.X_OK);
} catch {
  process.stderr.write(`desktop:build:verify missing executable helper: ${islandHelperPath}\n`);
  process.exit(1);
}
run("/usr/bin/file", [islandHelperPath]);
const signatureProbe = spawnSync("/usr/bin/codesign", ["-dv", appPath], {
  cwd: projectRoot,
  encoding: "utf8",
});
if (signatureProbe.status === 0) {
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath]);
} else {
  process.stdout.write("[desktop:build:verify] local app is unsigned; release CI must run the deep signature check.\n");
}
run(process.execPath, [
  path.join(projectRoot, "scripts", "audit-package-privacy.cjs"),
  appPath,
]);
run(process.execPath, [
  path.join(projectRoot, "tests", "electron", "packaged-mcp-sidecar-smoke.cjs"),
  "--app",
  appPath,
]);
process.stdout.write(`[desktop:build:verify] verified ${appPath}\n`);
