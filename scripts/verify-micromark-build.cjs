#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const outputRoot = path.resolve(__dirname, "../.next");
const markers = ["_gfmAutolinkLiteralUnbalanced", "aurisMdastCallbacks", "aurisListItemAt"];
// ProseMirror runs on the client. Its retained static property survives minification.
const clientMarkers = [...markers, "aurisDecorationPatch1565"];

function missingPatchMarkers(root, requiredMarkers = markers) {
  const missing = new Set(requiredMarkers);
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

module.exports = { missingPatchMarkers, clientMarkers };
if (require.main === module) {
for (const surface of ["server", "static"]) {
  const missing = missingPatchMarkers(path.join(outputRoot, surface), surface === "static" ? clientMarkers : markers);
  if (missing.length) {
    console.error(
      `[verify-micromark-build] ${surface} bundle lacks Markdown patch markers: ${missing.join(", ")}. ` +
        "The Next build cache may be stale; move .next aside and rebuild.",
    );
    process.exitCode = 1;
  }
}

if (process.exitCode !== 1) {
  console.log("[verify-micromark-build] Markdown patches and client ProseMirror patch found in production bundles.");
}
}
