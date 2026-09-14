# Shared Auth Background Frame Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse the login page background frame on `workspace`, `notes`, and `assessment` without changing those pages' internal content layout.

**Architecture:** Extract the shared login background into a focused shell component that renders the silhouette and atmosphere layers once, then wrap the existing page shells with that component. Keep auth-only story and card content inside `AuthShell`, and add component tests that verify both auth and non-auth shells consume the shared frame.

**Tech Stack:** Next.js 16, React 19, TypeScript, global CSS in `src/app/globals.css`, Vitest + Testing Library

---

## File Structure

### Existing files to modify

- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-shell.tsx`
  - Replace direct ownership of the shared background markup with the reusable frame while keeping the current auth composition and copy unchanged.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-shell.tsx`
  - Wrap the current workspace root content in the shared frame without changing internal workspace layout behavior.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\notes\notes-shell.tsx`
  - Wrap the notes shell in the shared frame while preserving the existing sidebar, editor, and library panel structure.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\assessment\assessment-shell.tsx`
  - Wrap the assessment shell in the shared frame while preserving the current sidebar and cards layout.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
  - Move background-related selectors from auth-only ownership into the shared frame and resolve any conflicting page-root backgrounds.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\auth\auth-shell.test.tsx`
  - Add regression coverage proving the auth shell still renders the shared frame and its existing auth content together.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\notes\notes-shell.test.tsx`
  - Add coverage proving the notes shell mounts inside the shared background frame.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\assessment\assessment-shell.test.tsx`
  - Add coverage proving the assessment shell mounts inside the shared background frame.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-library.test.tsx`
  - Add a regression proving the workspace shell mounts inside the shared background frame while keeping existing top-right actions intact.

### New files to create

- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\shell\shared-auth-background-frame.tsx`
  - Render the shared login background structure and accept arbitrary page content as `children`.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\shell\shared-auth-background-frame.test.tsx`
  - Verify the shared frame renders the background scaffold plus arbitrary child content.

## Assumptions and Constraints

- The current workspace is not inside a Git repository, so commit steps should be skipped unless Git is initialized later.
- "Perfectly copy the background" means the shared frame should reuse the actual login-page background structure instead of approximating it with new gradients.
- Page content layout for `workspace`, `notes`, and `assessment` must remain functionally and structurally the same.

## Implementation Tasks

### Task 1: Lock In Shared Frame Behavior with Failing Tests

**Files:**
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\shell\shared-auth-background-frame.test.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\auth\auth-shell.test.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\notes\notes-shell.test.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\assessment\assessment-shell.test.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-library.test.tsx`

- [ ] **Step 1: Write the failing shared frame unit test**

```tsx
it("renders the shared auth background and any child content", () => {
  render(
    <SharedAuthBackgroundFrame>
      <div>frame child</div>
    </SharedAuthBackgroundFrame>,
  );

  expect(screen.getByTestId("shared-auth-background-frame")).toBeInTheDocument();
  expect(screen.getByTestId("shared-auth-book-silhouette")).toBeInTheDocument();
  expect(screen.getByText("frame child")).toBeInTheDocument();
});
```

- [ ] **Step 2: Extend the auth shell regression to assert the shared frame wrapper exists**

```tsx
expect(screen.getByTestId("shared-auth-background-frame")).toBeInTheDocument();
```

- [ ] **Step 3: Add notes and assessment regressions that assert the shared frame exists around their content**

```tsx
expect(await screen.findByTestId("shared-auth-background-frame")).toBeInTheDocument();
expect(screen.getByRole("heading", { name: /绗旇|鍙戦煶璇勪及/ })).toBeInTheDocument();
```

- [ ] **Step 4: Extend the workspace regression to assert the shared frame exists while keeping library actions**

```tsx
expect(await screen.findByTestId("shared-auth-background-frame")).toBeInTheDocument();
expect(await screen.findByRole("link", { name: "鎵撳紑绗旇" })).toHaveAttribute("href", "/notes");
```

- [ ] **Step 5: Run the focused shell-related tests to verify RED**

Run: `npm run test -- tests/component/shell/shared-auth-background-frame.test.tsx tests/component/auth/auth-shell.test.tsx tests/component/notes/notes-shell.test.tsx tests/component/assessment/assessment-shell.test.tsx tests/component/workspace/workspace-library.test.tsx`

Expected: FAIL because the shared frame component does not exist yet and consuming shells do not render it.

### Task 2: Build the Shared Background Frame

**Files:**
- Create: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\shell\shared-auth-background-frame.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-shell.tsx`
- Test: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\shell\shared-auth-background-frame.test.tsx`
- Test: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\auth\auth-shell.test.tsx`

- [ ] **Step 1: Create the minimal shared frame component**

```tsx
type SharedAuthBackgroundFrameProps = {
  children: ReactNode;
};

export function SharedAuthBackgroundFrame({
  children,
}: SharedAuthBackgroundFrameProps) {
  return (
    <div className="shared-auth-background-frame" data-testid="shared-auth-background-frame">
      <div
        aria-hidden="true"
        className="shared-auth-background-frame__book-silhouette"
        data-testid="shared-auth-book-silhouette"
      />
      <div className="shared-auth-background-frame__content">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Refactor `AuthShell` to consume the shared frame instead of owning the background directly**

```tsx
return (
  <SharedAuthBackgroundFrame>
    <main className="auth-shell">
      {/* existing story + card content */}
    </main>
  </SharedAuthBackgroundFrame>
);
```

- [ ] **Step 3: Run the shared frame and auth shell tests**

Run: `npm run test -- tests/component/shell/shared-auth-background-frame.test.tsx tests/component/auth/auth-shell.test.tsx`

Expected: PASS.

### Task 3: Adopt the Shared Frame in Non-Auth Shells

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-shell.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\notes\notes-shell.tsx`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\assessment\assessment-shell.tsx`
- Test: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\notes\notes-shell.test.tsx`
- Test: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\assessment\assessment-shell.test.tsx`
- Test: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\workspace\workspace-library.test.tsx`

