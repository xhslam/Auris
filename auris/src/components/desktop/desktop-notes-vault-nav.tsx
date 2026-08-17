"use client";

import { useWorkspaceRail } from "@/features/notes/workspace/use-workspace-rail";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";

type DesktopNotesVaultNavProps = {
  isSidebarExpanded: boolean;
};

/**
 * Notes 的笔记库属于应用侧栏的二级导航，而不是编辑画布旁的一列。
 * 收起时只保留添加入口；展开时显示已授权的笔记库名称。
 */
export function DesktopNotesVaultNav({
  isSidebarExpanded,
}: DesktopNotesVaultNavProps) {
  const rail = useWorkspaceRail();

  if (!rail.canSwitch) {
    return null;
  }

  return (
    <div
      aria-label="笔记库"
      className="desktop-notes-vault-nav"
      data-expanded={isSidebarExpanded ? "true" : "false"}
    >
      {isSidebarExpanded ? (
        <div className="desktop-notes-vault-nav__roots" role="list">
          {rail.entries.map((entry) => (
            <button
              aria-current={entry.isActive ? "true" : undefined}
              aria-label={NOTES_UI_COPY.workspaceRail.activate(
                entry.displayName,
              )}
              aria-pressed={entry.isActive}
              className="desktop-notes-vault-nav__root"
              data-unavailable={entry.available ? "false" : "true"}
              disabled={rail.isSwitching || !entry.available}
              key={entry.instance.workspaceInstanceId}
              onClick={() =>
                void rail.switchTo(entry.instance.workspaceInstanceId)
              }
              title={
                entry.available
                  ? entry.displayName
                  : NOTES_UI_COPY.workspaceRail.unavailable(entry.displayName)
              }
              type="button"
            >
              <span
                className="desktop-notes-vault-nav__root-mark"
                aria-hidden="true"
              >
                {entry.glyph ?? "·"}
              </span>
              <span className="desktop-notes-vault-nav__root-name">
                {entry.displayName}
              </span>
            </button>
          ))}
        </div>
      ) : null}
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
