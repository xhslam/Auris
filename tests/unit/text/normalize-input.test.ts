import { describe, expect, it } from "vitest";
import { normalizeInput } from "@/features/text/normalize-input";

describe("normalizeInput", () => {
  it("collapses broken lines into stable sentence text", () => {
    expect(normalizeInput("Hello\nworld.")).toBe("Hello world.");
  });

  it("throws when the input is empty after trimming", () => {
    expect(() => normalizeInput("   \n  ")).toThrow("TEXT_REQUIRED");
  });
});
