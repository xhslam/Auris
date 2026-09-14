import { describe, expect, it, vi } from "vitest";
import { createDesktopNotesStorage } from "@/platform/notes/desktop-notes-storage";
import type { DesktopVaultService } from "@/platform/desktop/vault-service";

function createVaultService(): DesktopVaultService {
  const files = new Map<string, string>([
    [
      "notes/study-log.md",
      [
        "---",
        'id: "note-1"',
        'title: "Study Log"',
        'icon: "N"',
        'updatedAt: "2026-03-25T00:00:00.000Z"',
        "---",
        "",
        "# Study Log",
        "",
        "## Today",
        "",
        "Shadowing notes",
        "",
      ].join("\n"),
    ],
  ]);

  return {
    copyEntry: vi.fn(async () => undefined),
    createDirectory: vi.fn(async () => undefined),
    getDirectoryInfo: vi.fn(async () => ({
      directoryName: "English Vault",
      isConfigured: true,
      isDesktopVault: true,
      isSupported: true,
      pluginDirectory: "C:/vault/.shadowing/plugins",
      vaultPath: "C:/vault",
    })),
    listFiles: vi.fn(async () => []),
    listMarkdownFiles: vi.fn(async () =>
      [...files.keys()].map((relativePath) => ({
        absolutePath: `C:/vault/${relativePath}`,
        fileName: relativePath.split("/").at(-1) ?? relativePath,
        relativePath,
      })),
    ),
    moveMarkdownFile: vi.fn(async () => undefined),
    openPluginsDirectory: vi.fn(async () => undefined),
    pickDirectory: vi.fn(async () => ({
      directoryName: "English Vault",
      isConfigured: true,
      isDesktopVault: true,
      isSupported: true,
      pluginDirectory: "C:/vault/.shadowing/plugins",
      vaultPath: "C:/vault",
    })),
    readMarkdownFile: vi.fn(async (relativePath: string) => files.get(relativePath) ?? null),
    removeMarkdownFile: vi.fn(async (relativePath: string) => {
      files.delete(relativePath);
    }),
    renameMarkdownFile: vi.fn(async () => undefined),
    restoreLastDeletedEntry: vi.fn(async () => null),
    revealEntry: vi.fn(async () => undefined),
    saveMarkdownFile: vi.fn(async (relativePath: string, content: string) => {
      files.set(relativePath, content);
    }),
    subscribeToChanges: vi.fn(() => () => undefined),
  };
}

describe("desktop notes storage", () => {
  it("reuses the cached vault snapshot when loading page summaries and the active note", async () => {
    const vaultService = createVaultService();
    const storage = createDesktopNotesStorage(vaultService);

    await storage.listPages();
    await storage.getPage("note-1");

    expect(vaultService.listMarkdownFiles).toHaveBeenCalledTimes(1);
    expect(vaultService.readMarkdownFile).toHaveBeenCalledTimes(1);
  });

  it("lists and loads note pages from the vault", async () => {
    const storage = createDesktopNotesStorage(createVaultService());

    const pages = await storage.listPages();
    const page = await storage.getPage("note-1");

    expect(pages[0]?.title).toBe("Study Log");
    expect(page?.relativePath).toBe("notes/study-log.md");
  });

  it("uses file mtime when scanning a plain Markdown note", async () => {
    const vaultService = createVaultService();
    vi.mocked(vaultService.listMarkdownFiles).mockResolvedValue([
      {
        absolutePath: "C:/vault/math/linear-equations.md",
        fileName: "linear-equations.md",
        mtime: "2026-08-23T03:40:26.000Z",
        relativePath: "math/linear-equations.md",
      },
    ]);
    vi.mocked(vaultService.readMarkdownFile).mockResolvedValue(
      "# 线性方程组\n\n齐次方程组",
    );

    const pages = await createDesktopNotesStorage(vaultService).listPages();

    expect(pages[0]).toMatchObject({
      relativePath: "math/linear-equations.md",
      title: "线性方程组",
      updatedAt: "2026-08-23T03:40:26.000Z",
    });
  });

  it("creates and deletes a markdown note inside the vault", async () => {
    const storage = createDesktopNotesStorage(createVaultService());

    const created = await storage.createPage({
      title: "Vocabulary Review",
    });

    expect(created.relativePath.endsWith(".md")).toBe(true);

    await storage.deletePage(created.id);

    expect(await storage.getPage(created.id)).toBeNull();
  });
});
