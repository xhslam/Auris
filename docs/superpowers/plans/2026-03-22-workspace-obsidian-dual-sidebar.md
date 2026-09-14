# Workspace Obsidian Dual Sidebar Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-entry recents sidebar with a persistent left rail that has two Obsidian-style entry buttons, each opening its own compact explorer-like panel for `最近记录` and `模板`.

**Architecture:** Keep `WorkspaceShell` as the single state owner for which sidebar panel is open. Upgrade `WorkspaceSidebar` from a one-button shell into a full-height dual-button rail plus a reusable panel container, and refactor `RecentTemplatesPanel` away from card rendering into two explorer-style content surfaces with compact rows and collapsible template groups.

**Tech Stack:** Next.js 16, React 19, TypeScript, global CSS in `src/app/globals.css`, Vitest + Testing Library

---

## File Structure

### Existing files to modify

- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-shell.tsx`
  - Replace the boolean sidebar state with an active-panel union state, pass separate recent/template content into the sidebar, and keep sidebar-triggered actions wired to the existing data callbacks.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-sidebar.tsx`
  - Rebuild the shell to render a full-height left rail, two top buttons, and the currently active Obsidian-style panel.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\recent-templates-panel.tsx`
  - Refactor from a combined card feed into compact explorer-style content blocks for recent rows and template tree groups.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
  - Replace the current one-button floating sidebar styles with the new rail, dual buttons, panel, and file-tree row styling.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-sidebar.test.tsx`
  - Update assertions for the dual-button rail, per-panel opening behavior, and row actions in the explorer-style UI.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\source-panel.test.tsx`
  - Adjust any sidebar-open helpers and expectations that currently assume one generic recents panel.

### Files that may need small verification-only touches

- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-library.test.tsx`
  - Confirm the workspace layout change does not affect existing right-side tool entry expectations.

## Assumptions and Constraints

- Keep this change scoped to recents/templates only.
- The project directory is not currently a Git repository, so commit steps should be skipped unless Git becomes available.
- Match the current dark workspace theme while borrowing Obsidian’s layout and density rather than its light color palette.

## Implementation Tasks

### Task 1: Lock In Dual-Rail Sidebar Behavior with Tests

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-sidebar.test.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\source-panel.test.tsx`
- Reference: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-sidebar.tsx`

- [ ] **Step 1: Update the collapsed-state test to assert both rail buttons are present**

