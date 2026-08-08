import { describe, expect, it } from "vitest";
import { resolvePersonalVocabEntry } from "@/features/dictionary/personal-vocab/personal-vocab";
import type { PersonalVocabEntry } from "@/features/dictionary/personal-vocab/personal-vocab.types";

function entry(lookupKey: string): PersonalVocabEntry {
  return {
    definition: `${lookupKey} definition`,
    fileName: `${lookupKey}.md`,
    lookupKey,
    partOfSpeech: "",
    pronunciations: [],
    sections: [],
    source: {},
    word: lookupKey[0]!.toUpperCase() + lookupKey.slice(1),
  };
}

describe("resolvePersonalVocabEntry", () => {
  it("resolves a regular plural to an indexed lemma", () => {
    expect(resolvePersonalVocabEntry("duties", [entry("duty")])?.lookupKey).toBe(
      "duty",
    );
  });

  it("resolves an irregular form to an indexed lemma", () => {
    expect(resolvePersonalVocabEntry("went", [entry("go")])?.lookupKey).toBe("go");
  });

  it("prefers an exact surface entry over derived entries", () => {
    expect(
      resolvePersonalVocabEntry("duties", [entry("duty"), entry("duties")])
        ?.lookupKey,
    ).toBe("duties");
  });

  it("prefers an exact irregular surface entry over its canonical lemma", () => {
    expect(
      resolvePersonalVocabEntry("went", [entry("went"), entry("go")])?.lookupKey,
    ).toBe("went");
  });

  it("keeps worker when an exact worker entry exists", () => {
    expect(
      resolvePersonalVocabEntry("worker", [entry("work"), entry("worke"), entry("worker")])
        ?.lookupKey,
    ).toBe("worker");
  });

  it("documents the current ordered heuristic policy when worker is absent", () => {
    expect(
      resolvePersonalVocabEntry("worker", [entry("work"), entry("worke")])?.lookupKey,
    ).toBe("worke");
  });

  it("does not resolve worker to the forbidden raw er stem", () => {
    expect(resolvePersonalVocabEntry("worker", [entry("work")])).toBeNull();
  });

  it("returns null when no exact or derived candidate is indexed", () => {
    expect(resolvePersonalVocabEntry("unresolved", [entry("other")])).toBeNull();
  });

  it("checks an indexed irregular lemma before heuristic candidates", () => {
    expect(
      resolvePersonalVocabEntry("better", [entry("good"), entry("bette")])
        ?.lookupKey,
    ).toBe("good");
  });

  it("does not resolve heuristic candidates below the minimum length", () => {
    expect(resolvePersonalVocabEntry("gas", [entry("ga")])).toBeNull();
  });

  it("does not stem a named inflection exception", () => {
    expect(resolvePersonalVocabEntry("news", [entry("new")])).toBeNull();
  });

  it("keeps the first owner of a duplicate lookup key for arrays and maps", () => {
    const firstOwner = { ...entry("duty"), fileName: "first-duty.md" };
    const duplicateOwner = { ...entry("duty"), fileName: "duplicate-duty.md" };
    const lookupMap = new Map([["duty", firstOwner]]);

    expect(
      resolvePersonalVocabEntry("duty", [firstOwner, duplicateOwner]),
    ).toBe(firstOwner);
    expect(resolvePersonalVocabEntry("duty", lookupMap)).toBe(firstOwner);
  });
});
