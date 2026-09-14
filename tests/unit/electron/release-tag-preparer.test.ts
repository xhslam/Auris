import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  ReleaseTagPreparationError,
  createReleaseTagPreparer,
} = require("../../../electron/release-tag-preparer.cjs");

describe("createReleaseTagPreparer", () => {
  const appDirectory = "/worktree/auris";
  const root = "/worktree";

  function createFileSystem(version = "1.0.1") {
    return {
      readFile: vi.fn(async () => JSON.stringify({ name: "auris", version })),
    };
  }

  function createExec({
    localTag = "",
    remoteTag = "",
    localHead = "abc123",
    remoteHead = "abc123",
    tagCommit = "abc123",
  }: {
    localTag?: string;
    remoteTag?: string;
    localHead?: string;
    remoteHead?: string;
    tagCommit?: string;
  } = {}) {
    return vi.fn(async (_command: string, args: string[]) => {
      const command = args.join(" ");
      if (command === "rev-parse --show-toplevel") return { stdout: `${root}\n` };
      if (command === "branch --show-current") return { stdout: "main\n" };
      if (command === "rev-parse HEAD") return { stdout: `${localHead}\n` };
      if (command === "rev-parse origin/main") return { stdout: `${remoteHead}\n` };
      if (command === "ls-remote --tags origin refs/tags/v1.0.1") return { stdout: remoteTag };
      if (command === "tag --list v1.0.1") return { stdout: localTag };
      if (command === "rev-list -n 1 v1.0.1") return { stdout: `${tagCommit}\n` };
      return { stdout: "" };
    });
  }

  it("creates and pushes one immutable semantic version tag after source is synchronized", async () => {
    const exec = createExec();
    const preparer = createReleaseTagPreparer({
      appDirectory,
      exec,
      fileSystem: createFileSystem(),
    });

    await expect(preparer.prepare()).resolves.toMatchObject({
      branch: "main",
      retriedTagPush: false,
      tag: "v1.0.1",
      version: "1.0.1",
    });
    expect(exec.mock.calls.map(([, args]) => args)).toEqual([
      ["rev-parse", "--show-toplevel"],
      ["branch", "--show-current"],
      ["fetch", "--prune", "--tags", "origin"],
      ["rev-parse", "HEAD"],
      ["rev-parse", "origin/main"],
      ["ls-remote", "--tags", "origin", "refs/tags/v1.0.1"],
      ["tag", "--list", "v1.0.1"],
      ["tag", "-a", "v1.0.1", "-m", "Release v1.0.1"],
      ["push", "origin", "v1.0.1"],
    ]);
  });

  it("refuses to mutate an already published release tag", async () => {
    const preparer = createReleaseTagPreparer({
      appDirectory,
      exec: createExec({ remoteTag: "abc\trefs/tags/v1.0.1\n" }),
      fileSystem: createFileSystem(),
    });

    await expect(preparer.prepare()).rejects.toMatchObject({
      code: "REMOTE_TAG_EXISTS",
    });
  });

  it("retries only tag push when a matching local tag remains after a prior push failure", async () => {
    const exec = createExec({ localTag: "v1.0.1\n" });
    const preparer = createReleaseTagPreparer({
      appDirectory,
      exec,
      fileSystem: createFileSystem(),
    });

    await expect(preparer.prepare()).resolves.toMatchObject({
      retriedTagPush: true,
      tag: "v1.0.1",
    });
    const commands = exec.mock.calls.map(([, args]) => args.join(" "));
    expect(commands).toContain("push origin v1.0.1");
    expect(commands).not.toContain("tag -a v1.0.1 -m Release v1.0.1");
  });

  it("refuses to tag source that has not reached the remote branch", async () => {
    const preparer = createReleaseTagPreparer({
      appDirectory,
      exec: createExec({ localHead: "local", remoteHead: "remote" }),
      fileSystem: createFileSystem(),
    });

    await expect(preparer.prepare()).rejects.toBeInstanceOf(ReleaseTagPreparationError);
    await expect(preparer.prepare()).rejects.toMatchObject({ code: "SOURCE_NOT_PUSHED" });
  });
});
