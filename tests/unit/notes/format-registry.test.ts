import { describe, expect, it } from "vitest";
import {
  getFormatDescriptor,
  listRegisteredFormats,
} from "@/features/notes/formats/format-registry";
import { getVaultEntryDisplayKind } from "@/features/notes/vault/vault-path";

describe("notes format registry", () => {
  it.each([
    ["notes/a.csv", "csv"],
    ["notes/a.json", "json"],
    ["notes/a.tsv", "tsv"],
    ["notes/a.jsonl", "jsonl"],
    ["notes/a.yaml", "yaml"],
    ["notes/a.yml", "yaml"],
    ["notes/a.toml", "toml"],
    ["notes/a.md", "markdown"],
  ])("maps %s to %s", (path, formatId) => {
    expect(getFormatDescriptor(path).id).toBe(formatId);
  });

  it("falls back to an attachment descriptor", () => {
    expect(getFormatDescriptor("notes/archive.zip")).toMatchObject({
      canEdit: false,
      id: "attachment",
      previewKind: "none",
    });
  });

  it("falls back to a source-only text editor for unknown paths", () => {
    expect(getFormatDescriptor("project/Dockerfile")).toMatchObject({
      canEdit: true,
      id: "unknown-text",
      previewKind: "none",
    });
    expect(getFormatDescriptor("logs/build.log").id).toBe("text");
  });

  it("keeps the registry immutable and extension-unique", () => {
    const formats = listRegisteredFormats();
    const extensions = formats.flatMap((format) => format.extensions);

    expect(new Set(extensions).size).toBe(extensions.length);
    expect(Object.isFrozen(formats)).toBe(true);
    expect(formats.every(Object.isFrozen)).toBe(true);
  });

  it("classifies structured data separately in the vault", () => {
    expect(getVaultEntryDisplayKind("data.csv")).toBe("structured-data");
    expect(getVaultEntryDisplayKind("data.json")).toBe("structured-data");
    expect(getVaultEntryDisplayKind("config.yaml")).toBe("structured-data");
    expect(getVaultEntryDisplayKind("Cargo.toml")).toBe("structured-data");
    expect(getVaultEntryDisplayKind("Dockerfile")).toBe("text");
  });
});
