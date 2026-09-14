# Reading Workbench Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desktop-first reading workbench that adapts the target site's core bilingual intensive-reading loop into Auris without disturbing existing rehearsal, notes, video, or AI Dock workflows.

> **Execution status (updated 2026-06-15):**
> - ✅ Phases 1–8 complete: `/reading` route, sidebar entry, three-column workbench, bilingual/English toggle, paragraph hover + favorite, word-chain lookup + save word, annotation drafts, reading progress, and paste import that builds a local reading entry.
> - ✅ Phase 9 follow-up #1 (persistence) **done**: local imports are now upgraded from in-memory only to **vault-backed**. Pasted readings are saved into the existing notes vault (`NotesStorage`) as a `reading-source` note and re-loaded on mount, so entries survive a reload. Reuses the existing storage layer — no new database. Graceful degradation: when no vault is configured the workbench stays in-memory and shows a status pill.
> - ⏭️ Still open: real URL/file import, wordbook-store integration for saved words, AI-generated translation/paragraph analysis, and notes-vault persistence for annotations/favorites.

**Architecture:** Introduce a new `/reading` route and a focused `src/components/reading/` module. The first slice uses local mock reading data and controlled React state, reuses the existing `DesktopAppFrame` navigation shell, and keeps future persistence/import integration behind explicit follow-up tasks.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS modules by colocated global stylesheet import pattern, Vitest, Testing Library, optional Playwright smoke verification.

---

## 1. Background

The target website, `https://aim-read.top`, appears to be a Chinese-user-focused English intensive-reading product. Direct Browser automation did not reliably load the protected `/home` route because `/home` redirects to `/login` and the public pages include Cloudflare challenge scripts and security headers. The analysis therefore used only public HTML, manifest metadata, and publicly downloadable Next.js static bundle text. No login, bypass, private data extraction, or protected-page scraping was performed.

Auris already has a strong listening and rehearsal loop: import text, generate or load training audio, replay sentence-level material, click words, save words, save sentences, and send learning context into notes or the AI Dock. The target site's most valuable contribution is a complementary text-first loop: content library -> bilingual paragraph reading -> word-chain lookup -> annotation/favorite capture -> continue reading. This fits Auris as a new reading module rather than a replacement for the existing rehearsal workspace.

## 2. Target Website Functional Breakdown

### Product Positioning

The website positions itself as "Reader - read beyond words" and, in Chinese metadata, as a bilingual intensive-reading platform: "读懂每一句，不止读完". Its public copy emphasizes bilingual paragraph-by-paragraph reading, instant word lookup, word-chain memory, foreign articles, literature, films, and TV-series learning.

### Core Users

The core users are Chinese-speaking English learners who want to understand authentic English content deeply rather than only finish reading. The product is designed for people who need vocabulary support, paragraph explanations, sentence understanding, and repeatable review records.

### Home Page Structure

The public landing page is a marketing surface rather than the logged-in product. Static route/component names and page metadata show these public sections:

- Landing navigation.
- Hero section.
- Social proof.
- Bento-style feature grid.
- Visual records.
- Stats bar.
- Testimonials.
- Pricing.
- FAQ.
- Final CTA and footer.

The protected `/home` route renders an app-shell skeleton and redirects unauthenticated access to `/login`.

### Main Product Modules

Public bundle text exposes the likely logged-in modules:

- Article/content library: `/articles`, `/articles/category`, `/articles/book-tree`.
- Favorites: `/articles/favorite`, `/articles/favorites`, `/articles/favorites/ids`, `/articles/favorites/sources`.
- Reading navigation: `/reading/navigation`.
- Bilingual reader: bilingual/English-only mode switching, paragraph hover linkage, reading progress.
- Word lookup and word chain: right-click word lookup, recursive word-chain recommendations, save/remove vocabulary.
- Paragraph and sentence analysis: author explanations, sentence analysis, paragraph analysis.
- Highlights and annotations: paragraph favorite, text selection annotation, batch annotation removal.
- Subscription and entitlement: reading community, classic film/TV purchases, trials, renewal states.

### User Operation Path

The likely product path is:

1. Visitor lands on the marketing page and understands the reading promise.
2. Visitor registers or logs in.
3. User enters the app home/content library.
4. User chooses an article, book chapter, episode, film, or favorite.
5. User reads in bilingual side-by-side mode or pure English mode.
6. User hovers paragraphs to link source and translation.
7. User right-clicks or selects a word to open word-chain lookup.
8. User saves words to a vocabulary list.
9. User opens sentence/paragraph analysis when needed.
10. User highlights, annotates, or favorites a paragraph.
11. User returns later through reading progress, favorites, or content navigation.

### Information Display And Interaction Logic

