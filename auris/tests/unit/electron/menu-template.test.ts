import { describe, expect, it, vi } from "vitest";
import { createApplicationMenuTemplate } from "../../../electron/menu-template.cjs";

function findMenu(template: Array<{ label?: string }>, label: string) {
  return template.find((item) => item.label === label);
}

describe("application menu template", () => {
  it("includes desktop navigation, downloads, and upgrade entry shortcuts", () => {
    const template = createApplicationMenuTemplate({
      callbacks: {
        onCheckForUpdates: vi.fn(),
        onChooseVault: vi.fn(),
        onOpenAssessment: vi.fn(),
        onOpenBrowser: vi.fn(),
        onOpenHome: vi.fn(),
        onOpenNotes: vi.fn(),
        onOpenWorkspace: vi.fn(),
        onRevealDownloads: vi.fn(),
      },
      includeBrowserMenu: true,
      includeDevTools: true,
      isMac: false,
    });

    const fileMenu = findMenu(template, "File");
    const helpMenu = findMenu(template, "Help");

    expect(fileMenu?.submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accelerator: "CmdOrCtrl+0",
          label: "Open Home",
        }),
        expect.objectContaining({
          accelerator: "CmdOrCtrl+1",
          label: "Open Workspace",
        }),
        expect.objectContaining({
          accelerator: "CmdOrCtrl+2",
          label: "Open Notes",
        }),
        expect.objectContaining({
          accelerator: "CmdOrCtrl+3",
          label: "Open Assessment",
        }),
        expect.objectContaining({
          accelerator: "CmdOrCtrl+Shift+B",
          label: "Nia 浏览器",
        }),
        expect.objectContaining({
          accelerator: "CmdOrCtrl+Shift+O",
          label: "Choose Notes Folder",
        }),
        expect.objectContaining({
          accelerator: "CmdOrCtrl+Shift+D",
          label: "Show Downloads Folder",
        }),
      ]),
    );

    expect(helpMenu?.submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accelerator: "CmdOrCtrl+Shift+U",
          label: "Check for Updates",
        }),
      ]),
    );
  });
});
