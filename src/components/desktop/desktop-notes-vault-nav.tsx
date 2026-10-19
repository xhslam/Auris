"use client";

import {
  createNotesFolderNavigateEvent,
  createNotesRootNavigateEvent,
  readLastNotesFolder,
} from "@/components/notes-v2/notes-navigation";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";
import { useWorkspaceRail } from "@/features/notes/workspace/use-workspace-rail";

/** Compact vault glyphs retain full names through labels and tooltips. */
export function DesktopNotesVaultNav() {
  const rail = useWorkspaceRail();

  if (!rail.canSwitch) {
    // A browser preview has the current vault but no native root-switching IPC.
    // Preserve its existing folder navigation instead of hiding the whole group.
    if (getDesktopBridge()) return null;
    const folder = readLastNotesFolder();
    const name = folder?.name ?? "当前笔记库";
    return (
      <div aria-label="笔记库" className="desktop-notes-vault-nav" role="group">
        <button
          aria-label={`打开${name}`}
          className="desktop-notes-vault-nav__root"
          title={name}
          type="button"
          onClick={() => window.dispatchEvent(createNotesRootNavigateEvent())}
        >
          <span aria-hidden="true" className="desktop-notes-vault-nav__root-mark">
            {Array.from(name)[0]}
          </span>
        </button>
      </div>
    );
  }

  const handleOpenFolder = (entry: (typeof rail.entries)[number]) => {
    if (!entry.instance.rootPath) return;

    window.dispatchEvent(
      createNotesFolderNavigateEvent({
        id: entry.instance.workspaceInstanceId,
        name: entry.displayName,
        path: entry.instance.rootPath,
      }),
    );
    void rail.switchTo(entry.instance.workspaceInstanceId);
  };

  return (
    <div
      aria-label="笔记库"
      className="desktop-notes-vault-nav"
      role="group"
    >
      <div className="desktop-notes-vault-nav__roots">
        {rail.entries.map((entry) => (
          <button
            aria-current={entry.isActive ? "true" : undefined}
            aria-label={NOTES_UI_COPY.workspaceRail.activate(entry.displayName)}
            aria-pressed={entry.isActive}
            className="desktop-notes-vault-nav__root"
            data-active={entry.isActive ? "true" : "false"}
            data-unavailable={entry.available ? "false" : "true"}
            disabled={rail.isSwitching || !entry.available}
            key={entry.instance.workspaceInstanceId}
            onClick={() => handleOpenFolder(entry)}
            title={
              entry.available
                ? entry.displayName
                : NOTES_UI_COPY.workspaceRail.unavailable(entry.displayName)
            }
            type="button"
          >
            <span
              aria-hidden="true"
              className="desktop-notes-vault-nav__root-mark"
            >
              {entry.glyph ?? "?"}
            </span>

          </button>
        ))}
      </div>
      <button
        aria-label={NOTES_UI_COPY.workspaceRail.add}
        className="desktop-notes-vault-nav__add"
        disabled={rail.isSwitching}
        onClick={() => void rail.addRoot()}
        title={NOTES_UI_COPY.workspaceRail.add}
        type="button"
      >
        <span aria-hidden="true">+</span>
      </button>
      {rail.error ? (
        <p className="desktop-notes-vault-nav__error" role="alert">
          {rail.error}
        </p>
      ) : null}
    </div>
  );
}
