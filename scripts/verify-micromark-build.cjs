#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const outputRoot = path.resolve(__dirname, "../.next");
const markers = ["_gfmAutolinkLiteralUnbalanced", "aurisMdastCallbacks", "aurisListItemAt"];

function missingPatchMarkers(root) {
  const missing = new Set(markers);
  if (!fs.existsSync(root)) return [...missing];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(filePath);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        const source = fs.readFileSync(filePath, "utf8");
        for (const marker of missing) if (source.includes(marker)) missing.delete(marker);
        if (missing.size === 0) return [];
      }
    }
  }
  return [...missing];
}

for (const surface of ["server", "static"]) {
  const missing = missingPatchMarkers(path.join(outputRoot, surface));
  if (missing.length) {
    console.error(
      `[verify-micromark-build] ${surface} bundle lacks Markdown patch markers: ${missing.join(", ")}. ` +
        "The Next build cache may be stale; move .next aside and rebuild.",
    );
    process.exitCode = 1;
  }
}

if (process.exitCode !== 1) {
  console.log("[verify-micromark-build] all three Markdown patches found in server and client bundles.");
}
