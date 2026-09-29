#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const outputRoot = path.resolve(__dirname, "../.next");
const marker = "_gfmAutolinkLiteralUnbalanced";

function containsPatchedAutolink(root) {
  if (!fs.existsSync(root)) return false;
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(filePath);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        if (fs.readFileSync(filePath, "utf8").includes(marker)) return true;
      }
    }
  }
  return false;
}

for (const surface of ["server", "static"]) {
  if (!containsPatchedAutolink(path.join(outputRoot, surface))) {
    console.error(
      `[verify-micromark-build] ${surface} bundle lacks the patched GFM autolink cache. ` +
        "The Next build cache may be stale; move .next aside and rebuild.",
    );
    process.exitCode = 1;
  }
}

if (process.exitCode !== 1) {
  console.log("[verify-micromark-build] patched GFM autolink cache found in server and client bundles.");
}
