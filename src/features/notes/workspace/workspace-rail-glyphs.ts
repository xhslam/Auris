/**
 * 工作区 rail 的身份字形。
 *
 * 逐条移植 vmark `src/utils/workspaceRailGlyphs.ts`，包括它三条已经付过代价的
 * 结论——这些结论都是「看起来更好的做法为什么错」，不重新踩：
 *
 * 1. **用 `Intl.Segmenter` 而不是 `Array.from`**。后者是码点安全但不是字形簇
 *    安全的：会把 ZWJ emoji 切开（👨‍👩‍👧 → 👨）、把肤色修饰符摘掉（👍🏽 → 👍）、
 *    把分解形式的重音和基字母拆散（é → e + ◌́）。每一种都会渲染出文件夹名里
 *    根本不存在的字符。
 * 2. **只跳过标点/分隔/格式/独立组合字符，不要求字母数字**。所以 `.config`
 *    取到 "C" 而不是 "."；而名为 `🚀 项目` 的库取到 🚀 —— 跳过它去取 "项"
 *    会丢掉这个名字里最好认的字符。
 * 3. **永远只取一个字形，不为消歧而变长**。vmark 早期版本会把冲突的字形扩展成
 *    最短唯一前缀（alpha/apex → "AL"/"AP"），后来判定这是错的交易：30px 的
 *    rail 要把 2–3 字符缩到能塞进去，于是每次冲突都让**冲突的那几个**更难认，
 *    换来 rail 根本不需要的唯一性。身份已经由另外三条通道完整承载（强调色、
 *    tooltip、可访问名），且那三条带的都是完整名字而不是缩写。
 *
 * `toUpperCase()` 故意不带 locale：字形来自一个语言未知、且与用户 locale 无关的
 * 文件夹名，对英文名套土耳其语规则（或反过来）是任意而非正确。
 *
 * @module features/notes/workspace/workspace-rail-glyphs
 */

/** 名字里挑不出任何可用字符时（""、"..."、"   "）显示这个。 */
const FALLBACK_GLYPH = "?";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemes(value: string): string[] {
  return [...segmenter.segment(value)].map((entry) => entry.segment);
}

function glyphSource(name: string): string[] {
  const chars = graphemes(name.trim().toUpperCase());
  const start = chars.findIndex((char) => !/^[\p{P}\p{Z}\p{C}\p{M}]+$/u.test(char));
  return start === -1 ? [] : chars.slice(start);
}

/**
 * 逐实例的 rail 字形，由工作区**名字**推导。
 *
 * 名字派生而非位置派生是要点：vmark 早期 rail 显示 `index + 1`，重排就变，因此
 * 它标识不了任何稳定的东西，而唯一真实的标识（名字）却藏在 tooltip 里。
 *
 * loose 实例不发字形：它们不是工作区，有自己的图标。
 */
export function workspaceRailGlyphs(
  instances: readonly {
    displayName: string;
    kind: string;
    workspaceInstanceId: string;
  }[],
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const instance of instances) {
    if (instance.kind === "loose") continue;
    const [first] = glyphSource(instance.displayName);
    result[instance.workspaceInstanceId] = first ?? FALLBACK_GLYPH;
  }

  return result;
}
