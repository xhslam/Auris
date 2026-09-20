import { describe, expect, it } from "vitest";

describe("Terminal focus routing and orphan recovery", () => {
  function isTerminalSurfaceOrHost(element: Element | null): boolean {
    if (!element) return false;
    return Boolean(
      element.closest?.(".notes-v2__terminal-surface") ||
      element.closest?.(".notes-v2__terminal-host") ||
      element.closest?.(".notes-v2__minimal-terminal-pane") ||
      element.classList?.contains?.("xterm-helper-textarea"),
    );
  }

  function shouldRestoreEditorFocus(activeElement: Element | null): boolean {
    return (
      !activeElement ||
      activeElement === document.body ||
      isTerminalSurfaceOrHost(activeElement)
    );
  }

  it("restores editor focus when closing terminal with focus inside terminal", () => {
    const terminalHost = document.createElement("div");
    terminalHost.className = "notes-v2__terminal-host";
    const xtermTextarea = document.createElement("textarea");
    xtermTextarea.className = "xterm-helper-textarea";
    terminalHost.appendChild(xtermTextarea);
    document.body.appendChild(terminalHost);

    expect(shouldRestoreEditorFocus(xtermTextarea)).toBe(true);
    document.body.removeChild(terminalHost);
  });

  it("restores editor focus when focus fell onto document.body", () => {
    expect(shouldRestoreEditorFocus(document.body)).toBe(true);
    expect(shouldRestoreEditorFocus(null)).toBe(true);
  });

  it("does NOT yank focus when user was typing in a sidebar filter or input", () => {
    const sidebarInput = document.createElement("input");
    sidebarInput.className = "notes-file-tree__search-input";
    document.body.appendChild(sidebarInput);

    expect(shouldRestoreEditorFocus(sidebarInput)).toBe(false);
    document.body.removeChild(sidebarInput);
  });
});
