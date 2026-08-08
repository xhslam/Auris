# Login Book Silhouette Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Apple-style login redesign by adding a large left-edge half-open book silhouette and replacing the main hero copy with the newly approved notes-and-English-practice messaging.

**Architecture:** Keep the shared auth shell intact and add the new visual layer inside `AuthShell` as a dedicated background silhouette element rather than mixing decorative markup into the text block. Drive the effect primarily through `globals.css`, using layered gradients and softly shaped pseudo-surfaces to keep the book atmospheric and secondary.

**Tech Stack:** Next.js 16, React 19, TypeScript, global CSS in `src/app/globals.css`, Vitest + Testing Library

---

## File Structure

### Existing files to modify

- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-shell.tsx`
  - Add a structural book silhouette background element and replace the current left-side hero copy with the approved new text.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
  - Create the half-open book silhouette, position it along the left edge, and retune the left story block so it sits cleanly over the background.
- `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\auth\auth-shell.test.tsx`
  - Update rendering assertions to match the new hero copy.

## Assumptions and Constraints

- This is a continuation of the already-implemented Apple-style auth redesign.
- The book should remain abstract and atmospheric, not illustrative.
- Do not change auth business logic.
- The project directory is not currently a Git repository, so commit steps should be skipped unless Git becomes available.

## Implementation Tasks

### Task 1: Update Auth Shell Rendering Expectations

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\auth\auth-shell.test.tsx`
- Reference: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-shell.tsx`

- [ ] **Step 1: Replace the old story-copy assertion with the new approved hero text**

```tsx
expect(
  screen.getByText("集笔记和英语练习于一身，实现真正的 thinking by yourself, talking to yourself……"),
).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused auth shell test**

Run: `npm run test -- tests/component/auth/auth-shell.test.tsx`

Expected: FAIL before implementation because the new story copy and structure are not present yet.

### Task 2: Add the Book Silhouette Structure and New Hero Copy

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-shell.tsx`
- Test: `tests/component/auth/auth-shell.test.tsx`

- [ ] **Step 1: Add a dedicated decorative layer inside the left story section**

```tsx
<section className="auth-shell__story">
  <div aria-hidden="true" className="auth-shell__book-silhouette" />
  <div className="auth-shell__story-content">...</div>
</section>
```

- [ ] **Step 2: Replace the current hero message with the new approved copy**

```tsx
<p className="auth-shell__story-copy">
  集笔记和英语练习于一身，
  实现真正的 thinking by yourself,
  talking to yourself……
</p>
```

- [ ] **Step 3: Keep the existing brand row, metrics, and footer, but ensure they sit in a content wrapper above the silhouette**

Run: `npm run test -- tests/component/auth/auth-shell.test.tsx`

Expected: PASS.

### Task 3: Build the Half-Open Book Silhouette and Rebalance the Story Area

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
- Verify: `src/components/auth/auth-shell.tsx`

- [ ] **Step 1: Add a positioned book silhouette layer anchored to the far left**

```css
.auth-shell__book-silhouette {
  position: absolute;
  left: -120px;
  top: 6%;
  width: 520px;
  height: 680px;
}
```

- [ ] **Step 2: Create the half-open book effect using pseudo-elements or nested surfaces**

```css
.auth-shell__book-silhouette::before,
.auth-shell__book-silhouette::after {
  content: "";
  position: absolute;
  border-radius: 32px;
}
```

- [ ] **Step 3: Make the left page softer and the right page slightly brighter**

```css
.auth-shell__book-silhouette::before {
  opacity: 0.22;
}

.auth-shell__book-silhouette::after {
  opacity: 0.34;
}
```

- [ ] **Step 4: Add a faint spine/fold suggestion and keep the text readable above it**

```css
.auth-shell__story-content {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 5: Retune story width and line breaks so the new message reads like a poster statement**

```css
.auth-shell__story-copy {
  max-width: 26rem;
  line-height: 1.1;
}
```

### Task 4: Responsive Tuning

**Files:**
- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`

- [ ] **Step 1: Reduce the silhouette on medium screens**

```css
@media (max-width: 1180px) {
  .auth-shell__book-silhouette {
    width: 420px;
    opacity: 0.7;
  }
}
```

- [ ] **Step 2: Heavily tone down or partially hide the silhouette on mobile**

```css
@media (max-width: 720px) {
  .auth-shell__book-silhouette {
    opacity: 0.28;
    transform: translateX(-22%);
  }
}
```

### Task 5: Final Verification

**Files:**
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-shell.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\auth\auth-shell.test.tsx`

- [ ] **Step 1: Run auth component tests**

Run: `npm run test -- tests/component/auth`

Expected: PASS.

- [ ] **Step 2: Run the broader component suite**

Run: `npm run test -- tests/component`

Expected: PASS.

- [ ] **Step 3: Run a production build smoke test**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Manually verify the login page**

Checklist:
- The left edge shows a large, faint half-open book silhouette.
- The silhouette stays atmospheric and does not overpower the text.
- The new hero copy is visible and well-broken across lines.
- The right login card still feels balanced with the left side.
- Mobile remains usable and the silhouette does not crowd the page.

- [ ] **Step 5: Commit if Git becomes available**

```bash
git add src/components/auth/auth-shell.tsx \
  src/app/globals.css \
  tests/component/auth/auth-shell.test.tsx
git commit -m "feat: add auth page book silhouette hero"
```

If `git status` reports that this is not a repository, skip this step.

## Risks and Mitigations

- **Risk:** The silhouette may read as a random blob instead of a book.
  - **Mitigation:** use clear left/right page tonal separation and a faint spine cue.
- **Risk:** The new English phrases may make the hero line breaks awkward.
  - **Mitigation:** explicitly control max width and line rhythm in CSS.
- **Risk:** The silhouette may conflict with the login card on wide but short screens.
  - **Mitigation:** anchor it left, keep opacity low, and constrain the story block width.

## Review Notes

- Plan-document subagent review was skipped because this session does not have explicit user permission to delegate work to subagents.
