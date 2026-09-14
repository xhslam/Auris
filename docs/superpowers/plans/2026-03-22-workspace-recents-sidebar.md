# Workspace Recents Sidebar Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the workspace "recent records and templates" panel into a left-side Obsidian-style collapsible sidebar that is collapsed by default and keeps the main reading area focused.

**Architecture:** Keep `WorkspaceShell` as the data owner, extract the new left rail and overlay panel into a focused `WorkspaceSidebar` component, and reuse `RecentTemplatesPanel` as the embedded content body. Drive the behavior with a single local open/closed state and extend the existing global workspace styling instead of introducing a separate style system.

**Tech Stack:** Next.js 16, React 19, TypeScript, global CSS in `src/app/globals.css`, Vitest + Testing Library

---

## File Structure

### Existing files to modify

- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-shell.tsx`
  - Add sidebar open/close state, mount the new sidebar, remove inline placement of `RecentTemplatesPanel`, and wire existing recent/template callbacks into the new shell.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\recent-templates-panel.tsx`
  - Keep rendering the list content, but make the wrapper/layout assumptions sidebar-friendly and ensure the component can live inside the new overlay panel cleanly.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
  - Add left rail, overlay panel, backdrop, and responsive mobile drawer styles while preserving the current workspace theme.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-library.test.tsx`
  - Keep the existing top-right library expectations intact after the layout change.

### New files to create

- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-sidebar.tsx`
  - Render the narrow rail, the toggle button, the overlay backdrop, and the expandable recents/templates panel.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-sidebar.test.tsx`
  - Cover default-collapsed behavior, expand/collapse interactions, and the recents/templates actions still working through the sidebar surface.

## Assumptions and Constraints

- The workspace folder is currently not inside a Git repository, so commit steps should be skipped unless the project is later initialized as a repo.
- Keep this change scoped to recents/templates only; do not move notes, wordbook, or sentencebook into the left rail yet.
- Follow the existing dark, rounded workspace style already defined in `globals.css`.

## Implementation Tasks

### Task 1: Lock In Sidebar Behavior with Failing Tests

**Files:**
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-sidebar.test.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-library.test.tsx`
- Reference: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-shell.tsx`

- [ ] **Step 1: Write the failing sidebar interaction test**

```tsx
it("starts collapsed and opens the recents sidebar from the left rail", async () => {
  const user = userEvent.setup();
  installWorkspaceFetchMockWithData();

  render(<WorkspaceShell />);

  expect(screen.queryByText("快速继续练习")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "打开最近记录与模板侧栏" }));

  expect(await screen.findByText("快速继续练习")).toBeInTheDocument();
});
```

- [ ] **Step 2: Add a closing behavior test**

```tsx
it("closes the sidebar when pressing Escape", async () => {
  const user = userEvent.setup();
  installWorkspaceFetchMockWithData();

  render(<WorkspaceShell />);

  await user.click(screen.getByRole("button", { name: "打开最近记录与模板侧栏" }));
  await user.keyboard("{Escape}");

  expect(screen.queryByText("快速继续练习")).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Add a regression test for recents/template actions through the sidebar**

```tsx
it("keeps recent and template actions working inside the sidebar", async () => {
  const user = userEvent.setup();
  const fetchSpy = installWorkspaceFetchMockWithData();

  render(<WorkspaceShell />);

  await user.click(screen.getByRole("button", { name: "打开最近记录与模板侧栏" }));
  await user.click(await screen.findByRole("button", { name: /继续训练/ }));

  expect(fetchSpy).toHaveBeenCalledWith("/api/sessions/session-1/playback");
});
```

- [ ] **Step 4: Run the focused test file to confirm failure**

Run: `npm run test -- tests/component/workspace/workspace-sidebar.test.tsx`

Expected: FAIL because the left-rail sidebar UI does not exist yet.

- [ ] **Step 5: Re-run the existing workspace library test as a guardrail**

Run: `npm run test -- tests/component/workspace/workspace-library.test.tsx`

Expected: PASS before implementation changes so the baseline is known.

### Task 2: Build the New Sidebar Component

**Files:**
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-sidebar.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\recent-templates-panel.tsx`
- Test: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-sidebar.test.tsx`

- [ ] **Step 1: Create the focused sidebar shell component**

```tsx
type WorkspaceSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
  panel: React.ReactNode;
};

export function WorkspaceSidebar({
  isOpen,
  onClose,
  onToggle,
  panel,
}: WorkspaceSidebarProps) {
  // render rail button, optional backdrop, and panel container
}
```

- [ ] **Step 2: Add keyboard close handling inside the sidebar component**

```tsx
useEffect(() => {
  if (!isOpen) {
    return;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
    }
  }

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [isOpen, onClose]);
```

- [ ] **Step 3: Refactor `RecentTemplatesPanel` into a sidebar-friendly content block**

```tsx
export function RecentTemplatesPanel(props: RecentTemplatesPanelProps) {
  return (
    <section className="recent-panel recent-panel--sidebar">
      {/* keep list rendering and item actions unchanged */}
    </section>
  );
}
```

- [ ] **Step 4: Run the focused test file to verify the component still fails only on missing shell integration**

Run: `npm run test -- tests/component/workspace/workspace-sidebar.test.tsx`

Expected: FAIL on integration assertions, but no TypeScript/component import errors.

### Task 3: Integrate the Sidebar into the Workspace Shell

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-shell.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-sidebar.tsx`
- Test: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-sidebar.test.tsx`

- [ ] **Step 1: Add the sidebar open state and immutable handlers in `WorkspaceShell`**

```tsx
const [isRecentsSidebarOpen, setIsRecentsSidebarOpen] = useState(false);

function openRecentsSidebar() {
  setIsRecentsSidebarOpen(true);
}

function closeRecentsSidebar() {
  setIsRecentsSidebarOpen(false);
}
```

- [ ] **Step 2: Mount the new sidebar before the main board and pass the existing panel content into it**

```tsx
<main className="workspace-shell">
  <WorkspaceSidebar
    isOpen={isRecentsSidebarOpen}
    onClose={closeRecentsSidebar}
    onToggle={() => setIsRecentsSidebarOpen((current) => !current)}
    panel={
      <RecentTemplatesPanel
        onDeleteRecent={(item) => void handleDeleteRecent(item)}
        onSelectRecent={(item) => void loadPlayback(item.id)}
        onSelectTemplate={...}
        recent={recent}
        templates={...}
      />
    }
  />
  <section className="workspace-shell__article-stack">...</section>
  <section className="workspace-shell__board">...</section>
</main>
```

- [ ] **Step 3: Remove the old inline `RecentTemplatesPanel` from the left workspace column**

```tsx
<div className="workspace-shell__column">
  <SourcePanel ... />
  <VoiceRecorderPanel ... />
</div>
```

- [ ] **Step 4: Close the sidebar after sidebar-originated navigation actions that should return focus to the main workspace**

```tsx
onSelectRecent={(item) => {
  closeRecentsSidebar();
  void loadPlayback(item.id);
}}
```

- [ ] **Step 5: Run the focused sidebar test file**

Run: `npm run test -- tests/component/workspace/workspace-sidebar.test.tsx`

Expected: PASS.

- [ ] **Step 6: Run the existing workspace library regression test**

Run: `npm run test -- tests/component/workspace/workspace-library.test.tsx`

Expected: PASS.

### Task 4: Add Styling and Responsive Behavior

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-sidebar.tsx`
- Test: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-sidebar.test.tsx`

- [ ] **Step 1: Add desktop left-rail and overlay panel styles**

```css
.workspace-sidebar {
  position: fixed;
  left: 20px;
  top: 40px;
  bottom: 40px;
  z-index: 20;
  display: grid;
  grid-template-columns: auto;
}

.workspace-sidebar__rail {
  width: 56px;
  border: 1px solid var(--line);
  border-radius: 24px;
}

.workspace-sidebar__panel[data-open="true"] {
  transform: translateX(0);
  opacity: 1;
}
```

- [ ] **Step 2: Add backdrop and collapsed/expanded transition styles**

```css
.workspace-sidebar__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(6px);
}
```

- [ ] **Step 3: Add mobile drawer rules under the existing responsive breakpoints**

```css
@media (max-width: 1180px) {
  .workspace-sidebar {
    position: static;
  }

  .workspace-sidebar__panel {
    position: fixed;
    inset: auto 18px 18px 18px;
    width: auto;
  }
}
```

- [ ] **Step 4: Keep the main workspace content aligned after introducing the fixed rail**

```css
.workspace-shell {
  padding-left: 116px;
}
```

- [ ] **Step 5: Run the focused sidebar test file again**

Run: `npm run test -- tests/component/workspace/workspace-sidebar.test.tsx`

Expected: PASS after the final DOM structure settles.

### Task 5: Final Verification

**Files:**
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-shell.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-sidebar.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-sidebar.test.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-library.test.tsx`

- [ ] **Step 1: Run both workspace component test files together**

Run: `npm run test -- tests/component/workspace/workspace-sidebar.test.tsx tests/component/workspace/workspace-library.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run a broader workspace-related suite if the sidebar change affects surrounding UI**

Run: `npm run test -- tests/component/workspace`

Expected: PASS, or investigate and fix any regressions in neighboring workspace components.

- [ ] **Step 3: Run a production build smoke test**

Run: `npm run build`

Expected: PASS with no TypeScript or Next.js build errors.

- [ ] **Step 4: Manually verify the workspace in the browser**

Checklist:
- Sidebar is collapsed on first load.
- Left rail button is visible and clickable.
- Sidebar opens and closes smoothly.
- Backdrop click closes the panel.
- `Esc` closes the panel.
- Recent session selection still prepares the reader.
- Template selection still loads text into the source area.
- Mobile-sized viewport still keeps the main workspace usable.

- [ ] **Step 5: Commit if Git becomes available**

```bash
git add src/components/workspace/workspace-shell.tsx \
  src/components/workspace/workspace-sidebar.tsx \
  src/components/workspace/recent-templates-panel.tsx \
  src/app/globals.css \
  tests/component/workspace/workspace-sidebar.test.tsx \
  tests/component/workspace/workspace-library.test.tsx
git commit -m "feat: move workspace recents into collapsible sidebar"
```

If `git status` reports that this is not a repository, skip this step.

## Risks and Mitigations

- **Risk:** Fixed-position sidebar styling could overlap the article or board layouts unexpectedly.
  - **Mitigation:** Add the rail first, then adjust `workspace-shell` padding and verify desktop and mobile breakpoints explicitly.
- **Risk:** Overlay/backdrop markup could break current tests that assume a simpler workspace tree.
  - **Mitigation:** Introduce focused sidebar tests before changing DOM structure, then re-run the existing workspace regression tests.
- **Risk:** Closing behavior might be inconsistent across click, keyboard, and sidebar-triggered actions.
  - **Mitigation:** Centralize `open` and `close` handlers in `WorkspaceShell` and cover `Esc` plus backdrop click in tests.

## Review Notes

- Subagent plan review was not run because this session should not spawn subagents without an explicit user request.
