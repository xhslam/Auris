import { describe, expect, it } from "vitest";
import { wrap } from "@/components/nia/companion/bubble-wrap";

describe("bubble wrap formatting", () => {
  it("formats short single-line text without wrap", () => {
    const text = "Hello world";
    const res = wrap(text);
    expect(res.raw).toBe(text);
    expect(res.lines.length).toBe(1);
    expect(res.lines[0]).toBe("Hello world");
  });

  it("handles CJK characters and dense glyph boundaries", () => {
    const text = "今天的天气真好，我们一起去公园散步吧。";
    const res = wrap(text);
    expect(res.raw).toBe(text);
    expect(res.lines.length).toBeGreaterThanOrEqual(1);
    expect(res.lines.length).toBeLessThanOrEqual(5);
  });

  it("respects MAX_LINES limit and clamps to at most 5 lines", () => {
    const longText =
      "这是一段非常非常长的文字，用来测试气泡折行的上限。它包含了很多很多的句子，甚至超过了平常伴侣一次性会说出的长度。Nia在说话的时候，如果文字太多，气泡不能无限制地往上增高，而应该最多展示五行，保持在四百二十像素的窗口高度范围内。超过的部分会被适当排版或者截断。";
    const res = wrap(longText);
    expect(res.lines.length).toBeLessThanOrEqual(5);
  });
});
