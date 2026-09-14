import { afterEach, describe, expect, it } from "vitest";
import {
  READING_WORD_CARD_THEME_VARS,
  applyThemeVarsFromScope,
} from "@/components/workspace/floating-word-card-theme";

describe("applyThemeVarsFromScope", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("copies reading theme tokens onto a portaled surface", () => {
    const scope = document.createElement("div");
    scope.className = "reading-minimal";
    scope.style.setProperty("--reading-panel", "#232428");
    scope.style.setProperty("--reading-panel-foreground", "#d9d8dd");
    scope.style.setProperty("--reading-border", "#444");
    document.body.append(scope);

    const surface = document.createElement("div");
    document.body.append(surface);

    applyThemeVarsFromScope(
      surface,
      ".reading-minimal",
      READING_WORD_CARD_THEME_VARS,
    );

    expect(surface.style.getPropertyValue("--reading-panel").trim()).toBe(
      "#232428",
    );
    expect(
      surface.style.getPropertyValue("--reading-panel-foreground").trim(),
    ).toBe("#d9d8dd");
    expect(surface.style.getPropertyValue("--reading-border").trim()).toBe(
      "#444",
    );
  });
});
