import { describe, expect, it } from "vitest";
import { repairSplitSurrogateEntities } from "@/features/notes/markdown/surrogate-repair";

describe("repairSplitSurrogateEntities", () => {
  it("returns unchanged text when no &#x entities exist", () => {
    expect(repairSplitSurrogateEntities("hello world")).toBe("hello world");
    expect(repairSplitSurrogateEntities("你好 🙂 世界")).toBe("你好 🙂 世界");
  });

  it("repairs encoded high surrogate followed by raw low surrogate for 🙂 (U+1F642)", () => {
    // 🙂 = \uD83D\uDE42. High surrogate = D83D, Low surrogate = DE42
    const input = "**word\\***&#xD83D;\uDE42word";
    const expected = "**word\\***&#x1F642;word";
    expect(repairSplitSurrogateEntities(input)).toBe(expected);
  });

  it("repairs raw high surrogate followed by encoded low surrogate", () => {
    const input = "word\uD83D&#xDE42;**word**";
    const expected = "word&#x1F642;**word**";
    expect(repairSplitSurrogateEntities(input)).toBe(expected);
  });

  it("preserves unrelated hex entities", () => {
    expect(repairSplitSurrogateEntities("hello &#x26; world")).toBe("hello &#x26; world");
    expect(repairSplitSurrogateEntities("&#x4E2D;&#x6587;")).toBe("&#x4E2D;&#x6587;");
  });
});
