# Personal Vocabulary Markdown Rendering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render all displayed personal-vocabulary content as sanitized semantic Markdown across every Auris word-card surface.

**Architecture:** A pure dictionary-specific unified/remark renderer groups source lines into valid Markdown blocks, renders through a frozen GFM pipeline, and sanitizes with an explicit schema. A shared client component renders the trusted output and is used by both existing card surfaces with scoped styling.

**Tech Stack:** TypeScript, React 19, unified, remark-parse, remark-gfm, remark-rehype, rehype-sanitize, rehype-stringify, Vitest, Testing Library

---

### Task 0: Dirty-worktree and corpus baseline

- [ ] Record `git status --short`, `git diff --cached --stat`, and per-path diffs for every planned file plus `word-index.json` before creating the isolated worktree.
- [ ] Require no unrelated paths in the staged index before any task commit. If any exist, do not commit implementation work until they are unstaged without changing their working-tree content.
- [ ] Record the dirty `word-index.json` hash/count in the main worktree. Never edit or stage it. The isolated branch corpus test validates its checked-in baseline; after merge, rerun the identical test against the main worktree's current 3892-entry JSON so newly generated user entries are included.
- [ ] Record existing diffs for both card components and tests. Use patch-sized edits and compare final main-worktree diffs against this baseline.
- [ ] Create global worktree `/Users/apple/.config/superpowers/worktrees/auris/vocabulary-markdown-rendering` on branch `feature/vocabulary-markdown-rendering` from the current committed `master`. Install dependencies and run the existing two card test suites as the clean baseline.
- [ ] All implementation files, including the isolated clean-baseline `reading-workbench.test.tsx`, are committed on the feature branch. At integration, temporarily stash only main-worktree paths that were dirty at Task 0, fast-forward merge the feature branch, pop that narrow stash, and manually combine only conflicting hunks so both the user's baseline and new regressions remain. Verify on main against the current dirty JSON, then drop the retained stash and remove the worktree/branch.

### Task 1: Pure vocabulary Markdown pipeline

**Files:**
- Create: `src/features/dictionary/personal-vocab/personal-vocab-markdown.ts`
- Create: `tests/unit/dictionary/personal-vocab-markdown.test.ts`

- [ ] Before implementation, write all failing tests: block grouping, real-corpus shapes, security/schema, matched-group selection, and corpus-wide rendering. Block tests cover ordinary paragraphs, contiguous lists/quotes, mixed transitions, matching and unclosed backtick/tilde fences, and GFM delimiter tables.
- [ ] Run `npx vitest run tests/unit/dictionary/personal-vocab-markdown.test.ts` and confirm red because the module is absent.
- [ ] Export `PERSONAL_VOCAB_SECTION_CONTRACTS` as the canonical production map for `etymology`, `usage`, `deep`, and `epiphany`, each containing its matcher strings. Both cards and the corpus test must import it; no component-private matcher arrays remain. Also export `PersonalVocabMarkdownGroup = { id: string; lines: readonly string[] }`, `selectPersonalVocabMarkdownGroups(sections, sectionKey)`, `groupPersonalVocabMarkdownLines(lines)`, and `renderPersonalVocabMarkdown(lines)`. The selector uses the canonical contract and preserves each matched source section as a separate group; `id` is a stable section/index key and is never rendered. Synthetic usage fallback is represented as one `{ id: "usage-fallback", lines }` group.
- [ ] Add the frozen pipeline `remarkParse -> remarkGfm -> remarkRehype({ allowDangerousHtml: false }) -> rehypeSanitize(VOCAB_SCHEMA) -> rehypeStringify`, with no math. `VOCAB_SCHEMA` tag names are exactly `p,strong,em,ul,ol,li,blockquote,code,pre,del,a,table,thead,tbody,tr,th,td,h1,h2,h3,h4,h5,h6,hr,br,input`. Attributes are: `a[href,title]`, `th[align]`, `td[align]`, and `input[type="checkbox",checked,disabled]`; no global attributes. Protocols replace defaults: `href` permits only `http`, `https`, `mailto`, plus relative URLs. Post-sanitize enforcement removes any input that is not checkbox or is not disabled.
- [ ] Real-shape tests cover `inform`, `fundamental`, `economic`, and `range`; `$10 to $50` remains currency text. Security tests cover generated GFM task inputs, scripts/raw HTML, unsafe protocols, relative/safe links, and forbidden attributes.
- [ ] The corpus test iterates `PERSONAL_VOCAB_SECTION_CONTRACTS` and sends every entry through the same exported selector, deduplicates groups by entry/section id, renders them independently, rejects unsafe output, and uses an explicit timeout. This tests the exact displayed population without duplicating matcher data.
- [ ] Run focused tests and ESLint; commit the two clean files as `feat: add safe vocabulary markdown renderer`.

