"use strict";

function createApplicationMenuTemplate(options) {
  const {
    callbacks,
    includeBrowserMenu = false,
    includeDevTools = false,
    isMac = process.platform === "darwin",
  } = options;

  const fileMenu = {
    label: "File",
    submenu: [
      {
        accelerator: "CmdOrCtrl+0",
        click: callbacks.onOpenHome,
        label: "Open Home",
      },
      {
        accelerator: "CmdOrCtrl+1",
        click: callbacks.onOpenWorkspace,
        label: "Open Workspace",
      },
      {
        accelerator: "CmdOrCtrl+2",
        click: callbacks.onOpenNotes,
        label: "Open Notes",
      },
      {
        accelerator: "CmdOrCtrl+3",
        click: callbacks.onOpenAssessment,
        label: "Open Assessment",
      },
      ...(includeBrowserMenu && typeof callbacks.onOpenBrowser === "function"
        ? [{
          accelerator: "CmdOrCtrl+Shift+B",
          click: callbacks.onOpenBrowser,
          label: "Nia 浏览器",
        }]
        : []),
      {
        accelerator: "CmdOrCtrl+Shift+O",
        click: callbacks.onChooseVault,
        label: "Choose Notes Folder",
      },
      {
        accelerator: "CmdOrCtrl+Shift+D",
        click: callbacks.onRevealDownloads,
        label: "Show Downloads Folder",
      },
      { type: "separator" },
      isMac ? { role: "close" } : { role: "quit" },
    ],
  };

  const editMenu = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  };

  const viewMenu = {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "togglefullscreen" },
      ...(includeDevTools ? [{ role: "toggleDevTools" }] : []),
    ],
  };

  const windowMenu = {
    label: "Window",
    submenu: [{ role: "minimize" }, isMac ? { role: "zoom" } : { role: "close" }],
  };

  const helpMenu = {
    label: "Help",
    submenu: [
      {
        accelerator: "CmdOrCtrl+Shift+U",
        click: callbacks.onCheckForUpdates,
        label: "Check for Updates",
      },
    ],
  };

  if (!isMac) {
    return [fileMenu, editMenu, viewMenu, windowMenu, helpMenu];
  }

  return [
    {
      label: "Auris",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
    helpMenu,
  ];
}

module.exports = {
  createApplicationMenuTemplate,
};
