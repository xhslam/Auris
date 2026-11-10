import { describe, expect, it } from "vitest";
import { relativeNotesImagePath } from "@/features/notes/editor/notes-image-path";

describe("image attachment document paths", () => {
  it("retains a normal relative document path", () => {
    expect(relativeNotesImagePath("notes/a.md", "/vault")).toBe("notes/a.md");
  });
  it("normalizes an absolute opened note inside the Vault", () => {
    expect(relativeNotesImagePath("/vault/notes/a.md", "/vault")).toBe("notes/a.md");
  });
  it("recognizes macOS /var system symlink paths", () => {
    expect(relativeNotesImagePath("/private/var/tmp/vault/a.md", "/var/tmp/vault")).toBe("a.md");
  });
  it("normalizes Windows separators and root casing", () => {
    expect(relativeNotesImagePath("c:\\Vault\\notes\\a.md", "C:\\vault")).toBe("notes/a.md");
  });
  it("rejects traversal segments before writing attachments", () => {
    expect(() => relativeNotesImagePath("/vault/../other/a.md", "/vault")).toThrow("路径无效");
  });
  it("rejects an outside note and similarly named roots", () => {
    expect(() => relativeNotesImagePath("/vault-other/a.md", "/vault")).toThrow("当前工作区");
    expect(() => relativeNotesImagePath("/other/a.md", "/vault")).toThrow("当前工作区");
  });
});
