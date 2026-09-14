"use client";

/**
 * 侧边栏更新指示器。
 *
 * 对齐 vmark `src/components/StatusBar/UpdateIndicator.tsx` 的可见性规则：
 *
 * - idle / up-to-date 仍保留一个可点入口，它是更新中心而不只是告警灯
 * - checking / downloading 也可点开详情，不让进度只藏在 tooltip 里
 * - available / ready / error 用点和色彩表达状态，但入口本身始终保留
 * - 所有状态都进入「设置 → 关于 → 更新」，并在需要时自动检查
 *
 * 与 vmark 的差异：Auris 的设置是同一个窗口内的一条路由，所以"去设置"用
 * router.push 而不是 openSettingsWindow。
 */

import { useRouter } from "next/navigation";
import {
  useAppUpdateStore,
  selectUpdateSnapshot,
} from "@/features/updates/update-store";
import { useAppUpdateSubscription } from "@/features/updates/use-app-updates";
import {
  UPDATE_CHECK_REQUEST_KEY,
  UPDATE_SETTINGS_NAVIGATION_EVENT,
} from "@/features/updates/update-navigation";

type IndicatorConfig = {
  clickable: boolean;
  glyph: string;
  showDot: boolean;
  tone: "accent" | "danger" | "neutral";
};

function getIndicatorConfig(status: string): IndicatorConfig | null {
  switch (status) {
    case "checking":
      return { clickable: true, glyph: "⟳", showDot: false, tone: "neutral" };
    case "downloading":
    case "installing":
      return { clickable: true, glyph: "↓", showDot: false, tone: "accent" };
    case "available":
    case "manual-download":
      return { clickable: true, glyph: "↓", showDot: true, tone: "accent" };
    case "ready":
      return { clickable: true, glyph: "✓", showDot: true, tone: "accent" };
    case "error":
    case "stalled":
      return { clickable: true, glyph: "!", showDot: false, tone: "danger" };
    default:
      return { clickable: true, glyph: "⟳", showDot: false, tone: "neutral" };
  }
}

export function AppUpdateIndicator() {
  // 引用计数订阅：外壳、面板、指示器各自挂一次，对主进程仍只有一个 listener。
  useAppUpdateSubscription();

  const router = useRouter();
  const snapshot = useAppUpdateStore(selectUpdateSnapshot);
  const available = useAppUpdateStore((state) => state.available);

  const { downloadProgress, status, supported, updateInfo } = snapshot;
  const config = getIndicatorConfig(status);

  if (!available || !config) {
    return null;
  }

  const percent =
    status === "downloading" && downloadProgress?.total
      ? Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)
      : null;

  let title = supported ? "检查应用更新" : "更新中心（开发模式）";
  if (supported && status === "checking") {
    title = "正在检查更新…";
  } else if (status === "available" && updateInfo) {
    title = `有可用更新：${updateInfo.version}`;
  } else if (status === "manual-download" && updateInfo) {
    title = `新版本 ${updateInfo.version}：需手动下载`;
  } else if (status === "downloading") {
    title = percent === null ? "正在下载更新…" : `正在下载更新 ${percent}%`;
  } else if (status === "installing") {
    title = "正在安装更新…";
  } else if (status === "ready" && updateInfo) {
    title = `更新 ${updateInfo.version} 已就绪，点击查看并安装`;
  } else if (status === "error") {
    title = "更新检查失败，点击重试";
  } else if (status === "stalled") {
    title = "更新已停止响应，点击恢复";
  }

  const handleClick = () => {
    // 路由跨页时 query 会在新页触发检查；已在设置页时 Next
    // 可能复用组件，因此另发一个同页切换信号，并用 sessionStorage
    // 保留一次性检查意图，直到更新面板真正挂载。
    window.sessionStorage.setItem(UPDATE_CHECK_REQUEST_KEY, "1");
    window.dispatchEvent(
      new CustomEvent(UPDATE_SETTINGS_NAVIGATION_EVENT, {
        detail: { section: "about" },
      }),
    );
    router.push("/settings?section=about&check=1#updates");
  };

  return (
    <button
      aria-label={title}
      className="auris-update-indicator"
      data-clickable={config.clickable ? "true" : "false"}
      data-spin={status === "checking" ? "true" : "false"}
      data-tone={config.tone}
      onClick={handleClick}
      title={title}
      type="button"
    >
      <span aria-hidden="true">{config.glyph}</span>
      {config.showDot ? <i aria-hidden="true" /> : null}
      <style>{INDICATOR_CSS}</style>
    </button>
  );
}

const INDICATOR_CSS = `
.auris-update-indicator{position:relative;width:30px;height:30px;display:grid;place-items:center;border-radius:9px;border:1px solid transparent;background:transparent;color:var(--app-muted);font-size:14px;line-height:1;cursor:default;padding:0;transition:all .15s;}
.auris-update-indicator[data-clickable="true"]{cursor:pointer;}
.auris-update-indicator[data-clickable="true"]:hover{background:var(--app-fill);border-color:var(--app-line);}
.auris-update-indicator[data-tone="accent"]{color:var(--accent);}
.auris-update-indicator[data-tone="danger"]{color:#c2554d;}
.auris-update-indicator[data-spin="true"]>span{display:inline-block;animation:auris-update-spin 1.1s linear infinite;}
.auris-update-indicator>i{position:absolute;top:5px;right:5px;width:6px;height:6px;border-radius:99px;background:currentColor;}
@keyframes auris-update-spin{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion: reduce){
  .auris-update-indicator[data-spin="true"]>span{animation:none;}
}
`;
