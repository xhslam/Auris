"use client";

/**
 * 工作区实例 store（单窗口）。
 *
 * 移植 vmark `src/stores/workspaceInstancesStore.ts` + 其 `helpers.ts` 的状态
 * 机：placeholder/loose 的生命周期、添加真实实例时顶掉 placeholder、reorder
 * 去重、移除后的激活回退。
 *
 * 与 vmark 的三处结构差异，都是壳差异而不是省略：
 *
 * 1. **没有 `windows` 这一层**。vmark 的状态是
 *    `windows[windowLabel] → { workspaceInstanceIds, activeWorkspaceInstanceId }`，
 *    因为它能开多个 Tauri 窗口，实例要记住自己归属哪个窗口。auris 主进程是
 *    `mainWindow` 单例（`createMainWindow()` 先做 `focusExistingWindow()`），
 *    第二个窗口创建不出来。保留 `windows` 只会得到一个恒定单 key 的 Map 和一堆
 *    走不到的跨窗口分支。
 *
 * 2. **不 stash 工作区状态**。这是移植时最容易做错的一处。vmark 切换工作区要
 *    自己 stash「tab 归属 + pane 布局 + per-scope 的 reopen 栈」，因为它的这些
 *    状态活在窗口作用域的 store 里，没有按工作区根持久化的地方。auris 有：
 *    `useWorkspacePersistence(vaultRoot)` 已经把整份 `NotesWorkspaceState` 按
 *    vaultRoot 存进 hot-exit（`captureNotesHotExitWorkspace`），并在 root 变化
 *    时重新 hydrate。如果这里再存一份，就有两个都声称持有「root X 的工作区
 *    状态」的来源，切换时必然发散——而且发散的表现是「切回去发现打开的标签
 *    不对」，很难查。所以 store 只持有 auris 没有的那部分：rail 的条目顺序、
 *    身份和激活项。
 *
 * 3. **没有 move/duplicate 到新窗口**。同 1：没有第二个窗口。右键菜单因此只有
 *    「关闭」，不放点了不会发生任何事的按钮。
 *
 * @module features/notes/workspace/workspace-instances-store
 */

import { create } from "zustand";
import {
  createWorkspaceInstance,
  generateWorkspaceUuid,
  type WorkspaceInstanceIdentity,
} from "@/features/notes/workspace/workspace-identity";

export type WorkspaceInstanceRecord = WorkspaceInstanceIdentity;

type WorkspaceInstancesState = {
  activeWorkspaceInstanceId: string | null;
  instances: Record<string, WorkspaceInstanceRecord>;
  workspaceInstanceIds: string[];
};

type WorkspaceInstancesActions = {
  activateWorkspaceInstance: (instanceId: string) => void;
  addWorkspaceInstance: (instance: WorkspaceInstanceRecord) => void;
  ensureLooseInstance: (instanceId?: string) => WorkspaceInstanceRecord;
  ensurePlaceholderInstance: (placeholderId: string) => void;
  removeWorkspaceInstance: (instanceId: string) => void;
  reorderWorkspaceInstances: (orderedIds: string[]) => void;
  resetWorkspaceInstances: () => void;
  setInstanceUnavailableRoot: (instanceId: string, unavailable: boolean) => void;
};

const initialState: WorkspaceInstancesState = {
  activeWorkspaceInstanceId: null,
  instances: {},
  workspaceInstanceIds: [],
};

/** 去重，保持首次出现顺序。移植 vmark `helpers.ts#uniqueIds`。 */
export function uniqueWorkspaceIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

export const useWorkspaceInstancesStore = create<
  WorkspaceInstancesState & WorkspaceInstancesActions
