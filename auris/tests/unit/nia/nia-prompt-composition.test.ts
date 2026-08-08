/**
 * Nia 提示词合成规则。
 *
 * 这个模块修的是一个真实缺陷：`executeBuiltinStep` 解析出定义后只把用户原文
 * 交给 `executePrompt`，定义 body（那句 "You are an expert editor…"）被整条
 * 丢掉。所有相关测试都把 `executePrompt` 换成 `({ input }) => …`，正好替换掉
 * 本该做合成的那道缝，所以缺陷一直无人发现。这里直接测合成本身。
 */

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  CONTENT_SEPARATOR,
  composeNiaPrompt,
  formatNiaPromptContext,
} = require("../../../electron/shared/nia-prompt-composition.cjs");

describe("composeNiaPrompt", () => {
  it("substitutes the content placeholder in place", () => {
    expect(
      composeNiaPrompt({
        body: "Improve this:\n\n{{content}}\n\nReturn only the result.",
        content: "rough draft",
      }),
    ).toBe("Improve this:\n\nrough draft\n\nReturn only the result.");
  });

  it("substitutes every occurrence, not just the first", () => {
    // 带 /g 的正则用 test() 会推进 lastIndex；不归零的话 replace 会从那个位置
    // 起找，第一个占位符被跳过。这条用例正是为那个错误准备的。
    expect(
      composeNiaPrompt({ body: "{{content}} then {{content}}", content: "X" }),
    ).toBe("X then X");
  });

  it("tolerates whitespace inside the placeholder braces", () => {
    expect(composeNiaPrompt({ body: "{{  content  }}", content: "X" })).toBe("X");
  });

  it("appends the content when the body declares no insertion point", () => {
    // 这是本次修复的核心：body 没有 {{content}} 时，不能把指令单独发出去——
    // 模型会收到「改进下面这段文字」而下面什么都没有。
    expect(
      composeNiaPrompt({ body: "Summarize the text.", content: "long text" }),
    ).toBe(`Summarize the text.${CONTENT_SEPARATOR}long text`);
  });

  it("does not append a separator when there is no content to append", () => {
    expect(composeNiaPrompt({ body: "Just instructions.", content: "" })).toBe(
      "Just instructions.",
    );
  });

  it("returns bare content when the body is empty", () => {
    expect(composeNiaPrompt({ body: "", content: "only content" })).toBe("only content");
  });

  it("fills the context placeholder and empties it when no context is given", () => {
    expect(
      composeNiaPrompt({
        body: "Context:\n{{context}}\n---\n{{content}}",
        content: "C",
        context: "[Before]\nB",
      }),
    ).toBe("Context:\n[Before]\nB\n---\nC");

    expect(
      composeNiaPrompt({ body: "Context:{{context}}|{{content}}", content: "C" }),
    ).toBe("Context:|C");
  });

  it("leaves unknown placeholders untouched instead of failing the run", () => {
    // 与工作流 `with:` 映射的规则相反，且是有意的：定义 body 是散文体提示词，
    // 里面的 {{example}} 更可能是作者想让模型看到的字面内容。为它拒绝执行，
    // 比原样透传更糟。
    expect(
      composeNiaPrompt({ body: "Use {{example}} on {{content}}", content: "C" }),
    ).toBe("Use {{example}} on C");
  });

  it("treats non-string inputs as empty rather than stringifying them", () => {
    // 防的是 "undefined" / "[object Object]" 被当作提示词内容发给模型。
    expect(
      composeNiaPrompt({
        body: undefined as unknown as string,
        content: undefined as unknown as string,
      }),
    ).toBe("");
  });
});

describe("formatNiaPromptContext", () => {
  it("emits only the non-empty side", () => {
    expect(formatNiaPromptContext({ before: "B", after: "" })).toBe("[Before]\nB");
    expect(formatNiaPromptContext({ before: "", after: "A" })).toBe("[After]\nA");
  });

  it("joins both sides with a blank line", () => {
    expect(formatNiaPromptContext({ after: "A", before: "B" })).toBe(
      "[Before]\nB\n\n[After]\nA",
    );
  });

  it("returns an empty string when there is no context at all", () => {
    expect(formatNiaPromptContext()).toBe("");
    expect(formatNiaPromptContext({})).toBe("");
  });
});
