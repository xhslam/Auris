# Note Daily Review System Design (每日回顾与笔记联动)

## Goal

Enhance Auris's Daily Review interface (`/`, `ReviewPageClient`) to seamlessly support reviewing notes from the local note vault (`/notes`). Users can:
1. Select one or multiple notes from their Note Vault to add into today's review queue.
2. Review notes via active recall cards with quick-expand markdown preview right on the review page.
3. When stuck or unfamiliar with the note's concepts ("不会"), mark as needing practice and immediately navigate to the full Notes workbench via a dedicated "不会 / 打开笔记 ↗" button (`/notes?resumeNoteId=...`), opening that exact note in the editor.
4. Optionally promote any reviewed note into the long-term 1/2/4/7 Ebbinghaus spaced repetition cycle (Spaced Repetition Wheel).

## Context & Background

Auris is a local-first Electron desktop application with two key capabilities:
- **Notes Workbench (`/notes`)**: Manages Markdown notes in a local Vault directory via `NotesStorage` and `VaultClient`. Supports direct note navigation using query parameter `/notes?resumeNoteId=${encodeURIComponent(pathOrId)}`.
- **Daily Review (`/`, `ReviewPageClient`)**: Currently provides `"today" | "reading" | "all" | "projects" | "heatmap"` views. The output review system powers project-based 1/2/4/7 output reviews with a Spaced Repetition Wheel and heatmap.

Currently, there is no direct link between the notes written in the Notes workbench and the Daily Review dashboard. Users want to pick notes from their vault, quiz themselves during their daily review session, preview the notes on demand, and jump straight into the full note in the editor when they need deeper study.

## Architecture & Data Flow

```
+-----------------------------------------------------------------------------------+
|                              ReviewPageClient (/)                                 |
|                                                                                   |
|  [Today View]                 [Notes Review View]             [1/2/4/7 Wheel]     |
|  +-------------------------+  +----------------------------+  +-----------------+ |
|  | Today's Notes Review    |  | Full Note Review Manager   |  | Ebbinghaus      | |
|  | - NoteReviewCard        |  | - Filter by status         |  | Spaced Cycles   | |
|  |   - Active Recall       |  | - Search & Batch import    |  +-----------------+ |
|  |   - Markdown Preview    |  | - Detail viewer            |                      |
|  |   - "不会 / 打开笔记 ↗" |  +----------------------------+                      |
|  |   - "已掌握 ✓"          |                                                      |
|  |   - "纳入 1/2/4/7 ⟳"    |                                                      |
|  +-------------------------+                                                      |
|               ^                                                                   |
|               | (picks notes)                                                     |
|  +------------+------------+                                                      |
|  | NotePickerModal         |                                                      |
|  | Reads from Vault        |                                                      |
|  +------------+------------+                                                      |
+---------------|-------------------------------------------------------------------+
                | (Jump on "不会")
                v
+-----------------------------------------------------------------------------------+
|                        NotesPageClient (/notes?resumeNoteId=...)                  |
|                        Opens Note Document directly in Editor                     |
+-----------------------------------------------------------------------------------+
```

### Storage Isolation & Spaced Repetition Promotion
To avoid corrupting the strict zod schema and MCP validation of `auris.output-review.v1`, note review state is stored independently under `auris.note-review.v1`:
- **Storage key**: `auris.note-review.v1`
- **Storage event**: `auris:note-review-changed`
- **Promotion to 1/2/4/7 Spaced Repetition**:
  When a user clicks `[ 纳入 1/2/4/7 ⟳ ]`, the system creates a corresponding `KnowledgePoint` in `OutputReviewState`.
  - **Project resolution rule**: The system checks `state.projects` for an existing project named `"笔记回顾"`. If not present, it automatically creates one (`{ name: "笔记回顾", description: "从 Note Vault 选取的笔记回顾知识点" }`).
  - Then it calls `createKnowledgePoint(state, { title: item.noteTitle, projectId: defaultProject.id, startDate: today, notes: item.noteRelativePath, materialUrl: `/notes?resumeNoteId=${encodeURIComponent(item.noteId)}` })`.
  - The note review item records `inSpacedRepetition = true` and `knowledgePointId = newKnowledgePoint.id`.

