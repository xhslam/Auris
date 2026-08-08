# Desktop Frame Header Removal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the shared desktop header band and re-tighten the frame so page content starts immediately.

**Architecture:** Keep `DesktopAppFrame` as the shared desktop shell, but reduce it to sidebar plus viewport. Remove shared header/state markup there and clean up the corresponding global CSS rules so the remaining shells align correctly.

**Tech Stack:** React 19, Next.js 16, TypeScript, global CSS, Vitest

---

### Task 1: Lock the new frame behavior with a test

**Files:**
- Modify: `tests/component/runtime/desktop-app-frame.test.tsx`

- [ ] **Step 1: Update the expected behavior**

Assert that shared titlebar controls, shared page heading, and shared workspace-status chips are absent while viewport content still renders.

- [ ] **Step 2: Run the test to watch it fail**

Run: `npx vitest run tests/component/runtime/desktop-app-frame.test.tsx`

### Task 2: Remove the shared header and tighten the frame

**Files:**
- Modify: `src/components/runtime/desktop-app-frame.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Remove shared frame header/status markup**

Keep sidebar state logic and viewport rendering only.

- [ ] **Step 2: Adjust frame spacing**

Update frame/viewport spacing so content rises naturally after the header removal.

- [ ] **Step 3: Verify**

Run:
- `npx vitest run tests/component/runtime/desktop-app-frame.test.tsx`
- `npm run build`
