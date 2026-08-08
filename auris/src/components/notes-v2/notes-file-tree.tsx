"use client";

import type { CSSProperties, JSX } from "react";
import { useMemo, useRef, useState, useCallback } from "react";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import {
  NotesFileTreeContextMenu,
  type ContextMenuTarget,
} from "@/components/notes-v2/notes-file-tree-context-menu";
import { buildMoveEntryPlan } from "@/features/notes/documents/move-entry-plan";
import type { VaultEntry } from "@/features/notes/vault/vault-types";
import {
  getVaultEntryDisplayKind,
  isHiddenVaultPath,
  isSystemVaultFile,
  type VaultEntryDisplayKind,
} from "@/features/notes/vault/vault-path";

type TreeNode = {
  children: TreeNode[];
  kind: VaultEntry["kind"];
  displayKind: VaultEntryDisplayKind | null;
  name: string;
  path: string;
};

type NotesFileTreeProps = {
  activePath: string | null;
  entries: VaultEntry[];
  onOpenPath: (path: string) => void;
  onCreateNoteInPath?: (folderPath: string) => void;
  onCreateFolderInPath?: (parentPath: string) => void;
  onDeletePath?: (path: string, kind: "directory" | "file") => void;
  onRenamePath?: (path: string, kind: "directory" | "file") => void;
  /**
   * Move a file/folder into another folder via drag & drop. The target folder
   * is "" for the vault root.
   */
  onMovePath?: (sourcePath: string, targetFolderPath: string) => void;
  /**
   * When true, every folder starts collapsed (the workspace switcher uses
   * this so opening it only reveals top-level folders, not their contents).
   */
  collapseAllByDefault?: boolean;
  variant?: "default" | "obsidian";
};

const MOVE_DRAG_MIME = "application/x-notes-vault-path";

// `dropTarget` state: `null` = nothing hovered, `""` = the vault root area,
// any other value = that folder's path (folder paths are never empty).
const DROP_TARGET_ROOT = "";

// Reuses the single move-validity source of truth (buildMoveEntryPlan) so the
// drag-over highlight and the actual drop agree on what is allowed.
function canDropInto(
  sourcePath: string | null,
  folderPath: string,
  existingPaths: string[],
) {
  if (!sourcePath) {
    return false;
  }

  return (
    buildMoveEntryPlan({
      existingPaths,
      sourcePath,
      targetFolderPath: folderPath,
    }).type === "move"
  );
}

