import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotesWorkspaceRail } from "@/components/notes-v2/notes-workspace-rail";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { __resetWorkspaceInstancesForTests } from "@/features/notes/workspace/workspace-instances-store";
import type { DesktopVaultRoot } from "@/platform/desktop/desktop-bridge";
import { resetHydratedDesktopBridgeCacheForTests } from "@/platform/desktop/use-hydrated-desktop-bridge";
import { createTestDesktopBridge } from "../../helpers/desktop-bridge";

function installVaultBridge(roots: DesktopVaultRoot[]) {
  const listRoots = vi.fn(async () => roots);
  const setRoot = vi.fn(async () => ({
    directoryName: null,
    hasVault: true,
    pluginDirectory: null,
    vaultPath: null,
  }));
  const pickDirectory = vi.fn(async () => ({
    directoryName: null,
    hasVault: true,
    pluginDirectory: null,
    vaultPath: null,
  }));

  window.shadowingDesktop = createTestDesktopBridge({
    vault: { listRoots, pickDirectory, setRoot },
  });

  return { listRoots, pickDirectory, setRoot };
}

function root(overrides: Partial<DesktopVaultRoot> & { path: string }): DesktopVaultRoot {
  return {
    available: true,
    isActive: false,
    name: overrides.path.split("/").filter(Boolean).at(-1) ?? overrides.path,
    ...overrides,
  };
}

