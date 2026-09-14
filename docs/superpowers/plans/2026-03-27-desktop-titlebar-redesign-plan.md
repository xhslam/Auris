# Desktop Titlebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary symbol-heavy desktop header with a real desktop titlebar that uses labeled controls and a separate workspace status strip.

**Architecture:** Keep the existing `DesktopAppFrame` as the single shared desktop chrome component. Update header structure there, move workspace state chips into a dedicated strip below the header, and refresh the matching CSS overrides in the desktop surface section.

**Tech Stack:** React 19, Next.js 16, TypeScript, global CSS, Vitest, Testing Library

---

### Task 1: Lock the desired titlebar behavior with a component test

**Files:**
- Create: `tests/component/runtime/desktop-app-frame.test.tsx`
- Test: `tests/component/runtime/desktop-app-frame.test.tsx`

- [ ] **Step 1: Write the failing test**

Assert that the shared desktop frame renders labeled actions for sidebar, search, and help, keeps workspace status visible, and no longer shows placeholder symbols.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/component/runtime/desktop-app-frame.test.tsx`

- [ ] **Step 3: Write minimal implementation**

Update the shared frame markup so the titlebar uses explicit labeled controls and a separate status strip.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/component/runtime/desktop-app-frame.test.tsx`

### Task 2: Refresh the shared desktop chrome styling

**Files:**
- Modify: `src/components/runtime/desktop-app-frame.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update the titlebar layout**

Use a three-zone header layout: sidebar control, title copy, action group.

- [ ] **Step 2: Add a secondary workspace status strip**

Render the existing status chips below the header so the top row stays calm and desktop-like.

- [ ] **Step 3: Update CSS**

Style the new controls and status strip to match the light desktop shell.

- [ ] **Step 4: Verify targeted and project-level checks**

Run:
- `npx vitest run tests/component/runtime/desktop-app-frame.test.tsx`
- `npm run build`
