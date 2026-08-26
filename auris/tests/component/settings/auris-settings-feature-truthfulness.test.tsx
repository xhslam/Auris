import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AurisSettings } from "@/components/settings/auris-settings";
import { UPDATE_SETTINGS_NAVIGATION_EVENT } from "@/features/updates/update-navigation";
import type { DesktopUpdateSnapshot } from "@/platform/desktop/desktop-bridge";
import type { DesktopIslandSettings } from "@/features/desktop-island/desktop-island.types";
import { resetHydratedDesktopBridgeCacheForTests } from "@/platform/desktop/use-hydrated-desktop-bridge";
import { __resetAppUpdateStoreForTests } from "@/features/updates/update-store";
import { __resetUpdateSubscriptionForTests } from "@/features/updates/use-app-updates";
import { createTestDesktopBridge } from "../../helpers/desktop-bridge";

/**
 * 完整桥来自 `tests/helpers/desktop-bridge`：`isDesktopBridge()` 要求所有必填
 * 子桥到位，只挂一个 `updates` 会被整体判为 null——那正是上一版用例挂不上的
 * 原因。
 */
function installUpdatesBridge(snapshot: Partial<DesktopUpdateSnapshot> = {}) {
  const state = {
    canInstallInPlace: false,
    currentVersion: "1.0.0",
    downloadProgress: null,
    error: null,
    errorCode: null,
    lastCheckedAt: null,
    releasesUrl: "https://example.test/releases",
    stalledOperation: null,
    status: "idle" as const,
    supported: true,
    updateInfo: null,
    ...snapshot,
  };
  const check = vi.fn(async () => state);

  window.shadowingDesktop = createTestDesktopBridge({
    updates: {
      check,
      download: vi.fn(async () => state),
      getState: vi.fn(async () => state),
      onStateChange: vi.fn(() => () => undefined),
      openReleases: vi.fn(async () => ({ ok: true })),
      quitAndInstall: vi.fn(async () => ({ ok: true })),
      recover: vi.fn(async () => ({ ok: true, snapshot: state })),
      reset: vi.fn(async () => state),
    },
  });

  return { check };
}

