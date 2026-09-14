"use client";

/**
 * Workspace Rail：在已授权的 vault 根之间切换。
 *
 * 移植 vmark `src/components/WorkspaceRail/WorkspaceRail.tsx` 的交互：身份字形、
 * 按名字派生的强调色、aria-pressed + 左侧色条的双通道激活态、拖拽重排、右键
 * 菜单。逐条保留的 vmark 纪律都在对应位置注明。
 *
 * 三处按 auris 现实做的差异（都不是省略）：
 *
 * 1. **没有 move / duplicate to new window**。vmark 的这两个动作把工作区搬到
 *    另一个 Tauri 窗口。auris 主进程是 `mainWindow` 单例，`createMainWindow()`
 *    第一件事就是 `focusExistingWindow()`——第二个窗口创建不出来。放两个点了
 *    不会有任何事发生的按钮，比不放更糟。因此 vmark 的 `dragend` 移出手势
 *    （及其 `isOutsideViewport` / `droppedInternallyRef` 那套判定）在这里也没有
 *    对应物：拖拽只用于重排。
 * 2. **"关闭"是从列表收起，不是删除**。vmark 的 close 会关掉该工作区的所有
 *    tab（走 dirty 检查）。auris 这边一个 rail 条目就是一个已授权的 vault 根，
 *    主进程仍然记着它。所以菜单文案说的是"从列表中移除"，并明确它不删除任何
 *    文件——否则用户会以为自己删掉了笔记。
 * 3. **多了"添加工作区"按钮**。新根只能通过原生目录选择器进来（安全边界见
 *    `electron/vault/vault-roots.cjs`），rail 必须提供这个入口，否则列表永远
 *    只有历史上恰好打开过的那些根。
 *
 * @module components/notes-v2/notes-workspace-rail
 */

import { useRef, useState, type CSSProperties } from "react";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import {
  NotesWorkspaceRailMenu,
  type WorkspaceRailMenuPosition,
} from "@/components/notes-v2/notes-workspace-rail-menu";
import { useWorkspaceRail } from "@/features/notes/workspace/use-workspace-rail";

const DRAG_MIME = "application/x-auris-workspace-instance";

/**
 * 六个强调色，按名字哈希分配。
 *
 * 与 vmark 同样只用于装饰：激活态**不能**只靠颜色（六色下两个工作区可能撞色，
 * 且色盲用户读不到），所以形状（左侧色条）与 `aria-pressed` 各自独立承载状态。
 */
const RAIL_COLORS = [
  "var(--notes-rail-color-1, #3274d9)",
  "var(--notes-rail-color-2, #38a36b)",
  "var(--notes-rail-color-3, #d99a2b)",
  "var(--notes-rail-color-4, #cf5b4e)",
  "var(--notes-rail-color-5, #7a5cd0)",
  "var(--notes-rail-color-6, #2aa3a3)",
] as const;

type RailEntryStyle = CSSProperties & { "--notes-rail-color": string };

function railColorForSeed(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return RAIL_COLORS[hash % RAIL_COLORS.length];
}

function railEntryStyle(seed: string): RailEntryStyle {
  return { "--notes-rail-color": railColorForSeed(seed) };
}

type MenuState = {
  canClose: boolean;
  instanceId: string;
  name: string;
  position: WorkspaceRailMenuPosition;
};

export type NotesWorkspaceRailProps = {
  /** 关掉时整条 rail 不渲染（不是渲染一个空壳）。 */
  enabled?: boolean;
};

