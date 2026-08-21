"use client";

/**
 * 设置 → 关于 → 更新面板。
 *
 * 对齐 vmark `src/pages/settings/UpdateAvailableCard.tsx` +
 * `AboutSettings` 的更新设置行，合并成一个面板：
 *
 * - 版本信息 / 发布日期 / release notes（三行截断，与 vmark 的 line-clamp-3 一致）
 * - 下载进度条：确定态显示百分比，不确定态（服务端没给 Content-Length）
 *   显示已下载 MB + 走动条，并按 WAI-ARIA 省略 aria-valuenow、补 aria-valuetext
 * - installing 阶段按 100% 显示（vmark 的注释说明：Finished 事件到了但包还在写盘，
 *   停在冻结的 downloading 会让人以为卡死）
 * - 频率 / 自动下载 / 跳过版本三个偏好
 * - 未签名构建：不显示"重启安装"，而是显式说明并给"打开发布页"
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAppUpdateStore,
  selectUpdateSnapshot,
} from "@/features/updates/update-store";
import {
  useAppUpdateOperations,
  useAppUpdateSettings,
  useAppUpdateSubscription,
} from "@/features/updates/use-app-updates";
import {
  UPDATE_CHECK_FREQUENCIES,
  type UpdateCheckFrequency,
} from "@/features/updates/update-settings";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";
import { UPDATE_CHECK_REQUEST_KEY } from "@/features/updates/update-navigation";

const FREQUENCY_LABELS: Record<UpdateCheckFrequency, string> = {
  daily: "每天一次",
  manual: "仅手动",
  startup: "每次启动",
  weekly: "每周一次",
};

const STATUS_LABELS: Record<string, string> = {
  available: "有可用更新",
  checking: "正在检查…",
  downloading: "正在下载…",
  error: "检查失败",
  idle: "尚未检查",
  installing: "正在安装…",
  "manual-download": "需手动下载",
  ready: "已就绪，重启即可安装",
  "up-to-date": "已是最新版本",
  stalled: "更新已停止响应",
};

function formatMb(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(1);
}

function formatTimestamp(value: number | null) {
  if (!value) {
    return "从未检查";
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "从未检查";
  }
}

/** 下载/安装进度条。确定态、不确定态、安装态三种形态。 */
function UpdateProgressBar() {
  const snapshot = useAppUpdateStore(selectUpdateSnapshot);
  const { downloadProgress, status } = snapshot;

  if (status !== "downloading" && status !== "installing") {
    return null;
  }

  const installing = status === "installing";
  const downloaded = downloadProgress?.downloaded ?? 0;
  const total = downloadProgress?.total ?? null;
  // 不确定态：正在下载但没有 Content-Length，百分比本身无意义。
  const indeterminate = !installing && !(total !== null && total > 0);
  const percent =
    total !== null && total > 0
      ? Math.min(100, Math.round((downloaded / total) * 100))
      : null;
  const downloadedText = `已下载 ${formatMb(downloaded)} MB`;
  const label = installing ? "正在安装" : "正在下载";
  const detail = installing
    ? ""
    : indeterminate
      ? downloadedText
      : `${formatMb(downloaded)} / ${formatMb(total ?? 0)} MB（${percent}%）`;
  const valueNow = installing ? 100 : percent;

  return (
    <div className="auris-update__progress">
      <div className="auris-update__progress-head">
        <span>{label}</span>
        {detail ? <span>{detail}</span> : null}
      </div>
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={valueNow ?? undefined}
        aria-valuetext={indeterminate ? downloadedText : undefined}
        className="auris-update__progress-track"
        role="progressbar"
      >
        <div
          className="auris-update__progress-fill"
          data-indeterminate={indeterminate ? "true" : "false"}
          style={indeterminate ? undefined : { width: `${valueNow ?? 0}%` }}
        />
      </div>
    </div>
  );
}

