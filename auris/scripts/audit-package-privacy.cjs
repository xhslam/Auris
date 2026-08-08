#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  findPrivateArtifacts,
} = require("./assemble-standalone.cjs");

function auditPackagePrivacy(targetPath) {
  const target = path.resolve(targetPath);
  if (!fs.existsSync(target)) {
    throw new Error(`Package privacy audit target does not exist: ${target}`);
  }

  const privateArtifacts = findPrivateArtifacts(target);
  if (privateArtifacts.length > 0) {
    throw new Error(
      `Private artifacts found in package tree:\n${privateArtifacts
        .map((artifact) => `- ${artifact}`)
        .join("\n")}`,
    );
  }

  process.stdout.write(`[package-privacy] verified ${target}\n`);
  return Object.freeze({ privateArtifacts, target });
}

if (require.main === module) {
  const targetPath = process.argv[2];
  if (!targetPath) {
    process.stderr.write(
      "Usage: node scripts/audit-package-privacy.cjs <package-tree>\n",
    );
    process.exitCode = 2;
  } else {
    try {
      auditPackagePrivacy(targetPath);
    } catch (error) {
      process.stderr.write(
        `[package-privacy] FAILED: ${error?.message ?? error}\n`,
      );
      process.exitCode = 1;
    }
  }
}

module.exports = { auditPackagePrivacy };
