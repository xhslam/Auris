import { describe, expect, it } from "vitest";
import { parseStructuredData } from "@/features/notes/formats/structured-data";

describe("structured data parser", () => {
  it("parses JSON and JSONL", () => {
    expect(parseStructuredData("json", '{"course":"English"}')).toEqual({
      ok: true,
      value: { course: "English" },
    });
    expect(parseStructuredData("jsonl", '{"word":"one"}\n{"word":"two"}')).toEqual({
      ok: true,
      value: [{ word: "one" }, { word: "two" }],
    });
  });

  it("parses YAML and TOML", () => {
    expect(parseStructuredData("yaml", "course: English\nlevel: 2")).toEqual({
      ok: true,
      value: { course: "English", level: 2 },
    });
    expect(parseStructuredData("toml", 'course = "English"\nlevel = 2')).toEqual({
      ok: true,
      value: { course: "English", level: 2 },
    });
  });

  it("returns bounded diagnostics instead of throwing", () => {
    const result = parseStructuredData("json", '{"broken":');

    expect(result).toMatchObject({
      ok: false,
      error: {
        message: expect.any(String),
      },
    });
  });

  it("rejects payloads above the preview budget", () => {
    expect(parseStructuredData("json", `"${"x".repeat(2 * 1024 * 1024)}"`)).toEqual({
      ok: false,
      error: {
        message: "Structured preview is limited to 2 MiB.",
      },
    });
  });
});