export function AppUpdatePanel() {
  // 自己订阅，不依赖外壳：设置页可以单独渲染这个面板，那时若没人订阅，
  // `available` 会停在 false，把"没人订阅"渲染成"这个平台没有更新能力"。
  // 订阅内部做了引用计数，重复挂载不会产生第二个 bridge listener。
  useAppUpdateSubscription();

  const snapshot = useAppUpdateStore(selectUpdateSnapshot);
  const available = useAppUpdateStore((state) => state.available);
  const { checkForUpdates, downloadUpdate, openReleasesPage, recoverStalledUpdate, restartToInstall, skipVersion } =
    useAppUpdateOperations();
  const { settings, update: updateSetting } = useAppUpdateSettings();
  const [isRestarting, setIsRestarting] = useState(false);
  const [isRepositorySyncing, setIsRepositorySyncing] = useState(false);
  const [isReleasePublishing, setIsReleasePublishing] = useState(false);
  const [repositorySyncMessage, setRepositorySyncMessage] = useState<string | null>(null);
  const [releasePublishMessage, setReleasePublishMessage] = useState<string | null>(null);
  const handledDeepLinkCheck = useRef(false);

  const { canInstallInPlace, downloadProgress, error, errorCode, stalledOperation, status, supported, updateInfo } = snapshot;

  const runManualCheck = useCallback(async () => {
    if (status === "stalled") {
      await recoverStalledUpdate();
    }
    await checkForUpdates({ manual: true });
  }, [checkForUpdates, recoverStalledUpdate, status]);

  // 指示器是一键入口：打开更新中心后立即开始检查。开发
  // 构建只展示说明和发布页，不会误连生产更新源。
  useEffect(() => {
    if (!available || handledDeepLinkCheck.current) return;
    const requestedByUrl = new URLSearchParams(window.location.search).get("check") === "1";
    const requestedByNavigation =
      window.sessionStorage.getItem(UPDATE_CHECK_REQUEST_KEY) === "1";
    if (!requestedByUrl && !requestedByNavigation) return;
    handledDeepLinkCheck.current = true;
    window.sessionStorage.removeItem(UPDATE_CHECK_REQUEST_KEY);
    if (!supported) return;
    void runManualCheck();
  }, [available, runManualCheck, supported]);

  useEffect(() => {
    if (status !== "installing") {
      setIsRestarting(false);
    }
  }, [status]);

  const busy =
    status === "checking" || status === "downloading" || status === "installing";

  const statusLabel = useMemo(() => STATUS_LABELS[status] ?? status, [status]);

  const frequencyIndex = UPDATE_CHECK_FREQUENCIES.indexOf(settings.checkFrequency);
  const canSyncRepository = available && Boolean(getDesktopBridge()?.updates?.syncRepository);
  const canPublishRelease = available && Boolean(getDesktopBridge()?.updates?.publishRelease);
  const syncRepository = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.updates?.syncRepository) {
      setRepositorySyncMessage("当前桌面端未提供源码仓库同步能力。");
      return;
    }
    setIsRepositorySyncing(true);
    setRepositorySyncMessage(null);
    try {
      const result = await bridge.updates.syncRepository();
      setRepositorySyncMessage(
        result.ok
          ? result.skipped
            ? `当前分支已与 GitHub 同步，未创建新的版本提交${result.commit ? `（${result.commit}）` : ""}。`
            : result.retriedPush
              ? `已重试并推送 v${result.version ?? "当前版本"}${result.commit ? `（${result.commit}）` : ""}。`
              : `已推送 ${result.branch ?? "当前分支"}：${result.currentVersion ?? "当前版本"} → ${result.version ?? "新版本"}${result.commit ? `（${result.commit}）` : ""}`
          : result.error ?? "仓库同步失败，请检查 Git 状态后重试。",
      );
    } catch {
      setRepositorySyncMessage("仓库同步失败，请检查 Git 状态、网络和提交身份后重试。");
    } finally {
      setIsRepositorySyncing(false);
    }
  }, []);
  const publishRelease = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.updates?.publishRelease) {
      setReleasePublishMessage("当前桌面端未提供 GitHub Release 发布能力。");
      return;
    }
    setIsReleasePublishing(true);
    setReleasePublishMessage(null);
    try {
      const result = await bridge.updates.publishRelease();
      setReleasePublishMessage(
        result.ok
          ? `${result.retriedTagPush ? "已重试推送" : "已推送"} ${result.tag ?? `v${result.version ?? ""}`}。GitHub Actions 将构建 macOS 与 Windows 安装包；验证全部更新元数据后才会正式发布。`
          : result.error ?? "发布标签准备失败，请检查 Git 状态后重试。",
      );
    } catch {
      setReleasePublishMessage("桌面版发布失败，请检查构建环境、Git 状态和 GitHub 授权后重试。");
    } finally {
      setIsReleasePublishing(false);
    }
  }, []);

  if (!available || !supported) {
    return (
      <div className="auris-update" id="updates">
        <div className="auris-update__row">
          <div className="auris-update__label">自动更新</div>
          <div className="auris-update__value">
            {available ? "开发模式" : "当前环境不可用"}
          </div>
        </div>
        <p className="auris-update__note">
          自动更新只在打包后的桌面端可用。开发模式（<code>npm run desktop:dev</code>）下不会
          连接发布源，避免把正常的调试会话误报成更新卡死。
        </p>
        {canSyncRepository ? (
          <div className="auris-update__repository-sync">
            <div>
              <div className="auris-update__label">同步源码仓库</div>
              <p className="auris-update__note">
                依次拉取 GitHub 当前分支、将补丁版本递增（例如 1.0.0 → 1.0.1）、提交并推送；只会包含 Auris 源码目录及忽略规则。
              </p>
            </div>
            <button
              className="auris-update__btn auris-update__btn--primary"
              disabled={isRepositorySyncing}
              onClick={() => void syncRepository()}
              type="button"
            >
              {isRepositorySyncing ? "同步中…" : "同步并推送"}
            </button>
            {repositorySyncMessage ? (
              <p className="auris-update__repository-message" role="status">
                {repositorySyncMessage}
              </p>
            ) : null}
          </div>
        ) : null}
        {canPublishRelease ? (
          <div className="auris-update__repository-sync">
            <div>
              <div className="auris-update__label">发布桌面 App</div>
              <p className="auris-update__note">
                仅在当前分支已推送到 GitHub 后执行：创建 vX.Y.Z 标签，并由 GitHub Actions 构建 macOS 与 Windows 安装包；所有更新元数据齐全后才公开 Release。
              </p>
            </div>
            <button
              className="auris-update__btn auris-update__btn--primary"
              disabled={isReleasePublishing || isRepositorySyncing}
              onClick={() => void publishRelease()}
              type="button"
            >
              {isReleasePublishing ? "准备发布中…" : "创建标签并发布"}
            </button>
            {releasePublishMessage ? (
              <p className="auris-update__repository-message" role="status">
                {releasePublishMessage}
              </p>
            ) : null}
          </div>
        ) : null}
        {available && snapshot.releasesUrl ? (
          <button
            className="auris-update__btn"
            onClick={() => void openReleasesPage()}
            type="button"
          >
            打开发布页
          </button>
        ) : null}
        <style>{UPDATE_PANEL_CSS}</style>
      </div>
    );
  }

  return (
    <div className="auris-update" data-status={status} id="updates">
      <div className="auris-update__row">
        <div>
          <div className="auris-update__label">当前状态</div>
          <div className="auris-update__desc">
            上次检查：{formatTimestamp(settings.lastCheckTimestamp)}
          </div>
        </div>
        <div className="auris-update__actions">
          <span className="auris-update__status" data-status={status}>
            {statusLabel}
          </span>
          <button
            className="auris-update__btn"
            disabled={busy}
            onClick={() => {
              void runManualCheck();
            }}
            type="button"
          >
            {status === "checking"
              ? "检查中…"
              : status === "stalled"
                ? `恢复${stalledOperation === "download" ? "下载" : "检查"}`
                : "立即检查"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="auris-update__error" role="alert">
          {errorCode === "UPDATE_FEED_NOT_CONFIGURED"
            ? "这个构建没有配置发布源，无法检查更新。请从发布页手动下载。"
            : errorCode === "UPDATE_STALLED"
              ? `更新${stalledOperation === "download" ? "下载" : "检查"}已停止响应。恢复会丢弃这次卡住的请求，并重新开始。`
              : error}
        </p>
      ) : null}

      {updateInfo ? (
        <div className="auris-update__card">
          <div className="auris-update__card-head">
            <div>
              <div className="auris-update__version">
                新版本 {updateInfo.version}
                <span className="auris-update__version-current">
                  当前 {updateInfo.currentVersion}
                </span>
              </div>
              {updateInfo.pubDate ? (
                <div className="auris-update__desc">
                  发布于 {new Date(updateInfo.pubDate).toLocaleDateString()}
                </div>
              ) : null}
            </div>
            <div className="auris-update__card-actions">
              {status === "ready" ? (
                <button
                  className="auris-update__btn auris-update__btn--primary"
                  disabled={isRestarting}
                  onClick={() => {
                    setIsRestarting(true);
                    void restartToInstall().then((result) => {
                      if (!result.ok) {
                        setIsRestarting(false);
                      }
                    });
                  }}
                  type="button"
                >
                  {isRestarting ? "正在重启…" : "重启并安装"}
                </button>
              ) : canInstallInPlace ? (
                <button
                  className="auris-update__btn auris-update__btn--primary"
                  disabled={busy}
                  onClick={() => {
                    void downloadUpdate();
                  }}
                  type="button"
                >
                  {status === "installing"
                    ? "安装中…"
                    : status === "downloading"
                      ? "下载中…"
                      : "下载更新"}
                </button>
              ) : (
                <button
                  className="auris-update__btn auris-update__btn--primary"
                  onClick={() => {
                    void openReleasesPage();
                  }}
                  type="button"
                >
                  打开发布页
                </button>
              )}
              {status === "available" ? (
                <button
                  className="auris-update__btn"
                  onClick={() => skipVersion(updateInfo.version)}
                  type="button"
                >
                  跳过此版本
                </button>
              ) : null}
            </div>
          </div>

          {updateInfo.notes ? (
            <pre className="auris-update__notes">{updateInfo.notes}</pre>
          ) : null}

          <UpdateProgressBar />

          {!canInstallInPlace ? (
            <p className="auris-update__note">
              这个构建使用 ad-hoc 签名，macOS 不允许就地替换应用，因此不提供「重启安装」。
              请从发布页下载新版本手动覆盖安装。
            </p>
          ) : null}
        </div>
      ) : null}

      {downloadProgress && !updateInfo ? <UpdateProgressBar /> : null}

      <div className="auris-update__row">
        <div>
          <div className="auris-update__label">自动检查</div>
          <div className="auris-update__desc">启动后自动检查是否有新版本</div>
        </div>
        <button
          aria-pressed={settings.autoCheckEnabled}
          className="auris-update__switch"
          data-on={settings.autoCheckEnabled ? "true" : "false"}
          onClick={() => updateSetting("autoCheckEnabled", !settings.autoCheckEnabled)}
          type="button"
        >
          <span />
        </button>
      </div>

      <div className="auris-update__row">
        <div>
          <div className="auris-update__label">检查频率</div>
          <div className="auris-update__desc">{FREQUENCY_LABELS[settings.checkFrequency]}</div>
        </div>
        <button
          className="auris-update__btn"
          disabled={!settings.autoCheckEnabled}
          onClick={() => {
            const next =
              UPDATE_CHECK_FREQUENCIES[
                (frequencyIndex + 1) % UPDATE_CHECK_FREQUENCIES.length
              ];
            updateSetting("checkFrequency", next);
          }}
          type="button"
        >
          {FREQUENCY_LABELS[settings.checkFrequency]}
        </button>
      </div>

      <div className="auris-update__row">
        <div>
          <div className="auris-update__label">自动下载</div>
          <div className="auris-update__desc">
            {canInstallInPlace
              ? "发现新版本后自动下载，安装仍需你确认重启"
              : "当前构建无法就地安装，自动下载已停用"}
          </div>
        </div>
        <button
          aria-pressed={settings.autoDownload}
          className="auris-update__switch"
          data-on={settings.autoDownload ? "true" : "false"}
          disabled={!canInstallInPlace}
          onClick={() => updateSetting("autoDownload", !settings.autoDownload)}
          type="button"
        >
          <span />
        </button>
      </div>

      {settings.skipVersion ? (
        <div className="auris-update__row">
          <div>
            <div className="auris-update__label">已跳过版本</div>
            <div className="auris-update__desc">{settings.skipVersion}</div>
          </div>
          <button
            className="auris-update__btn"
            onClick={() => updateSetting("skipVersion", null)}
            type="button"
          >
            取消跳过
          </button>
        </div>
      ) : null}

      <style>{UPDATE_PANEL_CSS}</style>
    </div>
  );
}

