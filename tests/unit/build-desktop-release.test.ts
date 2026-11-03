import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  resolveBuildCommand,
  runBuild,
  sanitizeSigningEnv,
} = require("../../scripts/build-desktop-release.cjs");

describe("build-desktop-release", () => {
  describe("sanitizeSigningEnv", () => {
    it("cleans empty or dangling cert variables and sets identity=- for macOS adhoc mode", () => {
      const dirtyEnv = {
        CSC_LINK: "",
        CSC_KEY_PASSWORD: "",
        MAC_CSC_LINK: "",
        MAC_CSC_KEY_PASSWORD: "",
        MAC_SIGNING_MODE: "adhoc",
        PATH: "/usr/bin",
      };

      const result = sanitizeSigningEnv(dirtyEnv, {
        platform: "darwin",
        signingMode: "adhoc",
      });

      expect(result.env.CSC_LINK).toBeUndefined();
      expect(result.env.CSC_KEY_PASSWORD).toBeUndefined();
      expect(result.env.MAC_CSC_LINK).toBeUndefined();
      expect(result.env.MAC_CSC_KEY_PASSWORD).toBeUndefined();
      expect(result.env.CSC_IDENTITY_AUTO_DISCOVERY).toBe("false");
      expect(result.env.PATH).toBe("/usr/bin");
      expect(result.extraArgs).toEqual([
        "--config.mac.identity=-",
        "--config.forceCodeSigning=false",
      ]);
    });

    it("requires cert credentials and enables forceCodeSigning for macOS developer-id mode", () => {
      const validEnv = {
        MAC_CSC_LINK: "data:base64cert",
        MAC_CSC_KEY_PASSWORD: "secret-password",
        MAC_SIGNING_MODE: "developer-id",
      };

      const result = sanitizeSigningEnv(validEnv, {
        platform: "darwin",
        signingMode: "developer-id",
      });

      expect(result.env.CSC_LINK).toBe("data:base64cert");
      expect(result.env.CSC_KEY_PASSWORD).toBe("secret-password");
      expect(result.extraArgs).toEqual(["--config.forceCodeSigning=true"]);
    });

    it("throws a descriptive error when developer-id mode is missing credentials", () => {
      expect(() =>
        sanitizeSigningEnv(
          { MAC_SIGNING_MODE: "developer-id" },
          { platform: "darwin", signingMode: "developer-id" },
        ),
      ).toThrow("developer-id signing requires MAC_CSC_LINK and MAC_CSC_KEY_PASSWORD");
    });

    it("cleans Mac-specific signing variables on Windows", () => {
      const mixedEnv = {
        CSC_LINK: "random",
        MAC_CSC_LINK: "random",
        OTHER_VAR: "value",
      };

      const result = sanitizeSigningEnv(mixedEnv, {
        platform: "win32",
      });

      expect(result.env.CSC_LINK).toBeUndefined();
      expect(result.env.MAC_CSC_LINK).toBeUndefined();
      expect(result.env.OTHER_VAR).toBe("value");
      expect(result.extraArgs).toEqual([]);
    });
  });

  describe("resolveBuildCommand", () => {
    it("resolves the macOS release build command with adhoc flags", () => {
      const command = resolveBuildCommand({
        platform: "darwin",
        signingMode: "adhoc",
        env: {},
      });

      expect(command.command).toBe("npm");
      expect(command.args).toEqual([
        "run",
        "desktop:release:build:mac",
        "--",
        "--config.mac.identity=-",
        "--config.forceCodeSigning=false",
      ]);
    });

    it("resolves the Windows release build command without extra signing flags", () => {
      const command = resolveBuildCommand({
        platform: "win32",
        env: {},
      });

      expect(command.command).toBe("npm.cmd");
      expect(command.args).toEqual(["run", "desktop:release:build:win"]);
    });
  });

  describe("runBuild", () => {
    it("invokes spawnSync with the resolved command, args, and sanitized environment", () => {
      const mockSpawnSync = vi.fn((..._args: unknown[]) => ({ status: 0 }));

      runBuild({
        platform: "darwin",
        signingMode: "adhoc",
        env: { DUMMY: "1" },
        spawnSync: mockSpawnSync,
        noExit: true,
      });

      expect(mockSpawnSync).toHaveBeenCalledTimes(1);
      const call = mockSpawnSync.mock.calls[0] as [
        string,
        string[],
        { env: Record<string, string> },
      ];
      const [cmd, args, opts] = call;
      expect(cmd).toBe("npm");
      expect(args).toContain("desktop:release:build:mac");
      expect(opts.env.CSC_IDENTITY_AUTO_DISCOVERY).toBe("false");
      expect(opts.env.CSC_LINK).toBeUndefined();
    });
  });
});
