"use client";

/**
 * 更新操作 + 偏好读写 + 启动自动检查。
 *
 * 合并对齐 vmark 两个 hook：
 * - `src/hooks/useUpdateOperations.ts` → check / download / restart / skip
 * - `src/hooks/useUpdateChecker.ts`    → 频率策略、指数退避重试、toast 提示
 *
 * 保留的 vmark 纪律（每条都是它踩过坑写在注释里的）：
 * - 启动检查延迟 2s，且"重试链"标记只在定时器回调**内部**置位。若在 effect
 *   体里置位，定时器被取消（StrictMode 挂载/卸载/重挂）会留下 stale `true`，
 *   之后一次手动失败就会被误判成自动链的一环，弹出"重试已用尽"。
 * - 指数退避 3 次：5s / 10s / 20s。
 * - "重试用尽" toast 用稳定 id，重复出现时原地替换而不是叠成一片。
 * - 只有用户**手动**触发的检查才 toast 失败；后台重试静默，避免网络抖动刷屏。
 * - toast 与 retry 两个 effect 各持一个 prevStatus ref。两者都依赖 status，
 *   共用一个 ref 会让后声明的那个读到已被覆盖的值，retry 分支直接变成死代码。
 *
 * 去掉的 vmark 部分（壳差异，非省略）：
 * - single-flight 已下沉到主进程 `electron/updates/app-updater.cjs`，且因此对
 *   所有窗口全局生效，比 vmark 的 per-window `inFlight` 更严。
 * - 跨窗口 REQUEST_CHECK / REQUEST_STATE / state-changed 广播不存在：主进程是
 *   唯一真相源，状态直接 push 下来。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";
import {
  isUpdateBusy,
  selectUpdateSnapshot,
  useAppUpdateStore,
  type UpdateStatus,
} from "@/features/updates/update-store";
import {
  DEFAULT_UPDATE_SETTINGS,
  loadUpdateSettings,
  shouldCheckNow,
  updateUpdateSetting,
  UPDATE_SETTINGS_EVENT,
  type UpdateSettings,
} from "@/features/updates/update-settings";

const STARTUP_CHECK_DELAY_MS = 2000;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 5000;
const RETRIES_EXHAUSTED_TOAST_ID = "auris-update-retries-exhausted";

/**
 * 跨 hook 共享的两个标记，放在模块作用域。
 *
 * vmark 把它们放在 `useUpdateChecker` 的 ref 里是对的——那边
 * `useUpdateOperationHandler` 在同一个组件内被调用，ref 天然共享。这里
 * operations 被外壳、设置面板、状态指示器三处分别调用，是三个独立 hook 实例，
 * ref 传不过去。而"最近一次检查是不是用户点的"、"当前是否处在自动重试链里"
 * 本身就是每窗口一份的事实（主进程只有一个 updater），模块作用域才是归属。
 *
 * - manualCheckPending：只有用户点的检查才在失败/已是最新时 toast；后台重试
 *   静默，避免网络抖动刷屏。
 * - retryChainActive：只有自动链里的失败才走指数退避。手动失败不该悄悄排一串
 *   重试，也不该在链尾弹"重试已用尽"。
 */
const checkFlags = { manualCheckPending: false, retryChainActive: false };

/** 仅供测试重置模块级标记。 */
export function __resetUpdateCheckFlagsForTests() {
  checkFlags.manualCheckPending = false;
  checkFlags.retryChainActive = false;
}

function getUpdatesBridge() {
  return getDesktopBridge()?.updates ?? null;
}

/**
 * 更新偏好读写。
 *
 * 初始值用默认值而非 localStorage，避免 SSR/CSR hydration 不匹配；挂载后立刻
 * 读真实值。同时监听同文档 CustomEvent（设置页改了、指示器要跟随）与跨窗口
 * `storage` 事件。
 */
