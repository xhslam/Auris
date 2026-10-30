import { describe, expect, it } from "vitest";
import { normalizeFocusLayout, normalizeWeights, resizeTracks } from "@/components/desktop/terminal-focus/terminal-focus-layout";
import { DESKTOP_NAV_ITEMS } from "@/components/desktop/desktop-shell-fixtures";

describe("terminal focus layout", () => {
  it("registers an independent desktop route", () => {
    expect(DESKTOP_NAV_ITEMS.find((item) => item.id === "terminal")).toMatchObject({ href: "/terminal", label: "终端模式" });
  });
  it("bounds columns and discards malformed or unsafe track sizes", () => {
    for (const columns of [0, 9, NaN, -1, "4", null]) expect(normalizeFocusLayout({ columns }).columns).toBe(2);
    expect(normalizeFocusLayout({ columns: 4 }).columnWeights).toEqual([.25, .25, .25, .25]);
    expect(normalizeFocusLayout({ rowWeights: Array(99).fill(1) }).rowWeights).toEqual([]);
    expect(normalizeWeights([Infinity, .5], 2)).toEqual([.5, .5]);
    expect(normalizeWeights([0, 0], 2)).toEqual([.5, .5]);
    expect(normalizeWeights([.2, .6], 2)).toEqual([.25, .7499999999999999]);
  });
  it("resizes only adjacent tracks and clamps both to a usable positive fraction", () => {
    expect(resizeTracks([.25, .25, .25, .25], 1, .1)).toEqual([.25, .35, .15000000000000002, .25]);
    const extreme = resizeTracks([.25, .25, .25, .25], 1, 99);
    expect(extreme.reduce((a, b) => a + b)).toBeCloseTo(1);
    expect(extreme[2]).toBeCloseTo(.08);
    expect(resizeTracks([.5, .5], 0, NaN)).toEqual([.5, .5]);
  });
});
