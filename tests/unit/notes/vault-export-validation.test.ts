import { describe, expect, it } from "vitest";
import { createNoteDocument } from "@/features/notes/documents/document-repository";
import { buildVaultExportManifest } from "@/features/notes/vault/vault-export-manifest";
import { validateVaultExportManifest } from "@/features/notes/vault/vault-export-validation";
import type { VaultSnapshot } from "@/features/notes/vault/vault-types";

function createDocument(path: string, rawSource: string) {
  return createNoteDocument({
    mtime: "2026-05-03T00:00:00.000Z",
    path,
    rawSource,
  });
}

describe("vault-export-validation", () => {
  it("accepts a manifest built from the current vault snapshot", () => {
    const daily = createDocument("notes/daily.md", "# Daily\n\nPractice.");
    const snapshot: VaultSnapshot = {
      backlinks: {
        "notes/daily.md": [],
      },
      documents: [daily],
      entries: [
        {
          kind: "file",
          mtime: "2026-05-03T00:00:00.000Z",
          name: "daily.md",
          path: "notes/daily.md",
          size: 40,
        },
        {
          kind: "file",
          mtime: "2026-05-03T00:00:00.000Z",
          name: "lesson.wav",
          path: "assets/lesson.wav",
          size: 2048,
        },
      ],
      generatedAt: "2026-05-03T00:00:00.000Z",
      rootPath: "C:/vault",
    };

    const manifest = buildVaultExportManifest(snapshot);
    const validation = validateVaultExportManifest(manifest);

    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

  it("rejects a manifest that drops an exported file", () => {
    const daily = createDocument("notes/daily.md", "# Daily\n\nPractice.");
    const snapshot: VaultSnapshot = {
      backlinks: {
        "notes/daily.md": [],
      },
      documents: [daily],
      entries: [
        {
          kind: "file",
          mtime: "2026-05-03T00:00:00.000Z",
          name: "daily.md",
          path: "notes/daily.md",
          size: 40,
        },
      ],
      generatedAt: "2026-05-03T00:00:00.000Z",
      rootPath: "C:/vault",
    };

    const manifest = buildVaultExportManifest(snapshot);
    const validation = validateVaultExportManifest({
      ...manifest,
      files: [],
    });

    expect(validation.valid).toBe(false);
    expect(validation.issues[0]?.message).toContain("notes/daily.md");
  });
});
