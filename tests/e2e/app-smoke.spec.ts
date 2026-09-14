import { expect, test, type Page } from "@playwright/test";

async function installDesktopBridge(page: Page) {
  await page.addInitScript(() => {
    const runtimeStateStorageKey = "__desktopRuntimeState";
    const assessmentHistoryStorageKey = "__desktopAssessmentHistory";
    const trainingHistoryStorageKey = "__desktopTrainingHistory";
    const trainingPlaybackStorageKey = "__desktopTrainingPlayback";

    const noteMarkdown = [
      "---",
      'id: "desktop-note-1"',
      'title: "Desktop Study Log"',
      'icon: "N"',
      'updatedAt: "2026-03-25T00:00:00.000Z"',
      "---",
      "",
      "# Desktop Study Log",
      "",
      "A note loaded from the desktop vault.",
      "",
    ].join("\n");

    (
      window as Window & {
        __desktopExports?: Array<{ filename: string; payload: unknown }>;
      }
    ).__desktopExports = [];

    function readRuntimeState() {
      const rawValue = window.localStorage.getItem(runtimeStateStorageKey);

      if (!rawValue) {
        return {
          legacyRuntimeMigratedAt: null,
          lastRoute: "/",
          lastVisitedAt: null,
          lastWorkspace: "home",
          primaryResumeId: null,
          primaryResumeType: null,
          updatedAt: null,
          windowBounds: null,
        };
      }

      try {
        return JSON.parse(rawValue);
      } catch {
        return {
          legacyRuntimeMigratedAt: null,
          lastRoute: "/",
          lastVisitedAt: null,
          lastWorkspace: "home",
          primaryResumeId: null,
          primaryResumeType: null,
          updatedAt: null,
          windowBounds: null,
        };
      }
    }

    function writeRuntimeState(nextState: unknown) {
      window.localStorage.setItem(runtimeStateStorageKey, JSON.stringify(nextState));
      return nextState;
    }

    function readTrainingHistory() {
      const rawValue = window.localStorage.getItem(trainingHistoryStorageKey);

      if (!rawValue) {
        return [{ id: "desktop-session-1", status: "ready", title: "Desktop Quick Review" }];
      }

      try {
        return JSON.parse(rawValue);
      } catch {
        return [{ id: "desktop-session-1", status: "ready", title: "Desktop Quick Review" }];
      }
    }

    function writeTrainingHistory(nextState: unknown) {
      window.localStorage.setItem(trainingHistoryStorageKey, JSON.stringify(nextState));
      return nextState;
    }

    function readTrainingPlayback() {
      const rawValue = window.localStorage.getItem(trainingPlaybackStorageKey);

      if (!rawValue) {
        return {
          "desktop-session-1": {
            sentences: [
              {
                endMs: 1800,
                id: "sentence-1",
                orderIndex: 0,
                sessionId: "desktop-session-1",
                startMs: 0,
                text: "Desktop playback from local history.",
              },
            ],
            session: {
              audioUrl: "/api/audio/desktop-session-1",
              durationMs: 1800,
              id: "desktop-session-1",
              speedDefault: 1,
              status: "ready",
              title: "Desktop Quick Review",
              voiceId: "alloy",
            },
            wordTokens: [
              {
                endMs: 500,
                id: "word-1",
                orderIndex: 0,
                sentenceId: "sentence-1",
                startMs: 0,
                text: "Desktop",
              },
            ],
          },
        };
      }

      try {
        return JSON.parse(rawValue);
      } catch {
        return {};
      }
    }

    function writeTrainingPlayback(nextState: unknown) {
      window.localStorage.setItem(trainingPlaybackStorageKey, JSON.stringify(nextState));
      return nextState;
    }

    function readAssessmentHistory() {
      const rawValue = window.localStorage.getItem(assessmentHistoryStorageKey);

      if (!rawValue) {
        return [
          {
            accuracyScore: 91,
            completenessScore: 97,
            createdAt: "2026-03-26T00:00:00.000Z",
            fluencyScore: 93,
            id: "desktop-assessment-1",
            locale: "en-US",
            overallScore: 94,
            referenceText: "Desktop pronunciation feedback",
            sourceLabel: "Desktop",
            wordAssessments: [{ accuracyScore: 90, errorType: "None", word: "Desktop" }],
          },
        ];
      }

      try {
        return JSON.parse(rawValue);
      } catch {
        return [];
      }
    }

    function writeAssessmentHistory(nextState: unknown) {
      window.localStorage.setItem(assessmentHistoryStorageKey, JSON.stringify(nextState));
      return nextState;
    }

    window.shadowingDesktop = {
      assessmentHistory: {
        importLegacy: async (records: unknown[]) => {
          if (records.length > 0) {
            return writeAssessmentHistory(records);
          }

          return readAssessmentHistory();
        },
        list: async () => readAssessmentHistory(),
        save: async (record: unknown) => {
          const current = readAssessmentHistory() as Array<{ id: string }>;
          return writeAssessmentHistory([
            record,
            ...current.filter((item) => item.id !== (record as { id: string }).id),
          ]);
        },
      },
      commands: {
        list: async () => [{ id: "daily-review.open", title: "打开每日回顾" }],
        run: async () => ({ executed: true }),
      },
      downloads: {
        exportJson: async (filename: string, payload: unknown) => {
          (
            window as Window & {
              __desktopExports?: Array<{ filename: string; payload: unknown }>;
            }
          ).__desktopExports?.push({ filename, payload });

          return {
            path: `C:/Users/test/Downloads/${filename}`,
          };
        },
        getDirectoryInfo: async () => ({
          directoryPath: "C:/Users/test/Downloads",
        }),
        revealDirectory: async () => undefined,
      },
      plugins: {
        list: async () => [
          {
            enabled: true,
            entryPath: "C:/vault/.shadowing/plugins/daily-review/main.js",
            errorMessage: null,
            manifest: {
              id: "daily-review",
              name: "Daily Review",
              version: "1.0.0",
            },
          },
        ],
        openDirectory: async () => undefined,
        setEnabled: async () => [],
      },
      runtimeState: {
        get: async () => readRuntimeState(),
        importLegacy: async (legacyState: {
          lastVisitedAt: string | null;
          lastWorkspace: "assessment" | "home" | "notes" | "workspace";
        }) =>
          writeRuntimeState({
            ...readRuntimeState(),
            ...legacyState,
            legacyRuntimeMigratedAt: "2026-03-26T00:00:00.000Z",
            updatedAt: "2026-03-26T00:00:00.000Z",
          }),
        setLastWorkspace: async (
          workspace: "assessment" | "home" | "notes" | "workspace",
        ) =>
          writeRuntimeState({
            ...readRuntimeState(),
            lastRoute:
              workspace === "home"
                ? "/"
                : workspace === "workspace"
                  ? "/notes"
                  : `/${workspace}`,
            lastVisitedAt: "2026-03-26T00:00:00.000Z",
            lastWorkspace: workspace,
            updatedAt: "2026-03-26T00:00:00.000Z",
          }),
        setResumeTarget: async (
          targetType: "assessment" | "note" | "training" | null,
          targetId: string | null,
        ) =>
          writeRuntimeState({
            ...readRuntimeState(),
            primaryResumeId: targetId,
            primaryResumeType: targetType,
            updatedAt: "2026-03-26T00:00:00.000Z",
          }),
      },
      trainingHistory: {
        deleteSession: async (sessionId: string) => {
          const current = readTrainingHistory() as Array<{ id: string }>;
          writeTrainingHistory(current.filter((item) => item.id !== sessionId));
          const playbackMap = readTrainingPlayback() as Record<string, unknown>;
          delete playbackMap[sessionId];
          writeTrainingPlayback(playbackMap);
        },
        getPlayback: async (sessionId: string) => {
          const playbackMap = readTrainingPlayback() as Record<string, unknown>;
          return playbackMap[sessionId] ?? null;
        },
        listRecent: async () => readTrainingHistory(),
        savePreparedSession: async (input: {
          playback: { session: { id: string; status: string; title: string } };
          title: string;
        }) => {
          const current = readTrainingHistory() as Array<{ id: string; status: string; title: string }>;
          writeTrainingHistory([
            {
              id: input.playback.session.id,
              status: input.playback.session.status,
              title: input.title,
            },
            ...current.filter((item) => item.id !== input.playback.session.id),
          ]);
          const playbackMap = readTrainingPlayback() as Record<string, unknown>;
          playbackMap[input.playback.session.id] = input.playback;
          writeTrainingPlayback(playbackMap);
        },
      },
      system: {
        openUpgrade: async () => ({
          didOpen: true,
          targetUrl: "https://updates.example.com",
        }),
      },
      vault: {
        getDirectoryInfo: async () => ({
          directoryName: "English Vault",
          hasVault: true,
          pluginDirectory: "C:/vault/.shadowing/plugins",
          vaultPath: "C:/vault",
        }),
        listFiles: async () => [
          {
            absolutePath: "C:/vault/notes/desktop-study-log.md",
            fileName: "desktop-study-log.md",
            relativePath: "notes/desktop-study-log.md",
          },
        ],
        onDidChange: () => () => undefined,
        pickDirectory: async () => ({
          directoryName: "Chosen Notes Vault",
          hasVault: true,
          pluginDirectory: "C:/vault/.shadowing/plugins",
          vaultPath: "C:/vault/chosen",
        }),
        readFile: async () => noteMarkdown,
        removeFile: async () => undefined,
        revealPluginsDirectory: async () => undefined,
        saveFile: async () => undefined,
      },
      window: {
        showInFolder: async () => undefined,
      },
    };
  });
}

