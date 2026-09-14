import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const modulePath = "../../../../electron/notes/vault-file-operations.cjs";
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "auris-vault-ops-"));
  roots.push(root);
  const vaultRoot = path.join(root, "vault");
  const trashRoot = path.join(root, "trash");
  fs.mkdirSync(path.join(vaultRoot, "notes"), { recursive: true });
  fs.writeFileSync(path.join(vaultRoot, "notes", "daily.md"), "# Daily\n");
  return { root, trashRoot, vaultRoot };
}

describe("vault file operations", () => {
  it("rejects lexical traversal and symlink escapes", async () => {
    expect(fs.existsSync(path.resolve(__dirname, modulePath))).toBe(true);
    if (!fs.existsSync(path.resolve(__dirname, modulePath))) return;
    const { createVaultFileOperations } = require(modulePath);
    const { root, trashRoot, vaultRoot } = fixture();
    const outside = path.join(root, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "private.md"), "private\n");
    fs.symlinkSync(outside, path.join(vaultRoot, "linked"));
    const operations = createVaultFileOperations({ trashRoot, vaultRoot });

    await expect(operations.resolve("../outside/private.md")).rejects.toThrow(
      /escapes the current vault/i,
    );
    await expect(operations.resolve("linked/private.md")).rejects.toThrow(
      /escapes the current vault/i,
    );
  });

  it("copies without overwriting and reveals only bounded paths", async () => {
    const { createVaultFileOperations } = require(modulePath);
    const { trashRoot, vaultRoot } = fixture();
    const operations = createVaultFileOperations({ trashRoot, vaultRoot });

    await operations.copy("notes/daily.md", "notes/daily copy.md");
    expect(
      fs.readFileSync(path.join(vaultRoot, "notes", "daily copy.md"), "utf8"),
    ).toBe("# Daily\n");
    await expect(
      operations.copy("notes/daily.md", "notes/daily copy.md"),
    ).rejects.toThrow(/already exists/i);
    await expect(operations.reveal("notes/daily.md")).resolves.toBe(
      path.join(vaultRoot, "notes", "daily.md"),
    );
  });

  it("does not follow a source swapped to an external symlink", async () => {
    const { createVaultFileOperations } = require(modulePath);
    const { root, trashRoot, vaultRoot } = fixture();
    const outsideFile = path.join(root, "private.md");
    fs.writeFileSync(outsideFile, "PRIVATE\n");
    let swapped = false;
    const operations = createVaultFileOperations({
      beforeFileOpen: async ({ sourcePath }: { sourcePath: string }) => {
        if (swapped) return;
        swapped = true;
        fs.rmSync(sourcePath);
        fs.symlinkSync(outsideFile, sourcePath);
      },
      trashRoot,
      vaultRoot,
    });

    await expect(
      operations.copy("notes/daily.md", "notes/copied.md"),
    ).rejects.toThrow();
    expect(fs.existsSync(path.join(vaultRoot, "notes", "copied.md"))).toBe(
      false,
    );
  });

  it("never clobbers a destination created by a concurrent operation", async () => {
    const { createVaultFileOperations } = require(modulePath);
    const { trashRoot, vaultRoot } = fixture();
    fs.writeFileSync(path.join(vaultRoot, "notes", "other.md"), "# Other\n");
    const operations = createVaultFileOperations({ trashRoot, vaultRoot });

    const results = await Promise.allSettled([
      operations.copy("notes/daily.md", "notes/race.md"),
      operations.copy("notes/other.md", "notes/race.md"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(["# Daily\n", "# Other\n"]).toContain(
      fs.readFileSync(path.join(vaultRoot, "notes", "race.md"), "utf8"),
    );
  });

  it("copies, moves, trashes, and restores directories", async () => {
    const { createVaultFileOperations } = require(modulePath);
    const { trashRoot, vaultRoot } = fixture();
    fs.mkdirSync(path.join(vaultRoot, "folder", "nested"), { recursive: true });
    fs.writeFileSync(path.join(vaultRoot, "folder", "nested", "note.md"), "nested\n");
    const operations = createVaultFileOperations({ trashRoot, vaultRoot });

    await operations.copy("folder", "folder copy");
    expect(
      fs.readFileSync(path.join(vaultRoot, "folder copy", "nested", "note.md"), "utf8"),
    ).toBe("nested\n");
    await operations.move("folder copy", "folder moved");
    expect(fs.existsSync(path.join(vaultRoot, "folder copy"))).toBe(false);
    await operations.trash("folder moved");
    expect(fs.existsSync(path.join(vaultRoot, "folder moved"))).toBe(false);
    await expect(operations.restoreLatest()).resolves.toBe("folder moved");
    expect(
      fs.readFileSync(path.join(vaultRoot, "folder moved", "nested", "note.md"), "utf8"),
    ).toBe("nested\n");
  });

  it("preserves late writes through an open source during a same-volume move", async () => {
    const { createVaultFileOperations } = require(modulePath);
    const { trashRoot, vaultRoot } = fixture();
    const operations = createVaultFileOperations({
      afterCopy: async ({ sourcePath }: { sourcePath: string }) => {
        fs.writeFileSync(sourcePath, "concurrent edit\n");
      },
      trashRoot,
      vaultRoot,
    });

    await expect(
      operations.move("notes/daily.md", "notes/moved.md"),
    ).resolves.toBeUndefined();
    expect(fs.existsSync(path.join(vaultRoot, "notes", "daily.md"))).toBe(false);
    expect(fs.readFileSync(path.join(vaultRoot, "notes", "moved.md"), "utf8")).toBe(
      "concurrent edit\n",
    );
  });

  it("rejects a move when autosave recreates the original path", async () => {
    const { createVaultFileOperations } = require(modulePath);
    const { trashRoot, vaultRoot } = fixture();
    const operations = createVaultFileOperations({
      afterCopy: async ({ originalSourcePath }: { originalSourcePath: string }) => {
        fs.writeFileSync(originalSourcePath, "new autosave\n");
      },
      trashRoot,
      vaultRoot,
    });

    await expect(
      operations.move("notes/daily.md", "notes/moved.md"),
    ).rejects.toThrow(/source path was recreated/i);
    expect(fs.readFileSync(path.join(vaultRoot, "notes", "daily.md"), "utf8")).toBe(
      "new autosave\n",
    );
    expect(fs.existsSync(path.join(vaultRoot, "notes", "moved.md"))).toBe(false);
  });

  it("recovers a staged directory visibly when an external save recreates it", async () => {
    const { createVaultFileOperations } = require(modulePath);
    const { trashRoot, vaultRoot } = fixture();
    fs.mkdirSync(path.join(vaultRoot, "folder"));
    fs.writeFileSync(path.join(vaultRoot, "folder", "original.md"), "original\n");
    const operations = createVaultFileOperations({
      afterCopy: async ({ originalSourcePath }: { originalSourcePath: string }) => {
        fs.mkdirSync(originalSourcePath, { recursive: true });
        fs.writeFileSync(path.join(originalSourcePath, "external.md"), "external\n");
      },
      trashRoot,
      vaultRoot,
    });

    await expect(operations.move("folder", "moved folder")).rejects.toThrow(
      /recovered to/i,
    );
    expect(fs.readFileSync(path.join(vaultRoot, "folder", "external.md"), "utf8")).toBe(
      "external\n",
    );
    const recoveredName = fs
      .readdirSync(vaultRoot)
      .find((name) => name.startsWith("folder (Auris recovered "));
    expect(recoveredName).toBeTruthy();
    expect(
      fs.readFileSync(path.join(vaultRoot, recoveredName!, "original.md"), "utf8"),
    ).toBe("original\n");
    expect(fs.existsSync(path.join(vaultRoot, "moved folder"))).toBe(false);
  });

  it("keeps a trashed entry recoverable when pruning fails", async () => {
    const { createVaultFileOperations } = require(modulePath);
    const { trashRoot, vaultRoot } = fixture();
    const operations = createVaultFileOperations({
      beforePruneTrash: async () => {
        throw new Error("simulated prune failure");
      },
      trashRoot,
      vaultRoot,
    });

    await expect(operations.trash("notes/daily.md")).resolves.toEqual(
      expect.any(String),
    );
    await expect(operations.restoreLatest()).resolves.toBe("notes/daily.md");
    expect(fs.readFileSync(path.join(vaultRoot, "notes", "daily.md"), "utf8")).toBe(
      "# Daily\n",
    );
  });

  it("moves entries to an app trash and restores the latest item safely", async () => {
    const { createVaultFileOperations } = require(modulePath);
    const { trashRoot, vaultRoot } = fixture();
    const operations = createVaultFileOperations({ trashRoot, vaultRoot });

    await expect(operations.trash("notes/daily.md")).resolves.toEqual(
      expect.any(String),
    );
    expect(fs.existsSync(path.join(vaultRoot, "notes", "daily.md"))).toBe(false);
    await expect(operations.restoreLatest()).resolves.toBe("notes/daily.md");
    expect(fs.readFileSync(path.join(vaultRoot, "notes", "daily.md"), "utf8")).toBe(
      "# Daily\n",
    );
    await expect(operations.restoreLatest()).resolves.toBeNull();
  });

  it("keeps trash data when an external atomic save replaces a restore target", async () => {
    const { createVaultFileOperations } = require(modulePath);
    const { trashRoot, vaultRoot } = fixture();
    const initialOperations = createVaultFileOperations({ trashRoot, vaultRoot });
    await initialOperations.trash("notes/daily.md");

    const racingOperations = createVaultFileOperations({
      afterCopy: async ({ targetPath }: { targetPath: string }) => {
        fs.rmSync(targetPath, { force: true });
        fs.writeFileSync(targetPath, "external save\n");
      },
      trashRoot,
      vaultRoot,
    });
    await expect(racingOperations.restoreLatest()).rejects.toThrow(
      /destination changed/i,
    );
    expect(fs.readFileSync(path.join(vaultRoot, "notes", "daily.md"), "utf8")).toBe(
      "external save\n",
    );

    fs.rmSync(path.join(vaultRoot, "notes", "daily.md"));
    await expect(initialOperations.restoreLatest()).resolves.toBe("notes/daily.md");
    expect(fs.readFileSync(path.join(vaultRoot, "notes", "daily.md"), "utf8")).toBe(
      "# Daily\n",
    );
  });

  it("keeps trash data when an external in-place save changes a restore target", async () => {
    const { createVaultFileOperations } = require(modulePath);
    const { trashRoot, vaultRoot } = fixture();
    const initialOperations = createVaultFileOperations({ trashRoot, vaultRoot });
    await initialOperations.trash("notes/daily.md");

    const racingOperations = createVaultFileOperations({
      afterCopy: async ({ targetPath }: { targetPath: string }) => {
        fs.writeFileSync(targetPath, "external in-place save\n");
      },
      trashRoot,
      vaultRoot,
    });
    await expect(racingOperations.restoreLatest()).rejects.toThrow(
      /destination changed/i,
    );
    expect(fs.readFileSync(path.join(vaultRoot, "notes", "daily.md"), "utf8")).toBe(
      "external in-place save\n",
    );

    fs.rmSync(path.join(vaultRoot, "notes", "daily.md"));
    await expect(initialOperations.restoreLatest()).resolves.toBe("notes/daily.md");
    expect(fs.readFileSync(path.join(vaultRoot, "notes", "daily.md"), "utf8")).toBe(
      "# Daily\n",
    );
  });

  it("refuses to restore over a newly occupied original path", async () => {
    const { createVaultFileOperations } = require(modulePath);
    const { trashRoot, vaultRoot } = fixture();
    const operations = createVaultFileOperations({ trashRoot, vaultRoot });

    await operations.trash("notes/daily.md");
    fs.writeFileSync(path.join(vaultRoot, "notes", "daily.md"), "new file\n");

    await expect(operations.restoreLatest()).rejects.toThrow(/already occupied/i);
    expect(fs.readFileSync(path.join(vaultRoot, "notes", "daily.md"), "utf8")).toBe(
      "new file\n",
    );
  });
});