const UPDATE_PANEL_CSS = `
.auris-update{display:flex;flex-direction:column;gap:2px;}
.auris-update__row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 0;border-bottom:1px solid var(--app-line-soft);}
.auris-update__row:last-of-type{border-bottom:none;}
.auris-update__label{font-size:14px;color:var(--app-text);}
.auris-update__desc{margin-top:4px;font-size:12.5px;color:var(--app-muted);}
.auris-update__value{font-size:13px;color:var(--app-muted);}
.auris-update__actions{display:flex;align-items:center;gap:10px;}
.auris-update__status{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11.5px;letter-spacing:0.04em;color:var(--app-muted);}
.auris-update__status[data-status="available"],.auris-update__status[data-status="ready"]{color:var(--accent);}
.auris-update__status[data-status="error"],.auris-update__status[data-status="stalled"]{color:#c2554d;}
.auris-update__btn{height:30px;padding:0 13px;border-radius:9px;border:1px solid var(--app-line);background:var(--app-fill);color:var(--app-text);font-size:12.5px;font-family:inherit;cursor:pointer;transition:all .15s;}
.auris-update__btn:hover:not(:disabled){border-color:var(--accent-28);color:var(--accent);}
.auris-update__btn:disabled{opacity:.5;cursor:default;}
.auris-update__btn--primary{background:var(--accent-10);border-color:var(--accent-28);color:var(--accent);}
.auris-update__card{margin:12px 0;padding:16px;border-radius:12px;border:1px solid var(--accent-28);background:var(--accent-10);}
.auris-update__card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;}
.auris-update__card-actions{display:flex;flex-direction:column;gap:8px;flex-shrink:0;}
.auris-update__version{font-size:14.5px;color:var(--app-ink);display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}
.auris-update__version-current{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11.5px;color:var(--app-muted);}
.auris-update__notes{margin:12px 0 0;max-height:5.4em;overflow:hidden;white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.8;color:var(--app-text-soft);}
.auris-update__error{margin:10px 0 0;font-size:13px;line-height:1.7;color:#c2554d;}
.auris-update__note{margin:10px 0 0;font-size:12.5px;line-height:1.75;color:var(--app-muted);}
.auris-update__note code{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11.5px;}
.auris-update__repository-sync{margin-top:14px;padding:14px;border:1px solid var(--app-line);border-radius:12px;background:var(--app-fill);display:flex;align-items:center;flex-wrap:wrap;gap:10px 16px;}
.auris-update__repository-sync>div{min-width:220px;flex:1;}
.auris-update__repository-sync .auris-update__note{margin:4px 0 0;}
.auris-update__repository-message{flex-basis:100%;margin:0;font-size:12.5px;line-height:1.6;color:var(--app-muted);}
.auris-update__progress{margin-top:14px;display:flex;flex-direction:column;gap:6px;}
.auris-update__progress-head{display:flex;justify-content:space-between;font-size:11.5px;color:var(--app-muted);}
.auris-update__progress-track{height:6px;border-radius:99px;background:var(--app-fill-strong);overflow:hidden;}
.auris-update__progress-fill{height:100%;background:var(--accent);border-radius:99px;transition:width .3s;}
.auris-update__progress-fill[data-indeterminate="true"]{width:32%;transition:none;animation:auris-update-slide 1.1s ease-in-out infinite;}
@keyframes auris-update-slide{0%{transform:translateX(-100%);}100%{transform:translateX(320%);}}
.auris-update__switch{width:42px;height:24px;border-radius:99px;border:1px solid var(--app-line);background:var(--app-fill-strong);position:relative;cursor:pointer;padding:0;transition:all .18s;flex-shrink:0;}
.auris-update__switch[data-on="true"]{background:var(--accent);border-color:var(--accent);}
.auris-update__switch:disabled{opacity:.45;cursor:default;}
.auris-update__switch>span{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:99px;background:#fff;transition:transform .18s;}
.auris-update__switch[data-on="true"]>span{transform:translateX(18px);}
@media (prefers-reduced-motion: reduce){
  .auris-update__progress-fill[data-indeterminate="true"]{animation:none;width:100%;opacity:.45;}
}
`;
