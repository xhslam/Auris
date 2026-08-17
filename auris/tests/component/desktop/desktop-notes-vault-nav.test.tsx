import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopNotesVaultNav } from "@/components/desktop/desktop-notes-vault-nav";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { __resetWorkspaceInstancesForTests } from "@/features/notes/workspace/workspace-instances-store";
import { resetHydratedDesktopBridgeCacheForTests } from "@/platform/desktop/use-hydrated-desktop-bridge";
import { createTestDesktopBridge } from "../../helpers/desktop-bridge";

function installVaultBridge() {
  const pickDirectory = vi.fn(async () => ({}));
  const setRoot = vi.fn(async () => ({}));
  window.shadowingDesktop = createTestDesktopBridge({
    vault: {
      listRoots: async () => [
        {
          available: true,
          isActive: true,
          name: "个人笔记",
          path: "/vaults/personal",
        },
        {
          available: true,
          isActive: false,
          name: "课程笔记",
          path: "/vaults/course",
        },
      ],
      pickDirectory,
      setRoot,
    },
  });
  return { pickDirectory, setRoot };
}

afterEach(() => {
  delete window.shadowingDesktop;
  resetHydratedDesktopBridgeCacheForTests();
  __resetWorkspaceInstancesForTests();
});

describe("DesktopNotesVaultNav", () => {
  it("keeps the collapsed sidebar to a compact add-vault entry", async () => {
    installVaultBridge();
    render(<DesktopNotesVaultNav isSidebarExpanded={false} />);
    await screen.findByRole("button", {
      name: NOTES_UI_COPY.workspaceRail.add,
    });
    expect(screen.queryByText("个人笔记")).not.toBeInTheDocument();
    expect(screen.queryByText("课程笔记")).not.toBeInTheDocument();
  });

  it("shows vault names as Notes sub-navigation when expanded", async () => {
    installVaultBridge();
    render(<DesktopNotesVaultNav isSidebarExpanded />);
    expect(await screen.findByText("个人笔记")).toBeInTheDocument();
    expect(screen.getByText("课程笔记")).toBeInTheDocument();
    expect(screen.getByText("添加笔记库")).toBeInTheDocument();
  });

  it("uses the native picker to add a vault and switches selected vaults", async () => {
    const { pickDirectory, setRoot } = installVaultBridge();
    const user = userEvent.setup();
    render(<DesktopNotesVaultNav isSidebarExpanded />);
    await user.click(await screen.findByRole("button", { name: "添加笔记库" }));
    await waitFor(() => expect(pickDirectory).toHaveBeenCalledOnce());
    await user.click(
      screen.getByRole("button", {
        name: NOTES_UI_COPY.workspaceRail.activate("课程笔记"),
      }),
    );
    await waitFor(() => expect(setRoot).toHaveBeenCalledWith("/vaults/course"));
  });
});
