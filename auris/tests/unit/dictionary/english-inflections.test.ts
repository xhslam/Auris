import { describe, expect, it } from "vitest";
import {
  getEnglishLemmaCandidates,
  getIrregularEnglishLemma,
} from "@/features/dictionary/personal-vocab/english-inflections";

describe("getEnglishLemmaCandidates", () => {
  it.each([
    ["duties", ["duty", "dutie"]],
    ["studied", ["study"]],
    ["boxes", ["box", "boxe"]],
    ["uses", ["use"]],
    ["cats", ["cat"]],
    ["loved", ["love", "lov"]],
    ["stopped", ["stoppe", "stopp", "stop"]],
    ["making", ["mak", "make"]],
    ["running", ["runn", "runne", "run"]],
    ["happier", ["happy"]],
    ["happiest", ["happy"]],
    ["larger", ["large"]],
    ["largest", ["large"]],
  ])("generates ordered candidates for %s", (word, candidates) => {
    expect(getEnglishLemmaCandidates(word)).toEqual(candidates);
  });

  it("uses only the first matching suffix family", () => {
    expect(getEnglishLemmaCandidates("duties")).not.toContain("duti");
    expect(getEnglishLemmaCandidates("studied")).not.toContain("studi");
  });

  it.each(["news", "series", "species", "status"])(
    "does not stem the exception %s",
    (word) => {
      expect(getEnglishLemmaCandidates(word)).toEqual([]);
    },
  );

  it("does not apply heuristics to words of three letters or fewer", () => {
    expect(getEnglishLemmaCandidates("s")).toEqual([]);
    expect(getEnglishLemmaCandidates("is")).toEqual([]);
    expect(getEnglishLemmaCandidates("gas")).toEqual([]);
    expect(getEnglishLemmaCandidates("ties").every((word) => word.length >= 3)).toBe(
      true,
    );
  });

  it("applies heuristics at the four-letter boundary", () => {
    expect(getEnglishLemmaCandidates("ties")).toEqual(["tie"]);
    expect(getEnglishLemmaCandidates("dogs")).toEqual(["dog"]);
  });

  it("does not stem protected s endings", () => {
    expect(getEnglishLemmaCandidates("glass")).toEqual([]);
    expect(getEnglishLemmaCandidates("focus")).toEqual([]);
    expect(getEnglishLemmaCandidates("axis")).toEqual([]);
  });

  it("guards consonant undoubling and removes duplicate candidates", () => {
    expect(getEnglishLemmaCandidates("snowwed")).toEqual(["snowwe", "snoww"]);
    const candidates = getEnglishLemmaCandidates("stopped");
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates).not.toContain("stopped");
  });

  it("does not emit raw er/est stems or handle unrelated suffixes", () => {
    expect(getEnglishLemmaCandidates("worker")).toEqual(["worke"]);
    expect(getEnglishLemmaCandidates("dutiful")).toEqual([]);
  });
});

describe("getIrregularEnglishLemma", () => {
  it.each([
    ["children", "child"],
    ["men", "man"],
    ["women", "woman"],
    ["went", "go"],
    ["gone", "go"],
    ["better", "good"],
    ["best", "good"],
    ["worse", "bad"],
    ["worst", "bad"],
  ])("maps %s to %s", (word, lemma) => {
    expect(getIrregularEnglishLemma(word)).toBe(lemma);
  });

  it("returns null for regular and unknown words", () => {
    expect(getIrregularEnglishLemma("duties")).toBeNull();
    expect(getIrregularEnglishLemma("auris")).toBeNull();
  });

  it("does not read inherited Object.prototype properties", () => {
    expect(getIrregularEnglishLemma("constructor")).toBeNull();
    expect(getIrregularEnglishLemma("__proto__")).toBeNull();
  });
});
