"use client";

import type { CSSProperties } from "react";
import { CaretRight, FileText, FileImage, Folder } from "@phosphor-icons/react";
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
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

export type TreeNode = {
  children: TreeNode[];
  kind: VaultEntry["kind"];
  displayKind: VaultEntryDisplayKind | null;
  name: string;
  path: string;
};

export type FlattenedTreeNode = {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
};

export type NotesFileTreeHandle = { collapseAll: () => void };

export type NotesFileTreeProps = {
  activePath: string | null;
  entries: VaultEntry[];
  onOpenPath: (path: string) => void;
  onCreateNoteInPath?: (folderPath: string) => void;
  onCopyPath?: (path: string) => void;
  onCreateFolderInPath?: (parentPath: string) => void;
  onDeletePath?: (path: string, kind: "directory" | "file") => void;
  onRenamePath?: (path: string, kind: "directory" | "file") => void;
  onRevealPath?: (path: string) => void;
  onMovePath?: (sourcePath: string, targetFolderPath: string) => void;
  collapseAllByDefault?: boolean;
  variant?: "default" | "obsidian";
  showIcons?: boolean;
  filterActive?: boolean;
};

const MOVE_DRAG_MIME = "application/x-notes-vault-path";
const DROP_TARGET_ROOT = "";
export const TREE_ROW_HEIGHT = 32;
export const TREE_OVERSCAN = 8;

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

const treeCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function createTree(entries: VaultEntry[]): TreeNode[] {
  const lookup = new Map<string, TreeNode>();
  const childrenMap = new Map<string, TreeNode[]>();
  const rootChildren: TreeNode[] = [];

  const visibleEntries = entries.filter(
    (entry) =>
      !isHiddenVaultPath(entry.path) &&
      !(entry.kind === "file" && isSystemVaultFile(entry.path)),
  );

  for (const entry of visibleEntries) {
    const normalizedPath = entry.path.replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter(Boolean);
    let currentPath = "";

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      const parentPath = currentPath;
      currentPath = parentPath ? `${parentPath}/${segment}` : segment;

      if (!lookup.has(currentPath)) {
        const dirNode: TreeNode = {
          children: [],
          displayKind: null,
          kind: "directory",
          name: segment,
          path: currentPath,
        };
        lookup.set(currentPath, dirNode);

        if (parentPath) {
          let list = childrenMap.get(parentPath);
          if (!list) {
            list = [];
            childrenMap.set(parentPath, list);
          }
          list.push(dirNode);
        } else {
          rootChildren.push(dirNode);
        }
      }
    }

    if (!lookup.has(entry.path)) {
      const leafNode: TreeNode = {
        children: [],
        displayKind:
          entry.kind === "file" ? getVaultEntryDisplayKind(entry.path) : null,
        kind: entry.kind,
        name: entry.name,
        path: entry.path,
      };
      lookup.set(entry.path, leafNode);

      if (currentPath) {
        let list = childrenMap.get(currentPath);
        if (!list) {
          list = [];
          childrenMap.set(currentPath, list);
        }
        list.push(leafNode);
      } else {
        rootChildren.push(leafNode);
      }
    }
  }

  for (const [parentPath, children] of childrenMap.entries()) {
    const parentNode = lookup.get(parentPath);
    if (parentNode) {
      parentNode.children = children;
    }
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }
      return treeCollator.compare(left.name, right.name);
    });

    for (const node of nodes) {
      if (node.children.length > 0) {
        sortNodes(node.children);
      }
    }
    return nodes;
  };

  return sortNodes(rootChildren);
}

export function getActiveAncestors(activePath: string | null): Set<string> {
  const ancestors = new Set<string>();
  if (!activePath) return ancestors;

  const segments = activePath.replace(/\\/g, "/").split("/").filter(Boolean);
  let current = "";
  for (let i = 0; i < segments.length - 1; i++) {
    current = current ? `${current}/${segments[i]}` : segments[i];
    ancestors.add(current);
  }
  return ancestors;
}

