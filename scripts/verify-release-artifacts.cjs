#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { parse } = require("yaml");

async function verifyReleaseArtifacts(directory, version, metadataNames) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid release version");
  if (!metadataNames.length) throw new Error("Updater metadata is required");
  for (const name of metadataNames) {
    if (!["latest-mac.yml", "latest.yml"].includes(name)) throw new Error("Unsupported updater metadata");
    const metadata = parse(fs.readFileSync(path.join(directory, name), "utf8"));
    if (metadata?.version !== version) throw new Error(`${name}: version mismatch`);
    if (!Array.isArray(metadata.files) || !metadata.files.length) throw new Error(`${name}: no update files`);
    const requiredExtension = name === "latest-mac.yml" ? ".zip" : ".exe";
    if (!metadata.files.some((file) => file.url?.endsWith(requiredExtension))) {
      throw new Error(`${name}: missing ${requiredExtension} update artifact`);
    }
    for (const file of metadata.files) {
      const filename = file.url;
      if (typeof filename !== "string" || !filename || /[/\\]/.test(filename) || filename === "..") {
        throw new Error(`${name}: unsafe artifact filename`);
      }
      const artifactPath = path.join(directory, filename);
      const size = fs.statSync(artifactPath).size;
      if (!size || size !== file.size) throw new Error(`${filename}: size mismatch`);
      const hash = createHash("sha512");
      for await (const chunk of fs.createReadStream(artifactPath)) hash.update(chunk);
      if (hash.digest("base64") !== file.sha512) throw new Error(`${filename}: SHA-512 mismatch`);
    }
    // Squirrel.Mac downloads ZIP; DMG is the initial-install distribution.
    if (name === "latest-mac.yml" && !fs.readdirSync(directory).some((file) =>
      file.startsWith(`Auris-${version}`) && file.endsWith(".dmg") && fs.statSync(path.join(directory, file)).size > 0,
    )) throw new Error("Missing macOS DMG installer");
  }
}

module.exports = { verifyReleaseArtifacts };
if (require.main === module) {
  const [, , directory, version, ...metadataNames] = process.argv;
  verifyReleaseArtifacts(directory, version, metadataNames).then(() => {
    console.log(`Verified release ${version}: ${metadataNames.join(", ")}`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
