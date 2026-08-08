/**
 * 工作区根路径归一化与显示名推导。
 *
 * 逐条移植 vmark `src/utils/workspaceIdentityPaths.ts`，包括它那两条容易被
 * "顺手优化"掉的关键决定：
 *
 * 1. **POSIX 路径不 trim**。macOS/Linux 的路径段可以合法地带首尾空格，
 *    `/Users/me/Repo` 与 `/Users/me/Repo ` 是两个不同目录。trim 会把它们
 *    折叠成同一个身份，于是两个工作区抢同一份状态。空白校验放在
 *    `createWorkspaceRootIdentity`（唯一拒绝空路径的调用点）。
 * 2. **Windows 才做大小写归一**。盘符大写、分隔符统一、UNC 前缀保留，
 *    `platformIdentity` 用 `toLocaleLowerCase("en-US")` 固定 locale——否则
 *    土耳其语环境下 `I` 会变成 `ı`，同一个盘符算出两个身份。
 *
 * 纯函数，不碰文件系统，所以这些边界可以直接单测。
 *
 * @module features/notes/workspace/workspace-identity-paths
 */

export type WorkspacePlatform = "macos" | "windows" | "linux";

export type WorkspacePathIdentity = {
  normalizedPath: string;
  platformIdentity: string;
};

function stripTrailingPosixSeparator(value: string): string {
  if (value === "/") return value;
  return value.replace(/\/+$/, "");
}

function stripTrailingWindowsSeparator(value: string): string {
  if (/^[A-Z]:\\?$/i.test(value)) {
    return value.endsWith("\\") ? value : `${value}\\`;
  }
  return value.replace(/\\+$/, "");
}

export function normalizeWorkspacePathForIdentity(
  rawPath: string,
  platform: WorkspacePlatform,
): WorkspacePathIdentity {
  // 见文件头第 1 条：这里刻意不 trim。
  const input = rawPath;

  if (platform === "windows") {
    const usesUnc = input.replace(/\//g, "\\").startsWith("\\\\");
    let normalizedPath = input.replace(/\//g, "\\").replace(/\\+/g, "\\");

    if (usesUnc && !normalizedPath.startsWith("\\\\")) {
      normalizedPath = `\\${normalizedPath}`;
    }

    normalizedPath = normalizedPath.replace(
      /^([a-zA-Z]):/,
      (_match, drive: string) => `${drive.toUpperCase()}:`,
    );
    normalizedPath = stripTrailingWindowsSeparator(normalizedPath);

    return {
      normalizedPath,
      platformIdentity: normalizedPath.toLocaleLowerCase("en-US"),
    };
  }

  const normalizedPath = stripTrailingPosixSeparator(input.replace(/\/+/g, "/"));
  return { normalizedPath, platformIdentity: normalizedPath };
}

export function deriveWorkspaceDisplayName(
  value: string,
  platform: WorkspacePlatform,
): string {
  if (platform === "windows") {
    if (/^[A-Z]:\\$/i.test(value)) return value;
    return value.split("\\").filter(Boolean).at(-1) ?? value;
  }

  if (value === "/") return value;
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

/** 当前运行平台 → vmark 的平台枚举。 */
export function detectWorkspacePlatform(
  platform: string = typeof process === "undefined" ? "darwin" : process.platform,
): WorkspacePlatform {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  return "linux";
}