export function flattenVisibleTree(
  tree: TreeNode[],
  expandedPaths: Record<string, boolean>,
  activeAncestors: Set<string>,
  options: {
    collapseAllByDefault?: boolean;
    bulkCollapsed?: boolean;
    filterActive?: boolean;
  } = {},
): FlattenedTreeNode[] {
  const result: FlattenedTreeNode[] = [];

  function walk(nodes: TreeNode[], depth: number) {
    for (const node of nodes) {
      if (node.kind === "directory") {
        const defaultExpanded = options.bulkCollapsed
          ? false
          : activeAncestors.has(node.path)
            ? true
            : options.collapseAllByDefault
              ? false
              : depth < 1;
        const isExpanded =
          options.filterActive || (expandedPaths[node.path] ?? defaultExpanded);

        result.push({ depth, isExpanded, node });

        if (isExpanded && node.children.length > 0) {
          walk(node.children, depth + 1);
        }
      } else {
        result.push({ depth, isExpanded: false, node });
      }
    }
  }

  walk(tree, 0);
  return result;
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

export const NotesFileTree = forwardRef<NotesFileTreeHandle, NotesFileTreeProps>(
  function NotesFileTree(
    {
      activePath,
      entries,
      onOpenPath,
      onCreateNoteInPath,
      onCopyPath,
      onCreateFolderInPath,
      onDeletePath,
      onRenamePath,
      onRevealPath,
      onMovePath,
      collapseAllByDefault = false,
      variant = "default",
      showIcons = false,
      filterActive = false,
    }: NotesFileTreeProps,
    ref,
  ) {
    const tree = useMemo(() => createTree(entries), [entries]);
    const existingPaths = useMemo(
      () => entries.map((entry) => entry.path),
      [entries],
    );

    const activeAncestors = useMemo(
      () => getActiveAncestors(activePath),
      [activePath],
    );

    const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>(
      {},
    );
    const [bulkCollapsed, setBulkCollapsed] = useState(false);

    useImperativeHandle(
      ref,
      () => ({
        collapseAll() {
          setBulkCollapsed(true);
          setExpandedPaths({});
        },
      }),
      [],
    );

    const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(
      null,
    );
    const draggedPathRef = useRef<string | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);

    const flattened = useMemo(
      () =>
        flattenVisibleTree(tree, expandedPaths, activeAncestors, {
          bulkCollapsed,
          collapseAllByDefault,
          filterActive,
        }),
      [
        tree,
        expandedPaths,
        activeAncestors,
        bulkCollapsed,
        collapseAllByDefault,
        filterActive,
      ],
    );

    const scrollContainerRef = useRef<HTMLElement>(null);
    const [containerHeight, setContainerHeight] = useState(600);
    const [scrollTop, setScrollTop] = useState(0);

    useEffect(() => {
      const container = scrollContainerRef.current;
      if (!container || typeof ResizeObserver === "undefined") return;

      const observer = new ResizeObserver((entriesList) => {
        for (const entry of entriesList) {
          const height = entry.contentRect.height;
          if (height > 0) {
            setContainerHeight(height);
          }
        }
      });

      observer.observe(container);
      return () => observer.disconnect();
    }, []);

    // Scroll active item into view on external navigation
    const lastScrolledPathRef = useRef<string | null>(null);
    useEffect(() => {
      if (!activePath || lastScrolledPathRef.current === activePath) return;
      lastScrolledPathRef.current = activePath;

      const index = flattened.findIndex((item) => item.node.path === activePath);
      if (index === -1) return;

      const itemTop = index * TREE_ROW_HEIGHT;
      const container = scrollContainerRef.current;
      if (container) {
        if (
          itemTop < container.scrollTop ||
          itemTop > container.scrollTop + containerHeight - TREE_ROW_HEIGHT
        ) {
          container.scrollTop = Math.max(
            0,
            itemTop - containerHeight / 2 + TREE_ROW_HEIGHT / 2,
          );
        }
      }
    }, [activePath, containerHeight, flattened]);

    const handleDragStart = useCallback(
      (event: React.DragEvent, node: TreeNode) => {
        draggedPathRef.current = node.path;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(MOVE_DRAG_MIME, node.path);
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
          displayKind: node.displayKind,
          kind: node.kind,
          path: node.path,
          x: event.clientX,
          y: event.clientY,
        });
      },
      [],
    );

    const [focusedIndex, setFocusedIndex] = useState<number>(-1);

    const toggleFolder = useCallback(
      (folderPath: string, currentEffectiveExpanded?: boolean) => {
        setExpandedPaths((prev) => {
          const current =
            currentEffectiveExpanded !== undefined
              ? currentEffectiveExpanded
              : prev[folderPath] !== undefined
                ? prev[folderPath]
                : activeAncestors.has(folderPath) ||
                  (!collapseAllByDefault && !bulkCollapsed);
          return {
            ...prev,
            [folderPath]: !current,
          };
        });
      },
      [activeAncestors, bulkCollapsed, collapseAllByDefault],
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (flattened.length === 0) return;

        let nextIndex = focusedIndex;
        if (nextIndex < 0) {
          const activeIdx = flattened.findIndex(
            (item) => item.node.path === activePath,
          );
          nextIndex = activeIdx >= 0 ? activeIdx : 0;
        }

        switch (event.key) {
          case "ArrowDown": {
            event.preventDefault();
            nextIndex = Math.min(flattened.length - 1, nextIndex + 1);
            setFocusedIndex(nextIndex);
            break;
          }
          case "ArrowUp": {
            event.preventDefault();
            nextIndex = Math.max(0, nextIndex - 1);
            setFocusedIndex(nextIndex);
            break;
          }
          case "ArrowRight": {
            event.preventDefault();
            const currentItem = flattened[nextIndex];
            if (currentItem && currentItem.node.kind === "directory") {
              if (!currentItem.isExpanded) {
                toggleFolder(currentItem.node.path, false);
              } else if (nextIndex + 1 < flattened.length) {
                setFocusedIndex(nextIndex + 1);
              }
            }
            break;
          }
          case "ArrowLeft": {
            event.preventDefault();
            const currentItem = flattened[nextIndex];
            if (
              currentItem &&
              currentItem.node.kind === "directory" &&
              currentItem.isExpanded
            ) {
              toggleFolder(currentItem.node.path, true);
            } else if (currentItem && currentItem.depth > 0) {
              for (let i = nextIndex - 1; i >= 0; i--) {
                if (
                  flattened[i].node.kind === "directory" &&
                  flattened[i].depth === currentItem.depth - 1
                ) {
                  setFocusedIndex(i);
                  break;
                }
              }
            }
            break;
          }
          case "Home": {
            event.preventDefault();
            setFocusedIndex(0);
            break;
          }
          case "End": {
            event.preventDefault();
            setFocusedIndex(flattened.length - 1);
            break;
          }
          case "Enter": {
            event.preventDefault();
            const currentItem = flattened[nextIndex];
            if (currentItem) {
              if (currentItem.node.kind === "directory") {
                toggleFolder(currentItem.node.path, currentItem.isExpanded);
              } else {
                onOpenPath(currentItem.node.path);
              }
            }
            break;
          }
        }
      },
      [activePath, flattened, focusedIndex, onOpenPath, toggleFolder],
    );

    const handleBlankAreaContextMenu = useCallback(
      (event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
        setContextMenu({
          displayKind: null,
          kind: "directory",
          path: "",
          x: event.clientX,
          y: event.clientY,
        });
      },
      [],
    );

    const totalCount = flattened.length;
    const totalHeight = totalCount * TREE_ROW_HEIGHT;

    // Windowing: calculate start and end index
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / TREE_ROW_HEIGHT) - TREE_OVERSCAN,
    );
    const endIndex = Math.min(
      totalCount,
      Math.ceil((scrollTop + containerHeight) / TREE_ROW_HEIGHT) +
        TREE_OVERSCAN,
    );
    const visibleItems = flattened.slice(startIndex, endIndex);

    return (
      <>
        <nav
          aria-label={NOTES_UI_COPY.fileTree.ariaLabel}
          className="notes-v2__file-tree"
          data-drop-target={
            dropTarget === DROP_TARGET_ROOT ? "true" : undefined
          }
          data-variant={variant === "obsidian" ? "obsidian" : undefined}
          onContextMenu={handleBlankAreaContextMenu}
          onDragLeave={() => clearDropTarget(DROP_TARGET_ROOT)}
          onDragOver={(event) => handleFolderDragOver(event, DROP_TARGET_ROOT)}
          onDrop={(event) => handleFolderDrop(event, DROP_TARGET_ROOT)}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          ref={scrollContainerRef}
          style={{
            height: "100%",
            overflowY: "auto",
            position: "relative",
          }}
        >
          <div
            style={{
              height: `${totalHeight}px`,
              position: "relative",
              width: "100%",
            }}
          >
            <ul
              aria-label={NOTES_UI_COPY.fileTree.ariaLabel}
              className="notes-v2__tree-list"
              onKeyDown={handleKeyDown}
              role="tree"
              style={{
                left: 0,
                listStyle: "none",
                margin: 0,
                padding: 0,
                position: "absolute",
                right: 0,
                top: `${startIndex * TREE_ROW_HEIGHT}px`,
              }}
              tabIndex={0}
            >
              {visibleItems.map(({ depth, isExpanded, node }) => {
                const nodeStyle = {
                  "--notes-tree-indent": `${depth * 16}px`,
                  height: `${TREE_ROW_HEIGHT}px`,
                } as CSSProperties;

                if (node.kind === "directory") {
                  return (
                    <li
                      aria-expanded={isExpanded}
                      aria-level={depth + 1}
                      aria-selected={activePath === node.path}
                      className="notes-v2__tree-node"
                      data-depth={depth}
                      key={node.path}
                      role="treeitem"
                      style={nodeStyle}
                    >
                      <button
                        aria-expanded={isExpanded ? "true" : "false"}
                        className="notes-v2__tree-directory"
                        data-drop-target={
                          dropTarget === node.path ? "true" : undefined
                        }
                        data-expanded={isExpanded ? "true" : "false"}
                        onClick={() => toggleFolder(node.path, isExpanded)}
                        onContextMenu={(e) => handleContextMenu(e, node)}
                        onDragEnd={handleDragEnd}
                        onDragLeave={() => clearDropTarget(node.path)}
                        onDragOver={(event) =>
                          handleFolderDragOver(event, node.path)
                        }
                        onDragStart={(event) => handleDragStart(event, node)}
                        onDrop={(event) => handleFolderDrop(event, node.path)}
                        title={node.name}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="notes-v2__tree-caret"
                          style={{
                            display: "inline-block",
                            transform: isExpanded
                              ? "rotate(90deg)"
                              : "rotate(0deg)",
                          }}
                        >
                          <CaretRight size={12} />
                        </span>
                        {showIcons ? (
                          <Folder
                            aria-hidden="true"
                            className="notes-explorer__entry-icon"
                            size={16}
                          />
                        ) : null}
                        <span className="notes-v2__tree-name">{node.name}</span>
                      </button>
                    </li>
                  );
                }

                const isEditable =
                  node.displayKind === "markdown" ||
                  node.displayKind === "text" ||
                  node.displayKind === "structured-data";
                const extensionLabel = getExtensionLabel(node.name);

                return (
                  <li
                    aria-level={depth + 1}
                    aria-selected={activePath === node.path}
                    className="notes-v2__tree-node"
                    data-depth={depth}
                    key={node.path}
                    role="treeitem"
                    style={nodeStyle}
                  >
                    <button
                      aria-label={node.name}
                      className="notes-v2__tree-file"
                      data-active={activePath === node.path ? "true" : "false"}
                      data-kind={node.displayKind ?? undefined}
                      disabled={!isEditable}
                      draggable={Boolean(onMovePath) && isEditable}
                      onClick={
                        isEditable ? () => onOpenPath(node.path) : undefined
                      }
                      onContextMenu={(e) => handleContextMenu(e, node)}
                      onDragEnd={handleDragEnd}
                      onDragStart={(event) => handleDragStart(event, node)}
                      title={
                        node.displayKind
                          ? `${NOTES_UI_COPY.fileTree.kinds[node.displayKind]} · ${node.path}`
                          : node.path
                      }
                      type="button"
                    >
                      {showIcons ? (
                        isEditable ? (
                          <FileText
                            aria-hidden="true"
                            className="notes-explorer__entry-icon"
                            size={16}
                          />
                        ) : (
                          <FileImage
                            aria-hidden="true"
                            className="notes-explorer__entry-icon"
                            size={16}
                          />
                        )
                      ) : null}
                      <span className="notes-v2__tree-name">
                        {variant === "obsidian"
                          ? getObsidianDisplayName(node)
                          : node.name}
                      </span>
                      {extensionLabel ? (
                        <span className="notes-v2__tree-extension">
                          {extensionLabel}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        {contextMenu && (
          <NotesFileTreeContextMenu
            onClose={() => setContextMenu(null)}
            onCopy={(path) => onCopyPath?.(path)}
            onCreateFolder={(path) => onCreateFolderInPath?.(path)}
            onCreateNote={(path) => onCreateNoteInPath?.(path)}
            onDelete={(path, kind) => onDeletePath?.(path, kind)}
            onRename={(path, kind) => onRenamePath?.(path, kind)}
            onReveal={(path) => onRevealPath?.(path)}
            target={contextMenu}
          />
        )}
      </>
    );
  },
);
