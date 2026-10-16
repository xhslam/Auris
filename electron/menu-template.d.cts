import type { MenuItemConstructorOptions } from "electron";

declare namespace menuTemplate {
  type MenuEntry = {
    label?: string;
    accelerator?: string;
    click?: () => unknown;
    role?: MenuItemConstructorOptions["role"];
    type?: "separator";
    submenu?: MenuEntry[];
  };
  type Callbacks = {
    onCheckForUpdates?: () => unknown;
    onChooseVault?: () => unknown;
    onOpenAssessment?: () => unknown;
    onOpenBrowser?: () => unknown;
    onOpenHome?: () => unknown;
    onOpenNotes?: () => unknown;
    onOpenWorkspace?: () => unknown;
    onRevealDownloads?: () => unknown;
    onNotesCommand?: (command: string) => unknown;
  };
  function createApplicationMenuTemplate(options: {
    callbacks: Callbacks;
    includeBrowserMenu?: boolean;
    includeDevTools?: boolean;
    isMac?: boolean;
  }): MenuEntry[];
}
export = menuTemplate;