export function NotesWorkspaceRail({ enabled = true }: NotesWorkspaceRailProps) {
  const rail = useWorkspaceRail();
  const [menu, setMenu] = useState<MenuState | null>(null);
  // 拖拽源。用 ref 而不是 state：拖拽过程中不需要重渲染，而 dragover 触发极
  // 频繁，setState 会把每次移动都变成一次渲染。
  const dragSourceRef = useRef<string | null>(null);

  if (!enabled) {
    return null;
  }

  // 非桌面环境（浏览器里跑 dev server）没有 vault bridge，也就没有"多个已授权
  // 根"这个概念。此时整条 rail 不渲染，而不是显示一条点不动的空轨——后者会让人
  // 以为功能坏了。
  if (!rail.canSwitch) {
    return null;
  }

  return (
    <nav aria-label={NOTES_UI_COPY.workspaceRail.label} className="notes-v2__rail">
      <div className="notes-v2__rail-list" role="list">
        {rail.entries.map((entry) => {
          const { instance, isActive } = entry;
          const instanceId = instance.workspaceInstanceId;
          const unavailable = !entry.available;
          const title = unavailable
            ? NOTES_UI_COPY.workspaceRail.unavailable(entry.displayName)
            : entry.displayName;

          return (
            <div
              className="notes-v2__rail-entry"
              key={instanceId}
              role="listitem"
              style={railEntryStyle(instance.rootId ?? instanceId)}
            >
              <button
                aria-current={isActive ? "true" : undefined}
                aria-label={NOTES_UI_COPY.workspaceRail.activate(entry.displayName)}
                aria-pressed={isActive}
                className="notes-v2__rail-item"
                data-unavailable={unavailable ? "true" : "false"}
                disabled={rail.isSwitching}
                draggable
                onClick={() => {
                  void rail.switchTo(instanceId);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({
                    // 当前工作区不能从列表收起：收起后 rail 上就没有它，而它
                    // 仍是主进程的当前根，界面会和事实不一致。
                    canClose: !isActive,
                    instanceId,
                    name: entry.displayName,
                    position: { x: event.clientX, y: event.clientY },
                  });
                }}
                onDragEnd={() => {
                  dragSourceRef.current = null;
                }}
                onDragOver={(event) => {
                  // 必须 preventDefault，否则浏览器不会触发 drop。
                  event.preventDefault();
                  if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDragStart={(event) => {
                  dragSourceRef.current = instanceId;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(DRAG_MIME, instanceId);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  // dataTransfer 优先，ref 兜底：jsdom 与部分浏览器在 drop 时
                  // 拿不到自定义 MIME 的数据。
                  const sourceId =
                    event.dataTransfer.getData(DRAG_MIME) || dragSourceRef.current;
                  dragSourceRef.current = null;
                  if (!sourceId || sourceId === instanceId) return;
                  rail.reorder(sourceId, instanceId);
                }}
                title={title}
                type="button"
              >
                {entry.glyph ? (
                  // aria-hidden：按钮的 aria-label 已经带了完整工作区名，读屏
                  // 不该再念一遍这个单字符字形。
                  <span aria-hidden="true" className="notes-v2__rail-glyph">
                    {entry.glyph}
                  </span>
                ) : (
                  <span aria-hidden="true" className="notes-v2__rail-glyph">
                    ·
                  </span>
                )}
                {unavailable ? (
                  <span aria-hidden="true" className="notes-v2__rail-warning">
                    !
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>

      <button
        aria-label={NOTES_UI_COPY.workspaceRail.add}
        className="notes-v2__rail-add"
        onClick={() => {
          void rail.addRoot();
        }}
        title={NOTES_UI_COPY.workspaceRail.add}
        type="button"
      >
        <span aria-hidden="true">+</span>
      </button>

      {rail.error ? (
        <p className="notes-v2__rail-error" role="alert">
          {rail.error}
        </p>
      ) : null}

      {menu ? (
        <NotesWorkspaceRailMenu
          canClose={menu.canClose}
          onClose={() => setMenu(null)}
          onCloseWorkspace={() => rail.closeEntry(menu.instanceId)}
          onReveal={() => {
            void rail.switchTo(menu.instanceId);
          }}
          position={menu.position}
          workspaceName={menu.name}
        />
      ) : null}
    </nav>
  );
}
