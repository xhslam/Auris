/**
 * 工作区实例身份。
 *
 * 移植 vmark `src/utils/workspaceIdentity.ts` 中与 rail 相关的那部分：
 * root 身份、实例身份、kind/root 不变量、同名消歧。
 *
 * 两处按 auris 现实裁掉的东西，都不是"图省事"：
 *
 * - **没有 trust level**。vmark 的 `trustLevel` 服务于它的 task runner：受信
 *   工作区才允许跑工作区里定义的任务。auris 没有"从 vault 里读取并执行任务
 *   定义"这条路径，引入一个不控制任何能力的信任开关，只会让用户以为自己在
 *   做安全决策。真要有可执行能力时再加，那时它才有意义。
 * - **没有 `ownerWindowLabel`**。vmark 的 rail 是「单窗口多工作区 + 多窗口」
 *   两层模型，实例要记住自己属于哪个窗口。auris 主进程是 `mainWindow` 单例
 *   （`focusExistingWindow()` 复用已有窗口），没有第二个窗口可归属，这个字段
 *   会恒等于同一个常量。相应地也没有 move/duplicate-to-new-window。
 *
 * 纯函数：不碰 store、不碰文件系统。
 *
 * @module features/notes/workspace/workspace-identity
 */

import {
  deriveWorkspaceDisplayName,
  detectWorkspacePlatform,
  normalizeWorkspacePathForIdentity,
  type WorkspacePlatform,
} from "@/features/notes/workspace/workspace-identity-paths";

export type { WorkspacePlatform } from "@/features/notes/workspace/workspace-identity-paths";
export { normalizeWorkspacePathForIdentity } from "@/features/notes/workspace/workspace-identity-paths";

/**
 * 实例的来源。
 *
 * 对齐 vmark `WorkspaceInstanceCreatedFrom`，去掉 `dragOut`（跨窗口拖出，
 * 单窗口下不存在）。
 */
export type WorkspaceInstanceCreatedFrom =
  | "open"
  | "finderOpen"
  | "duplicate"
  | "restore"
  | "placeholder";

export type WorkspaceInstanceKind = "workspace" | "loose" | "placeholder";

export type WorkspaceRootIdentity = {
  canonicalization: "canonical" | "fallback";
  displayName: string;
  platformIdentity: string;
  rootId: string;
  rootPath: string;
};

export type WorkspaceRootIdentityResult =
  | { ok: true; root: WorkspaceRootIdentity }
  | { ok: false; error: "emptyRootPath" };

/**
 * rail 条目的身份。
 *
 * 刻意**不**包含 activePath / openPaths。vmark 的实例记录里带着 tab 归属，
 * 因为它的工作区状态散在窗口作用域的 tab/pane store 里、没有按 root 的持久化，
 * 所以切换时必须自己 stash 一份。auris 已经按 vaultRoot 分键持久化整份
 * `NotesWorkspaceState`（hot-exit + localStorage，见 `useWorkspacePersistence`），
 * 并在 root 变化时自动重新 hydrate。在这里再存一份就是同一份事实的第二个来源，
 * 而且是会打架的那种：切换瞬间两边都声称持有「root X 的工作区状态」。
 *
 * 所以这个类型只保留 auris 没有的东西：rail 的顺序、身份和可用性。
 */
export type WorkspaceInstanceIdentity = {
  createdFrom: WorkspaceInstanceCreatedFrom;
  /**
   * 人类可读名。真实工作区是根目录名；合成实例（loose/placeholder）这里只是
   * 英文兜底，渲染处应优先用 `displayNameKey`。
   */
  displayName: string;
  /**
   * 合成实例的文案 key。真实工作区没有这个字段（它的 displayName 是真的
   * 路径派生名）。让渲染层翻译"游离文件"/"未命名"，而不是显示存下来的英文。
   */
  displayNameKey?: string;
  kind: WorkspaceInstanceKind;
  rootId: string | null;
  rootPath: string | null;
  /** 根目录当前不可达（外置盘拔了、目录被删）。 */
  unavailableRoot?: boolean;
  workspaceInstanceId: string;
};

/** 合成实例显示名的文案 key，在渲染时翻译。 */
const WORKSPACE_INSTANCE_DISPLAY_NAME_KEYS = {
  loose: "workspaceRail.looseFiles",
  placeholder: "workspaceRail.untitled",
} as const;