The site organizes learning around a three-layer understanding model:

- Word layer: lookup, word chain, vocabulary management.
- Sentence layer: sentence explanation and comprehension support.
- Paragraph layer: paragraph analysis, bilingual alignment, annotation, favorites.

The most important interaction pattern is not a standalone dictionary. It is contextual reading: every lookup, annotation, and favorite remains attached to the current article and paragraph so review has source context.

### Most Valuable Core Function

The highest-value reusable function is the text-first intensive-reading loop:

`select content -> read bilingual paragraphs -> inspect word/paragraph -> save vocabulary/annotation -> continue later`

This complements Auris because Auris already handles listening/rehearsal, but lacks a dedicated calm reading surface for bilingual text, paragraph-level source context, and annotation-first review.

## 3. Reusable Feature Judgment

### Must Recreate In Auris

- Bilingual paragraph reader: this is the center of the target site's value and maps naturally to a desktop reading workbench.
- Pure English / bilingual mode switch: small implementation cost, high learning value.
- Paragraph hover/selection state: makes source and translation feel linked.
- Word lookup surface: Auris already has dictionary lookup patterns, and the new module can initially use mock word-chain data.
- Save vocabulary and paragraph/favorite affordances: required to make reading produce durable learning artifacts.
- Reading progress and "continue reading" state in the UI: important for a desktop study tool, even if MVP stores it only in component state or mock data.

### Can Be Simplified First

- Content library categories: implement Article / Episode / Favorite filters with mock data, then later connect to local notes/imported material.
- Word-chain recursion: show a shallow chain of prerequisite/related words in MVP; do not build full semantic graph logic yet.
- Paragraph and sentence analysis: show static analysis copy attached to sample paragraphs; later generate or store real analysis.
- Highlight annotations: MVP can create local in-memory annotations without full text-range persistence.
- Favorites: local UI state is enough in the first slice.
- Import entry: show a planned import affordance, then later wire to existing URL/file/paste import services.

### Not Recommended For Now

- Payments, subscriptions, QR-code purchase, customer-service recovery, entitlement renewal: this is commercial infrastructure, not needed for the desktop MVP.
- Copying film/TV/course content: content rights and product identity risk.
- Login/register flows: Auris desktop intentionally removed web auth surfaces and should not restore them for this feature.
- Remote scraping of the target site's private routes: unnecessary and against the safe analysis boundary.
- Large shared data-model refactor: current workspace, notes, and wordbook code already works; the MVP should avoid pulling them apart.

## 4. Current Project Adaptation Analysis

### Existing Entry And Layout

- `src/app/layout.tsx` registers services and wraps pages in global providers.
- `src/app/page.tsx` renders `DesktopHomeShell`.
- Existing page routes include `/`, `/workspace`, `/notes`, `/video`, and `/rehearsal`.
- `DesktopAppFrame` provides the desktop shell, hover-revealed sidebar, route persistence, and AI Dock attachment.

The new feature should use `DesktopAppFrame` directly, matching the route-level pattern used by home, workspace, notes, video, and rehearsal pages.

### Navigation And Sidebar

Navigation items live in `src/components/desktop/desktop-shell-fixtures.ts`. Sidebar glyph rendering lives in `src/components/desktop/desktop-app-sidebar.tsx`. The new feature should add one item, probably in the `library` group:

- `id: "reading"`
- `href: "/reading"`
- `label: "Reading"`
- `description: "双语精读、词链和批注"`
- `runtimeWorkspace`: use existing `"workspace"` unless a later runtime-state change introduces a dedicated workspace id.

Avoid changing `APP_WORKSPACES` in the MVP. Adding a new runtime workspace id would touch persistence and desktop runtime state for little benefit.

### Existing Similar Capabilities

Auris already has:

- URL/file/paste text intake in `src/components/workspace/source-panel.tsx`.
- URL import safety checks in `src/app/api/import-url/route.ts`.
- HTML readable-text extraction in `src/features/import/extract-readable-text.ts`.
- Word click and dictionary lookup in `src/components/player/reader-stage.tsx`.
- Wordbook and sentencebook panels in `src/components/workspace/wordbook-panel.tsx` and `src/components/workspace/sentencebook-panel.tsx`.
- Source-material Markdown persistence in `src/features/learning-memory/source-material-note.ts`.

The first reading MVP should not reuse `ReaderStage` directly because that component is tightly coupled to audio playback sessions and word timestamps. It can reuse the product patterns and later share smaller dictionary/wordbook helpers if needed.

### Impact On Existing Functions

The recommended MVP is additive:

- New route.
- New component folder.
- One nav item.
- One sidebar glyph.
- Tests for the new route/module.