describe("NotesWorkspaceRail", () => {
  afterEach(() => {
    delete window.shadowingDesktop;
    resetHydratedDesktopBridgeCacheForTests();
    __resetWorkspaceInstancesForTests();
  });

  it("renders one entry per authorized root, labelled by its folder name", async () => {
    installVaultBridge([
      root({ isActive: true, path: "/vaults/Alpha" }),
      root({ path: "/vaults/Beta" }),
    ]);

    render(<NotesWorkspaceRail />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: NOTES_UI_COPY.workspaceRail.activate("Alpha"),
        }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.workspaceRail.activate("Beta"),
      }),
    ).toBeInTheDocument();
  });

  it("marks the vault the main process reports as active, not the first entry", async () => {
    installVaultBridge([
      root({ path: "/vaults/Alpha" }),
      root({ isActive: true, path: "/vaults/Beta" }),
    ]);

    render(<NotesWorkspaceRail />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: NOTES_UI_COPY.workspaceRail.activate("Beta"),
        }),
      ).toHaveAttribute("aria-pressed", "true");
    });
    expect(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.workspaceRail.activate("Alpha"),
      }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("switches the vault root through the main process", async () => {
    const { setRoot } = installVaultBridge([
      root({ isActive: true, path: "/vaults/Alpha" }),
      root({ path: "/vaults/Beta" }),
    ]);
    const user = userEvent.setup();

    render(<NotesWorkspaceRail />);

    const beta = await screen.findByRole("button", {
      name: NOTES_UI_COPY.workspaceRail.activate("Beta"),
    });
    await user.click(beta);

    await waitFor(() => {
      expect(setRoot).toHaveBeenCalledWith("/vaults/Beta");
    });
  });

  it("treats clicking the active workspace as a strict no-op", async () => {
    const { setRoot } = installVaultBridge([
      root({ isActive: true, path: "/vaults/Alpha" }),
    ]);
    const user = userEvent.setup();

    render(<NotesWorkspaceRail />);

    const alpha = await screen.findByRole("button", {
      name: NOTES_UI_COPY.workspaceRail.activate("Alpha"),
    });
    await user.click(alpha);

    // 重复换根会让主进程重启 watcher 并广播一次 vault:changed，把整个文档快照
    // 白重载一遍。
    expect(setRoot).not.toHaveBeenCalled();
  });

  it("shows an unreachable root as unavailable instead of pretending it works", async () => {
    installVaultBridge([
      root({ isActive: true, path: "/vaults/Alpha" }),
      root({ available: false, path: "/Volumes/Ejected/Notes" }),
    ]);

    render(<NotesWorkspaceRail />);

    const entry = await screen.findByRole("button", {
      name: NOTES_UI_COPY.workspaceRail.activate("Notes"),
    });
    expect(entry).toHaveAttribute("data-unavailable", "true");
    expect(entry).toHaveAttribute(
      "title",
      NOTES_UI_COPY.workspaceRail.unavailable("Notes"),
    );
  });

  it("surfaces a failed switch instead of leaving a misleading highlight", async () => {
    const roots = [
      root({ isActive: true, path: "/vaults/Alpha" }),
      root({ path: "/vaults/Beta" }),
    ];
    const listRoots = vi.fn(async () => roots);
    const setRoot = vi.fn(async () => {
      throw new Error("This vault root is currently unavailable.");
    });
    window.shadowingDesktop = createTestDesktopBridge({
      vault: { listRoots, setRoot },
    });
    const user = userEvent.setup();

    render(<NotesWorkspaceRail />);

    const beta = await screen.findByRole("button", {
      name: NOTES_UI_COPY.workspaceRail.activate("Beta"),
    });
    await user.click(beta);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This vault root is currently unavailable.",
      );
    });
    // 切换失败后高亮必须仍在 Alpha 上：抢先 activate 会让界面与真实 vault 不一致。
    expect(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.workspaceRail.activate("Alpha"),
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("disambiguates two roots that share a folder name", async () => {
    installVaultBridge([
      root({ isActive: true, name: "Notes", path: "/work/Notes" }),
      root({ name: "Notes", path: "/personal/Notes" }),
    ]);

    render(<NotesWorkspaceRail />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: NOTES_UI_COPY.workspaceRail.activate("Notes"),
        }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.workspaceRail.activate("Notes 2"),
      }),
    ).toBeInTheDocument();
  });

  it("adds a new root only through the native picker", async () => {
    const { pickDirectory } = installVaultBridge([
      root({ isActive: true, path: "/vaults/Alpha" }),
    ]);
    const user = userEvent.setup();

    render(<NotesWorkspaceRail />);

    await user.click(
      await screen.findByRole("button", { name: NOTES_UI_COPY.workspaceRail.add }),
    );

    // 新根只能经由系统对话框授权——renderer 不能自己给出一个任意路径。
    await waitFor(() => {
      expect(pickDirectory).toHaveBeenCalledTimes(1);
    });
  });

  it("renders nothing without a vault bridge that can switch roots", async () => {
    // 浏览器里跑 dev server 时没有 vault bridge。渲染一条点不动的空轨会让人
    // 以为功能坏了。
    window.shadowingDesktop = createTestDesktopBridge();

    const { container } = render(<NotesWorkspaceRail />);

    await waitFor(() => {
      expect(container.querySelector(".notes-v2__rail")).toBeNull();
    });
  });

  it("renders nothing when disabled", () => {
    installVaultBridge([root({ isActive: true, path: "/vaults/Alpha" })]);

    const { container } = render(<NotesWorkspaceRail enabled={false} />);

    expect(container.querySelector(".notes-v2__rail")).toBeNull();
  });

  it("refuses to remove the active workspace from the rail", async () => {
    installVaultBridge([
      root({ isActive: true, path: "/vaults/Alpha" }),
      root({ path: "/vaults/Beta" }),
    ]);
    const user = userEvent.setup();

    render(<NotesWorkspaceRail />);

    const alpha = await screen.findByRole("button", {
      name: NOTES_UI_COPY.workspaceRail.activate("Alpha"),
    });
    await user.pointer({ keys: "[MouseRight]", target: alpha });

    // 收起当前工作区后 rail 上就没有它，而它仍是主进程的当前根——界面会和事实
    // 不一致。所以这一项禁用而不是隐藏，用户能看到原因。
    const remove = await screen.findByRole("menuitem", { name: /从列表移除/u });
    expect(remove).toHaveAttribute("aria-disabled", "true");
  });

  it("removes a non-active workspace from the rail on request", async () => {
    installVaultBridge([
      root({ isActive: true, path: "/vaults/Alpha" }),
      root({ path: "/vaults/Beta" }),
    ]);
    const user = userEvent.setup();

    render(<NotesWorkspaceRail />);

    const beta = await screen.findByRole("button", {
      name: NOTES_UI_COPY.workspaceRail.activate("Beta"),
    });
    await user.pointer({ keys: "[MouseRight]", target: beta });
    await user.click(await screen.findByRole("menuitem", { name: /从列表移除/u }));

    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: NOTES_UI_COPY.workspaceRail.activate("Beta"),
        }),
      ).not.toBeInTheDocument();
    });
  });

  it("closes the context menu on Escape", async () => {
    installVaultBridge([root({ isActive: true, path: "/vaults/Alpha" })]);
    const user = userEvent.setup();

    render(<NotesWorkspaceRail />);

    const alpha = await screen.findByRole("button", {
      name: NOTES_UI_COPY.workspaceRail.activate("Alpha"),
    });
    await user.pointer({ keys: "[MouseRight]", target: alpha });
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    // Escape 后焦点必须回到触发元素，否则键盘用户落到 <body> 上丢失位置。
    expect(alpha).toHaveFocus();
  });
});
