# Note Daily Review System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a note daily review system in Auris desktop review interface (`/`), allowing users to select notes from their note vault for daily active recall, quick-preview note contents, jump directly to `/notes` when stuck on a concept ("不会"), and optionally promote notes into 1/2/4/7 spaced repetition cycles.

**Architecture:** A standalone, decoupled note-review state module (`auris.note-review.v1`) that manages selected note items and today's review queue without corrupting existing OutputReview / ReadingReview data schemas. In the UI, integrates a "今日笔记回顾" active recall section into `TodayView`, provides a multi-note selection modal from the Vault, a full "笔记回顾" workstation view, and a high-contrast "不会 / 打开笔记 ↗" jump handler targeting `/notes?resumeNoteId=...`.

**Tech Stack:** Next.js / React 19, TypeScript, Vitest & Testing Library, LocalStorage with CustomEvent cross-window synchronization, Auris theme tokens, Tailwind / CSS modules.

---

## File Structure Map

- **Data & Model Layer**:
  - `src/features/note-review/note-review-model.ts`: Data types (`NoteReviewItem`, `NoteReviewState`), queue filtering, status transitions, and spaced repetition promotion helpers.
  - `src/features/note-review/note-review-storage.ts`: Persistence engine for `auris.note-review.v1`, change event listeners and dispatches.
  - `tests/unit/output-review/note-review-model.test.ts`: Unit tests for model manipulation and today queue filtering.
  - `tests/unit/output-review/note-review-storage.test.ts`: Unit tests for storage serialization, fallback handling, and events.
- **UI & Component Layer**:
  - `src/components/review/note-picker-modal.tsx`: Modal dialog for listing, filtering, and selecting Vault notes into today's deck.
  - `src/components/review/note-review-card.tsx`: Card component with active recall prompt, lazy markdown preview toggle, and "不会 / 打开笔记 ↗" button.
  - `src/components/review/today-note-review-section.tsx`: Section component embedded into `TodayView` showing today's review progress and cards.
  - `src/components/review/notes-review-view.tsx`: Dedicated full-page workstation tab for managing the review note repository.
  - `src/components/review/note-review.css`: Dedicated styling matching existing review page tokens and dark theme aesthetics.
  - `tests/component/review/note-review-card.test.tsx`: Tests for card rendering, preview toggling, and router navigation.
  - `tests/component/review/note-picker-modal.test.tsx`: Tests for modal search, selection, and submission.
  - `tests/component/review/today-note-review-section.test.tsx`: Tests for section progress, card list, and empty state.
- **Integration Layer**:
  - `src/components/review/review-page-client.tsx`: Updates `ReviewView` union to include `"notes"`, integrates badge, and wires up promotion to 1/2/4/7.
  - `tests/component/review/output-review-page.test.tsx`: Verifies integration of tabs, navigation, and state sync.

---

### Task 1: Note Review Core Data Model & Logic

**Files:**
- Create: `src/features/note-review/note-review-model.ts`
- Test: `tests/unit/output-review/note-review-model.test.ts`

- [ ] **Step 1: Write the failing tests for note review model**