async function installDemoAuthCookie(page: Page) {
  await page.context().addCookies([
    {
      name: "shadowing_demo_auth",
      value: encodeURIComponent(
        JSON.stringify({
          email: "tester@example.com",
          id: "demo-user-tester-example-com",
        }),
      ),
      url: "http://127.0.0.1:3000",
    },
  ]);
}

async function expectNotesV2Workbench(page: Page) {
  await expect(page.locator(".notes-v2")).toBeVisible();
  await expect(page.locator('[data-testid="notes-codemirror-host"]')).toBeVisible();
}

test("login page renders", async ({ page }) => {
  await page.goto("/login");

  await expect(page).toHaveTitle(/Auris/i);
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test("desktop home renders and exposes knowledge workspace links", async ({ page }) => {
  await installDesktopBridge(page);
  await page.goto("/");

  await expect(page.locator("main.auris-home")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Home",
    }),
  ).toBeVisible();
  const home = page.getByRole("main");
  await expect(home.getByRole("heading", { name: "Auris" })).toBeVisible();
  await expect(home.getByText("Pinned", { exact: true })).toBeVisible();
  await expect(home.getByText("近 12 周使用时长", { exact: true })).toBeVisible();
  await expect(home.getByText("今日继续", { exact: true })).toBeVisible();
  await expect(home.getByText("待读与未消化", { exact: true })).toBeVisible();
  await expect(
    home.locator(".auris-home__section-label").filter({ hasText: "最近沉淀" }),
  ).toBeVisible();
  await expect(home.getByRole("button", { exact: true, name: "记录闪念" })).toBeVisible();
  await expect(home.getByRole("button", { name: "打开今日回顾" })).toBeVisible();
  await expect(home.getByTestId("home-resume-card").getByText("Desktop Study Log")).toBeVisible();
  await expect(home.getByRole("button", { name: "总结当前材料" })).toBeVisible();
  await expect(home.getByRole("button", { name: "解释难点" })).toBeVisible();
  await expect(home.getByRole("button", { name: "生成复习问题" })).toBeVisible();
});

