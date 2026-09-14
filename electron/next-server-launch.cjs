"use strict";

const fs = require("node:fs");
const path = require("node:path");

function createNextServerLaunchPlan({
  isDevelopment,
  isPackaged,
  nextCliPath,
  nodeCommand,
  port,
  projectRoot,
  resourcesPath,
} = {}) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError("A valid Next.js server port is required.");
  }
  if (isPackaged) {
    const standaloneRoot = path.join(resourcesPath, "standalone");
    const serverPath = path.join(standaloneRoot, "server.js");
    if (!fs.existsSync(serverPath)) {
      throw new Error(`Packaged Next.js server is missing: ${serverPath}`);
    }
    return Object.freeze({
      args: Object.freeze([]),
      cwd: standaloneRoot,
      env: Object.freeze({
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production",
        PORT: String(port),
      }),
      modulePath: serverPath,
      serviceName: "auris-next-server",
      type: "utility",
    });
  }

  return Object.freeze({
    args: Object.freeze([
      nextCliPath,
      isDevelopment ? "dev" : "start",
      ...(isDevelopment ? ["--webpack"] : []),
      "--port",
      String(port),
    ]),
    command: nodeCommand,
    cwd: projectRoot,
    env: Object.freeze({ PORT: String(port) }),
    type: "spawn",
  });
}

module.exports = { createNextServerLaunchPlan };
