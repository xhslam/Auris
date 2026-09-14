import { describe, expect, it } from "vitest";
import { createVaultFileWalker } from "../../../electron/vault/vault-file-walker.cjs";

const directory = (name: string) => ({ isDirectory: () => true, name });
const file = (name: string) => ({ isDirectory: () => false, name });

describe("vault file walker", () => {
  it("lists nested files, empty directories, and skips root runtime state", async () => {
    const readdir = async (directoryPath: string) => {
      if (directoryPath === "/vault") {
        return [file("z.md"), directory("notes"), directory(".shadowing")];
      }
      if (directoryPath === "/vault/notes") return [file("a.md"), directory("empty")];
      if (directoryPath === "/vault/notes/empty") return [];
      throw new Error(`unexpected directory: ${directoryPath}`);
    };
    const stat = async (filePath: string) => ({
      mtime: new Date(
        filePath.endsWith("a.md") ? "2026-08-22T12:00:00.000Z" : "2026-08-21T12:00:00.000Z",
      ),
    });
    const walkVaultFiles = createVaultFileWalker({ readdir, stat });
    const records = await walkVaultFiles("/vault");
    expect(records.map((record) => record.relativePath)).toEqual([
      "notes", "notes/a.md", "notes/empty", "z.md",
    ]);
    expect(records.find((record) => record.relativePath === "notes")?.isDirectory).toBe(true);
    expect(records.find((record) => record.relativePath === "notes/a.md")?.mtime).toBe(
      "2026-08-22T12:00:00.000Z",
    );
  });

  it("handles a large nested subtree without expanding records into a call", async () => {
    const count = 150_000;
    const leaves = Array.from({ length: count }, (_, index) =>
      file(`note-${String(index).padStart(6, "0")}.md`),
    );
    const readdir = async (directoryPath: string) => {
      if (directoryPath === "/vault") return [directory("archive")];
      if (directoryPath === "/vault/archive") return leaves;
      throw new Error(`unexpected directory: ${directoryPath}`);
    };
    // This stress case verifies traversal/collection rather than filesystem metadata I/O.
    const stat = async () => ({ mtime: new Date("2026-08-22T12:00:00.000Z") });
    const records = await createVaultFileWalker({ readdir, stat })("/vault");
    expect(records).toHaveLength(count + 1);
    expect(records[0]?.relativePath).toBe("archive");
    expect(records.at(-1)?.relativePath).toBe("archive/note-149999.md");
  });
});
