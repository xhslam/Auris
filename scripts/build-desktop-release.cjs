#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const process = require("node:process");

function sanitizeSigningEnv(env = process.env, options = {}) {
  const sanitized = { ...env };
  const platform = options.platform || process.platform;
  const signingMode = options.signingMode || sanitized.MAC_SIGNING_MODE || "adhoc";

  if (platform === "darwin") {
    if (signingMode === "developer-id") {
      const cscLink = sanitized.MAC_CSC_LINK || sanitized.CSC_LINK;
      const cscKeyPassword = sanitized.MAC_CSC_KEY_PASSWORD || sanitized.CSC_KEY_PASSWORD;
      if (!cscLink || !cscKeyPassword) {
        throw new Error("developer-id signing requires MAC_CSC_LINK and MAC_CSC_KEY_PASSWORD");
      }
      sanitized.CSC_LINK = cscLink;
      sanitized.CSC_KEY_PASSWORD = cscKeyPassword;
      return {
        env: sanitized,
        extraArgs: ["--config.forceCodeSigning=true"],
      };
    }

    // Default to ad-hoc signing for macOS: strictly ensure no empty or partial certificate variables reach electron-builder
    delete sanitized.CSC_LINK;
    delete sanitized.CSC_KEY_PASSWORD;
    delete sanitized.MAC_CSC_LINK;
    delete sanitized.MAC_CSC_KEY_PASSWORD;
    sanitized.CSC_IDENTITY_AUTO_DISCOVERY = "false";
    return {
      env: sanitized,
      extraArgs: ["--config.mac.identity=-", "--config.forceCodeSigning=false"],
    };
  }

  // Windows or other platforms: remove Mac-specific certificate variables
  delete sanitized.CSC_LINK;
  delete sanitized.CSC_KEY_PASSWORD;
  delete sanitized.MAC_CSC_LINK;
  delete sanitized.MAC_CSC_KEY_PASSWORD;
  return {
    env: sanitized,
    extraArgs: [],
  };
}

function resolveBuildCommand(options = {}) {
  const platform = options.platform || process.platform;
  const { env, extraArgs } = sanitizeSigningEnv(options.env, options);

  let npmScript = "desktop:release:build:mac";
  if (platform === "win32") {
    npmScript = "desktop:release:build:win";
  }

  return {
    command: (options.platform || process.platform) === "win32" ? "npm.cmd" : "npm",
    args: ["run", npmScript, ...(extraArgs.length ? ["--", ...extraArgs] : [])],
    env,
  };
}

function runBuild(options = {}) {
  const { command, args, env } = resolveBuildCommand(options);
  const runner = options.spawnSync || spawnSync;
  const isWindows = (options.platform || process.platform) === "win32";
  const result = runner(command, args, {
    stdio: options.stdio || "inherit",
    env,
    shell: isWindows,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    if (!options.noExit) {
      process.exit(result.status || 1);
    }
  }
  return result;
}

module.exports = {
  sanitizeSigningEnv,
  resolveBuildCommand,
  runBuild,
};

if (require.main === module) {
  try {
    runBuild();
  } catch (error) {
    console.error(`[desktop:release:build] ${error.message}`);
    process.exit(1);
  }
}