- [ ] **Step 1: Wrap the workspace shell root in the shared frame**

```tsx
return (
  <SharedAuthBackgroundFrame>
    <main className="workspace-shell">
      {/* existing workspace content unchanged */}
    </main>
  </SharedAuthBackgroundFrame>
);
```

- [ ] **Step 2: Wrap the notes shell root in the shared frame**

```tsx
return (
  <SharedAuthBackgroundFrame>
    <main className="notes-shell">...</main>
  </SharedAuthBackgroundFrame>
);
```

- [ ] **Step 3: Wrap the assessment shell root in the shared frame**

```tsx
return (
  <SharedAuthBackgroundFrame>
    <main className="assessment-shell">...</main>
  </SharedAuthBackgroundFrame>
);
```

- [ ] **Step 4: Run the focused non-auth shell tests**

Run: `npm run test -- tests/component/notes/notes-shell.test.tsx tests/component/assessment/assessment-shell.test.tsx tests/component/workspace/workspace-library.test.tsx`

Expected: PASS.

### Task 4: Move Shared Background Styling and Remove Outer Conflicts

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\shell\shared-auth-background-frame.tsx`
- Test: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\shell\shared-auth-background-frame.test.tsx`

- [ ] **Step 1: Add shared frame selectors for the login background layers**

```css
.shared-auth-background-frame {
  position: relative;
  min-height: 100vh;
  isolation: isolate;
}

.shared-auth-background-frame__book-silhouette {
  position: absolute;
  inset: 0 auto 0 0;
  pointer-events: none;
}
```

- [ ] **Step 2: Repoint existing auth background styles from auth-only selectors to shared-frame selectors**

```css
.shared-auth-background-frame__book-silhouette::before { ... }
.shared-auth-background-frame__book-silhouette::after { ... }
```

- [ ] **Step 3: Preserve auth-specific story/card styling under `auth-shell` selectors only**

```css
.auth-shell__story { ... }
.auth-shell__card { ... }
```

- [ ] **Step 4: Remove or neutralize any duplicated outer background treatment that muddies the shared frame on non-auth pages**

```css
.shared-auth-background-frame__content {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 5: Run the focused shell-related suite again**

Run: `npm run test -- tests/component/shell/shared-auth-background-frame.test.tsx tests/component/auth/auth-shell.test.tsx tests/component/notes/notes-shell.test.tsx tests/component/assessment/assessment-shell.test.tsx tests/component/workspace/workspace-library.test.tsx`

Expected: PASS after the final structure and selectors settle.

### Task 5: Final Verification

**Files:**
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\shell\shared-auth-background-frame.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-shell.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\workspace\workspace-shell.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\notes\notes-shell.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\assessment\assessment-shell.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`

- [ ] **Step 1: Run the complete affected component test suite**

Run: `npm run test -- tests/component/auth/auth-shell.test.tsx tests/component/notes/notes-shell.test.tsx tests/component/assessment/assessment-shell.test.tsx tests/component/workspace/workspace-library.test.tsx tests/component/shell/shared-auth-background-frame.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run the broader component suite**

Run: `npm run test -- tests/component`

Expected: PASS, or investigate and fix any regressions before proceeding.

- [ ] **Step 3: Run a production build smoke test**

Run: `npm run build`

Expected: PASS with no TypeScript or Next.js build errors.

- [ ] **Step 4: Manually verify in the browser**

Checklist:
- Login page still looks unchanged.
- Workspace uses the login background while keeping the current workspace layout.
- Notes uses the login background while keeping sidebar/editor behavior.
- Assessment uses the login background while keeping sidebar/composer/card behavior.
- Desktop and narrow viewport still keep decorative layers behind interactive content.

- [ ] **Step 5: Commit if Git becomes available**

```bash
git add src/components/shell/shared-auth-background-frame.tsx \
  src/components/auth/auth-shell.tsx \
  src/components/workspace/workspace-shell.tsx \
  src/components/notes/notes-shell.tsx \
  src/components/assessment/assessment-shell.tsx \
  src/app/globals.css \
  tests/component/shell/shared-auth-background-frame.test.tsx \
  tests/component/auth/auth-shell.test.tsx \
  tests/component/notes/notes-shell.test.tsx \
  tests/component/assessment/assessment-shell.test.tsx \
  tests/component/workspace/workspace-library.test.tsx
git commit -m "feat: share auth background frame across app shells"
```

If `git status` reports that this is not a repository, skip this step.

## Risks and Mitigations

- **Risk:** The extracted frame no longer matches the login page exactly.
  - **Mitigation:** Make `AuthShell` consume the shared frame first, then extend it to other shells.
- **Risk:** Non-auth page roots become visually muddy from double-applied backgrounds.
  - **Mitigation:** Limit changes to the outermost decorative layer and keep page-specific panels unchanged.
- **Risk:** Fixed overlays or sidebars render below the decorative frame.
  - **Mitigation:** Keep the frame non-interactive and below all page content via low z-index plus `pointer-events: none`.

## Review Notes

- Subagent plan review was not run because this session should not spawn subagents without an explicit user request.
