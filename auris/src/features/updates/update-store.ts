"use client";

/**
 * 更新状态 store（renderer）。
 *
 * 对齐 vmark `src/stores/mcpStore.ts` 的 update slice：同一组 status /
 * updateInfo / downloadProgress / error / dismissed 字段与迁移语义。
 *
 * 与 vmark 的两处结构差异，都是壳差异而不是省略：
 *
 * 1. **没有 `pendingUpdate`**。vmark 存的是 Tauri 的 `Update` JS resource——
 *    窗口内对象、跨不了窗口，所以它必须让每个窗口各自 check/download 并做双向
 *    广播 + 回声抑制（`useUpdateSync`）。Electron 的 autoUpdater 是主进程单例，
 *    renderer 只消费快照，因此 `pendingUpdate` 和 `useUpdateSync` 在这里都没有
 *    对应物。
 * 2. **快照是一个稳定对象**。zustand v5 的 `useStore` 不再做浅比较，选择器每次
 *    返回新对象会无限重渲染。所以状态字段收在 `snapshot` 里整体替换，
 *    `selectUpdateSnapshot` 只做一次属性读取，引用天然稳定。
 */

import { create } from "zustand";
import type {
  DesktopUpdateSnapshot,
  DesktopUpdateStatus,
} from "@/platform/desktop/desktop-bridge";

export type UpdateStatus = DesktopUpdateStatus;

export type UpdateInfo = {
  currentVersion: string;
  notes: string;
  pubDate: string;
  version: string;
};

export type UpdateDownloadProgress = {
  downloaded: number;
  total: number | null;
};

/** renderer 持有的状态快照。整体替换，引用稳定。 */
export type UpdateSnapshot = {
  canInstallInPlace: boolean;
  downloadProgress: UpdateDownloadProgress | null;
  error: string | null;
  errorCode: string | null;
  lastCheckedAt: number | null;
  releasesUrl: string | null;
  status: UpdateStatus;
  stalledOperation: "check" | "download" | null;
  supported: boolean;
  updateInfo: UpdateInfo | null;
};

type UpdateState = {
  /** 主进程 updates bridge 是否可用（非桌面环境为 false）。 */
  available: boolean;
  /** 当前运行版本，来自主进程 `app.getVersion()`。 */
  currentVersion: string | null;
  /** 用户跳过当前版本后置为 true，UI 收起卡片。 */
  dismissed: boolean;
  snapshot: UpdateSnapshot;
};

type UpdateActions = {
  applySnapshot: (snapshot: DesktopUpdateSnapshot) => void;
  clearDismissed: () => void;
  dismiss: () => void;
  reset: () => void;
  setAvailable: (available: boolean) => void;
};

const initialSnapshot: UpdateSnapshot = {
  canInstallInPlace: false,
  downloadProgress: null,
  error: null,
  errorCode: null,
  lastCheckedAt: null,
  releasesUrl: null,
  status: "idle",
  stalledOperation: null,
  supported: false,
  updateInfo: null,
};

const initialState: UpdateState = {
  available: false,
  currentVersion: null,
  dismissed: false,
  snapshot: initialSnapshot,
};

export const useAppUpdateStore = create<UpdateState & UpdateActions>()((set) => ({
  ...initialState,

  applySnapshot: (incoming) =>
    set((state) => {
      const previousVersion = state.snapshot.updateInfo?.version ?? null;
      const nextVersion = incoming.updateInfo?.version ?? null;

      return {
        available: true,
        currentVersion: incoming.currentVersion ?? state.currentVersion,
        // 出现了一个不同的新版本号 → 清掉旧的"跳过"标记，对齐 vmark 在
        // `available` 分支里调用 clearDismissed() 的位置。
        dismissed:
          nextVersion !== null && nextVersion !== previousVersion ? false : state.dismissed,
        snapshot: {
          canInstallInPlace: incoming.canInstallInPlace,
          downloadProgress: incoming.downloadProgress,
          error: incoming.error,
          errorCode: incoming.errorCode,
          lastCheckedAt: incoming.lastCheckedAt,
          releasesUrl: incoming.releasesUrl,
          status: incoming.status,
          stalledOperation: incoming.stalledOperation,
          // 兼容旧版 preload 和测试 fixture：未携带该字段的已打包
          // 快照按“支持更新”处理，只有显式 false 才是开发构建。
          supported: incoming.supported !== false,
          updateInfo: incoming.updateInfo,
        },
      };
    }),

  clearDismissed: () => set({ dismissed: false }),

  dismiss: () => set({ dismissed: true }),

  reset: () =>
    set((state) => ({
      available: true,
      currentVersion: state.currentVersion,
      dismissed: false,
      snapshot: initialSnapshot,
    })),

  setAvailable: (available) => set({ available }),
}));

/** 稳定引用：只读一个已有属性，不构造新对象。 */
export function selectUpdateSnapshot(state: UpdateState): UpdateSnapshot {
  return state.snapshot;
}

/**
 * 仅供测试：把 store 复位到"桌面 bridge 不可用"的初始态。
 *
 * 注意与 `reset()` 的区别：`reset()` 是产品行为（用户在设置里复位更新状态），
 * 它保持 `available: true`——bridge 确实还在。测试需要的是连 bridge 都不存在的
 * 起点，否则一个用例装过 bridge 之后，后面的用例会误以为桌面端可用。
 */
export function __resetAppUpdateStoreForTests() {
  // 不能用 `setState(next, true)`：replace 模式会把 actions 一并从 store 上抹掉，
  // 下一个用例调 `applySnapshot` 就是 `undefined is not a function`。
  useAppUpdateStore.setState({ ...initialState, snapshot: initialSnapshot });
}

/** 当前状态是否属于"操作进行中"，UI 据此禁用按钮。 */
export function isUpdateBusy(status: UpdateStatus): boolean {
  return status === "checking" || status === "downloading" || status === "installing";
}

/** 下载百分比；总长未知（服务端无 Content-Length）时返回 null。 */
export function updateDownloadPercent(
  progress: UpdateDownloadProgress | null,
): number | null {
  if (!progress || progress.total === null || progress.total <= 0) {
    return null;
  }
  return Math.min(100, Math.round((progress.downloaded / progress.total) * 100));
}
