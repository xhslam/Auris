/**
 * 应用自动更新（主进程）。
 *
 * 对齐 vmark 的 updater 语义（`src/hooks/useUpdateOperations.ts`、
 * `useUpdateChecker.ts`），但底座换成 Electron：vmark 用
 * `tauri-plugin-updater`，Auris 用 `electron-updater`。
 *
 * 与 vmark 的三处结构性差异，都是壳带来的、不是偷工减料：
 *
 * 1. **状态权威在主进程**。Tauri 的 `Update` 是窗口内的 JS resource，跨不了
 *    窗口，所以 vmark 必须让每个窗口各自 check/download，再用
 *    `useUpdateSync` 做双向广播 + 回声抑制。Electron 的 autoUpdater 是主进程
 *    单例，天然只有一份真相：主进程 push 快照给所有 renderer，不存在 A↔B
 *    回声环，`useUpdateSync` 那一层在这里没有对应物（不是被省掉）。
 * 2. **single-flight 落在主进程**。vmark 的 `inFlight` 是 per-window 模块变量；
 *    这里放在主进程，因此对所有窗口全局生效，比 vmark 更严。
 * 3. **未签名构建诚实降级**。macOS 下 `electron-updater` 要求 app 有有效签名
 *    才能就地安装；Auris 当前 `electron-builder.yml` 用 ad-hoc identity("-")，
 *    自动安装必然失败。此时不假装能装：状态进 `manual-download`，让 UI 引导
 *    用户去 releases 页面下载。对齐上一轮审计里"删掉假的『已是最新』提示"的
 *    结论——不能用一个永远失败的按钮冒充更新能力。
 */

const { EventEmitter } = require("node:events");

const UPDATE_STATUSES = Object.freeze([
  "idle",
  "checking",
  "available",
  "downloading",
  "installing",
  "ready",
  "manual-download",
  "up-to-date",
  "error",
]);

/** 未配置发布源时的错误码，UI 据此显示"未配置更新源"而不是网络错误。 */
const NO_FEED_CODE = "UPDATE_FEED_NOT_CONFIGURED";
/** 未签名/无法就地安装时的错误码。 */
const UNSIGNED_CODE = "UPDATE_REQUIRES_SIGNED_BUILD";

/**
 * 进度写入节流——逐字节移植 vmark
 * `src/services/updates/updateProgressThrottle.ts`。
 *
 * vmark 那边的动机是"每个 chunk 一次 emit 会把跨窗口广播打爆（v0.7.11 卡死）"。
 * Auris 只有一次 IPC push，但 renderer 侧 re-render 的成本一样，节流照留。
 */
const INDETERMINATE_STEP_BYTES = 512 * 1024;

function shouldWriteProgress(downloaded, lastWritten, total) {
  if (lastWritten < 0) return true;
  if (total && total > 0) {
    return (
      Math.floor((downloaded / total) * 100) !== Math.floor((lastWritten / total) * 100)
    );
  }
  return downloaded - lastWritten >= INDETERMINATE_STEP_BYTES;
}

function toErrorMessage(cause, fallback) {
  if (cause instanceof Error && typeof cause.message === "string" && cause.message) {
    return cause.message;
  }
  if (typeof cause === "string" && cause) return cause;
  return fallback;
}

/**
 * `electron-updater` 的 releaseNotes 可能是 string，也可能是
 * `{version, note}[]`（Windows nsis 多版本聚合）。统一成纯文本。
 */
function normalizeReleaseNotes(notes) {
  if (typeof notes === "string") return notes;
  if (Array.isArray(notes)) {
    return notes
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        const version = typeof entry.version === "string" ? entry.version : "";
        const note = typeof entry.note === "string" ? entry.note : "";
        return version ? `## ${version}\n${note}` : note;
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

/**
 * 判断这次 check 的结果是否真的比当前版本新。
 *
 * `electron-updater` 的 `update-available` 在部分 provider 下也会对同版本触发，
 * vmark 侧由 Tauri 保证"只有更新才返回 Update 对象"。这里补一次显式比较，避免
 * 把"没更新"渲染成"有更新"——同一类诚实性问题上一轮已经修过一次。
 */
function isNewerVersion(candidate, current) {
  if (typeof candidate !== "string" || !candidate) return false;
  if (typeof current !== "string" || !current) return true;
  if (candidate === current) return false;

  const parse = (value) =>
    value
      .replace(/^v/i, "")
      .split(/[.+-]/)
      .map((part) => {
        const numeric = Number.parseInt(part, 10);
        return Number.isFinite(numeric) ? numeric : part;
      });

  const left = parse(candidate);
  const right = parse(current);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === b) continue;
    if (a === undefined) return false;
    if (b === undefined) return true;
    if (typeof a === "number" && typeof b === "number") return a > b;
    return String(a) > String(b);
  }

  return false;
}

