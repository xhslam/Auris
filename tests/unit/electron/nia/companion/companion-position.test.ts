import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { clampPlacement, defaultPlacement, normalizePlacement } = require("../../../../../electron/nia/companion/companion-position.cjs");

describe("companion placement", () => {
  const workArea = { x: 100, y: 50, width: 1000, height: 700 };
  it("normalizes and clamps saved positions into a visible edge", () => {
    expect(normalizePlacement({ displayId: 7, x: "bad", y: 20 })).toEqual({ displayId: null, x: 0, y: 20 });
    expect(clampPlacement({ displayId: "main", x: -1000, y: -1000 }, workArea, { width: 320, height: 360 })).toEqual({ displayId: "main", x: -202, y: -292 });
  });
  it("defaults to the bottom-right without hanging entirely off screen", () => {
    expect(defaultPlacement(workArea, { width: 320, height: 360 })).toEqual({ displayId: null, x: 762, y: 372 });
  });
});
