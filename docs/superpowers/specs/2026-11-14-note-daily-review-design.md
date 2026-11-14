# Note Daily Review System Design (每日回顾与笔记联动)

## Goal

Enhance Auris's Daily Review interface (`/`, `ReviewPageClient`) to seamlessly support reviewing notes from the local note vault (`/notes`). Users can:
1. Select one or multiple notes from their Note Vault to add into today's review queue.
2. Review notes via active recall cards with quick-expand markdown preview right on the review page.
3. When stuck or unfamiliar with the note's concepts ("不会"), immediately navigate to the full Notes workbench via a dedicated "不会 / 打开笔记 ↗" button (`/notes?resumeNoteId=...`), opening that exact note in the editor.
4. Optionally promote any reviewed note into the long-term 1/2/4/7 Ebbinghaus spaced repetition cycle (Spaced Repetition Wheel).

## Context & Background

Auris is a local-first Electron desktop application with two key capabilities:
- **Notes Workbench (`/notes`)**: Manages Markdown notes in a local Vault directory via `NotesStorage` and `VaultClient`. Supports direct note navigation using query parameter `/notes?resumeNoteId=${encodeURIComponent(pathOrId)}`.
- **Daily Review (`/`, `ReviewPageClient`)**: Currently focuses on project-based 1/2/4/7 output reviews with a Spaced Repetition Wheel and heatmap.

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

### Storage Isolation
To avoid corrupting the strict zod schema and MCP validation of `auris.output-review.v1`, note review state is stored independently under `auris.note-review.v1`:
- **Storage key**: `auris.note-review.v1`
- **Storage event**: `auris:note-review-changed`
- When a note is promoted to 1/2/4/7 spaced repetition, a corresponding `KnowledgePoint` is created in `OutputReviewState` and linked via `knowledgePointId`.

## Data Model

File: `src/features/note-review/note-review-model.ts`

```ts
export type NoteReviewStatus = "pending" | "reviewed" | "mastered" | "needs_practice";

export type NoteReviewItem = {
  id: string;                      // Unique ID (e.g., nr_timestamp_random)
  noteId: string;                  // Note ID or relative path in Vault
  noteTitle: string;               // Display title
  noteRelativePath: string;        // Relative path in vault (e.g., Math/Linear-Algebra.md)
  notePreview?: string;            // Cached first paragraph / summary for instant recall
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

File: `src/features/note-review/note-review-storage.ts`
- Provides `readNoteReviewState(storage: Storage | null): NoteReviewState`
- Provides `writeNoteReviewState(storage: Storage | null, state: NoteReviewState): void`
- Dispatches `auris:note-review-changed` and listens for `storage` events for multi-tab / route consistency.

## User-Facing Components & Interactions

### 1. Navigation & View Tabs
In `ReviewPageClient`:
- Extend `ReviewView` type: `"today" | "notes" | "all" | "projects" | "heatmap"`.
- `VIEW_LABELS`:
  - `today`: "今天"
  - `notes`: "笔记回顾"
  - `all`: "全部"
  - `projects`: "项目"
  - `heatmap`: "复盘热力图"
- The "笔记回顾" tab displays a badge showing the number of unreviewed notes today (`pendingCount`).

### 2. "今日笔记回顾" Section in TodayView
Located in `TodayView` on the left side of `/`:
- **Header**:
  - Title: `今日笔记自选回顾` with progress badge (`已回顾 X / Y 篇`).
  - Button: `[ ＋ 从笔记库选择 ]` styled with secondary accent.
- **Card: `NoteReviewCard`**:
  - **Top row**: Note icon + Note title (truncated safely, full title on hover) + Path/Folder tag + Status badge.
  - **Recall Hint & Quick Preview**:
    - Displays prompt / first paragraph.
    - Toggle button: `[ 预览正文 ⌄ ]` smoothly reveals markdown preview without navigating away.
  - **Action Bar (Button Pyramid)**:
    - **`不会 / 打开笔记 ↗`** (High visibility secondary/accent button):
      Calls `router.push('/notes?resumeNoteId=' + encodeURIComponent(item.noteId))`, immediately switching to the Notes workbench and focusing the note.
    - **`已掌握 ✓`** (Primary success button):
      Marks `status = "reviewed"`, increments `reviewCount`, sets `lastReviewedAt`, triggers subtle success transition.
    - **`纳入 1/2/4/7 ⟳`** (Ghost button):
      Promotes note to a 1/2/4/7 `KnowledgePoint`, creating a linked spaced cycle.
    - **`移出`** (Ghost icon button):
      Removes from today's deck.

### 3. Note Picker Modal (`NotePickerModal`)
- Triggered by `[ ＋ 从笔记库选择 ]`.
- Reads note pages using `getNotesStorage().listPages()`.
- Search bar: Real-time fuzzy filtering on note title and `relativePath`.
- Folder grouping / path indicator.
- Checkbox list with "Select All" / "Deselect All".
- Confirm button: `加入今日回顾 (N)`.
- Already added notes show status ("已在回顾清单中").

### 4. Dedicated "笔记回顾" View (`NotesReviewView`)
- Triggered by clicking the "笔记回顾" tab in the top navigation.
- Provides a full-width workstation:
  - **Left Toolbar**: Search input, status filter chips (`全部` | `今日待复习` | `已掌握` | `长期周期中`), and `[ 批量添加笔记 ]`.
  - **Main Area**: Split view with list of review notes on the left and full-height preview & actions on the right.

## Error Handling & Defensive Design

1. **Missing or Renamed Note on Disk**:
   When previewing or clicking "不会 / 打开笔记":
   - Try resolving note via `getNotesStorage().getPage(id)`.
   - If not found or deleted, show inline toast/alert: `"该笔记在本地库中未找到或已被重命名"`, with an action to `"从复习中移除"`.
2. **Empty Vault / Unconfigured Notes Storage**:
   - `NotePickerModal` displays clean empty state: `"暂无可选择的笔记。请先在 Notes 页面中创建笔记或连接本地 Vault。"`.
3. **Large Markdown Body**:
   - Quick preview is scrollable with a max-height (e.g. 360px) and formatted using standard readable typography, avoiding layout shifts.
4. **Data Validation**:
   - `readNoteReviewState` safely validates schema; if JSON is corrupted or invalid, falls back to empty state without throwing or wiping existing data.

## Verification & Testing Plan

### Automated Tests
1. `tests/unit/review/note-review-model.test.ts`:
   - Adding notes, updating status (`pending` -> `reviewed` -> `mastered`).
   - Filtering today's actionable review items.
   - Promoting a note review item to 1/2/4/7 knowledge point.
2. `tests/unit/review/note-review-storage.test.ts`:
   - Reading, writing, event emission, handling empty/corrupted localStorage safely.
3. `tests/unit/review/note-review-card.test.ts`:
   - Renders card, toggles quick preview, clicking "不会 / 打开笔记" invokes router with correct `/notes?resumeNoteId=...`.
4. `tests/unit/review/note-picker-modal.test.ts`:
   - Lists notes from storage mock, filters by search query, submits selected IDs.

### Manual Verification
1. Open Auris desktop app at `/`.
2. Observe "笔记回顾" tab and "今日笔记自选回顾" section in Today view.
3. Click `[ ＋ 从笔记库选择 ]`, select notes from vault, confirm.
4. Verify notes appear as review cards.
5. Click `[ 预览正文 ⌄ ]` to inspect markdown inline.
6. Click `[ 不会 / 打开笔记 ↗ ]` and verify app navigates to `/notes` and automatically loads the document in editor.
7. Return to `/`, mark note as `已掌握 ✓`.
