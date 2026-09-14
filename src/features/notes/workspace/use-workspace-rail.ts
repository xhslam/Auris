"use client";

/**
 * Workspace Rail 的数据与动作。
 *
 * 对齐 vmark 的职责划分：rail 组件只管渲染与手势，"什么是一个工作区实例"、
 * "切换意味着什么" 在这里。
 *
 * 与 vmark 最重要的一处差异，也是这个 hook 存在的理由：
 *
 * **auris 不需要自己 stash/restore 工作区状态。** vmark 的
 * `switchWorkspaceInstance` 有一条很长的 stash→activate→restore 流水线，因为
 * 它的工作区状态散在窗口作用域的 tab store / pane store / closed-tab scopes
 * 里，切换时必须手工搬运。auris 的 `useWorkspacePersistence(vaultRoot)` 已经
 * 按 vaultRoot 分键持久化整份 `NotesWorkspaceState`（hot-exit + localStorage），
 * 并在 root 变化时自动重新 hydrate。所以这里只做一件事：让主进程换根。
 * 工作区状态的恢复是既有机制的自然结果，不是这个 hook 的工作。
 *
 * 自己再存一份就会得到同一事实的两个来源：切换瞬间 store 和 hot-exit 都声称
 * 持有"root X 的工作区状态"，此后必然发散。
 *
 * @module features/notes/workspace/use-workspace-rail
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";
import type { DesktopVaultRoot } from "@/platform/desktop/desktop-bridge";
import {
  createWorkspaceInstance,
  createWorkspaceRootIdentity,
  disambiguateWorkspaceDisplayNames,
} from "@/features/notes/workspace/workspace-identity";
import { workspaceRailGlyphs } from "@/features/notes/workspace/workspace-rail-glyphs";
import {
  selectOrderedInstances,
  useWorkspaceInstancesStore,
  type WorkspaceInstanceRecord,
} from "@/features/notes/workspace/workspace-instances-store";

/** 一个 rail 条目：实例身份 + 渲染所需的派生信息。 */
export type WorkspaceRailEntry = {
  /** 当前根是否可达。不可达时条目仍显示，但点击会被拒绝。 */
  available: boolean;
  displayName: string;
  glyph: string | null;
  instance: WorkspaceInstanceRecord;
  isActive: boolean;
};

export type WorkspaceRailState = {
  /** 主进程 vault bridge 是否提供换根能力（非桌面环境为 false）。 */
  canSwitch: boolean;
  closeEntry: (instanceId: string) => void;
  entries: WorkspaceRailEntry[];
  error: string | null;
  isSwitching: boolean;
  /** 打开原生选择器新增一个根。新根只能这样进来——见 `vault-roots.cjs`。 */
  addRoot: () => Promise<void>;
  refresh: () => Promise<void>;
  reorder: (sourceId: string, targetId: string) => void;
  switchTo: (instanceId: string) => Promise<void>;
};

function getVaultBridge() {
  return getDesktopBridge()?.vault ?? null;
}

/** 两个记录在 rail 关心的字段上是否等价。 */
function isSameInstanceRecord(
  current: WorkspaceInstanceRecord | undefined,
  next: WorkspaceInstanceRecord,
): boolean {
  return (
    current !== undefined &&
    current.displayName === next.displayName &&
    current.kind === next.kind &&
    current.rootId === next.rootId &&
    current.rootPath === next.rootPath &&
    (current.unavailableRoot ?? false) === (next.unavailableRoot ?? false)
  );
}

/**
 * 由主进程报的已知根构建实例集合。
 *
 * 实例 id 直接用 rootId（`path:<platform>:<identity>`）而不是随机 UUID：
 * 单窗口下一个根最多对应一个实例，用 rootId 作 id 让"同一个根"跨会话稳定，
 * 也让 reorder 的持久化天然按根对齐。vmark 用随机 UUID 是因为它允许同一个根
 * 在不同窗口各开一个实例，那时 id 必须与根解耦。
 */
function buildInstancesFromRoots(roots: DesktopVaultRoot[]) {
  const instances: WorkspaceInstanceRecord[] = [];
  const availability = new Map<string, boolean>();
  let activeId: string | null = null;

  for (const root of roots) {
    const identity = createWorkspaceRootIdentity(root.path, {
      displayName: root.name || undefined,
    });

    if (!identity.ok) continue;

    const instance = createWorkspaceInstance({
      createdFrom: "restore",
      root: identity.root,
      workspaceInstanceId: identity.root.rootId,
      // 主进程已经检查过可达性，这里如实带上，让 rail 能显示"不可用"而不是
      // 假装可以切过去。
      ...(root.available ? {} : { unavailableRoot: true }),
    });

    instances.push(instance);
    availability.set(instance.workspaceInstanceId, root.available);

    if (root.isActive) {
      activeId = instance.workspaceInstanceId;
    }
  }

  return { activeId, availability, instances };
}