Create `tests/unit/output-review/note-review-model.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  EMPTY_NOTE_REVIEW_STATE,
  addNotesToReview,
  getTodayNoteReviewMetrics,
  getTodayNoteReviewQueue,
  removeNoteFromToday,
  updateNoteReviewStatus,
  type NoteReviewItem,
  type NoteReviewState,
} from "@/features/note-review/note-review-model";

describe("note-review-model", () => {
  it("initializes with empty state", () => {
    expect(EMPTY_NOTE_REVIEW_STATE.items).toEqual([]);
    expect(EMPTY_NOTE_REVIEW_STATE.version).toBe(1);
  });

  it("adds notes to review state with scheduledDate as today", () => {
    const today = "2026-11-14";
    const initial: NoteReviewState = { version: 1, items: [] };
    const notesToAdd = [
      { id: "note-1", title: "Linear Algebra", relativePath: "Math/LA.md" },
      { id: "note-2", title: "Quantum Physics", relativePath: "Physics/QP.md" },
    ];

    const next = addNotesToReview(initial, notesToAdd, today);
    expect(next.items).toHaveLength(2);
    expect(next.items[0]).toMatchObject({
      noteId: "note-1",
      noteTitle: "Linear Algebra",
      noteRelativePath: "Math/LA.md",
      scheduledDate: today,
      status: "pending",
      reviewCount: 0,
    });
  });

  it("filters today's queue including overdue uncompleted items", () => {
    const today = "2026-11-14";
    const state: NoteReviewState = {
      version: 1,
      items: [
        {
          id: "1",
          noteId: "n1",
          noteTitle: "Today pending",
          noteRelativePath: "1.md",
          scheduledDate: "2026-11-14",
          addedAt: "2026-11-14T00:00:00Z",
          lastReviewedAt: null,
          reviewCount: 0,
          status: "pending",
        },
        {
          id: "2",
          noteId: "n2",
          noteTitle: "Overdue pending",
          noteRelativePath: "2.md",
          scheduledDate: "2026-11-12",
          addedAt: "2026-11-12T00:00:00Z",
          lastReviewedAt: null,
          reviewCount: 0,
          status: "needs_practice",
        },
        {
          id: "3",
          noteId: "n3",
          noteTitle: "Overdue already reviewed",
          noteRelativePath: "3.md",
          scheduledDate: "2026-11-10",
          addedAt: "2026-11-10T00:00:00Z",
          lastReviewedAt: "2026-11-10T10:00:00Z",
          reviewCount: 1,
          status: "reviewed",
        },
        {
          id: "4",
          noteId: "n4",
          noteTitle: "Unscheduled / removed",
          noteRelativePath: "4.md",
          scheduledDate: "",
          addedAt: "2026-11-01T00:00:00Z",
          lastReviewedAt: null,
          reviewCount: 0,
          status: "pending",
        },
      ],
    };

    const queue = getTodayNoteReviewQueue(state, today);
    expect(queue.map((item) => item.id)).toEqual(["1", "2"]);

    const metrics = getTodayNoteReviewMetrics(state, today);
    expect(metrics.totalToday).toBe(2);
    expect(metrics.completedToday).toBe(0);
    expect(metrics.pendingToday).toBe(2);
  });

  it("updates note status and increments review count", () => {
    const today = "2026-11-14";
    const state: NoteReviewState = {
      version: 1,
      items: [
        {
          id: "1",
          noteId: "n1",
          noteTitle: "Note",
          noteRelativePath: "1.md",
          scheduledDate: today,
          addedAt: "2026-11-14T00:00:00Z",
          lastReviewedAt: null,
          reviewCount: 0,
          status: "pending",
        },
      ],
    };

    const next = updateNoteReviewStatus(state, "1", "reviewed", today);
    expect(next.items[0]?.status).toBe("reviewed");
    expect(next.items[0]?.reviewCount).toBe(1);
    expect(next.items[0]?.lastReviewedAt).toBe(today);

    const metrics = getTodayNoteReviewMetrics(next, today);
    expect(metrics.completedToday).toBe(1);
    expect(metrics.pendingToday).toBe(0);
  });

  it("removes note from today's deck by clearing scheduledDate", () => {
    const today = "2026-11-14";
    const state: NoteReviewState = {
      version: 1,
      items: [
        {
          id: "1",
          noteId: "n1",
          noteTitle: "Note",
          noteRelativePath: "1.md",
          scheduledDate: today,
          addedAt: "2026-11-14T00:00:00Z",
          lastReviewedAt: null,
          reviewCount: 0,
          status: "pending",
        },
      ],
    };

    const next = removeNoteFromToday(state, "1");
    expect(next.items[0]?.scheduledDate).toBe("");
    expect(getTodayNoteReviewQueue(next, today)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/output-review/note-review-model.test.ts`