```tsx
it("shows a full-height rail with recent and template buttons when collapsed", async () => {
  render(<WorkspaceShell />);

  expect(screen.getByRole("button", { name: "Open recent sidebar" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open templates sidebar" })).toBeInTheDocument();
  expect(
    screen.queryByRole("dialog", { name: "Recent records" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("dialog", { name: "Templates" }),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Add a test that opening one rail button only shows its own panel**

```tsx
it("opens the recent panel without opening the templates panel", async () => {
  const user = userEvent.setup();

  render(<WorkspaceShell />);

  await user.click(screen.getByRole("button", { name: "Open recent sidebar" }));

  expect(await screen.findByRole("dialog", { name: "Recent records" })).toBeInTheDocument();
  expect(
    screen.queryByRole("dialog", { name: "Templates" }),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Add a test for switching directly from recent to templates**

```tsx
it("switches between rail panels in place", async () => {
  const user = userEvent.setup();

  render(<WorkspaceShell />);

  await user.click(screen.getByRole("button", { name: "Open recent sidebar" }));
  await user.click(screen.getByRole("button", { name: "Open templates sidebar" }));

  expect(await screen.findByRole("dialog", { name: "Templates" })).toBeInTheDocument();
  expect(
    screen.queryByRole("dialog", { name: "Recent records" }),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Add a regression test for template grouping and click-through behavior**

```tsx
it("loads a template from the templates explorer panel", async () => {
  const user = userEvent.setup();

  render(<WorkspaceShell />);

  await user.click(screen.getByRole("button", { name: "Open templates sidebar" }));
  await user.click(await screen.findByRole("button", { name: /Use template/ }));

  expect(screen.getByRole("textbox", { name: "训练文本" })).toHaveValue(
    expect.stringContaining("shadowing"),
  );
});
```

- [ ] **Step 5: Run the focused sidebar tests to confirm they fail for the right reasons**

Run: `npm run test -- tests/component/workspace/workspace-sidebar.test.tsx`

Expected: FAIL because the current sidebar still exposes only one generic control and one combined panel.

- [ ] **Step 6: Re-run the source panel workspace test file as a guardrail**

Run: `npm run test -- tests/component/workspace/source-panel.test.tsx`

Expected: FAIL only where the old sidebar assumptions are no longer correct, otherwise PASS.

### Task 2: Rebuild the Sidebar Shell Around Two Independent Rail Buttons

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-sidebar.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-shell.tsx`
- Test: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-sidebar.test.tsx`

- [ ] **Step 1: Replace the boolean sidebar state with a discriminated panel state**

```tsx
type ActiveSidebarPanel = "recent" | "templates" | null;

const [activeSidebarPanel, setActiveSidebarPanel] =
  useState<ActiveSidebarPanel>(null);
```

- [ ] **Step 2: Add stable open/close/toggle helpers in `WorkspaceShell`**

```tsx
function toggleSidebarPanel(panel: Exclude<ActiveSidebarPanel, null>) {
  setActiveSidebarPanel((current) => (current === panel ? null : panel));
}

function closeSidebarPanel() {
  setActiveSidebarPanel(null);
}
```

- [ ] **Step 3: Expand `WorkspaceSidebar` props to support both buttons and active content**

```tsx
type WorkspaceSidebarProps = {
  activePanel: "recent" | "templates" | null;
  onClose: () => void;
  onTogglePanel: (panel: "recent" | "templates") => void;
  recentPanel: ReactNode;
  templatesPanel: ReactNode;
};
```

- [ ] **Step 4: Render two compact rail buttons and a single active panel container**

```tsx
<button aria-label="Open recent sidebar" ... />
<button aria-label="Open templates sidebar" ... />
{activePanel === "recent" ? recentPanel : null}
{activePanel === "templates" ? templatesPanel : null}
```

- [ ] **Step 5: Keep backdrop click and `Escape` closing behavior working with the new state**

Run: `npm run test -- tests/component/workspace/workspace-sidebar.test.tsx`

Expected: some tests still fail until panel content is refactored, but dual-button shell behavior should be in place.

### Task 3: Refactor Recent and Template Content into Explorer-Style Panels

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\recent-templates-panel.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-shell.tsx`
- Test: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-sidebar.test.tsx`
- Test: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\source-panel.test.tsx`

- [ ] **Step 1: Split the panel content into separate focused exports or internal sections**

```tsx
export function RecentRecordsPanel(props: RecentRecordsPanelProps) {
  return <section className="sidebar-explorer">...</section>;
}

export function TemplatesPanel(props: TemplatesPanelProps) {
  return <section className="sidebar-explorer">...</section>;
}
```

- [ ] **Step 2: Replace recent card rows with compact explorer rows**

```tsx
<button className="sidebar-explorer__row" type="button">
  <span className="sidebar-explorer__marker" />
  <span className="sidebar-explorer__content">
    <strong>{item.title}</strong>
    <small>{item.status}</small>
  </span>
</button>
```

- [ ] **Step 3: Move delete into a subtle row action that appears on hover/focus**

```tsx
<button
  aria-label={`Delete recent ${item.title}`}
  className="sidebar-explorer__action"
  type="button"
>
  删除
</button>
```

- [ ] **Step 4: Group templates into collapsible difficulty folders**

```tsx
const groupedTemplates = {
  easy: templates.filter((item) => item.difficulty === "easy"),
  medium: templates.filter((item) => item.difficulty === "medium"),
  hard: templates.filter((item) => item.difficulty === "hard"),
};
```

- [ ] **Step 5: Render template groups with disclosure buttons**

```tsx
<button className="sidebar-explorer__group" type="button">
  <span>简单</span>
</button>
```

- [ ] **Step 6: Wire `WorkspaceShell` so recent actions and template loads close the active panel after running**

```tsx
onSelectRecent={(item) => {
  closeSidebarPanel();
  void loadPlayback(item.id);
}}
```

- [ ] **Step 7: Run the sidebar and source panel test files**

Run: `npm run test -- tests/component/workspace/workspace-sidebar.test.tsx tests/component/workspace/source-panel.test.tsx`

Expected: PASS.

### Task 4: Restyle the Left Rail and Explorer Panels to Match the Approved Direction

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-sidebar.tsx`
- Test: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-sidebar.test.tsx`

- [ ] **Step 1: Replace the current floating rail styles with a persistent full-height slot**

```css
.workspace-sidebar {
  position: fixed;
  left: 28px;
  top: 40px;
  bottom: 40px;
  width: 72px;
}

.workspace-sidebar__rail {
  height: 100%;
  border-radius: 28px;
}
```

- [ ] **Step 2: Add a compact two-button stack aligned at the top of the rail**

```css
.workspace-sidebar__controls {
  display: grid;
  gap: 10px;
  align-content: start;
}
```

- [ ] **Step 3: Introduce explorer panel and tree row styles**

```css
.sidebar-explorer__row {
  min-height: 34px;
  border-radius: 10px;
  justify-content: start;
}
```

- [ ] **Step 4: Add hover/focus-only row action reveal styles**

```css
.sidebar-explorer__action {
  opacity: 0;
}

.sidebar-explorer__row-wrap:hover .sidebar-explorer__action,
.sidebar-explorer__row-wrap:focus-within .sidebar-explorer__action {
  opacity: 1;
}
```

- [ ] **Step 5: Keep desktop spacing correct and retain a usable mobile fallback**

```css
.workspace-shell {
  padding-left: 120px;
}
```

- [ ] **Step 6: Run the focused sidebar test file again**

Run: `npm run test -- tests/component/workspace/workspace-sidebar.test.tsx`

Expected: PASS with the final DOM and accessible labels.

### Task 5: Final Verification

**Files:**
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-shell.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-sidebar.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\recent-templates-panel.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-sidebar.test.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\source-panel.test.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-library.test.tsx`

- [ ] **Step 1: Run the updated workspace sidebar and related workspace tests together**

Run: `npm run test -- tests/component/workspace/workspace-sidebar.test.tsx tests/component/workspace/source-panel.test.tsx tests/component/workspace/workspace-library.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run the full workspace component suite**

Run: `npm run test -- tests/component/workspace`

Expected: PASS.

- [ ] **Step 3: Run a production build smoke test**

Run: `npm run build`

Expected: PASS with no TypeScript or Next.js build errors.

- [ ] **Step 4: Manually verify the workspace in the browser**

Checklist:
- The full-height rail is visible on first load.
- Both `最近记录` and `模板` buttons are visible at the top of the rail.
- Clicking one button opens only its own panel.
- Clicking the other button switches panels in place.
- Clicking the same button again closes the panel.
- `Esc` and backdrop click close the panel.
- Recent rows still resume training.
- Recent delete still works.
- Template groups expand/collapse and template rows still load text.

- [ ] **Step 5: Commit if Git becomes available**

```bash
git add src/components/workspace/workspace-shell.tsx \
  src/components/workspace/workspace-sidebar.tsx \
  src/components/workspace/recent-templates-panel.tsx \
  src/app/globals.css \
  tests/component/workspace/workspace-sidebar.test.tsx \
  tests/component/workspace/source-panel.test.tsx \
  tests/component/workspace/workspace-library.test.tsx
git commit -m "feat: add obsidian-style dual workspace sidebar"
```

If `git status` reports that this is not a repository, skip this step.

## Risks and Mitigations

- **Risk:** The template tree groups introduce extra state and could regress template click behavior.
  - **Mitigation:** Add explicit tests that open the template panel and click a grouped row.
- **Risk:** The new dual-button labels could break existing sidebar helper utilities in tests.
  - **Mitigation:** Update helper functions early and rerun `source-panel.test.tsx` after each shell change.
- **Risk:** The persistent full-height rail may visually crowd the workspace on narrower desktops.
  - **Mitigation:** keep the rail slim, keep the panel width controlled, and explicitly verify the shell padding.

## Review Notes

- Plan-document subagent review was skipped because this session does not have explicit user permission to delegate work to subagents.