## Data Model

File: `src/features/note-review/note-review-model.ts`

```ts
export type NoteReviewStatus = "pending" | "reviewed" | "needs_practice" | "mastered";

export type NoteReviewItem = {
  id: string;                      // Unique ID (e.g., nr_timestamp_random)
  noteId: string;                  // Note ID or relative path in Vault
  noteTitle: string;               // Display title
  noteRelativePath: string;        // Relative path in vault (e.g., Math/Linear-Algebra.md)
  scheduledDate: string;           // Scheduled date (YYYY-MM-DD); empty string if unscheduled/removed from today
  addedAt: string;                 // ISO 8601 timestamp
  lastReviewedAt: string | null;   // ISO 8601 timestamp or null
  reviewCount: number;             // How many times reviewed
  status: NoteReviewStatus;        // Current review status
  inSpacedRepetition?: boolean;    // Whether enrolled into 1/2/4/7
  knowledgePointId?: string;       // Linked 1/2/4/7 KnowledgePoint ID if enrolled
};

export type NoteReviewState = {
  version: 1;
  items: NoteReviewItem[];
};
```

### Today's Queue & Metrics Calculation Rules
- **Today's Queue Items**:
  Any item where `scheduledDate === today || (scheduledDate < today && scheduledDate !== "" && status !== "reviewed" && status !== "mastered")`. Overdue unreviewed items from past days carry over automatically.
- **Progress Metrics**:
  - `totalToday`: Count of items in Today's Queue.
  - `completedToday`: Count of items in Today's Queue with `status === "reviewed" || status === "mastered"`.
  - `pendingToday`: `totalToday - completedToday`.
