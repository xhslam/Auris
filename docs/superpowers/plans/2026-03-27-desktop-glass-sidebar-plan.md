# Desktop Glass Sidebar Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the desktop sidebar into a glassmorphism navigation rail with consistent expanded and collapsed states.

**Architecture:** Keep `DesktopAppSidebar` as the single source of navigation markup. Upgrade the icon rendering in the component and consolidate the final sidebar surface rules in `globals.css` so both states share one design language.

**Tech Stack:** React 19, Next.js 16, TypeScript, global CSS, Vitest

---

### Task 1: Upgrade sidebar markup for stable icon rendering

**Files:**
- Modify: `src/components/runtime/desktop-app-sidebar.tsx`
- Test: `tests/component/runtime/desktop-app-sidebar.test.tsx`

- [ ] **Step 1: Keep the existing collapsed rail assertions**

Use the existing sidebar test to preserve the icon-only collapsed behavior.

- [ ] **Step 2: Replace placeholder character badges**

Render a consistent glyph set keyed by navigation item id so expanded and collapsed states share the same icons.

- [ ] **Step 3: Keep the markup compact**

Do not add extra layout wrappers beyond what the sidebar needs for brand, nav groups, and footer.

### Task 2: Unify the visual system in CSS

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Refresh the sidebar surface**

Add a glass background, blur, soft border, and restrained shadow.

- [ ] **Step 2: Unify controls and nav items**

Use the same tile, border, radius, and active-state language for expanded and collapsed links.

- [ ] **Step 3: Tune collapsed spacing**

Make the collapsed rail slightly roomier so icon buttons feel intentional instead of squeezed.

- [ ] **Step 4: Verify**

Run:
- `npx vitest run tests/component/runtime/desktop-app-sidebar.test.tsx`
- `npm run lint`
- `npm run build`
