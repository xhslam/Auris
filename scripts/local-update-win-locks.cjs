"use strict";

// Loaded only by the updater's child builds. Never changes Defender or installed files.
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { setTimeout: wait } = require("node:timers/promises");

function inTree(file, root) {
  const candidate = path.resolve(file);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function installLockFallback({ projectRoot, outputRoot, fileSystem = fs, promises = fsp, log = console } = {}) {
  if (!projectRoot || !outputRoot) throw new Error("Both project and output roots are required");
  const electron = path.join(path.resolve(projectRoot), "electron");
  const build = path.resolve(outputRoot);
  const stage = `${path.join(build, "win-unpacked")}.tmp`;
  const target = path.join(build, "win-unpacked");
  const nodeModules = path.join(electron, "node_modules");
  const originalRename = fileSystem.renameSync.bind(fileSystem);
  const originalRemove = fileSystem.rmSync.bind(fileSystem);
  const originalAsyncRename = promises.rename.bind(promises);
  const originalUnlink = promises.unlink.bind(promises);
  const transient = error => ["EBUSY", "EPERM", "ENOTEMPTY"].includes(error?.code);
  const generated = file => inTree(file, electron) && /^\.runtime-node-modules-(stage|backup)-/u.test(path.relative(electron, file));

  fileSystem.renameSync = (from, to) => {
    if (!generated(from) || path.resolve(to) !== nodeModules) return originalRename(from, to);
    try { return originalRename(from, to); }
    catch (error) {
      if (!transient(error) || fileSystem.existsSync(to)) throw error;
      log.warn("[local-update] Windows locked the generated dependency stage; copying into vacant target");
      fileSystem.cpSync(from, to, { recursive: true, force: false, errorOnExist: true });
    }
  };
  fileSystem.rmSync = (file, options) => {
    try { return originalRemove(file, options); }
    catch (error) {
      if (!generated(file) || !transient(error)) throw error;
      log.warn(`[local-update] generated locked stage retained for later cleanup: ${file}`);
    }
  };
  promises.rename = async (from, to) => {
    if (path.resolve(from) !== stage || path.resolve(to) !== target) return originalAsyncRename(from, to);
    for (let attempt = 0; attempt < 5; attempt++) {
      try { return await originalAsyncRename(from, to); }
      catch (error) { if (!transient(error)) throw error; await wait(500); }
    }
    if (fileSystem.existsSync(to)) throw new Error("Refusing to overwrite the package output");
    log.warn("[local-update] Windows locked the generated Electron stage; copying into vacant output");
    fileSystem.cpSync(from, to, { recursive: true, force: false, errorOnExist: true });
  };
  promises.unlink = async file => {
    if (!inTree(file, build)) return originalUnlink(file);
    for (let attempt = 0; ; attempt++) {
      try { return await originalUnlink(file); }
      catch (error) {
        if (!transient(error) || attempt >= 20) throw error;
        await wait(500);
      }
    }
  };
}

if (process.env.AURIS_LOCAL_UPDATE_PROJECT && process.env.AURIS_LOCAL_UPDATE_OUTPUT) {
  installLockFallback({ projectRoot: process.env.AURIS_LOCAL_UPDATE_PROJECT, outputRoot: process.env.AURIS_LOCAL_UPDATE_OUTPUT });
}
module.exports = { inTree, installLockFallback };