No existing route behavior needs to change. The workspace's listening/rehearsal flow stays intact.

## 5. Recommended MVP Implementation

### First Version Scope

The first version should build a usable static reading workbench:

- Sidebar entry opens `/reading`.
- Reading page displays a content library column with mock articles/episodes/favorites.
- Reader center displays bilingual paragraph pairs.
- Toggle switches between bilingual and pure English modes.
- Hovering/selecting a paragraph highlights both English and Chinese text.
- Clicking a word opens a side panel with mock definition, word-chain items, and source sentence.
- User can mark a word as saved in local component state.
- User can favorite a paragraph in local component state.
- User can add a short annotation to the selected paragraph in local component state.
- Page shows reading progress based on selected paragraph count or active paragraph index.

### Mock Data

MVP mock data should live in `src/components/reading/reading-fixtures.ts` and be clearly replaceable. It should include:

- Two or three reading sources.
- Source category: article, episode, favorite.
- Bilingual paragraph array.
- Suggested word-chain entries.
- One or two example annotations.

Do not include copied target-site content. Use original short English/Chinese sample passages.

### Later Real Data Integration

Follow-up iterations can:

- Import URL/file/paste content using existing import utilities.
- Persist reading sources in the local notes vault.
- Save vocabulary into the existing wordbook store.
- Save paragraph annotations as Markdown blocks or frontmatter-linked note records.
- Generate bilingual translation and paragraph analysis via AI Dock or server-side routes.
- Add search and source filters after there is real data.

### First Version User Outcome

A user should be able to open Reading from the desktop sidebar, choose a sample source, read bilingual paragraphs, inspect a word chain, save a word, favorite a paragraph, write an annotation, switch display modes, and see reading progress. That is enough to demonstrate the target site's core product logic inside Auris.

### Page Shape

The page should follow Auris's current light local-first visual baseline:

- Warm mint background.
- Centered white/near-white work surface.
- Soft borders and low-contrast dividers.
- Forest-green headings.
- Calm pill controls for mode/category filters.
- Dense but readable desktop layout: library left, reader center, insight panel right.

Do not copy the target site's public dark marketing style.

## 6. File Modification Plan

### New Files

- `src/app/reading/page.tsx`
  - Route entry. Dynamically load the reading workbench and use the existing loading-shell pattern if needed.

- `src/components/reading/reading-workbench.tsx`
  - Main client component. Owns selected source, display mode, active paragraph, saved words, favorites, and draft annotations for the MVP.

- `src/components/reading/reading-fixtures.ts`
  - Replaceable mock reading sources, paragraph pairs, word-chain entries, and sample metadata.

- `src/components/reading/reading-workbench.css`
  - Styling for the reading module, matching the light Auris dashboard style.

- `tests/component/reading/reading-workbench.test.tsx`
  - Component tests for source selection, bilingual/pure-English toggle, paragraph favorite, word lookup, and annotation draft behavior.

- `tests/unit/app/reading-page.test.tsx`
  - Optional route-level smoke test if existing app-route tests are easy to mirror.

### Modified Files

- `src/components/desktop/desktop-shell-fixtures.ts`
  - Add the `reading` nav item in the `library` group.

- `src/components/desktop/desktop-app-sidebar.tsx`
  - Add a `reading` glyph branch.

- `tests/component/runtime/desktop-app-sidebar.test.tsx`
  - Assert that the sidebar exposes the Reading link.

- `tests/unit/navigation/use-desktop-route-prefetch.test.tsx`
  - Only modify if the current prefetch expectations are route-list-specific and need updating.

### Reused Files

- `src/components/desktop/desktop-app-frame.tsx`
  - Reuse unchanged for layout and AI Dock coexistence.

- `src/components/desktop/desktop-module-loading-shell.tsx`
  - Reuse for dynamic route loading state if `reading/page.tsx` uses dynamic import.

- `src/app/api/import-url/route.ts`
  - Do not use in MVP, but keep as the preferred later URL import path.

- `src/features/import/extract-readable-text.ts`
  - Reuse later for imported HTML cleanup.

- `src/components/workspace/word-definition-popover.tsx`
  - Consider later extraction or reuse; do not force it into MVP if styling/state coupling is awkward.

### Files Not To Touch

- `electron/main.cjs`
- `electron/preload.cjs`
- `src/features/auth/session-actor.ts`
- `src/lib/supabase/*`
- Existing `/workspace`, `/notes`, `/video`, `/rehearsal` page behavior
- Existing notes-v2 core storage and editor internals

## 7. Implementation Steps

### Phase 1: Confirm Project Structure

