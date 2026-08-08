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

test("keeps paragraph editing stable when a heading follows immediately after it", async ({
  page,
}) => {
  await page.goto("/notes");

  const activePath = await page
    .locator(".notes-v2__document-path")
    .textContent();

  await page.evaluate((path) => {
    (
      window as Window & {
        __notesHarness?: {
          replaceFile: (relativePath: string, content: string) => void;
        };
      }
    ).__notesHarness?.replaceFile(
      path ?? "",
      "# Pronunciation Sprint\n\nParagraph before heading\n## Section",
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
                line: (number: number) => {
                  from: number;
                  to: number;
                };
              };
            };
          };
        })
      | null;

    const view = host?.__notesEditorView;

    if (!view) {
      throw new Error("Expected a CodeMirror editor instance.");
    }

    const line = view.state.doc.line(1);

    view.dispatch({
      selection: {
        anchor: line.to,
      },
    });
    view.focus();
  });

  await page.keyboard.type(" abc");
  await expect(
    page.locator('[data-testid="notes-codemirror-host"] .cm-activeLine'),
  ).toContainText("Paragraph before heading abc");

  await expect
    .poll(() => getSavedSource(page, activePath), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    .toContain("Paragraph before heading abc\n## Section");
});

test("keeps heading editing stable when it follows immediately after a paragraph", async ({
  page,
}) => {
  await page.goto("/notes");

  const activePath = await page
    .locator(".notes-v2__document-path")
    .textContent();

  await page.evaluate((path) => {
    (
      window as Window & {
        __notesHarness?: {
          replaceFile: (relativePath: string, content: string) => void;
        };
      }
    ).__notesHarness?.replaceFile(
      path ?? "",
      "# Pronunciation Sprint\n\nParagraph before heading\n## Section",
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
                line: (number: number) => {
                  from: number;
                  to: number;
                };
              };
            };
          };
        })
      | null;

    const view = host?.__notesEditorView;

    if (!view) {
      throw new Error("Expected a CodeMirror editor instance.");
    }

    const line = view.state.doc.line(2);

    view.dispatch({
      selection: {
        anchor: line.to,
      },
    });
    view.focus();
  });

  await page.keyboard.type(" Two");

  await expect
    .poll(() => getSavedSource(page, activePath), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    .toContain("Paragraph before heading\n## Section Two");
});

test("lets users insert a new line between an adjacent paragraph and heading", async ({
  page,
}) => {
  await page.goto("/notes");

  const activePath = await page
    .locator(".notes-v2__document-path")
    .textContent();

  await page.evaluate((path) => {
    (
      window as Window & {
        __notesHarness?: {
          replaceFile: (relativePath: string, content: string) => void;
        };
      }
    ).__notesHarness?.replaceFile(
      path ?? "",
      "# Pronunciation Sprint\n\nParagraph before heading\n## Section",
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
                line: (number: number) => {
                  to: number;
                };
              };
            };
          };
        })
      | null;

    const view = host?.__notesEditorView;

    if (!view) {
      throw new Error("Expected a CodeMirror editor instance.");
    }

    const line = view.state.doc.line(1);

    view.dispatch({
      selection: {
        anchor: line.to,
      },
    });
    view.focus();
  });

  await page.keyboard.press("Enter");
  await page.keyboard.type("Bridge line");

  await expect
    .poll(() => getSavedSource(page, activePath), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    .toContain("Paragraph before heading\nBridge line\n## Section");
});

test("lets users click near the end of a rendered heading after a paragraph and keep typing", async ({
  page,
}) => {
  await page.goto("/notes");

  const activePath = await page
    .locator(".notes-v2__document-path")
    .textContent();

  await page.evaluate((path) => {
    (
      window as Window & {
        __notesHarness?: {
          replaceFile: (relativePath: string, content: string) => void;
        };
      }
    ).__notesHarness?.replaceFile(
      path ?? "",
      "# Pronunciation Sprint\n\nParagraph before heading\n## Section",
    );
  }, activePath);

  const headingLine = page
    .locator('[data-testid="notes-codemirror-host"] .cm-line')
    .filter({ hasText: "## Section" });
  await expect(headingLine).toBeVisible();

  const boundingBox = await headingLine.boundingBox();

  if (!boundingBox) {
    throw new Error("Expected the rendered heading line to have a bounding box.");
  }

  await page.mouse.click(
    boundingBox.x + Math.max(boundingBox.width - 6, 1),
    boundingBox.y + boundingBox.height / 2,
  );
  await page.keyboard.type(" Two");

  await expect
    .poll(() => getSavedSource(page, activePath), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    .toContain("Paragraph before heading\n## Section Two");
});
