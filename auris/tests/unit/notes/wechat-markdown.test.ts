import { describe, expect, it, vi } from "vitest";
import { renderWechatMarkdown } from "@/features/notes/wechat/wechat-markdown";

describe("renderWechatMarkdown", () => {
  it("renders a WeChat-safe article using inline styles only", () => {
    const html = renderWechatMarkdown([
      "---",
      "tags:",
      "  - publish",
      "---",
      "# 标题",
      "",
      "正文 **重点** 与 [链接](https://example.com)。",
      "",
      "> 引用",
      "",
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "```ts",
      "const answer = 42;",
      "```",
    ].join("\n"));

    expect(html).toContain('data-auris-wechat-content="true"');
    expect(html).toContain('<h1 style="');
    expect(html).toContain('<strong style="');
    expect(html).toContain('<blockquote style="');
    expect(html).toContain('<table style="');
    expect(html).toContain('data-auris-wechat-code="true"');
    expect(html).not.toContain("<style");
    expect(html).not.toContain("class=");
    expect(html).not.toContain("tags:");
  });

  it("drops dangerous link and image schemes after custom resolution", () => {
    const html = renderWechatMarkdown(
      [
        "[危险链接](javascript:alert(1))",
        "",
        "![危险图片](asset.png)",
      ].join("\n"),
      { resolveImageSource: () => "javascript:alert(1)" },
    );

    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('src="javascript:');
    expect(html).not.toContain('src=""');
    expect(html).toContain("危险图片");
  });

  it("escapes raw HTML and resolves local and wiki image sources", () => {
    const resolveImageSource = vi.fn(
      (source: string) => `shadowing-media://vault/${source}`,
    );
    const html = renderWechatMarkdown(
      [
        "<script>alert('no')</script>",
        "",
        "![[assets/hero image.png|封面]]",
      ].join("\n"),
      { resolveImageSource },
    );

    expect(html).toContain("&lt;script&gt;alert(");
    expect(html).toContain("&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(resolveImageSource).toHaveBeenCalledWith("assets/hero image.png");
    expect(html).toContain(
      'src="shadowing-media://vault/assets/hero image.png"',
    );
    expect(html).toContain("封面");
    expect(html).not.toMatch(/<p[^>]*>\s*<figure/u);
  });
});
