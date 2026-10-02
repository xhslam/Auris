import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
const require = createRequire(import.meta.url);
const { assertPrivacyEntitlements } = require("../../../scripts/verify-macos-terminal-permissions.cjs");
describe("macOS terminal privacy packaging", () => {
  it("pairs app entitlements with descriptions, while helper entitlements remain minimal", () => {
    const config = parse(readFileSync("electron-builder.yml", "utf8"));
    const app = readFileSync(config.mac.entitlements, "utf8");
    expect(() => assertPrivacyEntitlements(app)).not.toThrow();
    for (const key of ["NSMicrophoneUsageDescription", "NSCameraUsageDescription", "NSAppleEventsUsageDescription"]) expect(config.mac.extendInfo[key]).toMatch(/请求/);
    const helper = readFileSync(config.mac.entitlementsInherit, "utf8");
    expect(helper).not.toMatch(/audio-input|device.camera|automation.apple-events/);
    expect(config.afterSign).toBe("scripts/verify-macos-terminal-permissions.cjs");
  });
  it("rejects missing and explicitly false privacy entitlements", () => {
    const xml = readFileSync("build/entitlements.mac.plist", "utf8");
    expect(() => assertPrivacyEntitlements(xml.replace("<key>com.apple.security.device.camera</key><true/>", ""))).toThrow("camera");
    expect(() => assertPrivacyEntitlements(xml.replace("<key>com.apple.security.device.audio-input</key><true/>", "<key>com.apple.security.device.audio-input</key><false/>"))).toThrow("audio-input");
  });
});
