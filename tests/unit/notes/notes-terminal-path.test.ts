import { describe, expect, it } from "vitest";
import { formatTerminalPath } from "@/components/notes-v2/terminal/notes-terminal-path";

describe("formatTerminalPath", () => {
  it("returns empty string for empty or whitespace-only input", () => {
    expect(formatTerminalPath("")).toBe("");
    expect(formatTerminalPath("   ")).toBe("");
  });

  it("leaves standard paths without spaces or special characters unquoted", () => {
    expect(formatTerminalPath("/tmp/auris-terminal-image.png")).toBe(
      "/tmp/auris-terminal-image.png",
    );
    expect(formatTerminalPath("C:\\Users\\user\\image.png")).toBe(
      // Backslash is a special character, so it should be properly escaped and quoted
      '"C:\\\\Users\\\\user\\\\image.png"',
    );
  });

  it("quotes paths with spaces and escapes special characters", () => {
    expect(
      formatTerminalPath("/Users/apple/Desktop/My Photos/screenshot.png"),
    ).toBe('"/Users/apple/Desktop/My Photos/screenshot.png"');

    expect(formatTerminalPath("/tmp/image$file.png")).toBe('"/tmp/image\\$file.png"');

    expect(formatTerminalPath('/tmp/image"quote".png')).toBe(
      '"/tmp/image\\"quote\\".png"',
    );

    expect(formatTerminalPath("/tmp/image(1).png")).toBe('"/tmp/image(1).png"');
  });

  it("trims surrounding whitespace before checking", () => {
    expect(formatTerminalPath("  /tmp/screenshot.png  ")).toBe(
      "/tmp/screenshot.png",
    );
  });
});
