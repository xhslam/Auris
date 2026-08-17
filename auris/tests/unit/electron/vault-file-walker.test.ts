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
    const walkVaultFiles = createVaultFileWalker({ readdir });
    const records = await walkVaultFiles("/vault");
    expect(records.map((record) => record.relativePath)).toEqual([
      "notes", "notes/a.md", "notes/empty", "z.md",
    ]);
    expect(records.find((record) => record.relativePath === "notes")?.isDirectory).toBe(true);
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
    const records = await createVaultFileWalker({ readdir })("/vault");
    expect(records).toHaveLength(count + 1);
    expect(records[0]?.relativePath).toBe("archive");
    expect(records.at(-1)?.relativePath).toBe("archive/note-149999.md");
  });
});
