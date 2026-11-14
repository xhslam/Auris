import { describe, expect, it } from "vitest";
import { createPacer, wordAt } from "@/components/nia/companion/bubble-pace";
import { createUtterance } from "@/components/nia/companion/bubble-utterance";

describe("bubble pace and utterance state machine", () => {
  it("computes word span around index for CJK glyph and English word", () => {
    expect(wordAt("hello world", 1)).toEqual({ from: 0, to: 5 });
    expect(wordAt("今天学习", 2)).toEqual({ from: 2, to: 3 });
  });

  it("advances index proportionally without overshoot using advanceTo with CJK cost", () => {
    const pacer = createPacer();
    pacer.wrote("你好世界");
    pacer.began();
    pacer.step(0.1, true);
    expect(pacer.at()).toBe(0);

    pacer.step(0.2, true);
    expect(pacer.at()).toBe(1);
  });

  it("handles utterance lifecycle from wrote to speaks and finished", () => {
    const utterance = createUtterance();
    utterance.wrote("resp_1", "你好呀");
    expect(utterance.text()).toBe("你好呀");
    expect(utterance.begun()).toBe(false);

    utterance.speaks("resp_1");
    expect(utterance.begun()).toBe(true);

    utterance.finished("resp_1", true);
    expect(utterance.begun()).toBe(true);
  });
});
