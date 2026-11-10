# Terminal Mode Sidebar Toggle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible sidebar toggle button to the top toolbar of Auris Terminal Mode (`/terminal`), enabling full-width terminal workflows while persisting layout state in localStorage.

**Architecture:** Extend the existing `FocusLayout` state and normalization functions with a `sidebarCollapsed` boolean. Render a toggle button using Phosphor's `SidebarSimple` icon in `TerminalFocusWorkspace`'s toolbar, controlling DOM attributes (`data-sidebar-collapsed`, `hidden`, `inert`, `aria-expanded`, `aria-controls`) and CSS grid column transitions.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, `@phosphor-icons/react`, CSS Grid.

---

### Task 1: Extend `FocusLayout` Model and Normalization with Tests (TDD)

**Files:**
- Modify: `src/components/desktop/terminal-focus/terminal-focus-layout.ts`
- Test: `tests/unit/notes/terminal-focus-layout.test.ts`

- [x] **Step 1: Write failing tests for `sidebarCollapsed` normalization**

In `tests/unit/notes/terminal-focus-layout.test.ts`, add test cases:
```ts
it("normalizes sidebarCollapsed preference safely", () => {
  expect(normalizeFocusLayout(null).sidebarCollapsed).toBe(false);
  expect(normalizeFocusLayout({}).sidebarCollapsed).toBe(false);
  expect(normalizeFocusLayout({ sidebarCollapsed: true }).sidebarCollapsed).toBe(true);
  expect(normalizeFocusLayout({ sidebarCollapsed: false }).sidebarCollapsed).toBe(false);
  expect(normalizeFocusLayout({ sidebarCollapsed: "true" }).sidebarCollapsed).toBe(false);
  expect(normalizeFocusLayout({ sidebarCollapsed: 1 }).sidebarCollapsed).toBe(false);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/notes/terminal-focus-layout.test.ts`
Expected: FAIL (assertion fails because `sidebarCollapsed` is undefined).

- [x] **Step 3: Implement `sidebarCollapsed` in `FocusLayout`**

In `src/components/desktop/terminal-focus/terminal-focus-layout.ts`:
1. Add `sidebarCollapsed?: boolean;` to `FocusLayout` interface.
2. Update `DEFAULT_FOCUS_LAYOUT`:
```ts
export const DEFAULT_FOCUS_LAYOUT: FocusLayout = {
  columns: 2,
  columnWeights: [],
  rowWeights: [],
  sidebarCollapsed: false,
};
```
3. Update `normalizeFocusLayout`:
```ts
export function normalizeFocusLayout(value: unknown): FocusLayout {
  if (!value || typeof value !== "object") return { ...DEFAULT_FOCUS_LAYOUT };
  const raw = value as Partial<FocusLayout>;
  const columns = Number.isInteger(raw.columns) && raw.columns! >= 1 && raw.columns! <= 4 ? raw.columns! : 2;
  const sidebarCollapsed = typeof raw.sidebarCollapsed === "boolean" ? raw.sidebarCollapsed : false;
  return {
    columns,
    columnWeights: normalizeWeights(raw.columnWeights, columns),
    rowWeights: Array.isArray(raw.rowWeights) && raw.rowWeights.length <= 8 ? normalizeWeights(raw.rowWeights, raw.rowWeights.length) : [],
    sidebarCollapsed,
  };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/notes/terminal-focus-layout.test.ts`
Expected: PASS (all tests pass).

---

### Task 2: Scoped CSS for Collapsed Sidebar

**Files:**
- Modify: `src/components/desktop/terminal-focus/terminal-focus.css`

- [x] **Step 1: Add CSS rules for collapsed state**

In `src/components/desktop/terminal-focus/terminal-focus.css`, add:
```css
.desktop-app-frame .notes-v2.terminal-focus[data-sidebar-collapsed="true"] {
  grid-template-columns: minmax(0, 1fr);
}
.desktop-app-frame .notes-v2.terminal-focus[data-sidebar-collapsed="true"] .terminal-focus__sidebar {
  display: none;
}
```

- [x] **Step 2: Verify CSS syntax and diff**

Run: `git diff src/components/desktop/terminal-focus/terminal-focus.css`
Expected: Clean additions without syntax issues.

---

### Task 3: Implement Toolbar Toggle Button and State in `TerminalFocusWorkspace`

**Files:**
- Modify: `src/components/desktop/terminal-focus/terminal-focus-workspace.tsx`
- Test: `tests/component/notes/terminal-focus-workspace.test.tsx`

- [x] **Step 1: Write component tests for sidebar toggle interaction**