Expected: FAIL due to missing `@/features/note-review/note-review-model`.

- [ ] **Step 3: Implement `src/features/note-review/note-review-model.ts`**

```ts
export type NoteReviewStatus = "pending" | "reviewed" | "needs_practice" | "mastered";

export type NoteReviewItem = {
  id: string;
  noteId: string;
  noteTitle: string;
  noteRelativePath: string;
  scheduledDate: string;
  addedAt: string;
  lastReviewedAt: string | null;
  reviewCount: number;
  status: NoteReviewStatus;
  inSpacedRepetition?: boolean;
  knowledgePointId?: string;
};

export type NoteReviewState = {
  version: 1;
  items: NoteReviewItem[];
};

export const EMPTY_NOTE_REVIEW_STATE: NoteReviewState = {
  version: 1,
  items: [],
};

export function addNotesToReview(
  state: NoteReviewState,
  notes: Array<{ id: string; title: string; relativePath: string }>,
  today: string,
): NoteReviewState {
  const existingMap = new Map(state.items.map((item) => [item.noteId, item]));
  const nowIso = new Date().toISOString();

  const nextItems = [...state.items];

  for (const note of notes) {
    const existing = existingMap.get(note.id);
    if (existing) {
      // Re-schedule for today if already present
      const index = nextItems.findIndex((item) => item.id === existing.id);
      if (index !== -1) {
        nextItems[index] = {
          ...existing,
          scheduledDate: today,
          status: existing.status === "mastered" ? "reviewed" : "pending",
          noteTitle: note.title,
          noteRelativePath: note.relativePath,
        };
      }
    } else {
      nextItems.push({
        id: `nr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        noteId: note.id,
        noteTitle: note.title,
        noteRelativePath: note.relativePath,
        scheduledDate: today,
        addedAt: nowIso,
        lastReviewedAt: null,
        reviewCount: 0,
        status: "pending",
      });
    }
  }

  return { ...state, items: nextItems };
}

export function updateNoteReviewStatus(
  state: NoteReviewState,
  itemId: string,
  status: NoteReviewStatus,
  today: string,
): NoteReviewState {
  return {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        status,
        lastReviewedAt: today,
        reviewCount: item.reviewCount + 1,
      };
    }),
  };
}

export function removeNoteFromToday(state: NoteReviewState, itemId: string): NoteReviewState {
  return {
    ...state,
    items: state.items.map((item) => {
      if (item.id !== itemId) return item;
      return { ...item, scheduledDate: "" };
    }),
  };
}

export function deleteNoteReviewItem(state: NoteReviewState, itemId: string): NoteReviewState {
  return {
    ...state,
    items: state.items.filter((item) => item.id !== itemId),
  };
}

export function getTodayNoteReviewQueue(state: NoteReviewState, today: string): NoteReviewItem[] {
  return state.items.filter((item) => {
    if (!item.scheduledDate) return false;
    if (item.scheduledDate === today) return true;
    // Overdue items that haven't been completed yet
    return item.scheduledDate < today && item.status !== "reviewed" && item.status !== "mastered";
  });
}

