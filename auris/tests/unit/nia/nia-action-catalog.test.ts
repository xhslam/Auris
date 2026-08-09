/**
 * Nia 动作目录的纯逻辑。
 *
 * 覆盖点对齐 vmark `geniesStore.test.ts` + `GeniePicker.test.tsx` 里关于搜索、
 * 分组、recents 的部分，另加 auris 特有的 `workflow-step` 排除。
 */

import { describe, expect, it } from "vitest";
import {
  EMPTY_NIA_ACTION_PREFERENCES,
  MAX_NIA_ACTION_RECENTS,
  buildNiaActionListing,
  formatNiaActionName,
  groupNiaActionsByCategory,
  pruneNiaActionPreferences,
  pushNiaActionRecent,
  resolveNiaActionFavorites,
  resolveNiaActionRecents,
  searchNiaActions,
  selectInvocableActions,
  toggleNiaActionFavorite,
  type NiaActionSummary,
} from "@/features/nia/nia-action-catalog";

function action(
  canonicalId: string,
  overrides: Partial<NiaActionSummary> = {},
): NiaActionSummary {
  return {
    canonicalId,
    description: `${canonicalId} description`,
    label: "Nia",
    provenance: "built-in",
    scope: "selection",
    sourceCompatibility: "canonical_v1",
    ...overrides,
  } as NiaActionSummary;
}

describe("selectInvocableActions", () => {
  it("drops workflow-step definitions, which have no selection to act on", () => {
    const kept = selectInvocableActions([
      action("polish"),
      action("summarize", { scope: "document" }),
      action("extract-terms", { scope: "workflow-step" as NiaActionSummary["scope"] }),
    ]);

    expect(kept.map((entry) => entry.canonicalId)).toEqual(["polish", "summarize"]);
  });
});

describe("formatNiaActionName", () => {
  it("turns a kebab-case id into a readable title", () => {
    expect(formatNiaActionName("fix-grammar")).toBe("Fix Grammar");
    expect(formatNiaActionName("summarize")).toBe("Summarize");
  });
});

describe("searchNiaActions", () => {
  const definitions = [
    action("improve-clarity", { category: "editing", description: "Improve flow." }),
    action("summarize", {
      category: "summarizing",
      description: "Condense a document.",
      scope: "document",
    }),
    action("translate", { tags: ["language", "i18n"] }),
  ];

  it("returns everything invocable for an empty query", () => {
    expect(searchNiaActions(definitions, "")).toHaveLength(3);
    expect(searchNiaActions(definitions, "   ")).toHaveLength(3);
  });

  it("matches the id, description, and category", () => {
    expect(searchNiaActions(definitions, "clarity").map((entry) => entry.canonicalId)).toEqual([
      "improve-clarity",
    ]);
    expect(searchNiaActions(definitions, "condense").map((entry) => entry.canonicalId)).toEqual([
      "summarize",
    ]);
    expect(searchNiaActions(definitions, "editing").map((entry) => entry.canonicalId)).toEqual([
      "improve-clarity",
    ]);
  });

  it("matches tags, which the definition contract treats as a first-class field", () => {
    expect(searchNiaActions(definitions, "i18n").map((entry) => entry.canonicalId)).toEqual([
      "translate",
    ]);
  });

  it("is case-insensitive", () => {
    expect(searchNiaActions(definitions, "CLARITY")).toHaveLength(1);
  });

  it("narrows by scope", () => {
    expect(searchNiaActions(definitions, "", "document").map((entry) => entry.canonicalId)).toEqual(
      ["summarize"],
    );
    expect(searchNiaActions(definitions, "", "selection")).toHaveLength(2);
  });
});

describe("groupNiaActionsByCategory", () => {
  it("sorts named categories and keeps uncategorized last", () => {
    const grouped = groupNiaActionsByCategory([
      action("zeta", { category: "writing" }),
      action("alpha", { category: "editing" }),
      action("loose"),
      action("beta", { category: "editing" }),
    ]);

    expect(grouped.map((group) => group.category)).toEqual(["editing", "writing", null]);
    expect(grouped[0].actions.map((entry) => entry.canonicalId)).toEqual(["alpha", "beta"]);
  });

  it("uses a null key rather than inventing an 'Uncategorized' category name", () => {
    // 一个真的把定义归到 category: uncategorized 的作者不该和未分类混在一起。
    const grouped = groupNiaActionsByCategory([
      action("real", { category: "uncategorized" }),
      action("none"),
    ]);

    expect(grouped.map((group) => group.category)).toEqual(["uncategorized", null]);
    expect(grouped[0].actions.map((entry) => entry.canonicalId)).toEqual(["real"]);
    expect(grouped[1].actions.map((entry) => entry.canonicalId)).toEqual(["none"]);
  });

  it("omits the uncategorized group entirely when every action has a category", () => {
    const grouped = groupNiaActionsByCategory([action("a", { category: "editing" })]);
    expect(grouped).toHaveLength(1);
  });
});