export function useAppUpdateSettings() {
  const [settings, setSettings] = useState<UpdateSettings>(DEFAULT_UPDATE_SETTINGS);

  useEffect(() => {
    setSettings(loadUpdateSettings());

    const onSettingsEvent = (event: Event) => {
      const detail = (event as CustomEvent<UpdateSettings>).detail;
      if (detail) {
        setSettings(detail);
      }
    };
    const onStorage = () => setSettings(loadUpdateSettings());

    window.addEventListener(UPDATE_SETTINGS_EVENT, onSettingsEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(UPDATE_SETTINGS_EVENT, onSettingsEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback(
    <K extends keyof UpdateSettings>(key: K, value: UpdateSettings[K]) => {
      // 不直接 setSettings：走持久化函数以广播事件，让其他挂载点一起跟随。
      setSettings(updateUpdateSetting(key, value));
    },
    [],
  );

  return { settings, update };
}

/**
 * 订阅主进程状态并拉一次初始快照。挂在应用外壳里（每窗口一次）。
 */
/**
 * 订阅引用计数。
 *
 * 外壳、设置面板、状态指示器三处都要看到更新状态，而它们不在同一棵子树里
 * （设置页可以单独渲染 `AppUpdatePanel`）。如果只让外壳订阅，面板单独挂载时
 * 就会把"没人订阅"渲染成"这个平台没有更新能力"——又是一处假 UI。
 *
 * 所以三处各自调用 `useAppUpdateSubscription()`，由这个计数保证对主进程只有
 * 一个 listener 和一次初始拉取。vmark 没有这层，因为它的窗口拓扑不同：每个
 * 窗口一份 store，靠跨窗口广播对齐。
 */
const subscription: {
  count: number;
  dispose: (() => void) | null;
} = { count: 0, dispose: null };

/** 仅供测试重置订阅计数。 */
export function __resetUpdateSubscriptionForTests() {
  subscription.dispose?.();
  subscription.count = 0;
  subscription.dispose = null;
}

function acquireSubscription(): () => void {
  subscription.count += 1;

  if (subscription.count === 1) {
    const bridge = getUpdatesBridge();

    if (!bridge) {
      useAppUpdateStore.getState().setAvailable(false);
      subscription.dispose = null;
    } else {
      let active = true;
      const unsubscribe = bridge.onStateChange((snapshot) => {
        if (active) {
          useAppUpdateStore.getState().applySnapshot(snapshot);
        }
      });

      void bridge
        .getState()
        .then((snapshot) => {
          if (active) {
            useAppUpdateStore.getState().applySnapshot(snapshot);
          }
        })
        .catch(() => {
          // 首次拉取失败不致命：后续状态变更仍会推过来。标记 bridge 存在，
          // 这样 UI 不会把"暂时拉不到"渲染成"这个平台没有更新能力"。
          if (active) {
            useAppUpdateStore.getState().setAvailable(true);
          }
        });

      subscription.dispose = () => {
        active = false;
        unsubscribe();
      };
    }
  }

  return () => {
    subscription.count -= 1;
    if (subscription.count <= 0) {
      subscription.count = 0;
      subscription.dispose?.();
      subscription.dispose = null;
    }
  };
}

export function useAppUpdateSubscription() {
  useEffect(() => acquireSubscription(), []);
}

export function useAppUpdateOperations() {
  const dismiss = useAppUpdateStore((state) => state.dismiss);

  const checkForUpdates = useCallback(async (options: { manual?: boolean } = {}) => {
    const bridge = getUpdatesBridge();
    if (!bridge) return;
    if (options.manual === true) {
      checkFlags.manualCheckPending = true;
      // 手动检查不属于自动重试链：清标记，避免它的失败触发退避重试。
      checkFlags.retryChainActive = false;
    }
    const snapshot = await bridge.check();
    // invoke 返回的是这次检查的最终权威快照；state push 走另一条 IPC 通道，
    // 可能稍后才更新 renderer store。若读取 store，会把旧 idle 当成功、或把旧
    // error 当失败。失败不能更新时间戳，否则会把下一个检查窗口推后一整天。
    if (snapshot.status !== "error") {
      updateUpdateSetting("lastCheckTimestamp", Date.now());
    }
  }, []);

  const downloadUpdate = useCallback(async () => {
    const bridge = getUpdatesBridge();
    if (!bridge) return;
    await bridge.download();
  }, []);

  const recoverStalledUpdate = useCallback(async () => {
    const bridge = getUpdatesBridge();
    if (!bridge) return { ok: false as const, reason: "NO_BRIDGE" };
    const result = await bridge.recover();
    useAppUpdateStore.getState().applySnapshot(result.snapshot);
    return result;
  }, []);
  const restartToInstall = useCallback(async () => {
    const bridge = getUpdatesBridge();
    if (!bridge) return { ok: false as const, reason: "NO_BRIDGE" };
    return bridge.quitAndInstall();
  }, []);

  const openReleasesPage = useCallback(async () => {
    const bridge = getUpdatesBridge();
    if (!bridge) return;
    await bridge.openReleases();
  }, []);

  const skipVersion = useCallback(
    (version: string) => {
      updateUpdateSetting("skipVersion", version);
      dismiss();
    },
    [dismiss],
  );

  return {
    checkForUpdates,
    downloadUpdate,
    openReleasesPage,
    recoverStalledUpdate,
    restartToInstall,
    skipVersion,
  };
}

/**
 * 启动自动检查 + 状态变化提示 + 自动下载。仅在应用外壳挂一次。
 */
export function useAppUpdateChecker() {
  useAppUpdateSubscription();

  const { settings } = useAppUpdateSettings();
  const snapshot = useAppUpdateStore(selectUpdateSnapshot);
  const available = useAppUpdateStore((state) => state.available);
  const dismiss = useAppUpdateStore((state) => state.dismiss);
  const { checkForUpdates, downloadUpdate } = useAppUpdateOperations();

  const { status, updateInfo } = snapshot;

  const hasChecked = useRef(false);
  const hasAutoDownloaded = useRef(false);
  const retryCount = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStatusForToastRef = useRef<UpdateStatus | null>(null);
  const prevStatusForRetryRef = useRef<UpdateStatus | null>(null);

  const autoCheckEnabled = settings.autoCheckEnabled;
  const checkFrequency = settings.checkFrequency;
  const lastCheckTimestamp = settings.lastCheckTimestamp;

  useEffect(() => {
    if (!available || hasChecked.current) return undefined;
    if (!shouldCheckNow(autoCheckEnabled, checkFrequency, lastCheckTimestamp)) {
      return undefined;
    }

    hasChecked.current = true;

    const timer = setTimeout(() => {
      // 在回调内部置位：定时器被取消时不留 stale true。
      checkFlags.retryChainActive = true;
      retryCount.current = 0;
      void checkForUpdates().catch(() => {
        // 失败状态已由主进程写入 store，这里不重复上报。
      });
    }, STARTUP_CHECK_DELAY_MS);

    return () => clearTimeout(timer);
  }, [available, autoCheckEnabled, checkFrequency, checkForUpdates, lastCheckTimestamp]);

  useEffect(() => {
    const prevStatus = prevStatusForToastRef.current;
    prevStatusForToastRef.current = status;

    if (prevStatus === null || prevStatus === status) return;

    if (status === "ready" && updateInfo) {
      toast.success(`${updateInfo.version} 已下载完成，重启即可更新`, { duration: 5000 });
      return;
    }

    if (status === "manual-download" && updateInfo) {
      toast.message(`${updateInfo.version} 需要手动下载安装`, {
        description: "当前构建未使用开发者证书签名，无法就地安装。",
        duration: 6000,
      });
      return;
    }

    if (status === "up-to-date" && prevStatus === "checking" && checkFlags.manualCheckPending) {
      toast.success("已是最新版本");
      checkFlags.manualCheckPending = false;
      return;
    }

    if (status === "error" && prevStatus === "checking" && checkFlags.manualCheckPending) {
      const message = useAppUpdateStore.getState().snapshot.error;
      toast.error(`检查更新失败：${message ?? "未知错误"}`, { duration: 6000 });
      checkFlags.manualCheckPending = false;
    }
  }, [status, updateInfo]);

  useEffect(() => {
    const prevStatus = prevStatusForRetryRef.current;
    prevStatusForRetryRef.current = status;

    if (status === "up-to-date" || status === "available") {
      retryCount.current = 0;
      checkFlags.retryChainActive = false;
    }

    if (
      status === "error" &&
      prevStatus === "checking" &&
      autoCheckEnabled &&
      checkFlags.retryChainActive
    ) {
      if (retryCount.current < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY_MS * 2 ** retryCount.current;
        retryCount.current += 1;
        retryTimerRef.current = setTimeout(() => {
          void checkForUpdates().catch(() => {});
        }, delay);
      } else {
        // 链在此结束：先清标记再 toast，避免后续状态抖动重新进入这一分支。
        checkFlags.retryChainActive = false;
        toast.error("多次尝试后仍无法检查更新，请稍后手动重试。", {
          duration: 6000,
          id: RETRIES_EXHAUSTED_TOAST_ID,
        });
      }
    }

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [autoCheckEnabled, checkForUpdates, status]);

  // 已跳过的版本自动收起卡片。
  useEffect(() => {
    if (
      status === "available" &&
      updateInfo &&
      settings.skipVersion &&
      updateInfo.version === settings.skipVersion
    ) {
      dismiss();
    }
  }, [dismiss, settings.skipVersion, status, updateInfo]);

  useEffect(() => {
    if (hasAutoDownloaded.current) return;
    if (
      status === "available" &&
      settings.autoDownload &&
      updateInfo &&
      !(settings.skipVersion && updateInfo.version === settings.skipVersion)
    ) {
      hasAutoDownloaded.current = true;
      void downloadUpdate().catch(() => {});
    }
  }, [downloadUpdate, settings.autoDownload, settings.skipVersion, status, updateInfo]);

  // 回到非活动状态时重新武装自动下载（vmark 同款：idle 单独不会再次进入）。
  useEffect(() => {
    if (status === "idle" || status === "up-to-date" || status === "error") {
      hasAutoDownloaded.current = false;
    }
  }, [status]);

  const checkManually = useCallback(async () => {
    await checkForUpdates({ manual: true });
  }, [checkForUpdates]);

  return { checkManually, isBusy: isUpdateBusy(status) };
}
