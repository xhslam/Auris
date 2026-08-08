import { expect, test, type Page } from "@playwright/test";
import { installLocalNotesBridge } from "./notes-bridge";

const AUTOSAVE_TIMEOUT_MS = 7_000;
const NOTES_WORKSPACE_STORAGE_KEY = "shadowing-notes-workspace-v2";
const SOURCE_MODE_WORKSPACE_STATE = {
  activePath: null,
  commandHistory: [],
  editorModesByPath: {
    "notes/pronunciation-sprint.md": "source",
    "notes/rhythm-drill.md": "source",
  },
  leftSidebarCollapsed: false,
  leftSidebarMode: "files",
  openTabs: [],
  pinnedTabs: [],
  recentFiles: [],
  rightSidebarCollapsed: false,
  rightSidebarMode: "properties",
};

async function getSavedSource(page: Page, path: string | null) {
  return page.evaluate((relativePath) => {
    return (
      (
        window as Window & {
          __notesHarness?: {
            getFile: (relativePath: string) => string | null;
          };
        }
      ).__notesHarness?.getFile(relativePath ?? "") ?? null
    );
  }, path);
}

async function getActiveDocumentPath(page: Page) {
  return page.locator(".notes-v2__document-path").textContent();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ storageKey, workspaceState }) => {
    window.localStorage.clear();
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(workspaceState),
    );
  }, {
    storageKey: NOTES_WORKSPACE_STORAGE_KEY,
    workspaceState: SOURCE_MODE_WORKSPACE_STATE,
  });
  await installLocalNotesBridge(page);
});

test("keeps the note editor focused while typing consecutive characters", async ({
  page,
}) => {
  await page.goto("/notes");
  await expect(page.getByTestId("notes-codemirror-host")).toBeVisible();
  await page
    .locator('[data-testid="notes-codemirror-host"] .cm-content')
    .click();

  await page.evaluate(() => {
    const host = document.querySelector(
      '[data-testid="notes-codemirror-host"]',
    ) as
      | (HTMLDivElement & {
          __notesEditorView?: {
            dispatch: (transaction: unknown) => void;
            focus: () => void;
            state: { doc: { length: number } };
          };
        })
      | null;

    const view = host?.__notesEditorView;

    if (!view) {
      throw new Error("Expected a CodeMirror editor instance.");
    }

    const end = view.state.doc.length;
    view.dispatch({
      selection: {
        anchor: end,
      },
    });
    view.focus();
  });

  await page.keyboard.type("abc");

  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement?.classList.contains("cm-content") ?? false,
      ),
    )
    .toBe(true);

  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement?.classList.contains("cm-content") ?? false,
      ),
    )
    .toBe(true);
  await expect(page.getByText("正在加载笔记库...")).toHaveCount(0);

  const activePath = await getActiveDocumentPath(page);

  await expect
    .poll(() => getSavedSource(page, activePath), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    .toContain("abc");
});

test("separates the note title from the body editor source", async ({ page }) => {
  await page.goto("/notes");

  const titleInput = page.getByLabel("Note title");
  const originalTitle = await titleInput.inputValue();

  const editorSource = await page.evaluate(() => {
    const host = document.querySelector(
      '[data-testid="notes-codemirror-host"]',
    ) as
      | (HTMLDivElement & {
          __notesEditorView?: {
            state: { doc: { toString: () => string } };
          };
        })
      | null;

    return host?.__notesEditorView?.state.doc.toString() ?? null;
  });
  const activePath = await getActiveDocumentPath(page);
  const savedSource = await getSavedSource(page, activePath);

  expect(savedSource).toContain(`# ${originalTitle}`);
  expect(editorSource).not.toContain(`# ${originalTitle}`);

  await titleInput.fill("Rhythm Mastery");

  await expect
    .poll(async () => getSavedSource(page, await getActiveDocumentPath(page)), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    .toContain("# Rhythm Mastery");
  expect(await getSavedSource(page, await getActiveDocumentPath(page))).not.toContain(`# ${originalTitle}`);
});

test("keeps user deletions after autosave and vault refresh", async ({
  page,
}) => {
  await page.goto("/notes");
  const titleInput = page.getByLabel("Note title");
  const currentTitle = await titleInput.inputValue();
  await expect(page.getByTestId("notes-codemirror-host")).toBeVisible();
  await page
    .locator('[data-testid="notes-codemirror-host"] .cm-content')
    .click();

  await page.evaluate(() => {
    const host = document.querySelector(
      '[data-testid="notes-codemirror-host"]',
    ) as
      | (HTMLDivElement & {
          __notesEditorView?: {
            dispatch: (transaction: unknown) => void;
            focus: () => void;
            state: { doc: { length: number } };
          };
        })
      | null;

    const view = host?.__notesEditorView;

    if (!view) {
      throw new Error("Expected a CodeMirror editor instance.");
    }

    view.dispatch({
      selection: {
        anchor: 0,
        head: view.state.doc.length,
      },
    });
    view.focus();
  });

  await page.keyboard.press("Backspace");

  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement?.classList.contains("cm-content") ?? false,
      ),
    )
    .toBe(true);

  const editorSource = await page.evaluate(() => {
    const host = document.querySelector(
      '[data-testid="notes-codemirror-host"]',
    ) as
      | (HTMLDivElement & {
          __notesEditorView?: {
            state: { doc: { toString: () => string } };
          };
        })
      | null;

    return host?.__notesEditorView?.state.doc.toString() ?? null;
  });

  expect(editorSource).toBe("");

  const activePath = await getActiveDocumentPath(page);

  await expect
    .poll(() => getSavedSource(page, activePath), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    .toBe(`# ${currentTitle}`);
});

test("keeps text visible when typing on a trailing blank line under a rendered heading", async ({
  page,
}) => {
  await page.goto("/notes");

  const activePath = await getActiveDocumentPath(page);

  await page.evaluate((path) => {
    (
      window as Window & {
        __notesHarness?: {
          replaceFile: (relativePath: string, content: string) => void;
        };
      }
    ).__notesHarness?.replaceFile(
      path ?? "",
      "# Pronunciation Sprint\n\n## Section\n\n",
    );
  }, activePath);

  await expect(page.getByText("Section")).toBeVisible();

  await page.evaluate(() => {
    const host = document.querySelector(
      '[data-testid="notes-codemirror-host"]',
    ) as
      | (HTMLDivElement & {
          __notesEditorView?: {
            dispatch: (transaction: unknown) => void;
            focus: () => void;
            state: {
              doc: {
                length: number;
              };
            };
          };
        })
      | null;

    const view = host?.__notesEditorView;

    if (!view) {
      throw new Error("Expected a CodeMirror editor instance.");
    }

    view.dispatch({
      selection: {
        anchor: view.state.doc.length,
      },
    });
    view.focus();
  });

  await page.keyboard.insertText("只");
  await expect(page.locator('[data-testid="notes-codemirror-host"] .cm-activeLine')).toContainText(
    "只",
  );

  await expect
    .poll(() => getSavedSource(page, activePath), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    .toContain("## Section\n\n只");
});
