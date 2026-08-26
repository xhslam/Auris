const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");

if (process.platform !== "darwin") {
  console.log("Desktop island helper: skipped on non-macOS host.");
  process.exit(0);
}

const source = path.join(projectRoot, "native", "desktop-island", "macos", "AurisDesktopIslandHelper.swift");
const outputDirectory = path.join(projectRoot, "build", "native", "desktop-island", process.arch);
const output = path.join(outputDirectory, "AurisDesktopIslandHelper");
fs.mkdirSync(outputDirectory, { recursive: true });

const lookup = spawnSync("/usr/bin/xcrun", ["--find", "swiftc"], { encoding: "utf8" });
if (lookup.status !== 0) {
  throw new Error("swiftc is unavailable. Install the Xcode Command Line Tools.");
}
const swiftc = lookup.stdout.trim();
const compatibleSdk = "/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk";
const sdkLookup = spawnSync("/usr/bin/xcrun", ["--show-sdk-path"], { encoding: "utf8" });
const sdkPath = fs.existsSync(compatibleSdk) ? compatibleSdk : sdkLookup.stdout.trim();
const result = spawnSync(swiftc, [
  "-sdk", sdkPath,
  "-target", `${process.arch === "x64" ? "x86_64" : "arm64"}-apple-macosx12.0`,
  source,
  "-o", output,
  "-framework", "AppKit",
  "-framework", "SwiftUI",
], {
  encoding: "utf8",
  env: { ...process.env, MACOSX_DEPLOYMENT_TARGET: "12.0" },
  stdio: ["ignore", "pipe", "pipe"],
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status || 1);
}
fs.chmodSync(output, 0o755);
console.log(`Desktop island helper built: ${path.relative(projectRoot, output)}`);