- [ ] Re-read `auris/AGENTS.md`.
- [ ] Re-read `src/app/layout.tsx`.
- [ ] Re-read existing route files under `src/app/`.
- [ ] Re-read `desktop-shell-fixtures.ts`, `desktop-app-frame.tsx`, and `desktop-app-sidebar.tsx`.
- [ ] Re-read `home-dashboard-v2.css` and `home-dashboard.css` for visual baseline.
- [ ] Re-read `source-panel.tsx`, `reader-stage.tsx`, `wordbook-panel.tsx`, and `sentencebook-panel.tsx` for reusable interaction patterns.

### Phase 2: Add Tests For Navigation And Route

- [ ] Add a sidebar test expecting the Reading link to exist and point to `/reading`.
- [ ] Run `npx vitest run tests/component/runtime/desktop-app-sidebar.test.tsx`.
- [ ] Expect failure before implementation.
- [ ] Add a route/page smoke test if current app route tests can be copied safely.

### Phase 3: Add Route And Navigation

- [ ] Add the `reading` nav item to `DESKTOP_NAV_ITEMS`.
- [ ] Add a `reading` glyph to `NavGlyph`.
- [ ] Create `src/app/reading/page.tsx`.
- [ ] Run the sidebar and route tests.
- [ ] Expect navigation tests to pass after the minimal route exists.

### Phase 4: Create Mock Reading Domain Data

- [ ] Create `reading-fixtures.ts`.
- [ ] Define `ReadingSource`, `ReadingParagraph`, `WordChainEntry`, and annotation fixture types locally.
- [ ] Add two or three original sample sources.
- [ ] Keep content short enough for tests and desktop layout.

### Phase 5: Build Reading Workbench Structure

- [ ] Create `reading-workbench.tsx`.
- [ ] Render `DesktopAppFrame` with `activeNavId="reading"` and `activeWorkspace="workspace"`.
- [ ] Add the three-column layout: library, reader, insight panel.
- [ ] Add display mode state: `bilingual` and `english`.
- [ ] Add source category filters.
- [ ] Add active paragraph state.

### Phase 6: Add Core Interactions

- [ ] Implement source selection.
- [ ] Implement bilingual/pure-English toggle.
- [ ] Implement paragraph hover/select highlighting.
- [ ] Implement favorite paragraph toggle with local state.
- [ ] Implement word click lookup from fixture word-chain data.
- [ ] Implement save-word toggle with local state.
- [ ] Implement annotation draft and local annotation list.

### Phase 7: Add Styling

- [ ] Create `reading-workbench.css`.
- [ ] Import it from `reading-workbench.tsx`.
- [ ] Match the light mint/white panel visual direction from `home-dashboard-v2.css`.
- [ ] Keep desktop layout stable at common widths.
- [ ] Add responsive fallback for narrower windows.

### Phase 8: Verify

- [ ] Run `npx vitest run tests/component/reading/reading-workbench.test.tsx`.
- [ ] Run `npx vitest run tests/component/runtime/desktop-app-sidebar.test.tsx`.
- [ ] Run `npm run lint`.
- [ ] If time permits, run `npm run build`.
- [ ] If a dev server is used, open `/reading` and check that the sidebar entry, layout, and interactions work.

### Phase 9: Summarize And Handoff

- [ ] Summarize changed files.
- [ ] State which verifications passed.
- [ ] State which verifications were skipped and why.
- [ ] List next candidates: real import, persistent wordbook integration, paragraph analysis generation, notes-vault annotation persistence.

## 8. Risk Control

- Do not delete existing core files.
- Do not create a new desktop project, package root, Electron app, or copied app directory.
- Do not refactor existing `/workspace` behavior into the new reading module.
- Do not modify authentication, Supabase, billing, or Electron main/preload code.
- Do not restore removed web login/register surfaces.
- Do not touch unrelated pages.
- Do not copy target-site private content, paid content, or protected-route data.
- Keep mock data explicit and replaceable.
- If old code conflicts with this feature, record the conflict in the implementation summary before changing behavior.
- If adding a dedicated `reading` runtime workspace becomes necessary, make it a separate explicit change because it affects app-runtime persistence.

## 9. Acceptance Criteria

The plan is ready for implementation when:

- This document exists at `docs/superpowers/plans/2026-06-15-reading-workbench-integration-plan.md`.
- It explains the target site's core functionality and the safe limits of the analysis.
- It separates must-have, simplified, and deferred features.
- It identifies the recommended module shape: new `/reading` route with a focused reading workbench.
- It lists expected new, modified, reused, and protected files.
- It describes an MVP small enough to implement without broad refactoring.
- It gives an ordered implementation sequence with test and verification checkpoints.
- It defines risk boundaries that protect existing desktop functionality.
- A future coding session can start from Phase 1 without needing to repeat the product analysis.