### Task 2: Shared React renderer and scoped styles

**Files:**
- Create: `src/components/workspace/personal-vocab-markdown.tsx`
- Create: `src/components/workspace/personal-vocab-markdown.css`
- Create: `tests/component/workspace/personal-vocab-markdown.test.tsx`

- [ ] Before creating the component or stylesheet, write failing component tests proving semantic `strong`, `em`, `ul/li`, `blockquote`, code, table, safe links, and sanitized malicious input; in the same red phase add a stylesheet-scope test that reads the not-yet-created CSS file and requires every selector to start with `.personal-vocab-markdown`.
- [ ] Run the focused component test and confirm red.
- [ ] Implement `PersonalVocabMarkdown({ groups }: { groups: readonly PersonalVocabMarkdownGroup[] })`, memoizing each group render and inserting only sanitized output. Groups render as sibling `.personal-vocab-markdown__group` blocks keyed by `group.id`; group ids/titles never appear as content.
- [ ] Add class-scoped dark-card styles for paragraphs, headings, lists, quotes, emphasis, links, code/pre, tables, rules, and disabled task inputs. Every selector must begin with `.personal-vocab-markdown`; add a test that parses the stylesheet and rejects unscoped selectors. Do not touch global Notes Markdown styles.
- [ ] Run component tests and ESLint; commit clean new files as `feat: add vocabulary markdown component`.

### Task 3: Integrate both word-card surfaces

**Files:**
- Modify: `src/components/workspace/segmented-word-card.tsx`
- Modify: `src/components/workspace/word-definition-popover.tsx`
- Modify: `tests/component/reading/reading-workbench.test.tsx`
- Modify: `tests/component/workspace/word-definition-popover.test.tsx`

- [ ] Add red regressions using real `inform` list/bold syntax in both card surfaces; assert semantic list/strong elements and absence of visible raw `**` markers.
- [ ] Refactor section collection to call the shared selector and preserve `PersonalVocabMarkdownGroup[]`. Usage fallbacks use the synthetic group contract. Keep context rendering, navigation, saved-state behavior, and API requests unchanged.
- [ ] Replace plain personal-section line mapping with the shared `PersonalVocabMarkdown` component in both cards and import the scoped stylesheet once from the shared component.
- [ ] Run both component suites, the pure renderer suite, existing dictionary/route tests, and targeted ESLint.
- [ ] Commit all Task 3 changes in the clean isolated worktree. During main-worktree integration, reconcile every path recorded dirty at Task 0 through the narrow-stash/manual-merge procedure, preserving both the user's baseline hunks and the committed regression changes.

### Task 4: Final verification

- [ ] Run `npx vitest run tests/unit/dictionary/personal-vocab-markdown.test.ts tests/component/workspace/personal-vocab-markdown.test.tsx tests/component/workspace/word-definition-popover.test.tsx tests/component/reading/reading-workbench.test.tsx tests/unit/api/dictionary-lookup-route.test.ts`.
- [ ] Run targeted ESLint on all changed implementation/tests and `git diff --check`.
- [ ] Run `npx tsc --noEmit`; report pre-existing unrelated errors separately and confirm no changed-file error.
- [ ] Review the full branch diff against the approved spec and complete independent final review before merging.
