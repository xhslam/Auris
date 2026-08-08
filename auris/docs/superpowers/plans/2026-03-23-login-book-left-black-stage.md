# Login Left Book and Black Stage Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the login page so the book silhouette stays fully on the left while the login card sits on its own soft-edged pure black backdrop.

**Architecture:** Keep the existing auth shell markup and push this refinement into `src/app/globals.css`. Rebalance the left story column and book positioning, then introduce a separate backdrop layer on the card container so the right side feels quieter without flattening the entire page.

**Tech Stack:** Next.js 16, React 19, TypeScript, global CSS, Vitest + Testing Library

---

## File Structure

- Modify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\app\globals.css`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\src\components\auth\auth-shell.tsx`
- Verify: `C:\Users\gan79\Desktop\大学markdown\english-shadowing-web\tests\component\auth\auth-shell.test.tsx`

## Tasks

### Task 1: Rebalance the left composition

- [ ] Widen the usable left story region so the content can sit to the right of the book within the same column.
- [ ] Move and constrain `.auth-shell__book-silhouette` so it stays inside the left half of the page.
- [ ] Reduce any overlap between the book highlight and the copy block.

### Task 2: Create the black stage behind the card

- [ ] Add a dedicated soft-edged black backdrop on `.auth-shell__card`.
- [ ] Keep the login card surface above that backdrop and preserve the current form interactions.
- [ ] Remove or weaken competing right-side glow treatments in the page background.

### Task 3: Tune responsive behavior

- [ ] Reduce the book spread and black-stage spread on tablet widths.
- [ ] Tone both effects down on mobile so the form stays readable and dominant.

### Task 4: Verify

- [ ] Run `npm run test -- tests/component/auth`
- [ ] Run `npm run test -- tests/component`
- [ ] Run `npm run build`

## Constraints

- Do not change login logic.
- Do not introduce a hard rectangular panel behind the card.
- Skip commit steps if `git status` shows this is not a repository.
