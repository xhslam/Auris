import { expect, test, type Page } from "@playwright/test";
import { installLocalNotesBridge } from "./notes-bridge";

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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ storageKey, workspaceState }) => {
    window.localStorage.clear();
    window.localStorage.setItem(storageKey, JSON.stringify(workspaceState));
  }, {
    storageKey: NOTES_WORKSPACE_STORAGE_KEY,
    workspaceState: SOURCE_MODE_WORKSPACE_STATE,
  });
  await installLocalNotesBridge(page);
});

async function expectNotesWorkbenchReady(page: Page) {
  await expect(page.locator('[data-testid="notes-codemirror-host"] .cm-content')).toBeVisible();
}

async function openNoteFromWorkspace(page: Page, name: RegExp) {
  await page.locator(".notes-v2__active-note-pill").click();
  const tree = page.getByRole("navigation", { name: "笔记库文件树" });
  const fileButton = tree.getByRole("button", { name });

  if (await fileButton.count() === 0) {
    await tree.getByRole("button", { name: "notes" }).click();
  }

  await fileButton.click();
}

test("loads notes from the local vault and writes markdown changes back to disk", async ({
  page,
}) => {
  await page.goto("/notes");
  await expectNotesWorkbenchReady(page);
  await openNoteFromWorkspace(page, /rhythm-drill.md/i);
  await expect(page.locator(".notes-v2__editor-heading p")).toHaveText(
    "notes/rhythm-drill.md",
  );

  await page
    .locator('[data-testid="notes-codemirror-host"]')
    .evaluate((host, nextSource) => {
      const editorHost = host as HTMLDivElement & {
        __notesEditorView?: {
          dispatch: (transaction: {
            changes: { from: number; insert: string; to: number };
          }) => void;
          state: {
            doc: {
              length: number;
            };
          };
        };
      };

      editorHost.__notesEditorView?.dispatch({
        changes: {
          from: 0,
          insert: nextSource,
          to: editorHost.__notesEditorView.state.doc.length,
        },
      });
    }, "# Rhythm Drill\n\nUpdated locally from the desktop notes editor.");
  await expect(
    page.locator("[data-testid='notes-codemirror-host']"),
  ).toContainText("Updated locally from the desktop notes editor.");

  await page.waitForFunction(() => {
    const savedFile = (
      window as Window & {
        __notesHarness?: { getFile: (relativePath: string) => string | null };
      }
    ).__notesHarness?.getFile("notes/rhythm-drill.md");

    return Boolean(
      savedFile?.includes("Updated locally from the desktop notes editor."),
    );
  });
});

test("persists the selected note across reloads", async ({
  page,
}) => {
  await page.goto("/notes");
  await expectNotesWorkbenchReady(page);

  await openNoteFromWorkspace(page, /rhythm-drill.md/i);
  await openNoteFromWorkspace(page, /pronunciation-sprint.md/i);
  await expect(page.locator(".notes-v2__editor-heading p")).toHaveText(
    "notes/pronunciation-sprint.md",
  );

  await page.reload();

  await expectNotesWorkbenchReady(page);
  await expect(page.locator(".notes-v2__editor-heading p")).toHaveText(
    "notes/pronunciation-sprint.md",
  );
});

test("opens the local command palette from the workbench shortcut", async ({ page }) => {
  await page.goto("/notes");
  await expectNotesWorkbenchReady(page);
  await page.keyboard.press("Control+P");

  await expect(
    page.getByRole("dialog", { name: "笔记命令面板" }),
  ).toBeVisible();
  await expect(page.getByText("刷新笔记库")).toBeVisible();
});

test("reacts to external file changes through vault listeners", async ({
  page,
}) => {
  await page.goto("/notes");
  await expectNotesWorkbenchReady(page);
  await openNoteFromWorkspace(page, /rhythm-drill.md/i);

  await page.evaluate(() => {
    (
      window as Window & {
        __notesHarness?: {
          replaceFile: (relativePath: string, content: string) => void;
        };
      }
    ).__notesHarness?.replaceFile(
      "notes/rhythm-drill.md",
      "# Rhythm Drill\n\nExternally updated from the vault watcher.\n",
    );
  });

  await expect(
    page.locator("[data-testid='notes-codemirror-host']"),
  ).toContainText("Externally updated from the vault watcher.");
});

test("searches local notes by markdown body content, not only title", async ({
  page,
}) => {
  await page.goto("/notes");

  await expect(
    page.locator('[data-testid="notes-codemirror-host"] .cm-content'),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "打开笔记检索面板" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.getByPlaceholder("搜索当前笔记库").fill("consonant release");

  const searchPanel = page
    .locator(".notes-v2__panel")
    .filter({ hasText: "搜索" });

  await expect(
    searchPanel.getByRole("button", { name: /pronunciation sprint/i }),
  ).toBeVisible();
  await expect(
    searchPanel.getByRole("button", { name: /rhythm drill/i }),
  ).not.toBeVisible();
});
