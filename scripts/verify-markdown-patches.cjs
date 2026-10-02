#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const contract = require("./markdown-patch-contract.json");

function verifyMarkdownPatches(root = path.resolve(__dirname, "..")) {
  for (const [packageName, version] of Object.entries(contract.versions)) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "node_modules", packageName, "package.json"), "utf8"));
    if (manifest.version !== version) throw new Error(`Unexpected ${packageName} version; review the patch contract before updating.`);
  }
  for (const [file, expected] of Object.entries(contract.files)) {
    const actual = createHash("sha256").update(fs.readFileSync(path.join(root, "node_modules", file))).digest("hex");
    if (actual !== expected) throw new Error(`Markdown patch missing or changed: ${file}. Run npm ci; do not bypass install scripts.`);
  }
  return true;
}
module.exports = { verifyMarkdownPatches };
if (require.main === module) {
  try { verifyMarkdownPatches(); console.log("[markdown-patches] pinned versions and both shipped/development builds verified."); }
  catch (error) { console.error(`[markdown-patches] ${error.message}`); process.exitCode = 1; }
}