export function getTodayNoteReviewMetrics(state: NoteReviewState, today: string) {
  const queue = getTodayNoteReviewQueue(state, today);
  const completedToday = queue.filter(
    (item) => item.status === "reviewed" || item.status === "mastered",
  ).length;
  const totalToday = queue.length;
  const pendingToday = Math.max(0, totalToday - completedToday);

  return { totalToday, completedToday, pendingToday };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/output-review/note-review-model.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

`git add src/features/note-review/note-review-model.ts tests/unit/output-review/note-review-model.test.ts && git commit -m "feat(note-review): implement core data model and queue calculation"`

---

### Task 2: Note Review Storage Engine & Event Sync

**Files:**
- Create: `src/features/note-review/note-review-storage.ts`
- Test: `tests/unit/output-review/note-review-storage.test.ts`

- [ ] **Step 1: Write the failing tests for note review storage**

Create `tests/unit/output-review/note-review-storage.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  NOTE_REVIEW_STORAGE_KEY,
  NOTE_REVIEW_STORAGE_EVENT,
  readNoteReviewState,
  writeNoteReviewState,
} from "@/features/note-review/note-review-storage";
import { EMPTY_NOTE_REVIEW_STATE, type NoteReviewState } from "@/features/note-review/note-review-model";

describe("note-review-storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reads empty state when storage key is missing", () => {
    const state = readNoteReviewState(window.localStorage);
    expect(state).toEqual(EMPTY_NOTE_REVIEW_STATE);
  });

  it("reads empty state on corrupted JSON without crashing", () => {
    window.localStorage.setItem(NOTE_REVIEW_STORAGE_KEY, "invalid-json{{");
    const state = readNoteReviewState(window.localStorage);
    expect(state).toEqual(EMPTY_NOTE_REVIEW_STATE);
  });

  it("writes state and dispatches custom event", () => {
    const listener = vi.fn();
    window.addEventListener(NOTE_REVIEW_STORAGE_EVENT, listener);

    const testState: NoteReviewState = {
      version: 1,
      items: [
        {
          id: "item-1",
          noteId: "note-1",
          noteTitle: "Test Note",
          noteRelativePath: "test.md",
          scheduledDate: "2026-11-14",
          addedAt: "2026-11-14T00:00:00Z",
          lastReviewedAt: null,
          reviewCount: 0,
          status: "pending",
        },
      ],
    };

    writeNoteReviewState(window.localStorage, testState);
    expect(listener).toHaveBeenCalled();

    const loaded = readNoteReviewState(window.localStorage);
    expect(loaded.items).toHaveLength(1);
    expect(loaded.items[0]?.noteTitle).toBe("Test Note");

    window.removeEventListener(NOTE_REVIEW_STORAGE_EVENT, listener);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/output-review/note-review-storage.test.ts`
Expected: FAIL due to missing `@/features/note-review/note-review-storage`.

- [ ] **Step 3: Implement `src/features/note-review/note-review-storage.ts`**

```ts
import {
  EMPTY_NOTE_REVIEW_STATE,
  type NoteReviewState,
} from "@/features/note-review/note-review-model";

export const NOTE_REVIEW_STORAGE_KEY = "auris.note-review.v1";
export const NOTE_REVIEW_STORAGE_EVENT = "auris:note-review-changed";

export function readNoteReviewState(storage: Storage | null): NoteReviewState {
  if (!storage) return EMPTY_NOTE_REVIEW_STATE;
  try {
    const raw = storage.getItem(NOTE_REVIEW_STORAGE_KEY);
    if (!raw) return EMPTY_NOTE_REVIEW_STATE;

    const parsed = JSON.parse(raw) as Partial<NoteReviewState> | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) {
      return EMPTY_NOTE_REVIEW_STATE;
    }
    return parsed as NoteReviewState;
  } catch {
    return EMPTY_NOTE_REVIEW_STATE;
  }
}

export function writeNoteReviewState(storage: Storage | null, state: NoteReviewState): void {
  if (!storage) return;
  try {
    storage.setItem(NOTE_REVIEW_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(NOTE_REVIEW_STORAGE_EVENT));
  } catch {
    // Local persistence is best-effort
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/output-review/note-review-storage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

`git add src/features/note-review/note-review-storage.ts tests/unit/output-review/note-review-storage.test.ts && git commit -m "feat(note-review): implement local storage persistence with event synchronization"`

---

### Task 3: Note Picker Modal Component

**Files:**
- Create: `src/components/review/note-picker-modal.tsx`
- Create: `src/components/review/note-review.css`
- Test: `tests/component/review/note-picker-modal.test.tsx`

- [ ] **Step 1: Write the failing tests for NotePickerModal**

Create `tests/component/review/note-picker-modal.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotePickerModal } from "@/components/review/note-picker-modal";
import type { NotesStorage, NotePageSummary } from "@/features/notes/note-types";

