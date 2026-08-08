# Home Courses Anchor Jump Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the home page "查看更多" entry jump to the courses page course panel while keeping the home course cards display-only.

**Architecture:** Keep navigation declarative by turning the home section action into a normal link pointing at `/courses#course-panel`. Mark the courses page "课程面板" section with a stable anchor id so the browser handles the landing behavior without extra client state.

**Tech Stack:** React, Next.js, Testing Library, Vitest

---

### Task 1: Lock the desired navigation behavior with tests

**Files:**
- Modify: `tests/component/home/desktop-home-shell.test.tsx`
- Create: `tests/component/courses/courses-shell.test.tsx`

- [ ] **Step 1: Add a failing assertion for the home "查看更多" link**

Check that the home courses section exposes a link to `/courses#course-panel`.

- [ ] **Step 2: Run the focused home shell test to verify it fails**

Run: `npx vitest run tests/component/home/desktop-home-shell.test.tsx`

- [ ] **Step 3: Add a failing assertion for the courses anchor target**

Check that the courses shell renders a section with `id="course-panel"`.

- [ ] **Step 4: Run the focused courses shell test to verify it fails**

Run: `npx vitest run tests/component/courses/courses-shell.test.tsx`

### Task 2: Implement the anchor navigation with the smallest UI change

**Files:**
- Modify: `src/components/home/desktop-home-shell.tsx`
- Modify: `src/components/courses/courses-shell.tsx`

- [ ] **Step 1: Replace the home courses action button with a link**

Point the control at `/courses#course-panel` and keep the audio/video sections unchanged.

- [ ] **Step 2: Add the stable anchor to the courses panel section**

Set `id="course-panel"` on the existing "课程面板" block without changing placeholder content.

- [ ] **Step 3: Re-run the focused tests and make them pass**

Run: `npx vitest run tests/component/home/desktop-home-shell.test.tsx tests/component/courses/courses-shell.test.tsx`

### Task 3: Verify the small feature end to end at the code level

**Files:**
- Modify: `src/components/home/desktop-home-shell.tsx`
- Modify: `src/components/courses/courses-shell.tsx`
- Modify: `tests/component/home/desktop-home-shell.test.tsx`
- Create: `tests/component/courses/courses-shell.test.tsx`

- [ ] **Step 1: Run lint on the updated code**

Run: `npm run lint -- --quiet`

- [ ] **Step 2: Review the diff for scope control**

Run: `git diff -- src/components/home/desktop-home-shell.tsx src/components/courses/courses-shell.tsx tests/component/home/desktop-home-shell.test.tsx tests/component/courses/courses-shell.test.tsx`

- [ ] **Step 3: Keep implementation limited to anchor navigation only**

Do not add real course data, course detail routes, or card click behavior in this step.
