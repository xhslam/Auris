import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  RepositorySyncError,
  createRepositorySync,
  nextPatchVersion,
} = require("../../../electron/development-repository-sync.cjs");

describe("nextPatchVersion", () => {
  it("increments the semantic patch segment", () => {
    expect(nextPatchVersion("1.0.0")).toBe("1.0.1");
    expect(nextPatchVersion("1.0.9")).toBe("1.0.10");
  });

  it("rejects a non-semantic version instead of silently changing its meaning", () => {
    expect(() => nextPatchVersion("1.01")).toThrow(RepositorySyncError);
  });
});

describe("createRepositorySync", () => {
  it("pulls first, updates both version files, commits only the app scope, then pushes", async () => {
    const commands: Array<{ args: string[]; cwd: string }> = [];
    const writes = new Map<string, string>();
    const root = "/worktree";
    const appDirectory = "/worktree/auris";
    const files = new Map<string, string>([
      [
        "/worktree/auris/package.json",
        JSON.stringify({ name: "auris", version: "1.0.0" }),
      ],
      [
        "/worktree/auris/package-lock.json",
        JSON.stringify({
          name: "auris",
          packages: { "": { name: "auris", version: "1.0.0" } },
          version: "1.0.0",
        }),
      ],
    ]);
    const exec = vi.fn(async (_binary: string, args: string[], options: { cwd: string }) => {
      commands.push({ args, cwd: options.cwd });
      if (args.join(" ") === "rev-parse --show-toplevel") return { stdout: `${root}\n` };
      if (args.join(" ") === "branch --show-current") return { stdout: "main\n" };
      if (args.join(" ") === "rev-list --count origin/main..HEAD") return { stdout: "0\n" };
      if (args.join(" ") === "status --porcelain -- auris .github .gitignore") return { stdout: " M auris/src/file.ts\n" };
      if (args.join(" ") === "log -1 --format=%s") return { stdout: "work in progress\n" };
      if (args.join(" ") === "rev-parse --short HEAD") return { stdout: "abc1234\n" };
      return { stdout: "" };
    });
    const fileSystem = {
      access: vi.fn(async () => undefined),
      readFile: vi.fn(async (file: string) => files.get(file) ?? ""),
      writeFile: vi.fn(async (file: string, content: string) => {
        writes.set(file, content);
      }),
    };

    const sync = createRepositorySync({ appDirectory, exec, fileSystem });
    await expect(sync.syncAndPush()).resolves.toEqual({
      branch: "main",
      commit: "abc1234",
      currentVersion: "1.0.0",
      repositoryRoot: root,
      version: "1.0.1",
    });

    expect(commands.map(({ args }) => args)).toEqual([
      ["rev-parse", "--show-toplevel"],
      ["branch", "--show-current"],
      ["fetch", "--prune", "origin"],
      ["pull", "--rebase", "--autostash", "origin", "main"],
      ["rev-list", "--count", "origin/main..HEAD"],
      ["status", "--porcelain", "--", "auris", ".github", ".gitignore"],
      ["log", "-1", "--format=%s"],
      ["add", "--all", "--", "auris", ".github", ".gitignore"],
      ["commit", "-m", "chore(release): v1.0.1"],
      ["rev-parse", "--short", "HEAD"],
      ["push", "origin", "HEAD:main"],
    ]);
    expect(commands[7].cwd).toBe(root);
    expect(JSON.parse(writes.get("/worktree/auris/package.json") ?? "{}").version).toBe("1.0.1");
    const lockJson = JSON.parse(writes.get("/worktree/auris/package-lock.json") ?? "{}");
    expect(lockJson.version).toBe("1.0.1");
    expect(lockJson.packages[""].version).toBe("1.0.1");
  });
});


describe("repository sync retry safety", () => {
  function createFileSystem(version = "1.0.1") {
    const writes = new Map<string, string>();
    const files = new Map<string, string>([
      ["/worktree/auris/package.json", JSON.stringify({ name: "auris", version })],
      [
        "/worktree/auris/package-lock.json",
        JSON.stringify({
          name: "auris",
          packages: { "": { name: "auris", version } },
          version,
        }),
      ],
    ]);
    return {
      writes,
      fileSystem: {
        readFile: vi.fn(async (file: string) => files.get(file) ?? ""),
        writeFile: vi.fn(async (file: string, content: string) => {
          writes.set(file, content);
        }),
      },
    };
  }

  function createExec({ ahead, changedFiles, headSubject }: {
    ahead: number;
    changedFiles: string;
    headSubject: string;
  }) {
    return vi.fn(async (_binary: string, args: string[]) => {
      const command = args.join(" ");
      if (command === "rev-parse --show-toplevel") return { stdout: "/worktree\n" };
      if (command === "branch --show-current") return { stdout: "main\n" };
      if (command === "rev-list --count origin/main..HEAD") return { stdout: `${ahead}\n` };
      if (command === "status --porcelain -- auris .github .gitignore") return { stdout: changedFiles };
      if (command === "log -1 --format=%s") return { stdout: `${headSubject}\n` };
      if (command === "rev-parse --short HEAD") return { stdout: "abc1234\n" };
      return { stdout: "" };
    });
  }

  it("does not create an empty version commit when the worktree is already synchronized", async () => {
    const { fileSystem, writes } = createFileSystem("1.0.1");
    const exec = createExec({ ahead: 0, changedFiles: "", headSubject: "existing commit" });
    const sync = createRepositorySync({
      appDirectory: "/worktree/auris",
      exec,
      fileSystem,
    });

    await expect(sync.syncAndPush()).resolves.toMatchObject({
      skipped: true,
      version: "1.0.1",
    });
    expect(exec.mock.calls.map(([, args]) => args).some((args) => args[0] === "commit")).toBe(false);
    expect(writes.size).toBe(0);
  });

  it("retries only push after a previously committed release failed to publish", async () => {
    const { fileSystem, writes } = createFileSystem("1.0.1");
    const exec = createExec({
      ahead: 1,
      changedFiles: "",
      headSubject: "chore(release): v1.0.1",
    });
    const sync = createRepositorySync({
      appDirectory: "/worktree/auris",
      exec,
      fileSystem,
    });

    await expect(sync.syncAndPush()).resolves.toMatchObject({
      retriedPush: true,
      version: "1.0.1",
    });
    const commands = exec.mock.calls.map(([, args]) => args.join(" "));
    expect(commands).toContain("push origin HEAD:main");
    expect(commands).not.toContain("commit -m chore(release): v1.0.2");
    expect(writes.size).toBe(0);
  });
});
