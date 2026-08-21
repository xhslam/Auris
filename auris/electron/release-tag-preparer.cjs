"use strict";

/**
 * 将已经推送的应用源码固定为 vX.Y.Z 标签并推送。GitHub Actions 收到该标签后再
 * 构建各平台安装包、验证更新元数据并发布 Release；本地桌面进程不持有发布 token。
 */

const { execFile: defaultExecFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const execFile = promisify(defaultExecFile);
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

class ReleaseTagPreparationError extends Error {
  constructor(message, code = "RELEASE_TAG_PREPARATION_FAILED") {
    super(message);
    this.name = "ReleaseTagPreparationError";
    this.code = code;
  }
}

function normalizeOutput(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createReleaseTagPreparer({
  appDirectory,
  exec = execFile,
  fileSystem = fs,
  log = () => {},
} = {}) {
  if (typeof appDirectory !== "string" || !appDirectory) {
    throw new TypeError("createReleaseTagPreparer requires appDirectory.");
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
      throw new ReleaseTagPreparationError(
        detail ? `Git 操作失败：${detail}` : "Git 操作失败，请检查仓库状态与网络连接。",
        "GIT_COMMAND_FAILED",
      );
    }
  }

  async function inspect() {
    const repositoryRoot = await git(appDirectory, ["rev-parse", "--show-toplevel"]);
    const appRelativePath = path.relative(repositoryRoot, appDirectory);
    if (!appRelativePath || appRelativePath.startsWith("..") || path.isAbsolute(appRelativePath)) {
      throw new ReleaseTagPreparationError("应用目录不在当前 Git 工作树内，已停止创建发布标签。", "UNSAFE_REPOSITORY_LAYOUT");
    }
    const branch = await git(appDirectory, ["branch", "--show-current"]);
    if (!branch) {
      throw new ReleaseTagPreparationError("当前不在可发布的本地分支上，已停止创建发布标签。", "DETACHED_HEAD");
    }

    let version;
    try {
      const manifest = JSON.parse(await fileSystem.readFile(path.join(appDirectory, "package.json"), "utf8"));
      version = manifest.version;
    } catch {
      throw new ReleaseTagPreparationError("无法读取 package.json 版本号，已停止创建发布标签。", "VERSION_UNAVAILABLE");
    }
    if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
      throw new ReleaseTagPreparationError("应用版本必须是三段语义版本号，例如 1.0.1。", "INVALID_VERSION");
    }

    await git(appDirectory, ["fetch", "--prune", "--tags", "origin"]);
    const [localHead, remoteHead] = await Promise.all([
      git(appDirectory, ["rev-parse", "HEAD"]),
      git(appDirectory, ["rev-parse", `origin/${branch}`]),
    ]);
    if (!localHead || localHead !== remoteHead) {
      throw new ReleaseTagPreparationError(
        "当前代码尚未与 GitHub 当前分支完全同步。请先点击“同步并推送”，再发布桌面版本。",
        "SOURCE_NOT_PUSHED",
      );
    }

    return {
      branch,
      localHead,
      repositoryRoot,
      tag: `v${version}`,
      version,
    };
  }

  async function prepare() {
    const readiness = await inspect();
    const remoteTag = await git(readiness.repositoryRoot, [
      "ls-remote",
      "--tags",
      "origin",
      `refs/tags/${readiness.tag}`,
    ]);
    if (remoteTag) {
      throw new ReleaseTagPreparationError(
        `远端已存在 ${readiness.tag} 标签。已发布版本不可原地替换；请先递增版本号再发布。`,
        "REMOTE_TAG_EXISTS",
      );
    }

    const localTag = await git(readiness.repositoryRoot, ["tag", "--list", readiness.tag]);
    if (localTag) {
      const localTagCommit = await git(readiness.repositoryRoot, ["rev-list", "-n", "1", readiness.tag]);
      if (localTagCommit !== readiness.localHead) {
        throw new ReleaseTagPreparationError(
          `本地 ${readiness.tag} 标签并不指向当前已推送提交。请先删除或修正该标签，避免发布错误版本。`,
          "LOCAL_TAG_POINTS_ELSEWHERE",
        );
      }
      await git(readiness.repositoryRoot, ["push", "origin", readiness.tag]);
      return { ...readiness, retriedTagPush: true };
    }

    await git(readiness.repositoryRoot, ["tag", "-a", readiness.tag, "-m", `Release ${readiness.tag}`]);
    try {
      await git(readiness.repositoryRoot, ["push", "origin", readiness.tag]);
    } catch (cause) {
      // 标签仍留在本地，下一次点击会只重试推送，不会创建第二个版本标签。
      throw cause;
    }

    log("release-tag:created", { branch: readiness.branch, tag: readiness.tag });
    return { ...readiness, retriedTagPush: false };
  }

  return Object.freeze({ inspect, prepare });
}

module.exports = {
  ReleaseTagPreparationError,
  createReleaseTagPreparer,
};