test("community and settings routes render desktop platform pages", async ({ page }) => {
  await installDesktopBridge(page);

  await page.goto("/community");
  await expect(page.getByRole("heading", { name: "欢迎访问我们的社区" })).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "基本设置" })).toBeVisible();
});

test("courses and community pages expose richer desktop sections", async ({ page }) => {
  await installDesktopBridge(page);

  await page.goto("/courses");
  await expect(page.getByRole("heading", { name: "参加的课程" })).toBeVisible();
  await expect(page.getByText("本周训练节奏")).toBeVisible();
  await expect(page.getByText("继续本周单元")).toBeVisible();

  await page.goto("/community");
  await expect(page.getByRole("heading", { name: "欢迎访问我们的社区" })).toBeVisible();
  await expect(page.getByText("社区热榜")).toBeVisible();
  await expect(page.getByText("发帖前先搜一搜")).toBeVisible();
});

test("billing entitlement endpoint responds", async ({ request }) => {
  const response = await request.get("/api/billing/entitlements");

  expect(response.ok()).toBeTruthy();
  await expect
    .soft(response.json())
    .resolves.toMatchObject({ entitlements: [], isSupported: false, userId: null });
});

test("notes page still renders when the desktop bridge is present", async ({ page }) => {
  await installDesktopBridge(page);

  await page.goto("/notes");

  await expectNotesV2Workbench(page);
  await expect(page.getByRole("button", { name: "新建" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Desktop Study Log" })).toBeVisible();
});

test("desktop home surfaces recent notes as resume buttons", async ({ page }) => {
  await installDesktopBridge(page);
  await installDemoAuthCookie(page);

  await page.goto("/notes");
  await expect(page).toHaveURL(/\/notes$/);

  await page.goto("/");
  const home = page.getByRole("main");
  await expect(home.getByRole("button", { name: /Desktop Study Log/ })).toBeVisible();
  await home.getByRole("button", { name: /Desktop Study Log/ }).click();
  await expect(page).toHaveURL(/\/notes\?resumeNoteId=desktop-note-1$/);
});

test("desktop home restores note details from recent note buttons", async ({
  page,
}) => {
  await installDesktopBridge(page);
  await installDemoAuthCookie(page);

  await page.goto("/");

  await page.getByRole("main").getByRole("button", { name: /Desktop Study Log/ }).click();
  await expect(page).toHaveURL(/\/notes\?resumeNoteId=desktop-note-1$/);
  await expect(page.locator('input[value="Desktop Study Log"]')).toBeVisible();
});

test("desktop assessment history survives reload from bridge-backed local storage", async ({
  page,
}) => {
  await installDesktopBridge(page);

  await page.goto("/assessment");
  await expect(page.getByText("Desktop pronunciation feedback")).toBeVisible();

  await page.reload();

  await expect(page.getByText("Desktop pronunciation feedback")).toBeVisible();
});

test("demo login state survives a reload", async ({ page }) => {
  await page.goto("/login");

  await page.locator('input[name="account"]').fill("13800138000");
  await page.locator('input[name="password"]').fill("password123");
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("main.auris-home")).toBeVisible();
});

test("desktop notes command button opens the command palette", async ({ page }) => {
  await installDesktopBridge(page);
  await page.goto("/notes");

  await expectNotesV2Workbench(page);
  await page.getByRole("button", { name: "命令" }).click();

  await expect(page.getByRole("dialog", { name: "笔记命令面板" })).toBeVisible();
});

test("desktop notes page shows the active vault name", async ({ page }) => {
  await installDesktopBridge(page);
  await page.goto("/notes");

  await expectNotesV2Workbench(page);
  await expect(page.getByText("C:/vault")).toBeVisible();
});

test("notes open tab persists across reload as simple local cache", async ({ page }) => {
  await installDesktopBridge(page);
  await page.goto("/notes");
  await expectNotesV2Workbench(page);
  await expect(page.getByRole("tab", { name: "Desktop Study Log" })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("tab", { name: "Desktop Study Log" })).toBeVisible();
});