function createTree(entries: VaultEntry[]) {
  const lookup = new Map<string, TreeNode>();
  const root: TreeNode[] = [];
  const visibleEntries = entries.filter(
    (entry) =>
      !isHiddenVaultPath(entry.path) &&
      !(entry.kind === "file" && isSystemVaultFile(entry.path)),
  );

  const getOrCreateNode = (entry: Pick<VaultEntry, "kind" | "name" | "path">) => {
    const existing = lookup.get(entry.path);

    if (existing) {
      return existing;
    }

    const node: TreeNode = {
      children: [],
      displayKind:
        entry.kind === "file" ? getVaultEntryDisplayKind(entry.path) : null,
      kind: entry.kind,
      name: entry.name,
      path: entry.path,
    };

    lookup.set(entry.path, node);
    return node;
  };

  visibleEntries.forEach((entry) => {
    const normalizedPath = entry.path.replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter(Boolean);
    const parentSegments = segments.slice(0, -1);

    parentSegments.forEach((segment, index) => {
      const path = parentSegments.slice(0, index + 1).join("/");
      const parentPath = parentSegments.slice(0, index).join("/");
      const parentNode = parentPath ? lookup.get(parentPath) ?? null : null;
      const directoryNode = getOrCreateNode({
        kind: "directory",
        name: segment,
        path,
      });

      if (parentNode) {
        if (!parentNode.children.some((child) => child.path === directoryNode.path)) {
          parentNode.children.push(directoryNode);
        }
        return;
      }

      if (!root.some((child) => child.path === directoryNode.path)) {
        root.push(directoryNode);
      }
    });

    const node = getOrCreateNode(entry);
    const parentPath = parentSegments.join("/");
    const parentNode = parentPath ? lookup.get(parentPath) ?? null : null;

    if (parentNode) {
      if (!parentNode.children.some((child) => child.path === node.path)) {
        parentNode.children.push(node);
      }
      return;
    }

    if (!root.some((child) => child.path === node.path)) {
      root.push(node);
    }
  });

  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    [...nodes]
      .sort((left, right) => {
        if (left.kind !== right.kind) {
          return left.kind === "directory" ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      })
      .map((node) => ({
        ...node,
        children: sortNodes(node.children),
      }));

  return sortNodes(root);
}

function hasActiveDescendant(node: TreeNode, activePath: string | null): boolean {
  if (!activePath) {
    return false;
  }

  if (node.path === activePath) {
    return true;
  }

  return node.children.some((child) => hasActiveDescendant(child, activePath));
}

function getExtensionLabel(name: string) {
  const extension = name.match(/\.([^.]+)$/)?.[1] ?? "";
  return extension ? extension.toUpperCase() : null;
}

function getObsidianDisplayName(node: TreeNode) {
  if (node.kind !== "file") {
    return node.name;
  }

  if (node.displayKind === "markdown") {
    return node.name.replace(/\.md$/i, "");
  }

  return node.name.replace(/\.[^.]+$/, "");
}

export function NotesFileTree({
  activePath,
  entries,
  onOpenPath,
  onCreateNoteInPath,
  onCreateFolderInPath,
  onDeletePath,
  onRenamePath,
  onMovePath,
  collapseAllByDefault = false,
  variant = "default",
}: NotesFileTreeProps) {
  const tree = useMemo(() => createTree(entries), [entries]);
  const existingPaths = useMemo(
    () => entries.map((entry) => entry.path),
    [entries],
  );
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
  const draggedPathRef = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const handleDragStart = useCallback(
    (event: React.DragEvent, node: TreeNode) => {
      draggedPathRef.current = node.path;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(MOVE_DRAG_MIME, node.path);
      // text/plain fallback keeps the drag image readable in some browsers.
      event.dataTransfer.setData("text/plain", node.path);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    draggedPathRef.current = null;
    setDropTarget(null);
  }, []);

  const clearDropTarget = useCallback((folderPath: string) => {
    setDropTarget((current) => (current === folderPath ? null : current));
  }, []);

  const handleFolderDragOver = useCallback(
    (event: React.DragEvent, folderPath: string) => {
      if (
        !onMovePath ||
        !canDropInto(draggedPathRef.current, folderPath, existingPaths)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropTarget(folderPath);
    },
    [existingPaths, onMovePath],
  );

  const handleFolderDrop = useCallback(
    (event: React.DragEvent, folderPath: string) => {
      const sourcePath =
        event.dataTransfer.getData(MOVE_DRAG_MIME) ||
        draggedPathRef.current ||
        "";

      draggedPathRef.current = null;
      setDropTarget(null);

      if (!onMovePath || !canDropInto(sourcePath, folderPath, existingPaths)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onMovePath(sourcePath, folderPath);
    },
    [existingPaths, onMovePath],
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, node: TreeNode) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        path: node.path,
        kind: node.kind,
        displayKind: node.displayKind,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  function renderNode(node: TreeNode, depth = 0): JSX.Element {
    // Always reveal the active note's folder chain, even when the tree starts
    // fully collapsed (the bottom-left Workspace popover). Otherwise a freshly
    // created note — which becomes the active path — stays buried inside a
    // collapsed folder, so it looks like nothing was created.
    const defaultExpanded = hasActiveDescendant(node, activePath)
      ? true
      : collapseAllByDefault
        ? false
        : depth < 1;
    const isExpanded = expandedPaths[node.path] ?? defaultExpanded;
    const nodeStyle = {
      "--notes-tree-indent": `${depth * 16}px`,
    } as CSSProperties;

    if (node.kind === "directory") {
      return (
        <li
          key={node.path}
          className="notes-v2__tree-node"
          data-depth={depth}
          style={nodeStyle}
        >
          <button
            className="notes-v2__tree-directory"
            data-drop-target={dropTarget === node.path ? "true" : undefined}
            draggable={Boolean(onMovePath)}
            onClick={() =>
              setExpandedPaths((current) => ({
                ...current,
                [node.path]: !isExpanded,
              }))
            }
            onContextMenu={(e) => handleContextMenu(e, node)}
            onDragStart={(event) => handleDragStart(event, node)}
            onDragEnd={handleDragEnd}
            onDragOver={(event) => handleFolderDragOver(event, node.path)}
            onDragLeave={() => clearDropTarget(node.path)}
            onDrop={(event) => handleFolderDrop(event, node.path)}
            type="button"
          >
            <span
              aria-hidden="true"
              className="notes-v2__tree-caret"
              data-expanded={isExpanded ? "true" : "false"}
            >
              ›
            </span>
            <span className="notes-v2__tree-name">{node.name}</span>
          </button>

          {isExpanded ? (
            <ul className="notes-v2__tree-list">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </ul>
          ) : null}
        </li>
      );
    }

    const extensionLabel =
      variant === "obsidian" && node.displayKind !== "markdown"
        ? getExtensionLabel(node.name)
        : null;

    return (
      <li
        key={node.path}
        className="notes-v2__tree-node"
        data-depth={depth}
        style={nodeStyle}
      >
        <button
          className="notes-v2__tree-file"
          data-active={activePath === node.path ? "true" : "false"}
          data-kind={node.displayKind ?? undefined}
          disabled={node.displayKind !== "markdown"}
          draggable={Boolean(onMovePath) && node.displayKind === "markdown"}
          onClick={
            node.displayKind === "markdown"
              ? () => onOpenPath(node.path)
              : undefined
          }
          onContextMenu={(e) => handleContextMenu(e, node)}
          onDragStart={(event) => handleDragStart(event, node)}
          onDragEnd={handleDragEnd}
          aria-label={node.name}
          title={
            node.displayKind
              ? `${NOTES_UI_COPY.fileTree.kinds[node.displayKind]} · ${node.path}`
              : node.path
          }
          type="button"
        >
          <span className="notes-v2__tree-name">
            {variant === "obsidian" ? getObsidianDisplayName(node) : node.name}
          </span>
          {extensionLabel ? (
            <span className="notes-v2__tree-extension">{extensionLabel}</span>
          ) : null}
        </button>
      </li>
    );
  }

  const handleBlankAreaContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      // Only fire when clicking the nav itself (children stop propagation)
      setContextMenu({
        path: "",
        kind: "directory",
        displayKind: null,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  return (
    <>
      <nav
        aria-label={NOTES_UI_COPY.fileTree.ariaLabel}
        className="notes-v2__file-tree"
        data-drop-target={dropTarget === DROP_TARGET_ROOT ? "true" : undefined}
        data-variant={variant === "obsidian" ? "obsidian" : undefined}
        onContextMenu={handleBlankAreaContextMenu}
        onDragOver={(event) => handleFolderDragOver(event, DROP_TARGET_ROOT)}
        onDragLeave={() => clearDropTarget(DROP_TARGET_ROOT)}
        onDrop={(event) => handleFolderDrop(event, DROP_TARGET_ROOT)}
      >
        <ul className="notes-v2__tree-list">{tree.map((node) => renderNode(node))}</ul>
      </nav>

      {contextMenu && (
        <NotesFileTreeContextMenu
          target={contextMenu}
          onClose={() => setContextMenu(null)}
          onCreateNote={(path) => onCreateNoteInPath?.(path)}
          onCreateFolder={(path) => onCreateFolderInPath?.(path)}
          onRename={(path, kind) => onRenamePath?.(path, kind)}
          onDelete={(path, kind) => onDeletePath?.(path, kind)}
        />
      )}
    </>
  );
}
