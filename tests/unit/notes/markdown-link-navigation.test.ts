import { describe, expect, it } from "vitest";
import {
  findMarkdownHeadingLine,
  findMarkdownSourceLinkAt,
  getVaultRelativeMarkdownPath,
  resolveMarkdownLinkTarget,
} from "@/features/notes/documents/markdown-link-navigation";

describe("resolveMarkdownLinkTarget", () => {
  it("keeps a POSIX absolute target rooted at the path the Markdown names", () => {
    expect(
      resolveMarkdownLinkTarget(
        "/Users/me/记事本/A.md",
        "/Users/me/记事本/B.md",
      ),
    ).toEqual({ kind: "file", path: "/Users/me/记事本/A.md", fragment: "" });
  });

  it("resolves relative Windows targets on the source document drive", () => {
    expect(resolveMarkdownLinkTarget("A.md", "C:\\Users\\p\\notes\\B.md")).toEqual({
      kind: "file",
      path: "C:/Users/p/notes/A.md",
      fragment: "",
    });
  });

  it("recognizes Windows drive-rooted paths as paths rather than URI schemes", () => {
    expect(
      resolveMarkdownLinkTarget("C:\\Users\\p\\notes\\A.md", "C:\\Users\\p\\notes\\B.md"),
    ).toEqual({
      kind: "file",
      path: "C:/Users/p/notes/A.md",
      fragment: "",
    });
  });

  it("resolves relative vault links and decodes path and fragment safely", () => {
    expect(resolveMarkdownLinkTarget("../A%20one.md#章节%20一", "folder/B.md")).toEqual({
      kind: "file",
      path: "A one.md",
      fragment: "章节 一",
    });
    expect(resolveMarkdownLinkTarget("A.md#%zz", "/notes/B.md")).toEqual({
      kind: "file",
      path: "/notes/A.md",
      fragment: "%zz",
    });
  });

  it("opens only safe external schemes", () => {
    expect(resolveMarkdownLinkTarget("https://example.com/a", "note.md")).toEqual({
      kind: "external",
      href: "https://example.com/a",
    });
    expect(resolveMarkdownLinkTarget("mailto:person@example.com", "note.md").kind).toBe("external");
    expect(resolveMarkdownLinkTarget("javascript:alert(1)", "note.md")).toEqual({
      kind: "blocked",
      reason: "unsafe-scheme",
    });
    expect(resolveMarkdownLinkTarget("file:///etc/passwd", "note.md").kind).toBe("blocked");
    expect(resolveMarkdownLinkTarget("https://[broken", "note.md")).toEqual({
      kind: "blocked",
      reason: "invalid-url",
    });
  });

  it("refuses network, ambiguous drive, and vault-root escape paths", () => {
    expect(resolveMarkdownLinkTarget("\\\\host\\share\\A.md", "notes/B.md").kind).toBe("blocked");
    expect(resolveMarkdownLinkTarget("//host/share/A.md", "notes/B.md").kind).toBe("blocked");
    expect(resolveMarkdownLinkTarget("C:relative.md", "notes/B.md").kind).toBe("blocked");
    expect(resolveMarkdownLinkTarget("../A.md", "B.md")).toEqual({
      kind: "blocked",
      reason: "root-escape",
    });
    expect(resolveMarkdownLinkTarget("A.md", null)).toEqual({
      kind: "blocked",
      reason: "relative-without-source",
    });
  });
});

describe("getVaultRelativeMarkdownPath", () => {
  it("maps absolute paths under the authorized vault root", () => {
    expect(
      getVaultRelativeMarkdownPath("/Users/me/vault/folder/A.md", "/Users/me/vault"),
    ).toBe("folder/A.md");
    expect(getVaultRelativeMarkdownPath("/Users/me/elsewhere/A.md", "/Users/me/vault")).toBeNull();
  });

  it("matches Windows roots case-insensitively", () => {
    expect(getVaultRelativeMarkdownPath("c:/Vault/A.md", "C:\\vault")).toBe("A.md");
  });
});

describe("findMarkdownHeadingLine", () => {
  it("matches fragment slugs using the note's existing heading index", () => {
    expect(
      findMarkdownHeadingLine(
        [
          { depth: 2, line: 4, slug: "section-one", text: "Section One" },
          { depth: 2, line: 8, slug: "中文-标题", text: "中文 标题" },
        ],
        "Section One",
      ),
    ).toBe(4);
    expect(
      findMarkdownHeadingLine(
        [{ depth: 2, line: 8, slug: "中文-标题", text: "中文 标题" }],
        "#中文 标题",
      ),
    ).toBe(8);
  });

  it("reports missing fragments without throwing", () => {
    expect(findMarkdownHeadingLine([], "%zz")).toBeNull();
  });
});

describe("findMarkdownSourceLinkAt", () => {
  it("finds a file link from a modifier-click location in raw Markdown", () => {
    const source = "Read [the guide](../guides/A%20one.md) today";
    expect(findMarkdownSourceLinkAt(source, source.indexOf("A%20one"))).toEqual({
      href: "../guides/A%20one.md",
      from: 5,
      to: 38,
    });
  });

  it("does not treat code spans as links", () => {
    const source = "Example `[text](https://example.com)`";
    expect(findMarkdownSourceLinkAt(source, source.indexOf("text"))).toBeNull();
  });
});
