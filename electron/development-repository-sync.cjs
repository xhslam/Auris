"use strict";

/**
 * 开发工作副本的 GitHub 同步服务。
 *
 * 这不是已安装应用的自动更新器：后者只能从 GitHub Releases 下载已构建的安装包。
 * 本模块只服务于从源码工作副本启动的桌面端，固定在当前应用目录及其 Git 工作树内，
 * 不接收 renderer 提供的仓库路径、分支或命令，因此不会成为通用的命令执行入口。
 */

const { execFile: defaultExecFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const execFile = promisify(defaultExecFile);

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const DEFAULT_COMMIT_PREFIX = "chore(release): v";

class RepositorySyncError extends Error {
  constructor(message, code = "REPOSITORY_SYNC_FAILED") {
    super(message);
    this.name = "RepositorySyncError";
    this.code = code;
  }
}

function normalizeOutput(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nextPatchVersion(version) {
  const match = VERSION_PATTERN.exec(version);
  if (!match) {
    throw new RepositorySyncError(
      `当前版本 ${JSON.stringify(version)} 不是有效的三段语义版本号。请先使用如 1.0.0 的格式。`,
      "INVALID_VERSION",
    );
  }

  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number.parseInt(patch, 10) + 1}`;
}

async function writeVersionFiles({ fileSystem = fs, packageFile, lockFile, version }) {
  const packageJson = JSON.parse(await fileSystem.readFile(packageFile, "utf8"));
  const lockJson = JSON.parse(await fileSystem.readFile(lockFile, "utf8"));

  packageJson.version = version;
  lockJson.version = version;
  if (lockJson.packages && typeof lockJson.packages === "object" && lockJson.packages[""]) {
    lockJson.packages[""].version = version;
  }

  await fileSystem.writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  await fileSystem.writeFile(lockFile, `${JSON.stringify(lockJson, null, 2)}\n`, "utf8");
}

function createRepositorySync({
  appDirectory,
  exec = execFile,
  fileSystem = fs,
  log = () => {},
} = {}) {
  if (typeof appDirectory !== "string" || !appDirectory) {
    throw new TypeError("createRepositorySync requires appDirectory.");
  }
  if (typeof exec !== "function") {
    throw new TypeError("createRepositorySync requires exec.");
  }

  async function git(cwd, args) {
    try {
      const result = await exec("git", args, {
        cwd,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
      return normalizeOutput(result?.stdout);
    } catch (cause) {
      const detail = normalizeOutput(cause?.stderr) || normalizeOutput(cause?.message);
      throw new RepositorySyncError(
        detail ? `Git 操作失败：${detail}` : "Git 操作失败，请检查仓库状态与网络连接。",
        "GIT_COMMAND_FAILED",
      );
    }
  }

  async function syncAndPush() {
    const repositoryRoot = await git(appDirectory, ["rev-parse", "--show-toplevel"]);
    if (!repositoryRoot) {
      throw new RepositorySyncError("未能确定当前源码工作副本的 Git 根目录。", "NOT_A_REPOSITORY");
    }

    const appRelativePath = path.relative(repositoryRoot, appDirectory);
    if (!appRelativePath || appRelativePath.startsWith("..") || path.isAbsolute(appRelativePath)) {
      throw new RepositorySyncError("应用目录不在当前 Git 工作树中，已停止同步。", "UNSAFE_REPOSITORY_LAYOUT");
    }

    const branch = await git(appDirectory, ["branch", "--show-current"]);
    if (!branch) {
      throw new RepositorySyncError("当前不在可推送的本地分支上，已停止同步。", "DETACHED_HEAD");
    }

    const packageFile = path.join(appDirectory, "package.json");
    const lockFile = path.join(appDirectory, "package-lock.json");
    const packageRelativePath = path.join(appRelativePath, "package.json");
    const lockRelativePath = path.join(appRelativePath, "package-lock.json");

    // 先抓取并以 rebase + autostash 同步远端；远端分叉或工作区重放冲突时停止，绝不强推。
    await git(appDirectory, ["fetch", "--prune", "origin"]);
    await git(appDirectory, ["pull", "--rebase", "--autostash", "origin", branch]);

    let packageRaw;
    let lockRaw;
    let currentVersion;
    try {
      packageRaw = await fileSystem.readFile(packageFile, "utf8");
      lockRaw = await fileSystem.readFile(lockFile, "utf8");
      currentVersion = JSON.parse(packageRaw).version;
    } catch {
      throw new RepositorySyncError(
        "未找到可用的 package.json 或 package-lock.json，无法安全地递增版本号。",
        "VERSION_FILES_UNAVAILABLE",
      );
    }
    const nextVersion = nextPatchVersion(currentVersion);
    const localAheadCount = Number.parseInt(
      await git(repositoryRoot, ["rev-list", "--count", `origin/${branch}..HEAD`]),
      10,
    );
    const hasLocalCommits = Number.isFinite(localAheadCount) && localAheadCount > 0;
    const changedFiles = await git(repositoryRoot, [
      "status",
      "--porcelain",
      "--",
      appRelativePath,
      ".github",
      ".gitignore",
    ]);
    const headSubject = await git(repositoryRoot, ["log", "-1", "--format=%s"]);
    const hasPendingReleaseCommit =
      hasLocalCommits && headSubject === `${DEFAULT_COMMIT_PREFIX}${currentVersion}`;

    // 上次提交已完成但 push 失败时，重试只推送原提交，避免把同一版内容抬升两次版本号。
    if (!changedFiles && hasPendingReleaseCommit) {
      await git(repositoryRoot, ["push", "origin", `HEAD:${branch}`]);
      const commit = await git(repositoryRoot, ["rev-parse", "--short", "HEAD"]);
      log("repository-sync:push-retry-complete", { branch, commit, currentVersion });
      return {
        branch,
        commit,
        currentVersion,
        repositoryRoot,
        retriedPush: true,
        version: currentVersion,
      };
    }

    // 远端已同步且没有本地改动时不人为制造版本提交。
    if (!changedFiles && !hasLocalCommits) {
      const commit = await git(repositoryRoot, ["rev-parse", "--short", "HEAD"]);
      return {
        branch,
        commit,
        currentVersion,
        repositoryRoot,
        skipped: true,
        version: currentVersion,
      };
    }

    log("repository-sync:start", { branch, currentVersion, nextVersion });
    await writeVersionFiles({
      fileSystem,
      packageFile,
      lockFile,
      version: nextVersion,
    });

    // 只暂存应用目录和本工作区的忽略规则，根目录旁的个人 Markdown / research 文件不会入库。
    let committed = false;
    let commit = null;
    try {
      await git(repositoryRoot, ["add", "--all", "--", appRelativePath, ".github", ".gitignore"]);
      await git(repositoryRoot, ["commit", "-m", `${DEFAULT_COMMIT_PREFIX}${nextVersion}`]);
      committed = true;
      commit = await git(repositoryRoot, ["rev-parse", "--short", "HEAD"]);
      await git(repositoryRoot, ["push", "origin", `HEAD:${branch}`]);
    } catch (cause) {
      if (!committed) {
        // 提交没有落地时，恢复版本文件原样，避免一次失败无声占用下一个版本号。
        await fileSystem.writeFile(packageFile, packageRaw, "utf8");
        await fileSystem.writeFile(lockFile, lockRaw, "utf8");
        try {
          await git(repositoryRoot, ["reset", "--", packageRelativePath, lockRelativePath]);
        } catch {
          // 文件内容已恢复；索引清理由用户下次同步前的 git status 可见化处理。
        }
      }
      if (committed) {
        throw new RepositorySyncError(
          `本地已创建 v${nextVersion} 提交，但推送失败。修复远端问题后再次点击会只重试推送。`,
          "PUSH_FAILED_AFTER_COMMIT",
        );
      }
      throw cause;
    }

    log("repository-sync:complete", { branch, commit, currentVersion, nextVersion });
    return {
      branch,
      commit,
      currentVersion,
      repositoryRoot,
      version: nextVersion,
    };
  }

  return Object.freeze({ syncAndPush });
}

module.exports = {
  DEFAULT_COMMIT_PREFIX,
  RepositorySyncError,
  createRepositorySync,
  nextPatchVersion,
  writeVersionFiles,
};
