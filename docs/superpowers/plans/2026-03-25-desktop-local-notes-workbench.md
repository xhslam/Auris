# Desktop Local Notes Workbench Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current product into an Electron-based local desktop project while keeping core training flows stable and upgrading only `notes` into an Obsidian-like vault workbench with user-installable plugins.

**Architecture:** Keep the existing Next.js app as the product surface, add an Electron shell plus a typed desktop bridge, and route the `notes` feature through a new desktop vault/plugin layer. Reuse existing notes abstractions and current sentencebook/wordbook integrations instead of rewriting business logic.

**Tech Stack:** Next.js, React, TypeScript, Electron, Vitest, Testing Library, Playwright

---

### Task 1: Add Electron desktop shell and runtime bridge

**Files:**
- Create: `electron/main.cjs`
- Create: `electron/preload.cjs`
- Create: `electron/utils/find-open-port.cjs`
- Create: `src/platform/desktop/desktop-bridge.ts`
- Create: `src/platform/desktop/desktop-runtime.ts`
- Modify: `src/platform/runtime.ts`
- Modify: `package.json`
- Test: `tests/unit/platform/runtime.test.ts`
- Test: `tests/unit/platform/desktop-runtime.test.ts`

- [ ] **Step 1: Write failing runtime tests for desktop detection**
- [ ] **Step 2: Run the runtime tests and watch them fail**
- [ ] **Step 3: Implement desktop runtime and typed bridge detection**
- [ ] **Step 4: Add Electron main/preload bootstrapping and desktop npm scripts**
- [ ] **Step 5: Run the targeted runtime tests and make sure they pass**

### Task 2: Add desktop vault storage before changing notes UI

**Files:**
- Create: `src/platform/desktop/vault-types.ts`
- Create: `src/platform/desktop/vault-service.ts`
- Create: `src/platform/notes/desktop-notes-storage.ts`
- Modify: `src/features/notes/local-notes-store.ts`
- Test: `tests/unit/platform/vault-service.test.ts`
- Test: `tests/unit/notes/desktop-notes-storage.test.ts`

- [ ] **Step 1: Write failing tests for vault metadata and desktop notes storage**
- [ ] **Step 2: Run those tests to verify RED**
- [ ] **Step 3: Implement minimal vault + desktop notes storage**
- [ ] **Step 4: Wire `NotesStorage` selection to use the desktop adapter**
- [ ] **Step 5: Re-run the targeted tests and keep them green**

### Task 3: Upgrade notes into a vault workbench

**Files:**
- Create: `src/components/notes/notes-command-palette.tsx`
- Create: `src/components/notes/notes-tabs.tsx`
- Create: `src/components/notes/notes-plugin-panel.tsx`
- Create: `src/components/notes/use-notes-workbench.ts`
- Modify: `src/components/notes/notes-shell.tsx`
- Modify: `src/components/notes/notes-editor.tsx`
- Modify: `src/components/notes/notes-sidebar.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/component/notes/notes-shell.test.tsx`
- Test: `tests/component/notes/notes-editor.test.tsx`

- [ ] **Step 1: Write failing component tests for tabs, command palette, and plugin panel placeholders**
- [ ] **Step 2: Run the component tests and confirm the failures**
- [ ] **Step 3: Implement workbench state, tabs, and command palette**
- [ ] **Step 4: Integrate right-side plugin/context panel without breaking sentencebook/wordbook**
- [ ] **Step 5: Re-run notes component tests and make them pass**

### Task 4: Add user-installable plugin system

**Files:**
- Create: `src/features/plugins/plugin-manifest.ts`
- Create: `src/features/plugins/plugin-host.ts`
- Create: `src/features/plugins/plugin-api.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/platform/desktop/desktop-bridge.ts`
- Modify: `src/components/notes/use-notes-workbench.ts`
- Test: `tests/unit/plugins/plugin-manifest.test.ts`
- Test: `tests/unit/plugins/plugin-host.test.ts`

- [ ] **Step 1: Write failing tests for plugin manifest parsing and plugin registration**
- [ ] **Step 2: Run the plugin tests and verify they fail correctly**
- [ ] **Step 3: Implement the minimal plugin manifest loader and runtime host**
- [ ] **Step 4: Wire plugin commands/panels into the notes workbench**
- [ ] **Step 5: Re-run plugin tests and keep them green**

### Task 5: Regression tests, verification, and review

**Files:**
- Modify: `tests/component/notes/notes-shell.test.tsx`
- Modify: `tests/component/notes/notes-editor.test.tsx`
- Modify: `tests/unit/platform/runtime.test.ts`
- Modify: `tests/e2e/app-smoke.spec.ts`

- [ ] **Step 1: Add regression coverage for unchanged core flows where desktop runtime is present**
- [ ] **Step 2: Run `npm run test`**
- [ ] **Step 3: Run `npm run lint`**
- [ ] **Step 4: Run `npm run build`**
- [ ] **Step 5: Review the final diff for regressions, risky coupling, and missing cases**
