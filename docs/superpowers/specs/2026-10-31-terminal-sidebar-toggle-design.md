# Terminal Mode Sidebar Toggle Design

## Goal

Add a sidebar toggle (collapse / expand) button to the top toolbar of Auris's dedicated Terminal Mode (`/terminal`). When collapsed, the sidebar hides completely and the terminal canvas expands across the full workspace; the toggle button remains pinned in the toolbar to restore the sidebar at any time. The toggle state persists automatically in local storage alongside existing terminal layout preferences.

## Context

Auris features a dedicated Terminal Mode (`src/app/terminal/page.tsx` rendering `TerminalFocusWorkspace`). The layout currently divides the viewport into a fixed 190px left sidebar (`TerminalFocusSidebar`) and an adaptive right grid (`terminal-focus__main`), showing up to 8 shell sessions.

Users working on coding or log-heavy tasks frequently need maximized horizontal terminal width without session list distractions. Currently, there is no way to hide or collapse the terminal session sidebar.

## User-facing Behavior

### Toolbar Toggle Button
- Located at the **first position (leftmost)** of the terminal workspace header (`<header className="terminal-focus__toolbar">`), before the `"分屏工作台"` / `"单屏专注"` title.
- Uses the `@phosphor-icons/react` icon `SidebarSimple` (16px).
- Labels and ARIA attributes:
  - **Expanded state**:
    - Tooltip / label: `"收起侧边栏"`
    - `aria-label="收起侧边栏"`
    - `aria-expanded={true}`
    - `aria-controls="terminal-focus-sidebar"`
  - **Collapsed state**:
    - Tooltip / label: `"展开侧边栏"`
    - `aria-label="展开侧边栏"`
    - `aria-expanded={false}`
    - `aria-controls="terminal-focus-sidebar"`
- Visual appearance:
  - Follows existing `.terminal-focus__tool` button style (28x28px, subtle hover background, `:focus-visible` outline).
  - Matches the dark ink / shared Notes theme token palette.

### Sidebar Collapse & Expansion Transition
- When collapsed:
  - The root container `.notes-v2.terminal-focus` receives `data-sidebar-collapsed="true"`.
  - The CSS grid switches from `190px minmax(0, 1fr)` to `minmax(0, 1fr)`.
  - The sidebar element `<aside id="terminal-focus-sidebar" className="terminal-focus__sidebar">` is hidden (`display: none` and `hidden={true}`, `inert={true}`).
  - The active terminal grid takes the entire width of the application frame.
  - Active `xterm.js` terminals adjust column and row dimensions via existing `ResizeObserver` without reconnecting or resetting shell sessions.
- When expanded:
  - The CSS grid restores the 190px sidebar column.
  - The sidebar reappears with active session selection, project grouping, and status dots intact.

## Data Model & Persistence

- Add `sidebarCollapsed?: boolean` to `FocusLayout` in `src/components/desktop/terminal-focus/terminal-focus-layout.ts`:
  ```ts
  export type FocusLayout = {
    columns: number;
    columnWeights: number[];
    rowWeights: number[];
    sidebarCollapsed?: boolean;
  };
  ```
- Default layout:
  ```ts
  export const DEFAULT_FOCUS_LAYOUT: FocusLayout = {
    columns: 2,
    columnWeights: [],
    rowWeights: [],
    sidebarCollapsed: false,
  };
  ```
- Normalization in `normalizeFocusLayout(value: unknown)`:
  - Safely reads `raw.sidebarCollapsed`.
  - If `typeof raw.sidebarCollapsed === "boolean"`, uses `raw.sidebarCollapsed`; otherwise defaults to `false`.
  - Maintains strict backwards compatibility with existing stored JSON objects.
- Persistence:
  - Saved under the existing `TERMINAL_FOCUS_LAYOUT_KEY` (`"auris.terminal-focus.layout.v1"`).
  - Toggling sidebar updates `layout` state via `setLayout((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }))`.
  - Automatically written to `localStorage` on change when preferences are loaded.

## Component & CSS Architecture

1. **`terminal-focus-layout.ts`**:
   - Extend `FocusLayout` type with optional `sidebarCollapsed`.
   - Update `DEFAULT_FOCUS_LAYOUT` to include `sidebarCollapsed: false`.
   - Update `normalizeFocusLayout` to sanitize `sidebarCollapsed`.

2. **`terminal-focus-workspace.tsx`**:
   - Extend `ToolButton` props to accept `expanded?: boolean` and `controls?: string` (mapping to `aria-expanded` and `aria-controls`).
   - Import `SidebarSimple` from `@phosphor-icons/react`.
   - Attach `id="terminal-focus-sidebar"` and `hidden={layout.sidebarCollapsed}` / `inert={projectPickerOpen || layout.sidebarCollapsed}` to `<aside className="terminal-focus__sidebar">`.
   - Add `data-sidebar-collapsed={layout.sidebarCollapsed ? "true" : "false"}` to container `.notes-v2.terminal-focus`.
   - Insert `<ToolButton>` at index 0 of `.terminal-focus__toolbar` with `expanded={!layout.sidebarCollapsed}` and `controls="terminal-focus-sidebar"`.
   - In the layout column picker `onChange`, update `setLayout((prev) => ({ ...prev, columns: Number(event.target.value), columnWeights: [], rowWeights: [] }))` to preserve `sidebarCollapsed`.

3. **`terminal-focus.css`**:
   - Add scoped CSS rules:
     ```css
     .desktop-app-frame .notes-v2.terminal-focus[data-sidebar-collapsed="true"] {
       grid-template-columns: minmax(0, 1fr);
     }
     .desktop-app-frame .notes-v2.terminal-focus[data-sidebar-collapsed="true"] .terminal-focus__sidebar {
       display: none;
     }
     ```

## Verification Plan

1. **Unit Tests (`tests/unit/notes/terminal-focus-layout.test.ts`)**:
   - Test `normalizeFocusLayout` handles `sidebarCollapsed: true`, `sidebarCollapsed: false`, missing/undefined, and non-boolean values.
2. **Component Tests (`tests/component/notes/terminal-focus-workspace.test.tsx`)**:
   - Verify toggle button is rendered in toolbar with `aria-label="收起侧边栏"`, `aria-expanded="true"`, and `aria-controls="terminal-focus-sidebar"`.
   - Click toggle button: verify container gets `data-sidebar-collapsed="true"`, sidebar element gets `hidden`, button label becomes `"展开侧边栏"`, `aria-expanded="false"`.
   - Click toggle button again: verify container restores `data-sidebar-collapsed="false"`.
   - Verify column picker change preserves `sidebarCollapsed`.
   - Verify localStorage receives updated layout object with `sidebarCollapsed`.
3. **Regression Tests**:
   - Run existing terminal suite (`tests/component/notes/terminal-focus-workspace.test.tsx`, `tests/unit/notes/terminal-focus-layout.test.ts`).
   - Run `git diff --check` to verify code formatting.
