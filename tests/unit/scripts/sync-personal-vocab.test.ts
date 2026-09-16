import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { buildPersonalVocabIndex } = require("../../../scripts/sync-personal-vocab.cjs") as typeof import("../../../scripts/sync-personal-vocab.cjs");

const temporaryDirectories: string[] = [];

function createSourceDirectory(files: Record<string, string>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "auris-vocab-sync-"));
  temporaryDirectories.push(directory);

  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, fileName), content, "utf8");
  }

  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      fs.rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe("sync-personal-vocab", () => {
  it("parses both legacy second-level and current first-level word headings", () => {
    const directory = createSourceDirectory({
      "0001-legacy.md": "## Legacy  /ˈleɡəsi/  旧格式词条\n\n### 当前语境\n\n- legacy context\n",
      "0002-current.md": "# Current\n\n**音标：** /ˈkʌrənt/\n**词性：** adjective\n**释义：** 新格式词条\n\n## 核心语义\n\n- current context\n",
      "0003-phrase.md": "## Be/Have To Do With  /biː; hæv tə duː wɪð/  与……有关\n",
    });

    expect(buildPersonalVocabIndex(directory).entries.map((entry) => entry.lookupKey)).toEqual([
      "legacy",
      "current",
      "be-have-to-do-with",
    ]);
    expect(buildPersonalVocabIndex(directory).entries[1]).toMatchObject({
      definition: "新格式词条",
      partOfSpeech: "adjective",
      pronunciations: ["/ˈkʌrənt/"],
    });
  });

  it("keeps the first filename-ordered entry for a duplicate lookup key", () => {
    const directory = createSourceDirectory({
      "0002-duplicate.md": "# Duplicate  /djuːplɪkət/  later\n",
      "0001-duplicate.md": "## Duplicate  /djuːplɪkət/  canonical\n",
    });

    const index = buildPersonalVocabIndex(directory);

    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]).toMatchObject({
      definition: "canonical",
      fileName: "0001-duplicate.md",
      lookupKey: "duplicate",
    });
    expect(index.duplicateKeys).toEqual(["duplicate"]);
  });
});
