import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  DesktopReleaseError,
  createDesktopReleasePublisher,
  getTarget,
  getTokenFromEnvironment,
} = require("../../../electron/development-release-publisher.cjs");

describe("desktop release publisher helpers", () => {
  it("uses the dedicated release token before other GitHub token names", () => {
    expect(getTokenFromEnvironment({
      GH_TOKEN: "general-token",
      GITHUB_RELEASE_TOKEN: "release-token",
    })).toBe("release-token");
  });

  it("selects macOS update metadata for a macOS build", () => {
    expect(getTarget("darwin")).toEqual({
      builderArg: "--mac",
      label: "macOS",
      metadataFile: "latest-mac.yml",
    });
  });

  it("rejects unsupported local build platforms", () => {
    expect(() => getTarget("linux")).toThrow(DesktopReleaseError);
  });
});

describe("createDesktopReleasePublisher", () => {
  const root = "/worktree";
  const appDirectory = "/worktree/auris";

  function createFileSystem(version = "1.0.1") {
    const files = new Map<string, string>([
      ["/worktree/auris/package.json", JSON.stringify({ name: "auris", version })],
      ["/worktree/auris/release/latest-mac.yml", `version: ${version}\npath: Auris-${version}.zip\n`],
    ]);
    return {
      readFile: vi.fn(async (file: string) => {
        const value = files.get(file);
        if (value === undefined) throw new Error("ENOENT");
        return value;
      }),
    };
  }

  function createExec({ localHead = "abc", remoteHead = "abc" }: {
    localHead?: string;
    remoteHead?: string;
  } = {}) {
    return vi.fn(async (
      _command: string,
      args: string[],
      _options: { env?: Record<string, string> },
    ) => {
      void _options;
      const command = args.join(" ");
      if (command === "rev-parse --show-toplevel") return { stdout: `${root}\n` };
      if (command === "branch --show-current") return { stdout: "main\n" };
      if (command === "rev-parse HEAD") return { stdout: `${localHead}\n` };
      if (command === "rev-parse origin/main") return { stdout: `${remoteHead}\n` };
      return { stdout: "" };
    });
  }

  it("verifies pushed source, builds, assembles, publishes, and confirms update metadata", async () => {
    const exec = createExec();
    const publisher = createDesktopReleasePublisher({
      appDirectory,
      environment: { GITHUB_RELEASE_TOKEN: "secret-release-token" },
      exec,
      fileSystem: createFileSystem(),
      platform: "darwin",
    });

    await expect(publisher.publish()).resolves.toMatchObject({
      branch: "main",
      published: true,
      releaseTag: "v1.0.1",
      version: "1.0.1",
    });

    expect(exec.mock.calls.map(([command, args]) => [command, args])).toEqual([
      ["git", ["rev-parse", "--show-toplevel"]],
      ["git", ["branch", "--show-current"]],
      ["git", ["fetch", "--prune", "origin"]],
      ["git", ["rev-parse", "HEAD"]],
      ["git", ["rev-parse", "origin/main"]],
      ["npm", ["run", "build"]],
      ["npm", ["run", "desktop:assemble"]],
      ["/worktree/auris/node_modules/.bin/electron-builder", ["--mac", "--publish", "always"]],
    ]);
    const releaseEnvironment = exec.mock.calls[7]?.[2]?.env;
    expect(releaseEnvironment?.GITHUB_RELEASE_TOKEN).toBe("secret-release-token");
  });

  it("refuses to publish when the local source has not reached GitHub", async () => {
    const publisher = createDesktopReleasePublisher({
      appDirectory,
      environment: { GITHUB_RELEASE_TOKEN: "secret-release-token" },
      exec: createExec({ localHead: "local", remoteHead: "remote" }),
      fileSystem: createFileSystem(),
      platform: "darwin",
    });

    await expect(publisher.publish()).rejects.toMatchObject({
      code: "SOURCE_NOT_PUSHED",
    });
  });
});
