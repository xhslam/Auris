"use strict";

/**
 * 开发工作副本的桌面版发布服务。
 *
 * 它只在本地源码目录中运行，先确认当前代码已推送到 origin/<branch>，再构建并用
 * electron-builder 的 GitHub publisher 上传当前平台的安装包与更新元数据。renderer
 * 无法传入命令、路径、分支或 token；GitHub 凭据只存在于子进程环境变量中。
 */

const { execFile: defaultExecFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const execFile = promisify(defaultExecFile);

class DesktopReleaseError extends Error {
  constructor(message, code = "DESKTOP_RELEASE_FAILED") {
    super(message);
    this.name = "DesktopReleaseError";
    this.code = code;
  }
}

function normalizeOutput(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getTarget(platform) {
  if (platform === "darwin") {
    return { builderArg: "--mac", metadataFile: "latest-mac.yml", label: "macOS" };
  }
  if (platform === "win32") {
    return { builderArg: "--win", metadataFile: "latest.yml", label: "Windows" };
  }
  throw new DesktopReleaseError(
    "一键发布目前仅支持在 macOS 或 Windows 开发机上构建对应平台安装包。",
    "UNSUPPORTED_PLATFORM",
  );
}

function getTokenFromEnvironment(environment) {
  for (const name of ["GITHUB_RELEASE_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"]) {
    const value = environment?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function createDesktopReleasePublisher({
  appDirectory,
  environment = process.env,
  exec = execFile,
  fileSystem = fs,
  platform = process.platform,
  log = () => {},
} = {}) {
  if (typeof appDirectory !== "string" || !appDirectory) {
    throw new TypeError("createDesktopReleasePublisher requires appDirectory.");
  }
  if (typeof exec !== "function") {
    throw new TypeError("createDesktopReleasePublisher requires exec.");
  }

  async function run(command, args, options = {}) {
    try {
      const result = await exec(command, args, {
        cwd: options.cwd ?? appDirectory,
        encoding: "utf8",
        env: options.env ?? environment,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      });
      return normalizeOutput(result?.stdout);
    } catch (cause) {
      const detail = normalizeOutput(cause?.stderr) || normalizeOutput(cause?.message);
      throw new DesktopReleaseError(
        detail ? `发布步骤失败：${detail}` : "发布步骤失败，请检查构建环境与 GitHub 授权。",
        "RELEASE_COMMAND_FAILED",
      );
    }
  }

  async function resolvePublishToken() {
    const token = getTokenFromEnvironment(environment);
    if (token) return token;

    try {
      const fromGh = await run("gh", ["auth", "token", "--hostname", "github.com"]);
      if (fromGh) return fromGh;
    } catch {
      // 统一在下方给出不包含认证细节的可操作错误，不回显命令输出或凭据。
    }
    throw new DesktopReleaseError(
      "未找到 GitHub 发布凭据。请先在本机完成 GitHub CLI 登录，或仅在启动开发桌面端的环境中设置 GH_TOKEN。",
      "GITHUB_TOKEN_UNAVAILABLE",
    );
  }

  async function inspectReadiness() {
    const target = getTarget(platform);
    const repositoryRoot = await run("git", ["rev-parse", "--show-toplevel"]);
    const appRelativePath = path.relative(repositoryRoot, appDirectory);
    if (!appRelativePath || appRelativePath.startsWith("..") || path.isAbsolute(appRelativePath)) {
      throw new DesktopReleaseError("应用目录不在当前 Git 工作树内，已停止发布。", "UNSAFE_REPOSITORY_LAYOUT");
    }

    const branch = await run("git", ["branch", "--show-current"]);
    if (!branch) {
      throw new DesktopReleaseError("当前不在可发布的本地分支上，已停止构建。", "DETACHED_HEAD");
    }

    const packageFile = path.join(appDirectory, "package.json");
    let version;
    try {
      const manifest = JSON.parse(await fileSystem.readFile(packageFile, "utf8"));
      version = manifest.version;
    } catch {
      throw new DesktopReleaseError("无法读取 package.json 版本号，已停止发布。", "VERSION_UNAVAILABLE");
    }
    if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new DesktopReleaseError("应用版本必须是三段语义版本号，例如 1.0.1。", "INVALID_VERSION");
    }

    // 已推送的代码才可成为 Release，以免安装包与 GitHub 源码版本不一致。
    await run("git", ["fetch", "--prune", "origin"]);
    const [localHead, remoteHead] = await Promise.all([
      run("git", ["rev-parse", "HEAD"]),
      run("git", ["rev-parse", `origin/${branch}`]),
    ]);
    if (!localHead || localHead !== remoteHead) {
      throw new DesktopReleaseError(
        "当前代码尚未与 GitHub 当前分支完全同步。请先点击“同步并推送”，再发布桌面版本。",
        "SOURCE_NOT_PUSHED",
      );
    }

    return {
      appRelativePath,
      branch,
      repositoryRoot,
      target,
      version,
    };
  }

  async function publish({ checkOnly = false } = {}) {
    const readiness = await inspectReadiness();
    const token = await resolvePublishToken();
    if (checkOnly) {
      return { ...readiness, ready: true };
    }

    const releaseEnvironment = {
      ...environment,
      // electron-builder 官方优先读取此变量；token 不写入项目文件、不回传 renderer。
      GITHUB_RELEASE_TOKEN: token,
    };
    const npmCommand = platform === "win32" ? "npm.cmd" : "npm";
    const builderCommand = path.join(appDirectory, "node_modules", ".bin", "electron-builder");

    log("desktop-release:build-start", { branch: readiness.branch, version: readiness.version });
    await run(npmCommand, ["run", "build"], { env: releaseEnvironment });
    await run(npmCommand, ["run", "desktop:assemble"], { env: releaseEnvironment });
    await run(builderCommand, [readiness.target.builderArg, "--publish", "always"], {
      env: releaseEnvironment,
    });

    const metadataPath = path.join(appDirectory, "release", readiness.target.metadataFile);
    let metadata;
    try {
      metadata = await fileSystem.readFile(metadataPath, "utf8");
    } catch {
      throw new DesktopReleaseError(
        `构建完成后未生成 ${readiness.target.metadataFile}，无法确认 App 自动更新元数据。`,
        "UPDATE_METADATA_MISSING",
      );
    }
    if (!metadata.includes(`version: ${readiness.version}`)) {
      throw new DesktopReleaseError(
        `${readiness.target.metadataFile} 的版本与 package.json 不一致，已停止确认发布结果。`,
        "UPDATE_METADATA_VERSION_MISMATCH",
      );
    }

    log("desktop-release:complete", { branch: readiness.branch, version: readiness.version });
    return {
      ...readiness,
      metadataPath,
      published: true,
      releaseTag: `v${readiness.version}`,
    };
  }

  return Object.freeze({ inspectReadiness, publish });
}

module.exports = {
  DesktopReleaseError,
  createDesktopReleasePublisher,
  getTarget,
  getTokenFromEnvironment,
};