describe("AurisSettings feature truthfulness", () => {
  afterEach(() => {
    delete window.shadowingDesktop;
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    resetHydratedDesktopBridgeCacheForTests();
    __resetUpdateSubscriptionForTests();
    __resetAppUpdateStoreForTests();
  });

  it("switches an already-mounted settings page to About on an update navigation request", async () => {
    render(<AurisSettings />);
    expect(screen.getByRole("heading", { name: "外观" })).toBeInTheDocument();

    window.dispatchEvent(
      new CustomEvent(UPDATE_SETTINGS_NAVIGATION_EVENT, {
        detail: { section: "about" },
      }),
    );

    expect(await screen.findByRole("heading", { name: "关于" })).toBeInTheDocument();
  });

  it("loads and persists the native desktop island preferences", async () => {
    const user = userEvent.setup();
    const updateSettings = vi.fn(async (patch: Partial<DesktopIslandSettings>) => ({
      enabled: patch.enabled ?? true,
      expandOnHover: patch.expandOnHover ?? false,
      privacyMode: patch.privacyMode ?? false,
    }));
    window.shadowingDesktop = createTestDesktopBridge({
      desktopIsland: {
        acknowledgeIntent: vi.fn(async () => undefined),
        getSettings: vi.fn(async () => ({
          enabled: true, expandOnHover: false, privacyMode: false,
        })),
        listPendingIntents: vi.fn(async () => []),
        onIntent: vi.fn(() => () => undefined),
        syncSnapshot: vi.fn(async () => ({ accepted: true, revision: 1 })),
        updateSettings,
      },
    });

    render(<AurisSettings />);
    const privacySwitch = await screen.findByRole("switch", { name: "隐私模式" });
    expect(privacySwitch).toHaveAttribute("aria-checked", "false");
    await user.click(privacySwitch);
    expect(updateSettings).toHaveBeenCalledWith({ privacyMode: true });
  });

  it("opens the About update center and checks immediately from the update-button deep link", async () => {
    window.history.replaceState(null, "", "/settings?section=about&check=1#updates");
    const { check } = installUpdatesBridge();

    render(<AurisSettings />);

    expect(await screen.findByRole("heading", { name: "关于" })).toBeInTheDocument();
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "立即检查" })).toBeInTheDocument();
  });

  it("describes the active byte-based large-file policy without inert toggles", async () => {
    const user = userEvent.setup();
    render(<AurisSettings />);

    await user.click(screen.getByText("编辑器"));

    expect(
      screen.getByText(/按 UTF-8 实际字节数评估.*1 MB.*5 MB/u),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("超过 1 MB 的文件自动以源码模式打开"),
    ).not.toBeInTheDocument();
  });

  it("does not advertise unsupported file policies and keeps Pandoc export truthful", async () => {
    const user = userEvent.setup();
    render(<AurisSettings />);

    await user.click(screen.getByText("文件与图片"));

    expect(
      screen.getByText(/尚未提供隐藏文件过滤.*相关开关已从设置中移除/u),
    ).toBeInTheDocument();
    expect(screen.getByText(/不提供“确认退出”或“自动保存策略”的切换/u)).toBeInTheDocument();
    expect(screen.queryByText("最大版本数")).not.toBeInTheDocument();

    await user.click(screen.getByText("Formats"));
    expect(
      screen.getByText(/检测本机 Pandoc 是否可用.*对应能力开放后显示/u),
    ).toBeInTheDocument();
  });

  it("edits and persists bindings from the unified shortcut registry", async () => {
    const user = userEvent.setup();
    render(<AurisSettings />);

    await user.click(screen.getByText("快捷键"));

    expect(
      screen.getByText(/绑定直接驱动 Notes 命令总线.*冲突/u),
    ).toBeInTheDocument();
    const saveBinding = screen.getByLabelText("保存当前笔记");
    await user.clear(saveBinding);
    await user.type(saveBinding, "Mod+Alt+S");
    await user.tab();

    expect(screen.getByRole("button", { name: "导入" })).toBeInTheDocument();
    expect(
      JSON.parse(
        window.localStorage.getItem("auris.notes.shortcuts.v1") ?? "null",
      ),
    ).toMatchObject({
      overrides: {
        "global:notes.save": "mod+alt+s",
      },
      schemaVersion: 1,
    });
  });

  it("persists a real Notes interface locale", async () => {
    const user = userEvent.setup();
    render(<AurisSettings />);

    await user.click(screen.getByText("语言"));
    await user.selectOptions(screen.getByLabelText("Notes 界面语言"), "en-US");

    expect(window.localStorage.getItem("auris.notes.locale.v1")).toBe("en-US");
    expect(document.documentElement.lang).toBe("en-US");
  });

  // 更新能力现在真的接通了（electron-updater + 主进程控制器），所以这两个用例
  // 守护的不再是"不许出现更新控件"，而是同一条诚实性不变量的两半：没有可用的
  // 更新通道时不许出现能点的按钮；有通道时按钮必须真的打到主进程。
  it("does not offer update controls when no updater channel exists", async () => {
    const user = userEvent.setup();
    render(<AurisSettings />);

    await user.click(screen.getByText("关于"));

    expect(screen.getByText("当前环境不可用")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "立即检查" }),
    ).not.toBeInTheDocument();
  });

  it("wires the check button to the real main-process updater", async () => {
    const { check } = installUpdatesBridge();
    const user = userEvent.setup();
    render(<AurisSettings />);

    await user.click(screen.getByText("关于"));

    const checkButton = await screen.findByRole("button", { name: "立即检查" });
    expect(screen.queryByText("当前环境不可用")).not.toBeInTheDocument();

    await user.click(checkButton);
    await waitFor(() => {
      expect(check).toHaveBeenCalledTimes(1);
    });
  });

  it("reports the real running version instead of a hardcoded one", async () => {
    installUpdatesBridge({ currentVersion: "2.5.1" } as Partial<DesktopUpdateSnapshot>);
    const user = userEvent.setup();
    render(<AurisSettings />);

    await user.click(screen.getByText("关于"));

    await waitFor(() => {
      expect(screen.getByText("版本 2.5.1")).toBeInTheDocument();
    });
  });
});