export function generateWorkspaceUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createWorkspaceRootIdentity(
  rawPath: string | null,
  options: {
    canonicalPath?: string | null;
    displayName?: string;
    platform?: WorkspacePlatform;
  } = {},
): WorkspaceRootIdentityResult {
  if (rawPath === null || rawPath === undefined || rawPath.trim() === "") {
    return { error: "emptyRootPath", ok: false };
  }

  const platform = options.platform ?? detectWorkspacePlatform();
  const requested = normalizeWorkspacePathForIdentity(rawPath, platform);

  // 只用 trim 判断 canonical 是否为空；真正参与归一的是未 trim 的原值，
  // 这样 canonical 路径里合法的首尾空格不会被抹掉、也就不会折叠两个身份。
  const rawCanonical = options.canonicalPath;
  const hasCanonical = rawCanonical !== null && rawCanonical !== undefined && rawCanonical.trim() !== "";
  const identity = hasCanonical
    ? normalizeWorkspacePathForIdentity(rawCanonical, platform)
    : requested;

  return {
    ok: true,
    root: {
      canonicalization: hasCanonical ? "canonical" : "fallback",
      displayName:
        options.displayName ??
        deriveWorkspaceDisplayName(requested.normalizedPath, platform),
      platformIdentity: identity.platformIdentity,
      rootId: `path:${platform}:${identity.platformIdentity}`,
      rootPath: requested.normalizedPath,
    },
  };
}

/**
 * 强制 kind/root 不变量，让非法实例构造不出来：
 * - `workspace` 必须有 root
 * - `loose` / `placeholder` 必须没有 root
 *
 * 违反是程序错误而不是用户输入，所以在构造边界直接抛（对齐 vmark T216）。
 */
function assertKindRootInvariant(
  kind: WorkspaceInstanceKind,
  root: WorkspaceRootIdentity | null,
): void {
  if (kind === "workspace" && !root) {
    throw new Error("createWorkspaceInstance: kind 'workspace' requires a root");
  }
  if (kind !== "workspace" && root) {
    throw new Error(`createWorkspaceInstance: kind '${kind}' must not have a root`);
  }
}

function inferWorkspaceInstanceKind(
  root: WorkspaceRootIdentity | null,
  createdFrom: WorkspaceInstanceCreatedFrom,
): WorkspaceInstanceKind {
  if (root) return "workspace";
  return createdFrom === "placeholder" ? "placeholder" : "loose";
}

function workspaceInstanceDisplayName(
  kind: WorkspaceInstanceKind,
  root: WorkspaceRootIdentity | null,
): string {
  if (root) return root.displayName;
  return kind === "loose" ? "Loose Files" : "Untitled";
}

export function createWorkspaceInstance(options: {
  createdFrom: WorkspaceInstanceCreatedFrom;
  displayName?: string;
  kind?: WorkspaceInstanceKind;
  root: WorkspaceRootIdentity | null;
  unavailableRoot?: boolean;
  workspaceInstanceId: string;
}): WorkspaceInstanceIdentity {
  const kind =
    options.kind ?? inferWorkspaceInstanceKind(options.root, options.createdFrom);
  assertKindRootInvariant(kind, options.root);

  const displayNameKey = options.root
    ? undefined
    : WORKSPACE_INSTANCE_DISPLAY_NAME_KEYS[kind as "loose" | "placeholder"];

  return {
    createdFrom: options.createdFrom,
    displayName:
      options.displayName ?? workspaceInstanceDisplayName(kind, options.root),
    kind,
    rootId: options.root?.rootId ?? null,
    rootPath: options.root?.rootPath ?? null,
    workspaceInstanceId: options.workspaceInstanceId,
    // 两个 key 都是「缺省」而不是写成 undefined：rail 的约定是
    // 「displayNameKey 存在时优先用它」，而根目录正常的实例本来就没有
    // unavailableRoot 这个断言要做。
    ...(displayNameKey === undefined ? {} : { displayNameKey }),
    ...(options.unavailableRoot === undefined
      ? {}
      : { unavailableRoot: options.unavailableRoot }),
  };
}

/**
 * 同名消歧。两个都叫 `notes` 的根目录会显示成 `notes` 与 `notes 2`。
 *
 * 逐条对齐 vmark：按传入顺序编号，第一个保持原名。顺序即语义，所以调用方
 * 必须按 rail 的显示顺序传入。
 */
export function disambiguateWorkspaceDisplayNames(
  instances: Array<{
    displayName: string;
    rootId: string | null;
    workspaceInstanceId: string;
  }>,
): Record<string, string> {
  const seen = new Map<string, number>();
  const result: Record<string, string> = {};

  for (const instance of instances) {
    const count = seen.get(instance.displayName) ?? 0;
    const next = count + 1;
    seen.set(instance.displayName, next);
    result[instance.workspaceInstanceId] =
      count === 0 ? instance.displayName : `${instance.displayName} ${next}`;
  }

  return result;
}
