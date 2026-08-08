import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AurisSettings } from "@/components/settings/auris-settings";
import { resetHydratedDesktopBridgeCacheForTests } from "@/platform/desktop/use-hydrated-desktop-bridge";

describe("AurisSettings feature truthfulness", () => {
  afterEach(() => {
    delete window.shadowingDesktop;
    window.localStorage.clear();
    resetHydratedDesktopBridgeCacheForTests();
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

  it("describes real document history and keeps Pandoc export truthful", async () => {
    const user = userEvent.setup();
    render(<AurisSettings />);

    await user.click(screen.getByText("文件与图片"));

    expect(
      screen.getByText(/不超过 512 KB.*最多保留 50 个.*Hot Exit/u),
    ).toBeInTheDocument();
    expect(screen.queryByText("最大版本数")).not.toBeInTheDocument();
    expect(
      screen.getByText(/检测成功只代表运行环境就绪.*不代表 Auris 已支持 Pandoc/u),
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

  it("does not simulate an updater that is not connected", async () => {
    const user = userEvent.setup();
    render(<AurisSettings />);

    await user.click(screen.getByText("关于"));

    expect(
      screen.getByText(/桌面端自动检查、下载和安装更新尚未接入/u),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "立即检查" }),
    ).not.toBeInTheDocument();
  });
});