describe("recents and favorites", () => {
  it("moves a repeated action to the front instead of duplicating it", () => {
    let recents = pushNiaActionRecent([], "a");
    recents = pushNiaActionRecent(recents, "b");
    recents = pushNiaActionRecent(recents, "a");

    expect(recents).toEqual(["a", "b"]);
  });

  it("caps recents", () => {
    let recents: string[] = [];
    for (let index = 0; index < MAX_NIA_ACTION_RECENTS + 5; index += 1) {
      recents = pushNiaActionRecent(recents, `action-${index}`);
    }

    expect(recents).toHaveLength(MAX_NIA_ACTION_RECENTS);
    // 最近的在最前。
    expect(recents[0]).toBe(`action-${MAX_NIA_ACTION_RECENTS + 4}`);
  });

  it("toggles a favorite both ways", () => {
    const once = toggleNiaActionFavorite([], "a");
    expect(once).toEqual(["a"]);
    expect(toggleNiaActionFavorite(once, "a")).toEqual([]);
  });

  it("resolves recents in MRU order and drops names that no longer exist", () => {
    const definitions = [action("a"), action("b")];
    const resolved = resolveNiaActionRecents(definitions, ["b", "deleted", "a"]);

    expect(resolved.map((entry) => entry.canonicalId)).toEqual(["b", "a"]);
  });

  it("resolves favorites in stable alphabetical order, not click order", () => {
    const definitions = [action("zeta"), action("alpha")];
    const resolved = resolveNiaActionFavorites(definitions, ["zeta", "alpha"]);

    // 收藏是一个稳定的清单，不该随最后一次点击重排。
    expect(resolved.map((entry) => entry.canonicalId)).toEqual(["alpha", "zeta"]);
  });

  it("prunes preferences against the current definition list", () => {
    const pruned = pruneNiaActionPreferences([action("a")], {
      favorites: ["a", "gone"],
      recents: ["gone", "a"],
    });

    expect(pruned.favorites).toEqual(["a"]);
    expect(pruned.recents).toEqual(["a"]);
  });

  it("prunes workflow-step names too, since they never belonged in the picker", () => {
    const pruned = pruneNiaActionPreferences(
      [action("step", { scope: "workflow-step" as NiaActionSummary["scope"] })],
      { favorites: ["step"], recents: ["step"] },
    );

    expect(pruned.favorites).toEqual([]);
    expect(pruned.recents).toEqual([]);
  });
});

describe("buildNiaActionListing", () => {
  const definitions = [
    action("improve-clarity", { category: "editing" }),
    action("rephrase", { category: "editing" }),
    action("summarize", { category: "summarizing", scope: "document" }),
    action("loose-one"),
  ];

  it("segments favorites, recents, and the rest when not searching", () => {
    const listing = buildNiaActionListing(definitions, {
      preferences: { favorites: ["summarize"], recents: ["rephrase"] },
      query: "",
      scope: null,
    });

    expect(listing.isSearching).toBe(false);
    expect(listing.favorites.map((entry) => entry.canonicalId)).toEqual(["summarize"]);
    expect(listing.recents.map((entry) => entry.canonicalId)).toEqual(["rephrase"]);
    // 已经出现在 favorites/recents 的不再重复出现在分组里。
    expect(listing.grouped.flatMap((group) => group.actions).map((entry) => entry.canonicalId)).toEqual(
      ["improve-clarity", "loose-one"],
    );
  });

  it("never lists one action twice across segments", () => {
    const listing = buildNiaActionListing(definitions, {
      preferences: { favorites: ["rephrase"], recents: ["rephrase"] },
      query: "",
      scope: null,
    });

    const ids = listing.ordered.map((entry) => entry.canonicalId);
    expect(new Set(ids).size).toBe(ids.length);
    // 同时被收藏和最近使用时，只算收藏。
    expect(listing.recents).toHaveLength(0);
  });

  it("gives a flat ordered list for keyboard navigation", () => {
    const listing = buildNiaActionListing(definitions, {
      preferences: { favorites: ["summarize"], recents: ["rephrase"] },
      query: "",
      scope: null,
    });

    expect(listing.ordered.map((entry) => entry.canonicalId)).toEqual([
      "summarize",
      "rephrase",
      "improve-clarity",
      "loose-one",
    ]);
  });

  it("drops the segments while searching so a match cannot appear twice", () => {
    const listing = buildNiaActionListing(definitions, {
      preferences: { favorites: ["rephrase"], recents: ["rephrase"] },
      query: "rephrase",
      scope: null,
    });

    expect(listing.isSearching).toBe(true);
    expect(listing.favorites).toHaveLength(0);
    expect(listing.recents).toHaveLength(0);
    expect(listing.ordered.map((entry) => entry.canonicalId)).toEqual(["rephrase"]);
  });

  it("applies the scope filter to every segment", () => {
    const listing = buildNiaActionListing(definitions, {
      preferences: { favorites: ["summarize"], recents: ["rephrase"] },
      query: "",
      scope: "document",
    });

    // summarize 是唯一的 document 作用域动作，它在收藏里，所以分组为空。
    expect(listing.favorites.map((entry) => entry.canonicalId)).toEqual(["summarize"]);
    expect(listing.recents).toHaveLength(0);
    expect(listing.ordered.map((entry) => entry.canonicalId)).toEqual(["summarize"]);
  });

  it("returns empty segments for an empty catalog", () => {
    const listing = buildNiaActionListing([], {
      preferences: EMPTY_NIA_ACTION_PREFERENCES,
      query: "",
      scope: null,
    });

    expect(listing.ordered).toEqual([]);
    expect(listing.grouped).toEqual([]);
  });
});
