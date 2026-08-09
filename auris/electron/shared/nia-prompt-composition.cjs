"use strict";

/**
 * 把一条 Nia 定义的 body 与用户内容合成为最终提示词。
 *
 * 为什么需要这个模块：定义的 body 是**模板**（内置定义里写着 `{{content}}`），
 * 而不是一条能直接发给 provider 的提示词。在它存在之前，`executeBuiltinStep`
 * 解析出定义后只把 `input`（用户原文）交给 `executePrompt`，body 被整条丢掉——
 * 于是 `uses: nia/improve-clarity` 实际发给模型的只有用户的原始文本，那句
 * "You are an expert editor…" 从未送达。所有相关测试都把 `executePrompt` 换成
 * `({ input }) => …`，正好替换掉了本该做合成的那道缝，所以这个缺陷一直无人发现。
 *
 * 为什么不直接复用工作流合约里的 `fillTemplate`：
 *
 * 1. **尺寸上限不同**。`fillTemplate` 对模板的上限是
 *    `NIA_WORKFLOW_LIMITS.template`（32,768 字节），而定义 body 的合法上限是
 *    `NIA_DEFINITION_LIMITS.bodyBytes`（200KB）。拿它来填 body，会让一条完全
 *    合法的长定义在运行时报「模板过大」。
 * 2. **未绑定占位符的处理必须不同**。`fillTemplate` 遇到未知占位符直接抛
 *    `INTERPOLATION_FAILED`，这对工作流的 `with:` 映射是对的——那是作者写错了
 *    键名，抛错能让他立刻改。但定义 body 是散文体提示词，里面出现一个
 *    `{{example}}` 更可能是作者想让模型看到的字面内容。为此拒绝执行，比原样
 *    透传更糟。
 *
 * 纯函数：不碰 fs、不碰 Electron，主进程与渲染层共用同一份合成规则——否则选择器
 * 里看到的提示词和工作流里跑的会悄悄分叉。
 *
 * @module electron/shared/nia-prompt-composition
 */

/** 只匹配这两个我们负责绑定的占位符，其余原样保留。 */
const CONTENT_PLACEHOLDER_RE = /\{\{\s*content\s*\}\}/gu;
const CONTEXT_PLACEHOLDER_RE = /\{\{\s*context\s*\}\}/gu;

/** body 里没有 `{{content}}` 时，用它分隔指令与内容。 */
const CONTENT_SEPARATOR = "\n\n---\n\n";

/**
 * 把上下文片段格式化成提示词里的一段。
 *
 * 与 vmark `extraction.ts#formatContext` 同形：`[Before]` / `[After]` 两段，
 * 只输出非空的一侧。标签是给模型读的结构信号，不是给用户看的 UI 文案，所以
 * 不做本地化。
 */
function formatNiaPromptContext({ before = "", after = "" } = {}) {
  const parts = [];
  if (typeof before === "string" && before.length > 0) parts.push(`[Before]\n${before}`);
  if (typeof after === "string" && after.length > 0) parts.push(`[After]\n${after}`);
  return parts.join("\n\n");
}

/**
 * 合成最终提示词。
 *
 * @param {object} options
 * @param {string} options.body 定义的 body（模板）。
 * @param {string} options.content 用户内容（选区 / 整篇文档）。
 * @param {string} [options.context] 已格式化的上下文片段，可为空。
 * @returns {string} 发给 provider 的提示词。
 */
function composeNiaPrompt({ body, content, context = "" }) {
  const template = typeof body === "string" ? body : "";
  const text = typeof content === "string" ? content : "";
  const contextText = typeof context === "string" ? context : "";

  const hasContentPlaceholder = CONTENT_PLACEHOLDER_RE.test(template);
  // `test()` 在带 /g 的正则上会推进 lastIndex，后面的 replace 会从那个位置开始
  // 找，于是第一个占位符被跳过。显式归零。
  CONTENT_PLACEHOLDER_RE.lastIndex = 0;

  let composed = template.replace(CONTENT_PLACEHOLDER_RE, () => text);
  composed = composed.replace(CONTEXT_PLACEHOLDER_RE, () => contextText);

  if (!hasContentPlaceholder) {
    // body 没有声明内容插入点。不能就这么把指令单独发出去——模型会收到
    // "改进下面这段文字" 而下面什么都没有。追加在末尾是唯一诚实的处理。
    if (text.length > 0) {
      composed = composed.length > 0 ? `${composed}${CONTENT_SEPARATOR}${text}` : text;
    }
  }

  return composed;
}

module.exports = {
  CONTENT_SEPARATOR,
  composeNiaPrompt,
  formatNiaPromptContext,
};
