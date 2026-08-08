/**
 * CJK 排版规范化：在中日韩字符与 ASCII 拉丁字母/数字之间自动插入半角空格。
 * 参考 pangu.js / autocorrect 的基本规则，仅处理最通用的中英混排情形。
 *
 * 安全策略：
 *  - 跳过代码围栏块（``` / ~~~）内部的内容，避免破坏代码
 *  - 跳过 YAML front matter（--- 包围的头部块）
 *  - 不改动已经存在空格的位置（幂等）
 */

// CJK 统一字符集范围（覆盖常用汉字、假名、谚文基本块）
const CJK_RANGE =
  "⺀-⻿" + // CJK Radicals Supplement
  "⼀-⿟" + // Kangxi Radicals
  "぀-ゟ" + // Hiragana
  "゠-ヿ" + // Katakana
  "㄀-ㄯ" + // Bopomofo
  "㈀-㋿" + // Enclosed CJK
  "㐀-䶿" + // CJK Extension A
  "一-鿿" + // CJK Unified Ideographs（核心汉字区）
  "豈-﫿" + // CJK Compatibility Ideographs
  "︰-﹏"; // CJK Compatibility Forms

// CJK 后紧跟 ASCII 字母或数字，且前后没有空格
const RE_CJK_BEFORE_ASCII = new RegExp(`([${CJK_RANGE}])([A-Za-z0-9])`, "g");
// ASCII 字母或数字后紧跟 CJK，且前后没有空格
const RE_ASCII_BEFORE_CJK = new RegExp(`([A-Za-z0-9])([${CJK_RANGE}])`, "g");

/**
 * 对单行文本应用 CJK 排版规则。
 * 行内内容不区分是否在内联代码（`code`）中——如需精细处理可扩展。
 */
function normalizeLine(line: string): string {
  return line
    .replace(RE_CJK_BEFORE_ASCII, "$1 $2")
    .replace(RE_ASCII_BEFORE_CJK, "$1 $2");
}

/**
 * 对整篇 Markdown 文档应用 CJK 排版规范化。
 * - front matter（--- 头部块）原样保留
 * - 代码围栏块（``` / ~~~）内部原样保留
 * - 其余正文行逐行规范化
 *
 * @returns 规范化后的文档字符串（如无变化则返回原字符串引用）
 */
export function normalizeCjkSpacing(source: string): string {
  const lines = source.split("\n");
  const result: string[] = [];

  let inFrontMatter = false;
  let frontMatterClosed = false;
  let inCodeFence = false;
  let fenceMarker = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── Front matter ────────────────────────────────────────────────
    if (i === 0 && line.trim() === "---") {
      inFrontMatter = true;
      result.push(line);
      continue;
    }
    if (inFrontMatter && !frontMatterClosed) {
      result.push(line);
      if (line.trim() === "---" || line.trim() === "...") {
        inFrontMatter = false;
        frontMatterClosed = true;
      }
      continue;
    }

    // ── Code fence ──────────────────────────────────────────────────
    if (!inCodeFence) {
      const fenceMatch = /^(\s{0,3})(```+|~~~+)/.exec(line);
      if (fenceMatch) {
        inCodeFence = true;
        fenceMarker = fenceMatch[2].charAt(0).repeat(fenceMatch[2].length);
        result.push(line);
        continue;
      }
    } else {
      // 关闭代码块：行必须以相同类型且 ≥ 相同长度的 fence 开头
      const closingPattern = new RegExp(`^\\s{0,3}${fenceMarker.charAt(0)}{${fenceMarker.length},}\\s*$`);
      if (closingPattern.test(line)) {
        inCodeFence = false;
        fenceMarker = "";
      }
      result.push(line);
      continue;
    }

    // ── Normal line ─────────────────────────────────────────────────
    result.push(normalizeLine(line));
  }

  const normalized = result.join("\n");
  // 如果内容完全没变，返回原引用（避免触发不必要的脏状态）
  return normalized === source ? source : normalized;
}
