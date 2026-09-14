"use client";

/**
 * Rail 条目的右键菜单。
 *
 * 移植 vmark `WorkspaceRailContextMenu.tsx` 的交互契约：视口内钳位、Escape 与
 * 点击外部关闭、roving focus（ArrowUp/Down/Home/End）、关闭时把焦点还给触发
 * 元素。这些不是装饰——vmark 的注释点明了每一条对应的真实问题：贴着视口右下角
 * 打开会露在屏幕外；Escape 后焦点落到 `<body>` 会让键盘用户丢失位置；
 * `role="menu"` 承诺了方向键导航，不实现就是骗读屏器。
 *
 * 菜单项与 vmark 不同：vmark 是「关闭 / 复制到新窗口 / 移动到新窗口」，后两项
 * 在 auris 没有对应物（主进程 `mainWindow` 单例，`focusExistingWindow()` 让第二
 * 个窗口根本创建不出来）。放两个点了不会有任何事发生的按钮比不放更糟。所以这里
 * 是「切换到此工作区 / 从列表移除」。
 *
 * @module components/notes-v2/notes-workspace-rail-menu
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** 钳位时与视口边缘保持的距离。 */
const VIEWPORT_MARGIN = 8;

export type WorkspaceRailMenuPosition = { x: number; y: number };

export type NotesWorkspaceRailMenuProps = {
  /**
   * 是否允许从列表移除。
   *
   * 当前工作区不允许移除：移掉它会让 rail 上没有任何条目对应你正在看的 vault，
   * 高亮无处可去，而 vault 其实没有变——一个自相矛盾的界面。
   */
  canClose: boolean;
  onClose: () => void;
  onCloseWorkspace: () => void;
  onReveal: () => void;
  position: WorkspaceRailMenuPosition;
  /** 完整工作区名，用作菜单的可访问名。 */
  workspaceName: string;
};

type MenuItem = {
  disabled: boolean;
  hint?: string;
  label: string;
  run: () => void;
};

export function NotesWorkspaceRailMenu({
  canClose,
  onClose,
  onCloseWorkspace,
  onReveal,
  position,
  workspaceName,
}: NotesWorkspaceRailMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focused, setFocused] = useState(0);
  const [clamped, setClamped] = useState(position);
  // 关闭时把焦点还回去——否则 Escape 之后焦点落在 <body> 上，键盘用户失去位置。
  const invokerRef = useRef<Element | null>(
    typeof document === "undefined" ? null : document.activeElement,
  );

  const items: MenuItem[] = [
    { disabled: false, label: "切换到此工作区", run: onReveal },
    {
      disabled: !canClose,
      label: "从列表移除",
      run: onCloseWorkspace,
      ...(canClose ? {} : { hint: "当前工作区不能从列表移除" }),
    },
  ];

  // 在 paint 前按视口钳位。直接用 clientX/clientY，靠近右/下边缘打开的菜单会
  // 有一部分在屏幕外。
  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element) return;

    const { height, width } = element.getBoundingClientRect();
    const maxX = window.innerWidth - width - VIEWPORT_MARGIN;
    const maxY = window.innerHeight - height - VIEWPORT_MARGIN;

    setClamped({
      x: Math.max(VIEWPORT_MARGIN, Math.min(position.x, maxX)),
      y: Math.max(VIEWPORT_MARGIN, Math.min(position.y, maxY)),
    });
  }, [position]);

  // 聚焦第一个「菜单项」而不是容器：容器的 outline 被抑制了，聚焦它等于没有
  // 任何可见焦点。
  useEffect(() => {
    itemRefs.current[0]?.focus();
  }, []);

  const dismiss = useCallback(() => {
    const invoker = invokerRef.current;
    onClose();
    if (invoker instanceof HTMLElement && invoker.isConnected) {
      invoker.focus();
    }
  }, [onClose]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        dismiss();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [dismiss]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      dismiss();
      return;
    }

    const move = (next: number) => {
      event.preventDefault();
      setFocused(next);
      itemRefs.current[next]?.focus();
    };

    if (event.key === "ArrowDown") move((focused + 1) % items.length);
    else if (event.key === "ArrowUp") move((focused - 1 + items.length) % items.length);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(items.length - 1);
  };

  const run = (item: MenuItem) => () => {
    if (item.disabled) return;
    // 先关闭，让焦点回到 rail，再执行动作——动作会改变 rail 的内容。
    dismiss();
    item.run();
  };

  return (
    <div
      aria-label={workspaceName}
      className="notes-v2__rail-menu"
      onKeyDown={onKeyDown}
      ref={menuRef}
      role="menu"
      style={{ left: clamped.x, top: clamped.y }}
    >
      {items.map((item, index) => (
        <button
          // 用 aria-disabled 而不是原生 disabled：原生 disabled 的按钮
          // `.focus()` 不生效，roving focus 会在它上面断掉，而 WAI-ARIA 要求
          // 菜单项即使不可用也保持可聚焦（否则读屏器用户根本不知道这一项存在）。
          aria-disabled={item.disabled ? "true" : undefined}
          className="notes-v2__rail-menu-item"
          key={item.label}
          onClick={run(item)}
          onFocus={() => setFocused(index)}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          role="menuitem"
          tabIndex={index === focused ? 0 : -1}
          title={item.hint}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
