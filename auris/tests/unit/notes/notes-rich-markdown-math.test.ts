import { describe, expect, it } from "vitest";
import {
  parseNotesRichMarkdown,
  serializeNotesRichMarkdown,
} from "@/features/notes/editor/notes-rich-markdown";

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
});
