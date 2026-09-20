import { describe, expect, it } from "vitest";
import {
  customFontValue,
  parseCustomFont,
  quoteCustomFamily,
  sanitizeCustomFontFamily,
} from "@/features/notes/editor/custom-font";

describe("Custom font sanitization", () => {
  it("sanitizes valid font families across scripts", () => {
    expect(sanitizeCustomFontFamily("LXGW WenKai")).toBe("LXGW WenKai");
    expect(sanitizeCustomFontFamily("霞鹜文楷")).toBe("霞鹜文楷");
    expect(sanitizeCustomFontFamily("Fira Code")).toBe("Fira Code");
    expect(sanitizeCustomFontFamily("Noto Sans CJK SC")).toBe("Noto Sans CJK SC");
  });

  it("collapses internal whitespace and trims ends", () => {
    expect(sanitizeCustomFontFamily("  Fira    Code  ")).toBe("Fira Code");
  });

  it("rejects empty or whitespace-only inputs", () => {
    expect(sanitizeCustomFontFamily("")).toBeNull();
    expect(sanitizeCustomFontFamily("   ")).toBeNull();
  });

  it("rejects names exceeding max length (64 chars)", () => {
    const longName = "A".repeat(65);
    expect(sanitizeCustomFontFamily(longName)).toBeNull();
  });

  it("rejects quotes, backslashes, semicolons, brackets, and braces", () => {
    expect(sanitizeCustomFontFamily('Font"Name')).toBeNull();
    expect(sanitizeCustomFontFamily("Font'Name")).toBeNull();
    expect(sanitizeCustomFontFamily("Font`Name")).toBeNull();
    expect(sanitizeCustomFontFamily("Font; color: red")).toBeNull();
    expect(sanitizeCustomFontFamily("Font{color:red}")).toBeNull();
    expect(sanitizeCustomFontFamily("Font(url)")).toBeNull();
    expect(sanitizeCustomFontFamily("Font/Name")).toBeNull();
    expect(sanitizeCustomFontFamily("Font\\Name")).toBeNull();
    expect(sanitizeCustomFontFamily("Font, Another")).toBeNull();
  });

  it("rejects control and format characters", () => {
    expect(sanitizeCustomFontFamily("Font\nName")).toBeNull();
    expect(sanitizeCustomFontFamily("Font\u200BName")).toBeNull(); // zero-width space
  });

  it("parses custom font setting values", () => {
    expect(parseCustomFont("custom:LXGW WenKai")).toBe("LXGW WenKai");
    expect(parseCustomFont("custom:霞鹜文楷")).toBe("霞鹜文楷");
    expect(parseCustomFont("sans-serif")).toBeNull(); // curated key
    expect(parseCustomFont("custom:Bad;Font")).toBeNull(); // invalid
  });

  it("encodes custom font values and quotes families safely", () => {
    expect(customFontValue("LXGW WenKai")).toBe("custom:LXGW WenKai");
    expect(quoteCustomFamily("LXGW WenKai")).toBe('"LXGW WenKai"');
  });
});