In `tests/component/notes/terminal-focus-workspace.test.tsx`, add test cases:
```tsx
it("toggles the session sidebar from the toolbar and persists to layout preferences", async () => {
  const { bridge } = createBridge([record("term-1")]);
  render(<TerminalFocusWorkspace bridge={bridge} />);

  const toggleBtn = screen.getByRole("button", { name: "收起侧边栏" });
  expect(toggleBtn).toBeInTheDocument();
  expect(toggleBtn).toHaveAttribute("aria-expanded", "true");
  expect(toggleBtn).toHaveAttribute("aria-controls", "terminal-focus-sidebar");

  const sidebar = screen.getByRole("complementary", { name: "终端会话" });
  expect(sidebar).not.toHaveAttribute("hidden");

  // Click to collapse
  fireEvent.click(toggleBtn);

  expect(screen.getByRole("button", { name: "展开侧边栏" })).toHaveAttribute("aria-expanded", "false");
  expect(sidebar).toHaveAttribute("hidden");
  const container = sidebar.closest(".terminal-focus");
  expect(container).toHaveAttribute("data-sidebar-collapsed", "true");
  expect(JSON.parse(localStorage.getItem(TERMINAL_FOCUS_LAYOUT_KEY) || "{}")).toMatchObject({ sidebarCollapsed: true });

  // Click to restore
  fireEvent.click(screen.getByRole("button", { name: "展开侧边栏" }));
  expect(screen.getByRole("button", { name: "收起侧边栏" })).toHaveAttribute("aria-expanded", "true");
  expect(sidebar).not.toHaveAttribute("hidden");
  expect(container).toHaveAttribute("data-sidebar-collapsed", "false");
  expect(JSON.parse(localStorage.getItem(TERMINAL_FOCUS_LAYOUT_KEY) || "{}")).toMatchObject({ sidebarCollapsed: false });
});

it("preserves sidebarCollapsed preference when changing column layout", async () => {
  const { bridge } = createBridge([record("term-1")]);
  render(<TerminalFocusWorkspace bridge={bridge} />);

  const sidebar = screen.getByRole("complementary", { name: "终端会话" });

  // Collapse sidebar first
  const toggleBtn = screen.getByRole("button", { name: "收起侧边栏" });
  fireEvent.click(toggleBtn);

  // Change columns via select
  const select = screen.getByLabelText("终端分屏列数");
  fireEvent.change(select, { target: { value: "3" } });

  // Sidebar remains collapsed
  expect(sidebar).toHaveAttribute("hidden");
  expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(TERMINAL_FOCUS_LAYOUT_KEY) || "{}")).toMatchObject({ columns: 3, sidebarCollapsed: true });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/component/notes/terminal-focus-workspace.test.tsx -t "sidebar"`
Expected: FAIL (button with name "收起侧边栏" not found).

- [x] **Step 3: Update `TerminalFocusWorkspace` implementation**

In `src/components/desktop/terminal-focus/terminal-focus-workspace.tsx`:
1. Import `SidebarSimple` from `@phosphor-icons/react` (keeping all existing icons including `FilePlus`):
```tsx
import { ArrowClockwise, ArrowsIn, ArrowsOut, ClockCounterClockwise, Copy, MagnifyingGlass, SidebarSimple, TerminalWindow, Trash, X, ClipboardText, FilePlus } from "@phosphor-icons/react";
```
2. Update `ToolButton` to support accessibility attributes:
```tsx
function ToolButton({ label, children, onClick, disabled, pressed, expanded, controls }: {
  label: string; children: ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean; expanded?: boolean; controls?: string;
}) {
  return <button type="button" className="terminal-focus__tool" aria-label={label} title={label} aria-pressed={pressed} aria-expanded={expanded} aria-controls={controls} disabled={disabled} onClick={onClick}>{children}</button>;
}
```
3. Update column picker `onChange` to preserve `sidebarCollapsed`:
```tsx
onChange={(event) => {
  setLayout((prev) => ({ ...prev, columns: Number(event.target.value), columnWeights: [], rowWeights: [] })); setSinglePane(false);
}}
```
4. Update container attributes:
```tsx
<div className="notes-v2 notes-v2--minimal terminal-focus" data-notes-theme={theme} data-sidebar-collapsed={layout.sidebarCollapsed ? "true" : "false"} style={notesTypographyCssVars(typography) as CSSProperties}>
```
5. Update sidebar attributes:
```tsx
<aside id="terminal-focus-sidebar" className="terminal-focus__sidebar" aria-label="终端会话" inert={projectPickerOpen || layout.sidebarCollapsed} hidden={layout.sidebarCollapsed}>
```
6. Add toggle `ToolButton` as first item in `<header className="terminal-focus__toolbar">`:
```tsx
<ToolButton
  label={layout.sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
  expanded={!layout.sidebarCollapsed}
  controls="terminal-focus-sidebar"
  onClick={() => setLayout((previous) => ({ ...previous, sidebarCollapsed: !previous.sidebarCollapsed }))}
>
  <SidebarSimple size={16} />
</ToolButton>
```

- [x] **Step 4: Run component tests to verify they pass**

Run: `npx vitest run tests/component/notes/terminal-focus-workspace.test.tsx -t "sidebar"`
Expected: PASS.

---

### Task 4: Full Test Suite and Verification

**Files:**
- Test: `tests/unit/notes/terminal-focus-layout.test.ts`
- Test: `tests/component/notes/terminal-focus-workspace.test.tsx`

- [x] **Step 1: Run complete terminal unit and component tests**

Run: `npx vitest run tests/unit/notes/terminal-focus-layout.test.ts tests/component/notes/terminal-focus-workspace.test.tsx`
Expected: All tests PASS.

- [x] **Step 2: Check git diff formatting**

Run: `git diff --check`
Expected: 0 errors/whitespace anomalies.