- **Remove from Today**:
  Sets `scheduledDate = ""` (keeps the item in historical library, but removes from Today's active queue).

File: `src/features/note-review/note-review-storage.ts`
- Provides `readNoteReviewState(storage: Storage | null): NoteReviewState`
- Provides `writeNoteReviewState(storage: Storage | null, state: NoteReviewState): void`
- Dispatches `auris:note-review-changed` and listens for `storage` events for multi-tab / route consistency.

## User-Facing Components & Interactions

### 1. Navigation & View Tabs
In `src/components/review/review-page-client.tsx`:
- Preserve existing `"reading"` tab and insert `"notes"`:
  ```ts
  type ReviewView = "today" | "reading" | "notes" | "all" | "projects" | "heatmap";
  ```
- `VIEW_LABELS`:
  ```ts
  const VIEW_LABELS: Record<ReviewView, string> = {
    today: "今天",
    reading: "书籍回顾",
    notes: "笔记回顾",
    all: "全部",
    projects: "项目",
    heatmap: "复盘热力图",
  };
  ```
- The "笔记回顾" tab displays a badge showing `pendingToday` count if greater than 0.

### 2. "今日笔记回顾" Section in TodayView
Located in `TodayView` on the left side of `/`:
- **Header**:
  - Title: `今日笔记自选回顾` with progress badge (`已回顾 ${completedToday} / ${totalToday} 篇`).
  - Button: `[ ＋ 从笔记库选择 ]` styled with secondary accent.
- **Card: `NoteReviewCard`**:
  - **Top row**: Note icon + Note title (truncated safely, full title on hover) + Path/Folder tag + Status badge (`待复习` / `需强化` / `已回顾`).
  - **Recall Hint & Quick Preview**:
    - Displays prompt / first paragraph.
    - Toggle button: `[ 预览正文 ⌄ ]`: lazily loads markdown body via `notesStorage.getPage(item.noteId)` on first expand and renders readable markdown without navigating away.
  - **Action Bar (Button Pyramid)**:
    - **`不会 / 打开笔记 ↗`** (High visibility secondary/warning button):
      Updates item `status = "needs_practice"`, increments `reviewCount`, sets `lastReviewedAt = today`, and immediately calls `router.push('/notes?resumeNoteId=' + encodeURIComponent(item.noteId))`.
    - **`已掌握 ✓`** (Primary success button):
      Updates item `status = "reviewed"`, increments `reviewCount`, sets `lastReviewedAt = today`.
    - **`纳入 1/2/4/7 ⟳`** (Ghost button):
      Promotes note to a 1/2/4/7 `KnowledgePoint` (under project `"笔记回顾"`), creating a linked spaced repetition cycle.
    - **`移出今日`** (Ghost icon button):
      Sets `scheduledDate = ""`, removing it from today's deck.

### 3. Note Picker Modal (`NotePickerModal`)
- Triggered by `[ ＋ 从笔记库选择 ]`.
- Reads note pages using `getNotesStorage().listPages()`.
- Search bar: Real-time fuzzy filtering on note title and `relativePath`.
- Folder grouping / path indicator.
- Checkbox list with "Select All" / "Deselect All".
- Confirm button: `加入今日回顾 (N)`.
  - Sets `scheduledDate = today`, `status = "pending"`, and saves to `auris.note-review.v1`.
- Already added notes show status ("已在回顾清单中").

### 4. Dedicated "笔记回顾" View (`NotesReviewView`)
- Triggered by clicking the "笔记回顾" tab in the top navigation.
- Provides a full-width workstation:
  - **Left Toolbar**: Search input, status filter chips (`全部` | `今日待复习` | `已回顾` | `长期周期中`), and `[ 批量添加笔记 ]`.
  - **Main Area**: Split view with list of review notes on the left and full-height preview & actions on the right.

## Error Handling & Defensive Design

1. **Missing or Renamed Note on Disk**:
   When previewing or clicking "不会 / 打开笔记":
   - Try resolving note via `getNotesStorage().getPage(id)`.
   - If not found or deleted, show inline toast/alert: `"该笔记在本地库中未找到或已被重命名"`, with an action to `"从复习中移除"`.
2. **Empty Vault / Unconfigured Notes Storage**:
   - `NotePickerModal` displays clean empty state: `"暂无可选择的笔记。请先在 Notes 页面中创建笔记或连接本地 Vault。"`.
3. **Large Markdown Body**:
   - Quick preview is scrollable with a max-height (360px) and formatted using standard readable typography, avoiding layout shifts.
4. **Data Validation**:
   - `readNoteReviewState` safely validates schema; if JSON is corrupted or invalid, falls back to empty state without throwing or wiping existing data.

## Verification & Testing Plan

### Automated Tests
1. `tests/unit/review/note-review-model.test.ts`:
   - Adding notes, updating status (`pending` -> `reviewed` -> `needs_practice` -> `mastered`).
   - Filtering today's actionable review items with overdue carry-over and scheduled date calculations.
   - Promoting a note review item to 1/2/4/7 knowledge point with automatic `"笔记回顾"` project resolution.
2. `tests/unit/review/note-review-storage.test.ts`:
   - Reading, writing, event emission, handling empty/corrupted localStorage safely.
3. `tests/unit/review/note-review-card.test.ts`:
   - Renders card, toggles quick preview, clicking "不会 / 打开笔记" transitions status to `needs_practice` and invokes router with correct `/notes?resumeNoteId=...`.
4. `tests/unit/review/note-picker-modal.test.ts`:
   - Lists notes from storage mock, filters by search query, submits selected IDs with `scheduledDate = today`.

### Manual Verification
1. Open Auris desktop app at `/`.
2. Observe "笔记回顾" tab (alongside "书籍回顾") and "今日笔记自选回顾" section in Today view.
3. Click `[ ＋ 从笔记库选择 ]`, select notes from vault, confirm.
4. Verify notes appear as review cards in Today view.
5. Click `[ 预览正文 ⌄ ]` to inspect markdown inline.
6. Click `[ 不会 / 打开笔记 ↗ ]` and verify app navigates to `/notes` and automatically loads the document in editor.
7. Return to `/`, mark note as `已掌握 ✓`.
