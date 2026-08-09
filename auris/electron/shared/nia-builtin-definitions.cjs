"use strict";

/**
 * 随 Auris 一同发布的内置 Nia 定义（原始源文本）。
 *
 * 为什么放在 `electron/shared/` 而不是继续留在 `src/features/nia/`：主进程
 * （`main.cjs`，CommonJS）需要在创建定义存储时把内置定义传进去，而它不能
 * `require` 一个 TS 模块。原先内置定义只存在于 TS 侧，于是主进程只能用
 * `builtins: []` 创建存储——两个内置定义因此从未真正被装载，只有测试在读它们。
 *
 * 这里只存**原始 Markdown+frontmatter 源文本**，不存预解析的 AST：渲染层与
 * 主进程各自通过打包好的 `nia-definition-contract.cjs` 独立重解析。即使是随代码
 * 发布的内置定义，也不把一个预解析对象当作可信输入——这是契约模块的既有立场，
 * 换个位置存放不该改变它。
 *
 * @module electron/shared/nia-builtin-definitions
 */

const IMPROVE_CLARITY_SOURCE = `---
nia: v1
id: improve-clarity
description: Improve clarity and flow while preserving voice and intent.
scope: selection
category: editing
action: replace
approval: ask
input:
  type: text
  description: Selected text to improve
output:
  type: text
  description: Improved text
tags:
  - editing
  - clarity
---

You are an expert editor. Improve the clarity, flow, and conciseness of the
following text while preserving the author's voice and intent.

Return only the improved text — no explanations.

{{content}}
`;

const SUMMARIZE_SOURCE = `---
nia: v1
id: summarize
description: Summarize the selection or document into a short digest.
scope: document
category: summarizing
action: insert
approval: ask
input:
  type: text
  description: Text to summarize
output:
  type: text
  description: Summary
tags:
  - summarizing
---

Summarize the following text into a concise digest that captures the key
points. Preserve important names, numbers, and decisions.

{{content}}
`;

const BUILT_IN_NIA_DEFINITIONS = Object.freeze([
  Object.freeze({ name: "improve-clarity", source: IMPROVE_CLARITY_SOURCE }),
  Object.freeze({ name: "summarize", source: SUMMARIZE_SOURCE }),
]);

module.exports = {
  BUILT_IN_NIA_DEFINITIONS,
};
