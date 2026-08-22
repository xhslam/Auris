import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AurisSettings } from "@/components/settings/auris-settings";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

const activeRoot = {
  available: true,
  isActive: true,
  name: "Personal Notes",
  path: "/Users/test/Personal Notes",
};

const archiveRoot = {
  available: true,
  isActive: false,
  name: "Archive",
  path: "/Users/test/Archive",
};

function installVaultBridge() {
  const vault = {
    createDirectory: vi.fn(async () => undefined),
    listFiles: vi.fn(async () => [
      {
        absolutePath: "/Users/test/Personal Notes/Inbox",
        fileName: "Inbox",
        isDirectory: true,
        relativePath: "Inbox",
      },
      {
        absolutePath: "/Users/test/Personal Notes/Inbox/plan.md",
        fileName: "plan.md",
        isDirectory: false,
        relativePath: "Inbox/plan.md",
      },
    ]),
    listRoots: vi.fn(async () => [activeRoot, archiveRoot]),
    onDidChange: vi.fn(() => () => undefined),
    pickDirectory: vi.fn(async () => ({
      directoryName: activeRoot.name,
      hasVault: true,
      pluginDirectory: null,
      vaultPath: activeRoot.path,
    })),
    removeFile: vi.fn(async () => undefined),
    removeRoot: vi.fn(async () => [activeRoot]),
    saveFile: vi.fn(async () => undefined),
    setRoot: vi.fn(async () => ({
      directoryName: archiveRoot.name,
      hasVault: true,
      pluginDirectory: null,
      vaultPath: archiveRoot.path,
    })),
    trashRoot: vi.fn(async () => [activeRoot]),
  };

  window.shadowingDesktop = { vault } as unknown as DesktopBridge;
  return vault;
}

describe("AurisSettings Vault management", () => {
  afterEach(() => {
    delete window.shadowingDesktop;
    vi.restoreAllMocks();
  });

  it("creates and deletes files and folders inside the active Vault", async () => {
    const user = userEvent.setup();
    const vault = installVaultBridge();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AurisSettings />);
    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(await screen.findByRole("heading", { name: "Vaults" })).toBeInTheDocument();
    expect(await screen.findByText("Inbox/plan.md")).toBeInTheDocument();

    const input = screen.getByLabelText("New file or folder path");
    await user.type(input, "daily/today");
    await user.click(screen.getByRole("button", { name: "New File" }));
    await waitFor(() => {
      expect(vault.saveFile).toHaveBeenCalledWith("daily/today.md", "");
    });

    await user.type(input, "projects");
    await user.click(screen.getByRole("button", { name: "New Folder" }));
    await waitFor(() => {
      expect(vault.createDirectory).toHaveBeenCalledWith("projects");
    });

    const entry = screen.getByText("Inbox/plan.md").closest("div")?.parentElement;
    expect(entry).not.toBeNull();
    await user.click(within(entry as HTMLElement).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(vault.removeFile).toHaveBeenCalledWith("Inbox/plan.md");
    });
  });

  it("removes a Vault from Auris or moves the selected Vault folder to the system Trash", async () => {
    const user = userEvent.setup();
    const vault = installVaultBridge();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AurisSettings />);
    await user.click(screen.getByRole("button", { name: "Notes" }));

    const archiveCard = (await screen.findByText("Archive")).closest("article");
    expect(archiveCard).not.toBeNull();

    await user.click(within(archiveCard as HTMLElement).getByRole("button", { name: "Remove" }));
    await waitFor(() => {
      expect(vault.removeRoot).toHaveBeenCalledWith(archiveRoot.path);
    });

    await user.click(within(archiveCard as HTMLElement).getByRole("button", { name: "Delete Folder" }));
    await waitFor(() => {
      expect(vault.trashRoot).toHaveBeenCalledWith(archiveRoot.path);
    });
  });
});