/**
 * 创建更新控制器。
 *
 * @param {object} options
 * @param {() => string} options.getCurrentVersion  当前应用版本（app.getVersion）
 * @param {object} options.autoUpdater              electron-updater 的 autoUpdater
 * @param {(url: string) => Promise<void>} options.openExternal 打开外部链接
 * @param {string|null} [options.releasesUrl]       无法就地安装时引导用户去的页面
 * @param {boolean} [options.canInstallInPlace]     是否具备就地安装条件（签名等）
 * @param {(message: string, detail?: unknown) => void} [options.log]
 */
function createAppUpdater(options) {
  const {
    autoUpdater,
    getCurrentVersion,
    openExternal,
    releasesUrl = null,
    canInstallInPlace = true,
    log = () => {},
  } = options ?? {};

  if (!autoUpdater) {
    throw new TypeError("createAppUpdater requires an autoUpdater instance.");
  }
  if (typeof getCurrentVersion !== "function") {
    throw new TypeError("createAppUpdater requires getCurrentVersion().");
  }

  const emitter = new EventEmitter();

  let state = {
    status: "idle",
    updateInfo: null,
    downloadProgress: null,
    error: null,
    errorCode: null,
    releasesUrl,
    canInstallInPlace: canInstallInPlace === true,
    lastCheckedAt: null,
  };

  // 主进程级 single-flight：所有窗口共享。vmark 的等价物是 per-window 的
  // `inFlight`，这里更严一层。
  const inFlight = { check: null, download: null };
  let downloadedInfo = null;

  function snapshot() {
    return {
      status: state.status,
      updateInfo: state.updateInfo,
      downloadProgress: state.downloadProgress,
      error: state.error,
      errorCode: state.errorCode,
      releasesUrl: state.releasesUrl,
      canInstallInPlace: state.canInstallInPlace,
      lastCheckedAt: state.lastCheckedAt,
    };
  }

  function patch(next) {
    state = { ...state, ...next };
    emitter.emit("state", snapshot());
  }

  function setStatus(status, extra = {}) {
    if (!UPDATE_STATUSES.includes(status)) {
      throw new RangeError(`Unknown update status: ${status}`);
    }
    patch({
      status,
      // 与 vmark mcpStore.setUpdateStatus 一致：切到非 error 状态时清掉旧错误，
      // 否则一次失败会把后续成功状态一直染成"有错"。
      error: status === "error" ? state.error : null,
      errorCode: status === "error" ? state.errorCode : null,
      ...extra,
    });
  }

  function setError(message, code = null) {
    patch({ status: "error", error: message, errorCode: code, downloadProgress: null });
  }

  /**
   * 是否配置了发布源。没有 publish 配置时 `electron-updater` 会抛
   * "provider is not configured"，那不是网络问题，UI 必须区分。
   */
  function hasFeed() {
    try {
      // 读到任何一个非空 feed 配置即认为已配置。
      return Boolean(autoUpdater.isUpdaterActive?.() ?? true);
    } catch {
      return false;
    }
  }

  let listenersBound = false;

  function bindListeners() {
    if (listenersBound) return;
    listenersBound = true;

    autoUpdater.on("error", (cause) => {
      const message = toErrorMessage(cause, "Update failed.");
      log("updater:error", message);
      setError(message);
    });

    autoUpdater.on("download-progress", (progress) => {
      const total =
        typeof progress?.total === "number" && progress.total > 0 ? progress.total : null;
      const downloaded =
        typeof progress?.transferred === "number" ? progress.transferred : 0;
      const lastWritten = state.downloadProgress?.downloaded ?? -1;
      if (!shouldWriteProgress(downloaded, lastWritten, total)) return;
      patch({ status: "downloading", downloadProgress: { downloaded, total } });
    });

    autoUpdater.on("update-downloaded", (info) => {
      downloadedInfo = info ?? null;
      patch({
        status: "ready",
        downloadProgress: null,
        error: null,
        errorCode: null,
      });
    });
  }

  async function runCheck() {
    if (inFlight.check) return inFlight.check;

    inFlight.check = (async () => {
      if (!hasFeed()) {
        setError(
          "No update feed is configured for this build.",
          NO_FEED_CODE,
        );
        return false;
      }

      bindListeners();
      setStatus("checking");

      try {
        // autoDownload 交给显式的 download 动作，对齐 vmark 的
        // available → (用户或 autoDownload 设置) → downloading 分两步。
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = true;

        const result = await autoUpdater.checkForUpdates();
        const currentVersion = getCurrentVersion();
        const candidate = result?.updateInfo?.version ?? null;

        state.lastCheckedAt = Date.now();

        if (!candidate || !isNewerVersion(candidate, currentVersion)) {
          setStatus("up-to-date", { updateInfo: null, lastCheckedAt: Date.now() });
          return false;
        }

        patch({
          status: "available",
          lastCheckedAt: Date.now(),
          updateInfo: {
            version: candidate,
            currentVersion,
            notes: normalizeReleaseNotes(result?.updateInfo?.releaseNotes),
            pubDate:
              typeof result?.updateInfo?.releaseDate === "string"
                ? result.updateInfo.releaseDate
                : "",
          },
          error: null,
          errorCode: null,
        });
        return true;
      } catch (cause) {
        setError(toErrorMessage(cause, "Update check failed."));
        return false;
      } finally {
        inFlight.check = null;
      }
    })();

    return inFlight.check;
  }

  async function runDownload() {
    if (inFlight.download) return inFlight.download;
    if (!state.updateInfo) return false;

    // 不能就地安装时，不假装能下载安装：直接把用户送到 releases 页。
    if (!state.canInstallInPlace) {
      patch({ status: "manual-download", downloadProgress: null });
      if (state.releasesUrl && typeof openExternal === "function") {
        try {
          await openExternal(state.releasesUrl);
        } catch (cause) {
          log("updater:open-releases-failed", toErrorMessage(cause, "open failed"));
        }
      }
      return false;
    }

    inFlight.download = (async () => {
      bindListeners();
      patch({
        status: "downloading",
        downloadProgress: { downloaded: 0, total: null },
        error: null,
        errorCode: null,
      });

      try {
        await autoUpdater.downloadUpdate();
        // `update-downloaded` 监听器负责把状态推到 ready；若 provider 未触发
        // 该事件（异常路径），这里兜底，避免永远停在 downloading。
        if (state.status === "downloading") {
          patch({ status: "ready", downloadProgress: null });
        }
        return true;
      } catch (cause) {
        setError(toErrorMessage(cause, "Update download failed."));
        return false;
      } finally {
        inFlight.download = null;
      }
    })();

    return inFlight.download;
  }

  /**
   * 重启安装。调用前由 renderer 负责脏文档确认（对齐 vmark 把 dirty 检查放在
   * `useUpdateChecker` 的 REQUEST_RESTART 处理里）。
   */
  function quitAndInstall() {
    if (state.status !== "ready") {
      return { ok: false, reason: "NOT_READY" };
    }
    if (!state.canInstallInPlace) {
      return { ok: false, reason: UNSIGNED_CODE };
    }
    setStatus("installing");
    // isSilent=false 让安装器可见；isForceRunAfter=true 安装完拉起新版本。
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  }

  async function openReleasesPage() {
    if (!state.releasesUrl || typeof openExternal !== "function") {
      return { ok: false, reason: "NO_RELEASES_URL" };
    }
    await openExternal(state.releasesUrl);
    return { ok: true };
  }

  function reset() {
    downloadedInfo = null;
    patch({
      status: "idle",
      updateInfo: null,
      downloadProgress: null,
      error: null,
      errorCode: null,
    });
  }

  return Object.freeze({
    NO_FEED_CODE,
    UNSIGNED_CODE,
    check: runCheck,
    download: runDownload,
    getDownloadedInfo: () => downloadedInfo,
    getSnapshot: snapshot,
    onStateChange(listener) {
      emitter.on("state", listener);
      return () => emitter.off("state", listener);
    },
    openReleasesPage,
    quitAndInstall,
    reset,
  });
}

module.exports = {
  INDETERMINATE_STEP_BYTES,
  NO_FEED_CODE,
  UNSIGNED_CODE,
  UPDATE_STATUSES,
  createAppUpdater,
  isNewerVersion,
  normalizeReleaseNotes,
  shouldWriteProgress,
};
