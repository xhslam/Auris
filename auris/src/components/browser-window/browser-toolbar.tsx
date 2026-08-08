"use client";

import {
  ArrowRightIcon,
  BookmarkIcon,
  RotateCcwIcon,
} from "@/components/auris-ui/auris-icons";
import { BrowserOmnibox } from "@/components/browser-window/browser-omnibox";
import { BrowserStatusPill } from "@/components/browser-window/browser-status-pill";

type BrowserToolbarProps = {
  address: string;
  bookmarked: boolean;
  crashMode?: "ok" | "auto" | "manual-only";
  lifecycle?: "creating" | "ready" | "hibernated" | "crashed";
  loading: boolean;
  mode?: "Human" | "AiSandbox" | "AiShared";
  onAddressChange(value: string): void;
  onAddressSubmit(value: string): void;
  onBack(): void;
  onBookmark(): void;
  onCreateTab?(mode: "Human" | "AiSandbox" | "AiShared"): void;
  onForward(): void;
  onReload(): void;
  onStop(): void;
};

export function BrowserToolbar({
  address,
  bookmarked,
  crashMode = "ok",
  lifecycle = "ready",
  loading,
  mode = "Human",
  onAddressChange,
  onAddressSubmit,
  onBack,
  onBookmark,
  onCreateTab,
  onForward,
  onReload,
  onStop,
}: BrowserToolbarProps) {
  return (
    <div aria-label="浏览器工具栏" className="browser-toolbar" role="toolbar">
      <div className="browser-toolbar__navigation">
        <ChromeButton label="后退" onClick={onBack}>
          <ArrowRightIcon aria-hidden="true" className="browser-toolbar__back" size={17} />
        </ChromeButton>
        <ChromeButton label="前进" onClick={onForward}>
          <ArrowRightIcon aria-hidden="true" size={17} />
        </ChromeButton>
        {loading ? (
          <ChromeButton label="停止加载" onClick={onStop}>
            <span aria-hidden="true" className="browser-toolbar__stop" />
          </ChromeButton>
        ) : (
          <ChromeButton label="重新加载" onClick={onReload}>
            <RotateCcwIcon aria-hidden="true" size={17} />
          </ChromeButton>
        )}
      </div>
      <BrowserOmnibox value={address} onChange={onAddressChange} onSubmit={onAddressSubmit} />
      <ChromeButton
        label={bookmarked ? "取消收藏当前页面" : "收藏当前页面"}
        onClick={onBookmark}
        pressed={bookmarked}
      >
        <BookmarkIcon aria-hidden="true" size={17} />
      </ChromeButton>
      <BrowserStatusPill crashMode={crashMode} lifecycle={lifecycle} mode={mode} />
      {onCreateTab ? (
        <label className="browser-toolbar__mode">
          <span className="browser-toolbar__mode-label">New · 新建</span>
          <select
            aria-label="新建标签模式"
            className="browser-toolbar__mode-select"
            defaultValue=""
            onChange={(event) => {
              const next = event.target.value as "Human" | "AiSandbox" | "AiShared" | "";
              event.target.value = "";
              if (!next) return;
              onCreateTab(next);
            }}
          >
            <option disabled value="">Mode · 模式</option>
            <option value="Human">Human · 人工</option>
            <option value="AiSandbox">Sandbox · 沙盒</option>
            <option value="AiShared">Shared · 共用</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}

function ChromeButton({
  children,
  label,
  onClick,
  pressed,
}: {
  children: React.ReactNode;
  label: string;
  onClick(): void;
  pressed?: boolean;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className="browser-chrome-button"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
