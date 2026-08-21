"use client";

import {
  createNotesFolderNavigateEvent,
} from "@/components/notes-v2/notes-navigation";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import { useWorkspaceRail } from "@/features/notes/workspace/use-workspace-rail";

type DesktopNotesVaultNavProps = {
  isSidebarExpanded: boolean;
};

/**
 * Notes 的笔记库属于应用侧栏的二级导航，而不是编辑画布旁的一列。
 *
 * 收起时，每个已授权笔记库以其名称首个可见字形显示为紧凑方块，紧随其后的
 * `+` 方块始终保留为添加入口；展开时，同一组条目展示完整名称。
 */
export function DesktopNotesVaultNav({
  isSidebarExpanded,
}: DesktopNotesVaultNavProps) {
  const rail = useWorkspaceRail();

  if (!rail.canSwitch) {
    return null;
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
      data-expanded={isSidebarExpanded ? "true" : "false"}
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
            {isSidebarExpanded ? (
              <span className="desktop-notes-vault-nav__root-name">
                {entry.displayName}
              </span>
            ) : null}
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
        {isSidebarExpanded ? <span>添加笔记库</span> : null}
      </button>
      {rail.error ? (
        <p className="desktop-notes-vault-nav__error" role="alert">
          {rail.error}
        </p>
      ) : null}
    </div>
  );
}
