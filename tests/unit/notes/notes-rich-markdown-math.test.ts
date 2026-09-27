import { describe, expect, it } from "vitest";
import {
  parseNotesRichMarkdown,
  serializeNotesRichMarkdown,
} from "@/features/notes/editor/notes-rich-markdown";
import {
  normalizeNotesMathDelimiters,
  parseNotesMarkdownAst,
} from "@/features/notes/markdown/notes-markdown-dialect";
import {
  DEFAULT_KATEX_MACROS,
  renderMathMarkup,
} from "@/features/notes/editor/code-block-preview";
import { renderMarkdown } from "@/features/notes/rendering/remark-renderer";

function collectMathNodes(source: string) {
  const nodes: Array<{ content: string; type: string }> = [];
  parseNotesRichMarkdown(source).descendants((node) => {
    if (node.type.name === "math_inline" || node.type.name === "math_block") {
      nodes.push({
        content: node.attrs.content as string,
        type: node.type.name,
      });
    }
  });
  return nodes;
}

describe("notes-rich-markdown math", () => {
  it("parses a $$ block formula into a math_block node", () => {
    const doc = parseNotesRichMarkdown("$$\nF_t = F_f + F_w + F_i + F_j\n$$");
    const nodes: string[] = [];

    doc.descendants((node) => {
      nodes.push(node.type.name);
    });

    expect(nodes).toContain("math_block");
  });

  it("round-trips a $$ block formula back to markdown", () => {
    const source = "$$\nF_t = F_f + F_w + F_i + F_j\n$$";
    const doc = parseNotesRichMarkdown(source);
    expect(serializeNotesRichMarkdown(doc)).toBe(source);
  });

  it("parses inline $...$ formula into a math_inline node", () => {
    const doc = parseNotesRichMarkdown("速度公式 $v = at$ 表示加速度");
    const nodes: string[] = [];

    doc.descendants((node) => {
      nodes.push(node.type.name);
    });

    expect(nodes).toContain("math_inline");
  });

  it("round-trips inline $...$ formula back to markdown", () => {
    const source = "速度公式 $v = at$ 表示加速度";
    const doc = parseNotesRichMarkdown(source);
    expect(serializeNotesRichMarkdown(doc)).toBe(source);
  });

  it("does not treat a lone $ sign as math", () => {
    const doc = parseNotesRichMarkdown("价格是 $5 美元");
    const nodes: string[] = [];

    doc.descendants((node) => {
      nodes.push(node.type.name);
    });

    expect(nodes).not.toContain("math_inline");
  });

  it("does not misread paired currency signs as inline math", () => {
    const source = "Prices moved from $100 to $200 today.";

    expect(collectMathNodes(source)).toHaveLength(0);
    expect(serializeNotesRichMarkdown(parseNotesRichMarkdown(source))).toBe(source);
  });

  it.each([
    String.raw`卡在 \(\int \frac{2\ln x-1}{2x^3}\,dx\)。`,
    String.raw`卡在 \(\int y^{-3}e^{-1/y^2}\,dy\)。`,
    String.raw`追问 \(\left(-\frac1{y^2}\right)'\) 怎么来。`,
    String.raw`追问 \(e^{-3\ln|y|}\) 中绝对值为什么能处理掉。`,
  ])("parses compatible inline delimiters as math_inline: %s", (source) => {
    const nodes = collectMathNodes(source);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("math_inline");
    expect(nodes[0].content).toContain("\\");
    expect(serializeNotesRichMarkdown(parseNotesRichMarkdown(source))).toMatch(
      /\$[^$]+\$/u,
    );
  });

  it("parses NotebookLM's double-escaped inline delimiters across a pasted explanation", () => {
    const source = String.raw`# 稳定裕度的相关的10道习题

开环传递函数为 \\(G_0(s) = \frac{K}{s(0.2s + 1)(0.5s + 1)}\\)，已知 \\(K=6\\)。相角裕度 \\(\gamma\\) 与幅值裕度 \\(h\\) 及 \\(h(\text{dB})\\)。

由模值方程 \\(|G_0(j\omega_c)| = \frac{60}{\omega_c\sqrt{(\omega_c^2 + 25)(\omega_c^2 + 4)}} = 1\\)，解得 \\(\omega_c = 2.92\text{ rad/s}\\)。

代入得 \\(\operatorname{Re}[G_0(j\omega_x)] = -0.859\\)，故幅值裕度 \\(h = \frac{1}{|G_0(j\omega_x)|} \approx 1.165\\)，换算成分贝形式为 \\(h(\text{dB}) = -20\lg |G_0(j\omega_x)| \approx 1.33\text{ dB}\\)。`;
    const doc = parseNotesRichMarkdown(source);
    const nodes: string[] = [];
    const contents: string[] = [];

    doc.descendants((node) => {
      if (node.type.name === "math_inline" || node.type.name === "math_block") {
        nodes.push(node.type.name);
        contents.push(node.attrs.content as string);
      }
    });

    expect(nodes).toHaveLength(10);
    expect(nodes.every((type) => type === "math_inline")).toBe(true);
    expect(contents).toContain(String.raw`\gamma`);
    expect(contents).toContain(String.raw`h(\text{dB})`);
    expect(contents.some((content) => content.includes("\\frac{K}"))).toBe(true);
    expect(serializeNotesRichMarkdown(doc)).not.toContain(String.raw`\\(`);

    const html = renderMarkdown(source);
    expect(html.match(/class="katex"/gu)).toHaveLength(10);
    expect(html).not.toContain(String.raw`\\(`);
  });

  it("sanitizes NotebookLM's double-escaped LaTeX commands, escaped brackets, subscripts, and percent signs without katex-error", () => {
    const source = [
      String.raw`相角裕度 \\(\\gamma = 180^\\circ + \\varphi(\\omega_c) = 180^\\circ - 90^\\circ - \\arctan(0.2\\omega_c) \\approx 4.12^\\circ\\)。`,
      String.raw`令虚部为零 \\(\\text{Im}\[G_0(j\\omega)\] = 0\\)，代入得 \\(Re\[G_0(j\\omega_x)\] = -0.859\\)。`,
      String.raw`截止频率 \\(\\omega\_{c0} \\approx 12.5\\text{ rad/s}\\)，最大延时 \\(\\tau\_{max}\\)。`,
      String.raw`超调量 \\(\\sigma% = 15%\\)，误差带 \\(\\Delta = 2%\\)。`,
    ].join("\n\n");

    const doc = parseNotesRichMarkdown(source);
    const contents: string[] = [];

    doc.descendants((node) => {
      if (node.type.name === "math_inline") {
        contents.push(node.attrs.content as string);
      }
    });

    expect(contents.some((c) => c.includes(String.raw`\gamma = 180^\circ`))).toBe(true);
    expect(contents.some((c) => c.includes(String.raw`[G_0(j\omega)]`))).toBe(true);
    expect(contents.some((c) => c.includes(String.raw`\omega_{c0}`))).toBe(true);
    expect(contents.some((c) => c.includes(String.raw`\tau_{max}`))).toBe(true);
    expect(contents.some((c) => c.includes(String.raw`\sigma\% = 15\%`))).toBe(true);

    const html = renderMarkdown(source);
    expect(html).not.toContain("katex-error");
    expect(html.match(/class="katex"/gu)?.length).toBe(contents.length);
  });

  it("parses balanced double-escaped display delimiters but keeps unmatched ones literal", () => {
    const source = String.raw`\\[
\int_0^1 x\,dx
\\]`;
    const nodes = collectMathNodes(source);

    expect(nodes).toEqual([
      {
        content: String.raw`\int_0^1 x\,dx`,
        type: "math_block",
      },
    ]);
    expect(normalizeNotesMathDelimiters(String.raw`escaped \\\\(x^2\)`)).toBe(
      String.raw`escaped \\\\(x^2\)`,
    );
  });

  it("parses a compatible display integral as math_block", () => {
    const source = String.raw`面积题需要计算：

\[
\int_0^1 -x\ln x\,dx
\]`;
    const nodes = collectMathNodes(source);

    expect(nodes).toEqual([
      {
        content: String.raw`\int_0^1 -x\ln x\,dx`,
        type: "math_block",
      },
    ]);
  });

  it("preserves a multiline boxed formula as one math_block node", () => {
    const source = String.raw`\[
\boxed{
\text{负指数改写}
\to
\text{幂函数求导/积分}
\to
\text{识别内层导数}
\to
\text{换元或分部积分}
\to
\text{处理符号、绝对值与定义域}
}
\]`;
    const nodes = collectMathNodes(source);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual({
      content: String.raw`\boxed{
\text{负指数改写}
\to
\text{幂函数求导/积分}
\to
\text{识别内层导数}
\to
\text{换元或分部积分}
\to
\text{处理符号、绝对值与定义域}
}`,
      type: "math_block",
    });
  });

  it("uses the same AST node types for canonical dollar delimiters", () => {
    const source = String.raw`行内 $\frac{1}{x}$

$$
\int_0^1 x\,dx
$$`;
    const ast = parseNotesMarkdownAst(source) as unknown as {
      children: Array<{ children?: Array<{ type: string }>; type: string }>;
    };
    const astTypes = ast.children.flatMap((node) => [
      node.type,
      ...(node.children ?? []).map((child) => child.type),
    ]);

    expect(astTypes).toContain("inlineMath");
    expect(astTypes).toContain("math");
    expect(collectMathNodes(source).map((node) => node.type)).toEqual([
      "math_inline",
      "math_block",
    ]);
  });

  it("does not recognize compatible delimiters inside inline or fenced code", () => {
    const source = String.raw`代码示例：\`\(x^2\)\`

\`\`\`text
\[
x^2
\]
\`\`\``.replaceAll("\\`", "`");
    const doc = parseNotesRichMarkdown(source);

    expect(collectMathNodes(source)).toHaveLength(0);
    expect(serializeNotesRichMarkdown(doc)).toContain(String.raw`\(x^2\)`);
    expect(serializeNotesRichMarkdown(doc)).toContain(String.raw`\[
x^2
\]`);
  });

  it("protects escaped backslashes, URLs, and Markdown destinations", () => {
    const source = String.raw`escaped \\(x^2\), https://example.com/\(x\), [docs](https://example.com/\(y\))`;

    expect(normalizeNotesMathDelimiters(source)).toBe(source);
    expect(collectMathNodes(source)).toHaveLength(0);
  });

  it("renders compatible delimiters through KaTeX and tolerates one bad formula", () => {
    const html = renderMarkdown(
      String.raw`正常 \(\frac{1}{x}\) 错误 \(\notARealCommand{\)`,
    );

    expect(html).toContain("katex");
    expect(html).toContain("katex-error");
  });

  it("renders centernot macro defensively without katex-error", () => {
    expect(DEFAULT_KATEX_MACROS["\\centernot"]).toBe("\\not");

    const markup = renderMathMarkup(
      String.raw`AB = AC \centernot\implies B = C`,
      false,
    );
    expect(markup).toContain("katex");
    expect(markup).not.toContain("katex-error");

    const html = renderMarkdown(
      String.raw`公式 $AB = AC \centernot\implies B = C$ 正常渲染`,
    );
    expect(html).toContain("katex");
    expect(html).not.toContain("katex-error");
  });

  it("renders standard nRightarrow formula without katex-error", () => {
    const markup = renderMathMarkup(
      String.raw`AB = AC \nRightarrow B = C`,
      false,
    );
    expect(markup).toContain("katex");
    expect(markup).not.toContain("katex-error");

    const html = renderMarkdown(
      String.raw`公式 $AB = AC \nRightarrow B = C$ 正常渲染`,
    );
    expect(html).toContain("katex");
    expect(html).not.toContain("katex-error");
  });
});
