import { describe, expect, it } from "vitest";
import {
  appendMediaReloadKey,
  resolveMarkdownImageSource,
} from "@/features/notes/editor/code-block-preview";

describe("Markdown image source policy", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "file:///etc/passwd",
    "blob:https://example.com/id",
    "data:text/html,<script>alert(1)</script>",
    "custom-protocol://resource",
    "//example.com/image.png",
    "/absolute/image.png",
    "C:\\absolute\\image.png",
    "~/private.png",
    "..",
    "../",
    "../../outside.png",
    "assets/../../../outside.png",
  ])("rejects untrusted or escaping source %s", (source) => {
    expect(resolveMarkdownImageSource(source, "notes/daily.md")).toBeNull();
  });

  it("rejects parent-relative paths when escaping above vault root", () => {
    expect(resolveMarkdownImageSource("../outside.png", "daily.md")).toBeNull();
  });

  it("allows parent-relative image paths within the vault", () => {
    expect(
      resolveMarkdownImageSource("../images/photo.png", "notes/chapter1/daily.md"),
    ).toBe("shadowing-media://vault/notes/images/photo.png");

    expect(
      resolveMarkdownImageSource("../outside.png", "notes/daily.md"),
    ).toBe("shadowing-media://vault/outside.png");
  });

  it.each([
    "https://example.com/image.png",
    "http://localhost:3000/image.png",
    "data:image/png;base64,aGVsbG8=",
    "data:image/jpeg;base64,aGVsbG8=",
    "data:image/webp;base64,aGVsbG8=",
  ])("allows an explicitly supported external image source %s", (source) => {
    expect(resolveMarkdownImageSource(source, "notes/daily.md")).toBe(source);
  });

  it("resolves a safe relative path against the owning note", () => {
    expect(
      resolveMarkdownImageSource(
        "<assets/课程 封面.png>",
        "notes/英语/daily.md",
      ),
    ).toBe(
      "shadowing-media://vault/notes/%E8%8B%B1%E8%AF%AD/assets/%E8%AF%BE%E7%A8%8B%20%E5%B0%81%E9%9D%A2.png",
    );
  });

  it("adds a bounded reload key only to local media URLs", () => {
    expect(
      resolveMarkdownImageSource("assets/hero.png", "notes/daily.md", 7),
    ).toBe("shadowing-media://vault/notes/assets/hero.png?v=7");
    expect(
      appendMediaReloadKey("shadowing-media://vault/assets/hero.png?size=large", 8),
    ).toBe("shadowing-media://vault/assets/hero.png?size=large&v=8");
    expect(appendMediaReloadKey("https://example.com/hero.png", 8)).toBe(
      "https://example.com/hero.png",
    );
    expect(appendMediaReloadKey("shadowing-media://vault/assets/hero.png", -1)).toBe(
      "shadowing-media://vault/assets/hero.png",
    );
  });
});