export function useWorkspaceRail(): WorkspaceRailState {
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [canSwitch, setCanSwitch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  const activeId = useWorkspaceInstancesStore(
    (state) => state.activeWorkspaceInstanceId,
  );
  // `useShallow` 是必须的，不是优化：`selectOrderedInstances` 每次调用都 map 出
  // 一个新数组，而 zustand v5 的 `useStore` 不再做浅比较，直接传会让
  // `useSyncExternalStore` 判定"快照每次都变"并无限重渲染（React 报
  // "The result of getSnapshot should be cached" 然后 Maximum update depth）。
  const instances = useWorkspaceInstancesStore(useShallow(selectOrderedInstances));

  const refresh = useCallback(async () => {
    const bridge = getVaultBridge();

    if (!bridge?.listRoots || !bridge.setRoot) {
      setCanSwitch(false);
      return;
    }

    setCanSwitch(true);

    try {
      const roots = await bridge.listRoots();
      const built = buildInstancesFromRoots(roots);
      const store = useWorkspaceInstancesStore.getState();

      // 主进程是已知根的唯一权威：它不再报的根要从 rail 上消失，否则会留下一个
      // 点了必然失败的条目。
      const nextIds = new Set(
        built.instances.map((instance) => instance.workspaceInstanceId),
      );
      for (const existing of store.workspaceInstanceIds) {
        if (!nextIds.has(existing)) {
          store.removeWorkspaceInstance(existing);
        }
      }

      for (const instance of built.instances) {
        // 只在真的变了才写。每次 vault:changed 都无条件覆盖会给每个实例换一个新
        // 对象引用，让所有订阅者白重渲染一遍（浅比较逐元素比的是引用）。
        if (!isSameInstanceRecord(store.instances[instance.workspaceInstanceId], instance)) {
          store.addWorkspaceInstance(instance);
        }
      }

      if (built.activeId) {
        store.activateWorkspaceInstance(built.activeId);
      }

      setAvailability(Object.fromEntries(built.availability));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取已知工作区。");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 主进程换根后会广播 vault:changed；rail 跟着它刷新，而不是自己轮询。
  useEffect(() => {
    const bridge = getVaultBridge();
    if (!bridge) return undefined;

    return bridge.onDidChange(() => {
      void refresh();
    });
  }, [refresh]);

  const switchTo = useCallback(
    async (instanceId: string) => {
      const bridge = getVaultBridge();
      if (!bridge?.setRoot) return;

      const store = useWorkspaceInstancesStore.getState();
      const instance = store.instances[instanceId];

      // 已经是当前工作区 → 严格无操作。重复换根会让主进程重启 watcher 并广播
      // 一次 vault:changed，把整个文档快照白重载一遍。
      if (!instance?.rootPath || instanceId === store.activeWorkspaceInstanceId) {
        return;
      }

      setIsSwitching(true);
      try {
        await bridge.setRoot(instance.rootPath);
        // 不在这里 activate：主进程成功后会广播 vault:changed，refresh() 会用
        // 主进程报的 isActive 来激活。自己抢先 activate 会在 setRoot 失败时留下
        // 一个与真实 vault 不一致的高亮。
        setError(null);
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "无法切换到这个工作区。";
        setError(message);
        // 失败往往是根暂时不可达，标记它让 rail 如实显示。
        store.setInstanceUnavailableRoot(instanceId, true);
        setAvailability((current) => ({ ...current, [instanceId]: false }));
      } finally {
        setIsSwitching(false);
      }
    },
    [],
  );

  const addRoot = useCallback(async () => {
    const bridge = getVaultBridge();
    if (!bridge?.pickDirectory) return;

    try {
      await bridge.pickDirectory();
      // pickDirectory 已经换了根并广播 vault:changed，refresh 会跟上；这里再显式
      // 刷一次以覆盖「用户选了当前根」（主进程不发变更事件）的情况。
      await refresh();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法添加工作区。");
    }
  }, [refresh]);

  const closeEntry = useCallback((instanceId: string) => {
    // 只从 rail 上移除，不动磁盘、不动主进程的已知根列表：这是「从列表里收起」
    // 而不是「删除这个文件夹」。下次 refresh 时主进程仍会报它，条目会回来——
    // 这一点在菜单文案里写明，避免用户以为自己删掉了什么。
    useWorkspaceInstancesStore.getState().removeWorkspaceInstance(instanceId);
  }, []);

  const reorder = useCallback((sourceId: string, targetId: string) => {
    const store = useWorkspaceInstancesStore.getState();
    const current = store.workspaceInstanceIds;
    const fromIndex = current.indexOf(sourceId);
    const toIndex = current.indexOf(targetId);

    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    store.reorderWorkspaceInstances(next);
  }, []);

  const entries = useMemo<WorkspaceRailEntry[]>(() => {
    const labels = disambiguateWorkspaceDisplayNames(instances);
    const glyphs = workspaceRailGlyphs(
      instances.map((instance) => ({
        displayName: labels[instance.workspaceInstanceId] ?? instance.displayName,
        kind: instance.kind,
        workspaceInstanceId: instance.workspaceInstanceId,
      })),
    );

    return instances.map((instance) => ({
      available:
        availability[instance.workspaceInstanceId] ?? !instance.unavailableRoot,
      displayName: labels[instance.workspaceInstanceId] ?? instance.displayName,
      glyph: glyphs[instance.workspaceInstanceId] ?? null,
      instance,
      isActive: instance.workspaceInstanceId === activeId,
    }));
  }, [activeId, availability, instances]);

  return {
    addRoot,
    canSwitch,
    closeEntry,
    entries,
    error,
    isSwitching,
    refresh,
    reorder,
    switchTo,
  };
}
