import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  shellPath,
  widenPath,
} = require("../../../../../electron/nia/companion/shell-path.cjs");

interface MockProbeResult {
  status: number | null;
  stdout: string;
  failed: boolean;
  timedOut: boolean;
}

const ok = (stdout: string): MockProbeResult => ({
  status: 0,
  stdout,
  failed: false,
  timedOut: false,
});

const asked = (result: MockProbeResult) => {
  const seen: string[][] = [];
  return {
    seen,
    run: (command: string, args: readonly string[]) => {
      seen.push([command, ...args]);
      return Promise.resolve(result);
    },
  };
};

const deps = (over: Record<string, unknown> = {}) => ({
  platform: "darwin" as NodeJS.Platform,
  env: { SHELL: "/bin/zsh" },
  ...over,
});

describe("shellPath", () => {
  it("reads PATH from an interactive login shell", async () => {
    const probe = asked(ok("/opt/homebrew/bin:/usr/bin"));
    const found = await shellPath(deps({ run: probe.run }));
    expect(found).toBe("/opt/homebrew/bin:/usr/bin");
    expect(probe.seen[0]).toEqual(["/bin/zsh", "-ilc", 'printf %s "$PATH"']);
  });

  it("takes the last line when an interactive shell greets the user with banners", async () => {
    const probe = asked(
      ok("Welcome to your shell!\nyou have mail\n/opt/homebrew/bin:/usr/bin"),
    );
    expect(await shellPath(deps({ run: probe.run }))).toBe(
      "/opt/homebrew/bin:/usr/bin",
    );
  });

  it("returns null safely when the shell fails or times out", async () => {
    const badResults: MockProbeResult[] = [
      { status: 1, stdout: "", failed: false, timedOut: false },
      { status: null, stdout: "", failed: true, timedOut: false },
      { status: null, stdout: "", failed: false, timedOut: true },
    ];
    for (const bad of badResults) {
      expect(await shellPath(deps({ run: asked(bad).run }))).toBeNull();
    }
  });

  it("refuses output that is not a path", async () => {
    expect(
      await shellPath(deps({ run: asked(ok("command not found")).run })),
    ).toBeNull();
  });

  it("does not ask when there is no SHELL configured", async () => {
    const probe = asked(ok("/usr/bin"));
    expect(await shellPath(deps({ env: {}, run: probe.run }))).toBeNull();
    expect(probe.seen).toEqual([]);
  });

  it("does not ask on Windows where GUI already inherits registry PATH", async () => {
    const probe = asked(ok("/usr/bin"));
    expect(
      await shellPath(deps({ platform: "win32", run: probe.run })),
    ).toBeNull();
    expect(probe.seen).toEqual([]);
  });
});

describe("widenPath", () => {
  it("keeps existing entries first to prevent shadowing system binaries", () => {
    expect(widenPath("/usr/bin:/bin", "/opt/homebrew/bin:/usr/bin")).toBe(
      "/usr/bin:/bin:/opt/homebrew/bin",
    );
  });

  it("adds directories from modern version managers like mise/nvm/asdf", () => {
    const widened = widenPath(
      "/usr/bin:/bin:/usr/sbin:/sbin",
      "/Users/someone/.local/share/mise/installs/node/lts/bin:/usr/bin",
    );
    expect(widened.split(":")).toContain(
      "/Users/someone/.local/share/mise/installs/node/lts/bin",
    );
  });

  it("survives a shell that returned null", () => {
    expect(widenPath("/usr/bin:/bin", null)).toBe("/usr/bin:/bin");
  });

  it("deduplicates entries without dropping any", () => {
    expect(widenPath("/a:/b", "/b:/c")).toBe("/a:/b:/c");
  });
});