describe("NotePickerModal", () => {
  const mockNotes: NotePageSummary[] = [
    {
      id: "note-1",
      title: "Linear Algebra Eigenvalues",
      fileName: "Linear Algebra.md",
      relativePath: "Math/Linear Algebra.md",
      icon: "📝",
      updatedAt: "2026-11-10T12:00:00Z",
    },
    {
      id: "note-2",
      title: "Quantum Mechanics Bra-Ket",
      fileName: "Quantum.md",
      relativePath: "Physics/Quantum.md",
      icon: "⚛️",
      updatedAt: "2026-11-12T12:00:00Z",
    },
  ];

  const mockStorage = {
    listPages: vi.fn().mockResolvedValue(mockNotes),
  } as unknown as NotesStorage;

  it("loads and lists notes from storage", async () => {
    render(
      <NotePickerModal
        existingNoteIds={new Set(["note-1"])}
        notesStorage={mockStorage}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("从笔记库选择复习笔记")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Linear Algebra Eigenvalues")).toBeInTheDocument();
      expect(screen.getByText("Quantum Mechanics Bra-Ket")).toBeInTheDocument();
    });

    expect(screen.getByText("已在复习中")).toBeInTheDocument();
  });

  it("filters notes by search input and submits selected", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <NotePickerModal
        existingNoteIds={new Set()}
        notesStorage={mockStorage}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Quantum Mechanics Bra-Ket")).toBeInTheDocument();
    });

    // Search for Quantum
    const searchInput = screen.getByPlaceholderText("搜索笔记标题或文件夹路径…");
    await user.type(searchInput, "Quantum");

    expect(screen.queryByText("Linear Algebra Eigenvalues")).not.toBeInTheDocument();
    expect(screen.getByText("Quantum Mechanics Bra-Ket")).toBeInTheDocument();

    // Select checkbox
    const checkbox = screen.getByRole("checkbox", { name: "选择 Quantum Mechanics Bra-Ket" });
    await user.click(checkbox);

    const submitBtn = screen.getByRole("button", { name: "加入今日回顾 (1)" });
    await user.click(submitBtn);

    expect(onConfirm).toHaveBeenCalledWith([
      {
        id: "note-2",
        title: "Quantum Mechanics Bra-Ket",
        relativePath: "Physics/Quantum.md",
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/component/review/note-picker-modal.test.tsx`
Expected: FAIL due to missing component.

- [ ] **Step 3: Implement `src/components/review/note-picker-modal.tsx` and CSS**

Implement `src/components/review/note-picker-modal.tsx` with search, multi-selection, existing note badge, and responsive modal styling. Add base styles in `src/components/review/note-review.css`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/component/review/note-picker-modal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/components/review/note-picker-modal.tsx src/components/review/note-review.css tests/component/review/note-picker-modal.test.tsx && git commit -m "feat(note-review): implement note picker modal dialog"`

---

### Task 4: Note Review Card Component with Quick Preview & Jump

**Files:**
- Create: `src/components/review/note-review-card.tsx`
- Modify: `src/components/review/note-review.css`
- Test: `tests/component/review/note-review-card.test.tsx`

- [ ] **Step 1: Write the failing tests for NoteReviewCard**

Create `tests/component/review/note-review-card.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoteReviewCard } from "@/components/review/note-review-card";
import type { NoteReviewItem } from "@/features/note-review/note-review-model";
import type { NotesStorage } from "@/features/notes/note-types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("NoteReviewCard", () => {
  const mockItem: NoteReviewItem = {
    id: "item-1",
    noteId: "note-1",
    noteTitle: "Linear Algebra Notes",
    noteRelativePath: "Math/Linear Algebra.md",
    scheduledDate: "2026-11-14",
    addedAt: "2026-11-14T00:00:00Z",
    lastReviewedAt: null,
    reviewCount: 0,
    status: "pending",
  };

  const mockStorage = {
    getPage: vi.fn().mockResolvedValue({
      id: "note-1",
      title: "Linear Algebra Notes",
      markdownBody: "## Eigenvalues\n\nDefinition and algebraic multiplicity.",
    }),
  } as unknown as NotesStorage;

  it("renders card details and handles mastered action", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();

    render(
      <NoteReviewCard
        item={mockItem}
        notesStorage={mockStorage}
        onPromoteToSpaced={vi.fn()}
        onRemoveFromToday={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    );

    expect(screen.getByText("Linear Algebra Notes")).toBeInTheDocument();
    expect(screen.getByText("Math/Linear Algebra.md")).toBeInTheDocument();

    const masterBtn = screen.getByRole("button", { name: "已掌握 ✓" });
    await user.click(masterBtn);
    expect(onStatusChange).toHaveBeenCalledWith(mockItem.id, "reviewed");
  });

  it("expands markdown preview on toggle", async () => {
    const user = userEvent.setup();

    render(
      <NoteReviewCard
        item={mockItem}
        notesStorage={mockStorage}
        onPromoteToSpaced={vi.fn()}
        onRemoveFromToday={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    const toggleBtn = screen.getByRole("button", { name: /预览正文/i });
    await user.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText(/algebraic multiplicity/i)).toBeInTheDocument();
    });
  });

  it("navigates to /notes with resumeNoteId when clicking '不会 / 打开笔记 ↗'", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();

    render(
      <NoteReviewCard
        item={mockItem}
        notesStorage={mockStorage}
        onPromoteToSpaced={vi.fn()}
        onRemoveFromToday={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    );

    const jumpBtn = screen.getByRole("button", { name: "不会 / 打开笔记 ↗" });
    await user.click(jumpBtn);

    expect(onStatusChange).toHaveBeenCalledWith(mockItem.id, "needs_practice");
    expect(mockPush).toHaveBeenCalledWith(`/notes?resumeNoteId=${encodeURIComponent("note-1")}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/component/review/note-review-card.test.tsx`
Expected: FAIL due to missing component.

- [ ] **Step 3: Implement `src/components/review/note-review-card.tsx`**

Implement `NoteReviewCard`:
- Renders note icon, title, relative path, and review status badge.
- Active recall area with `[ 预览正文 ⌄ ]` toggle (lazily loads `getPage(item.noteId)`).
- Action buttons:
  - `[ 不会 / 打开笔记 ↗ ]`: updates status to `"needs_practice"`, calls `router.push('/notes?resumeNoteId=' + encodeURIComponent(item.noteRelativePath || item.noteId))`.
  - `[ 已掌握 ✓ ]`: updates status to `"reviewed"`.
  - `[ 纳入 1/2/4/7 ⟳ ]`: calls `onPromoteToSpaced(item)`.
  - `[ 移出 ]`: calls `onRemoveFromToday(item.id)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/component/review/note-review-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/components/review/note-review-card.tsx src/components/review/note-review.css tests/component/review/note-review-card.test.tsx && git commit -m "feat(note-review): implement note review card with lazy preview and jump button"`

---

### Task 5: Today View Integration: Today Note Review Section

**Files:**
- Create: `src/components/review/today-note-review-section.tsx`
- Modify: `src/components/review/review-page-client.tsx` (embed into `TodayView`)
- Test: `tests/component/review/today-note-review-section.test.tsx`

- [ ] **Step 1: Write the failing tests for TodayNoteReviewSection**

Create `tests/component/review/today-note-review-section.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TodayNoteReviewSection } from "@/components/review/today-note-review-section";
import type { NoteReviewItem } from "@/features/note-review/note-review-model";

describe("TodayNoteReviewSection", () => {
  const queue: NoteReviewItem[] = [
    {
      id: "1",
      noteId: "n1",
      noteTitle: "Algebra",
      noteRelativePath: "Math/Algebra.md",
      scheduledDate: "2026-11-14",
      addedAt: "2026-11-14T00:00:00Z",
      lastReviewedAt: null,
      reviewCount: 0,
      status: "pending",
    },
  ];

  it("renders progress badge and note cards", () => {
    render(
      <TodayNoteReviewSection
        notesStorage={null}
        onOpenPicker={vi.fn()}
        onPromoteToSpaced={vi.fn()}
        onRemoveFromToday={vi.fn()}
        onStatusChange={vi.fn()}
        queue={queue}
        today="2026-11-14"
      />,
    );

    expect(screen.getByText("今日笔记自选回顾")).toBeInTheDocument();
    expect(screen.getByText("已回顾 0 / 1 篇")).toBeInTheDocument();
    expect(screen.getByText("Algebra")).toBeInTheDocument();
  });

  it("renders empty state and calls onOpenPicker when clicking add button", async () => {
    const user = userEvent.setup();
    const onOpenPicker = vi.fn();

    render(
      <TodayNoteReviewSection
        notesStorage={null}
        onOpenPicker={onOpenPicker}
        onPromoteToSpaced={vi.fn()}
        onRemoveFromToday={vi.fn()}
        onStatusChange={vi.fn()}
        queue={[]}
        today="2026-11-14"
      />,
    );

    expect(screen.getByText(/今天还没有选择回顾的笔记/i)).toBeInTheDocument();
    const addBtn = screen.getByRole("button", { name: "从笔记库选择笔记" });
    await user.click(addBtn);
    expect(onOpenPicker).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/component/review/today-note-review-section.test.tsx`
Expected: FAIL due to missing component.

- [ ] **Step 3: Implement `src/components/review/today-note-review-section.tsx`**

Implement component displaying the header with metrics, `[ ＋ 选择笔记 ]` button, empty state, and rendering `NoteReviewCard` list.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/component/review/today-note-review-section.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/components/review/today-note-review-section.tsx tests/component/review/today-note-review-section.test.tsx && git commit -m "feat(note-review): implement today note review section component"`

---

### Task 6: Dedicated Notes Review Workstation View

**Files:**
- Create: `src/components/review/notes-review-view.tsx`
- Modify: `src/components/review/note-review.css`
- Test: `tests/component/review/notes-review-view.test.tsx`

- [ ] **Step 1: Write the failing tests for NotesReviewView**

Create `tests/component/review/notes-review-view.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotesReviewView } from "@/components/review/notes-review-view";
import type { NoteReviewState } from "@/features/note-review/note-review-model";

describe("NotesReviewView", () => {
  const state: NoteReviewState = {
    version: 1,
    items: [
      {
        id: "1",
        noteId: "n1",
        noteTitle: "Linear Algebra",
        noteRelativePath: "Math/LA.md",
        scheduledDate: "2026-11-14",
        addedAt: "2026-11-14T00:00:00Z",
        lastReviewedAt: null,
        reviewCount: 0,
        status: "pending",
      },
      {
        id: "2",
        noteId: "n2",
        noteTitle: "Physics Optics",
        noteRelativePath: "Physics/Optics.md",
        scheduledDate: "2026-11-14",
        addedAt: "2026-11-14T00:00:00Z",
        lastReviewedAt: "2026-11-14T01:00:00Z",
        reviewCount: 1,
        status: "reviewed",
      },
    ],
  };

  it("renders list and supports filter chips", async () => {
    const user = userEvent.setup();

    render(
      <NotesReviewView
        notesStorage={null}
        onOpenPicker={vi.fn()}
        onPromoteToSpaced={vi.fn()}
        onRemoveItem={vi.fn()}
        onStatusChange={vi.fn()}
        state={state}
        today="2026-11-14"
      />,
    );

    expect(screen.getByText("Linear Algebra")).toBeInTheDocument();
    expect(screen.getByText("Physics Optics")).toBeInTheDocument();

    // Click "今日已回顾" filter
    const reviewedFilter = screen.getByRole("button", { name: "已回顾" });
    await user.click(reviewedFilter);

    expect(screen.queryByText("Linear Algebra")).not.toBeInTheDocument();
    expect(screen.getByText("Physics Optics")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/component/review/notes-review-view.test.tsx`
Expected: FAIL due to missing component.

- [ ] **Step 3: Implement `src/components/review/notes-review-view.tsx`**

Implement workstation view:
- Toolbar with search input, status filters (`全部`, `今日待复习`, `已回顾`, `长期周期中`), and `[ 批量添加笔记 ]`.
- Two-column or structured list with selection, full detail viewer, and actions (`不会/跳转笔记`, `标记掌握`, `纳入周期`, `移除`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/component/review/notes-review-view.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/components/review/notes-review-view.tsx src/components/review/note-review.css tests/component/review/notes-review-view.test.tsx && git commit -m "feat(note-review): implement dedicated notes review workstation view"`

---

### Task 7: ReviewPageClient Integration, Tab Navigation, Badge & Spaced Repetition Promotion

**Files:**
- Modify: `src/components/review/review-page-client.tsx`
- Test: `tests/component/review/output-review-page.test.tsx`

- [ ] **Step 1: Write integration tests for Note Review inside ReviewPageClient**

Update `tests/component/review/output-review-page.test.tsx` to assert:
- `笔记回顾` tab is rendered with pending count badge.
- Clicking `笔记回顾` switches to `NotesReviewView`.
- TodayView renders `TodayNoteReviewSection`.
- Promoting note to 1/2/4/7 creates a KnowledgePoint under project "笔记回顾".

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/component/review/output-review-page.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `src/components/review/review-page-client.tsx`**

- Update `ReviewView` union:
  ```ts
  type ReviewView = "today" | "reading" | "notes" | "all" | "projects" | "heatmap";
  ```
- Update `VIEW_LABELS`:
  ```ts
  const VIEW_LABELS: Record<ReviewView, string> = {
    today: "今天", reading: "书籍回顾", notes: "笔记回顾", all: "全部", projects: "项目", heatmap: "复盘热力图",
  };
  ```
- Load `NoteReviewState` from `readNoteReviewState(window.localStorage)` with `NOTE_REVIEW_STORAGE_EVENT` listener.
- Compute `noteMetrics = getTodayNoteReviewMetrics(noteState, today)` and display `noteMetrics.pendingToday` in tab badge.
- In `TodayView`: render `<TodayNoteReviewSection ... />`.
- When `view === "notes"`: render `<NotesReviewView ... />`.
- Implement `handlePromoteToSpaced`:
  - Find or create project named `"笔记回顾"`.
  - Call `createKnowledgePoint(state, { title: item.noteTitle, projectId, startDate: today, notes: item.noteRelativePath, materialUrl: `/notes?resumeNoteId=${encodeURIComponent(item.noteId)}` })`.
  - Mark item `inSpacedRepetition = true` and `knowledgePointId = createdId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/component/review/output-review-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/components/review/review-page-client.tsx tests/component/review/output-review-page.test.tsx && git commit -m "feat(review): integrate note review into ReviewPageClient with tabs, badge, and spaced repetition promotion"`

---

### Task 8: Verification & Visual Polish

**Files:**
- All modified & created files

- [ ] **Step 1: Run all unit and component tests for review**

Run: `npx vitest run tests/unit/output-review/ tests/component/review/`
Expected: All tests pass.

- [ ] **Step 2: Run targeted lint check**

Run: `npx eslint src/features/note-review/ src/components/review/`
Expected: 0 errors.

- [ ] **Step 3: Check TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: 0 new errors in modified/created files.

- [ ] **Step 4: Next.js Production Build Verification**

Run: `npm run build`
Expected: Build succeeds with `/` and `/notes` routes passing.

- [ ] **Step 5: Commit and clean up**

`git status`
Ensure clean working tree and commit any final polish.
