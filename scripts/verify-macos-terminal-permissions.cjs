#!/usr/bin/env node
"use strict";
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const resources = [
  ["NSMicrophoneUsageDescription", "com.apple.security.device.audio-input"],
  ["NSCameraUsageDescription", "com.apple.security.device.camera"],
  ["NSAppleEventsUsageDescription", "com.apple.security.automation.apple-events"],
];
function assertPrivacyEntitlements(xml) {
  for (const [, entitlement] of resources) {
    const escaped = entitlement.replaceAll(".", "\\.");
    if (!new RegExp(`<key>\\s*${escaped}\\s*</key>\\s*<true\\s*/>`).test(xml)) throw new Error(`Missing signed entitlement: ${entitlement}`);
  }
}
function verifyMacosTerminalPermissions(appPath, { requireSignature = false } = {}) {
  const info = path.join(appPath, "Contents", "Info.plist");
  for (const [key] of resources) {
    const value = execFileSync("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", info], { encoding: "utf8" });
    if (!value.trim()) throw new Error(`Missing usage description: ${key}`);
  }
  const probe = spawnSync("/usr/bin/codesign", ["-d", "--entitlements", ":-", appPath], { encoding: "utf8" });
  if (probe.status !== 0) {
    if (requireSignature) throw new Error("Cannot verify macOS terminal permissions without an app signature.");
    console.log("[macos-terminal-permissions] usage descriptions verified; unsigned local package entitlements remain unverified.");
    return { signed: false };
  }
  assertPrivacyEntitlements(probe.stdout);
  console.log("[macos-terminal-permissions] packaged descriptions and signed privacy entitlements verified.");
  return { signed: true };
}
// electron-builder runs this before publishing, even if the build is launched elsewhere.
module.exports = async (context) => {
  if (context.electronPlatformName !== "darwin") return;
  verifyMacosTerminalPermissions(path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`), {
    requireSignature: Boolean(process.env.CSC_LINK || process.env.CSC_NAME),
  });
};
module.exports.assertPrivacyEntitlements = assertPrivacyEntitlements;
module.exports.verifyMacosTerminalPermissions = verifyMacosTerminalPermissions;
if (require.main === module) {
  try { verifyMacosTerminalPermissions(path.resolve(process.argv[2]), { requireSignature: process.argv.includes("--require-signature") }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
