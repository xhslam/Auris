import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function listSourceFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const children = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return listSourceFiles(entryPath);
      }

      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) {
        return [];
      }

      return [entryPath];
    }),
  );

  return children.flat();
}

describe("notes source of truth", () => {
  it("keeps the notes feature free of Supabase as an implicit content store", async () => {
    const notesDirectory = path.join(process.cwd(), "src", "features", "notes");
    const files = await listSourceFiles(notesDirectory);
    const matches: string[] = [];

    await Promise.all(
      files.map(async (filePath) => {
        const source = await readFile(filePath, "utf8");

        if (source.toLowerCase().includes("supabase")) {
          matches.push(path.relative(process.cwd(), filePath));
        }
      }),
    );

    expect(matches).toEqual([]);
  });
});