>()((set, get) => ({
  ...initialState,

  activateWorkspaceInstance: (instanceId) =>
    set((state) =>
      // 未登记的 id 是无操作，不是「激活一个不存在的工作区」。
      state.workspaceInstanceIds.includes(instanceId)
        ? { activeWorkspaceInstanceId: instanceId }
        : {},
    ),

  addWorkspaceInstance: (instance) =>
    set((state) => {
      const id = instance.workspaceInstanceId;
      const isReal = instance.kind !== "placeholder";

      // 真实实例进来时顶掉所有 placeholder：placeholder 的全部意义就是
      // 「还没有任何工作区」，一旦有了就不该继续占位。
      const placeholderIds = isReal
        ? state.workspaceInstanceIds.filter(
            (candidate) => state.instances[candidate]?.kind === "placeholder",
          )
        : [];

      const remaining = state.workspaceInstanceIds.filter(
        (candidate) => !placeholderIds.includes(candidate),
      );
      const nextIds = remaining.includes(id) ? remaining : [...remaining, id];

      const nextInstances = { ...state.instances, [id]: instance };
      for (const placeholderId of placeholderIds) {
        delete nextInstances[placeholderId];
      }

      return {
        activeWorkspaceInstanceId: nextIds.includes(
          state.activeWorkspaceInstanceId ?? "",
        )
          ? state.activeWorkspaceInstanceId
          : id,
        instances: nextInstances,
        workspaceInstanceIds: nextIds,
      };
    }),

  ensureLooseInstance: (instanceId) => {
    const existingId = get().workspaceInstanceIds.find(
      (id) => get().instances[id]?.kind === "loose",
    );

    if (existingId) {
      return get().instances[existingId];
    }

    const looseId = instanceId ?? `wsi-loose-${generateWorkspaceUuid()}`;
    const loose = createWorkspaceInstance({
      createdFrom: "open",
      kind: "loose",
      root: null,
      workspaceInstanceId: looseId,
    });

    get().addWorkspaceInstance(loose);
    return loose;
  },

  ensurePlaceholderInstance: (placeholderId) =>
    set((state) => {
      // 只在完全空的时候占位。已经有实例还插 placeholder，会在 rail 上多出一个
      // 点不开的空格子。
      if (state.workspaceInstanceIds.length > 0) return {};

      const placeholder = createWorkspaceInstance({
        createdFrom: "placeholder",
        kind: "placeholder",
        root: null,
        workspaceInstanceId: placeholderId,
      });

      return {
        activeWorkspaceInstanceId: placeholderId,
        instances: { ...state.instances, [placeholderId]: placeholder },
        workspaceInstanceIds: [placeholderId],
      };
    }),

  removeWorkspaceInstance: (instanceId) =>
    set((state) => {
      if (!state.workspaceInstanceIds.includes(instanceId)) return {};

      const nextIds = state.workspaceInstanceIds.filter((id) => id !== instanceId);
      // 显式重建而不是 destructure-to-omit：后者要声明一个立刻被丢弃的绑定，
      // 而这个仓库的 lint 是 `--max-warnings=0` 且没有配 varsIgnorePattern，
      // 所以 `_removed` 这种写法在这里不是合法约定。
      const instances = Object.fromEntries(
        nextIds.map((id) => [id, state.instances[id]]),
      ) as Record<string, WorkspaceInstanceRecord>;

      return {
        activeWorkspaceInstanceId:
          state.activeWorkspaceInstanceId === instanceId
            ? (nextIds[0] ?? null)
            : state.activeWorkspaceInstanceId,
        instances,
        workspaceInstanceIds: nextIds,
      };
    }),

  reorderWorkspaceInstances: (orderedIds) =>
    set((state) => {
      // 先去重：orderedIds 里重复的 id 否则会通过 filter 存活，让同一个实例
      // 在 rail 上出现两次。
      const ordered = uniqueWorkspaceIds(orderedIds).filter((id) =>
        state.workspaceInstanceIds.includes(id),
      );
      const omitted = state.workspaceInstanceIds.filter(
        (id) => !ordered.includes(id),
      );
      const nextIds = [...ordered, ...omitted];

      return {
        activeWorkspaceInstanceId: nextIds.includes(
          state.activeWorkspaceInstanceId ?? "",
        )
          ? state.activeWorkspaceInstanceId
          : (nextIds[0] ?? null),
        workspaceInstanceIds: nextIds,
      };
    }),

  resetWorkspaceInstances: () => set({ ...initialState }),

  setInstanceUnavailableRoot: (instanceId, unavailable) =>
    set((state) => {
      const instance = state.instances[instanceId];
      if (!instance) return {};

      return {
        instances: {
          ...state.instances,
          [instanceId]: { ...instance, unavailableRoot: unavailable },
        },
      };
    }),
}));

/** 仅供测试重置。 */
export function __resetWorkspaceInstancesForTests() {
  useWorkspaceInstancesStore.setState({ ...initialState });
}

/** rail 的显示顺序：按 `workspaceInstanceIds`，过滤掉已被移除的悬空 id。 */
export function selectOrderedInstances(
  state: WorkspaceInstancesState,
): WorkspaceInstanceRecord[] {
  return state.workspaceInstanceIds
    .map((id) => state.instances[id])
    .filter((instance): instance is WorkspaceInstanceRecord => instance !== undefined);
}
