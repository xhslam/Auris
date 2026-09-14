import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopNotesVaultNav } from "@/components/desktop/desktop-notes-vault-nav";
import { NOTES_FOLDER_NAVIGATE_EVENT } from "@/components/notes-v2/notes-navigation";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { __resetWorkspaceInstancesForTests } from "@/features/notes/workspace/workspace-instances-store";
import { resetHydratedDesktopBridgeCacheForTests } from "@/platform/desktop/use-hydrated-desktop-bridge";
import { createTestDesktopBridge } from "../../helpers/desktop-bridge";

type FolderNavigateDetail = {
  folder: { name: string; path: string };
};

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
  it("shows configured vault glyph squares and preserves the compact add square", async () => {
    installVaultBridge();
    render(<DesktopNotesVaultNav isSidebarExpanded={false} />);

    const personal = await screen.findByRole("button", {
      name: NOTES_UI_COPY.workspaceRail.activate("个人笔记"),
    });
    const course = screen.getByRole("button", {
      name: NOTES_UI_COPY.workspaceRail.activate("课程笔记"),
    });
    const add = screen.getByRole("button", {
      name: NOTES_UI_COPY.workspaceRail.add,
    });

    expect(personal).toHaveTextContent("个");
    expect(personal).toHaveAttribute("title", "个人笔记");
    expect(course).toHaveTextContent("课");
    expect(course).toHaveAttribute("title", "课程笔记");
    expect(add).toHaveTextContent("+");
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

  it("uses the compact glyph square to open the matching folder browser and keeps native add", async () => {
    const { pickDirectory, setRoot } = installVaultBridge();
    const user = userEvent.setup();
    const folderEvents: CustomEvent<FolderNavigateDetail>[] = [];
    const onFolderNavigate = (event: Event) => {
      folderEvents.push(event as CustomEvent<FolderNavigateDetail>);
    };
    window.addEventListener(NOTES_FOLDER_NAVIGATE_EVENT, onFolderNavigate);
    render(<DesktopNotesVaultNav isSidebarExpanded={false} />);

    await user.click(
      await screen.findByRole("button", {
        name: NOTES_UI_COPY.workspaceRail.activate("课程笔记"),
      }),
    );
    await waitFor(() => expect(setRoot).toHaveBeenCalledWith("/vaults/course"));
    expect(folderEvents).toHaveLength(1);
    expect(folderEvents[0]?.detail.folder).toMatchObject({
      name: "课程笔记",
      path: "/vaults/course",
    });

    await user.click(
      screen.getByRole("button", { name: NOTES_UI_COPY.workspaceRail.add }),
    );
    await waitFor(() => expect(pickDirectory).toHaveBeenCalledOnce());
    window.removeEventListener(NOTES_FOLDER_NAVIGATE_EVENT, onFolderNavigate);
  });
});
