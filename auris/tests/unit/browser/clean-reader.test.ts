import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readPage } from "../../../src/features/browser/clean-reader";

const URL = "https://example.com/blog/post";
const FIXTURE = readFileSync(
  path.join(process.cwd(), "tests/fixtures/browser/observation-document.html"),
  "utf8",
);

// Cases adapted from VMark `src/lib/browser/reader/reader.test.ts`.
describe("readPage — title, byline, and main-content selection", () => {
  it("extracts title/byline and prefers article content over chrome", () => {
    const html = `
      <html><head><title>My Post — Example Blog</title></head>
      <body>
        <header><a rel="author" href="/u/sam">Sam Author</a></header>
        <nav><a href="/">Home</a></nav>
        <aside>Related links and ads galore galore galore</aside>
        <article><h1>Real Headline</h1><p>The genuine article body paragraph that carries the real content of this page.</p></article>
        <footer>Copyright 2026</footer>
      </body></html>`;
    const result = readPage(html, URL);
    expect(result.title).toBe("Real Headline");
    expect(result.byline).toBe("Sam Author");
    expect(result.markdown).toContain("genuine article body paragraph");
    expect(result.markdown).not.toContain("Home");
    expect(result.markdown).not.toContain("Copyright");
    expect(result.markdown).not.toContain("Sam Author");
    expect(result.truncated).toBe(false);
  });

  it("falls back to the densest text container without article/main", () => {
    const html = `
      <body>
        <div class="sidebar"><p>short</p></div>
        <div class="content"><p>This is the main content region with substantially more readable prose than the sidebar.</p><p>A second paragraph reinforcing the density of this container.</p></div>
      </body>`;
    const result = readPage(html, URL);
    expect(result.markdown).toContain("main content region");
    expect(result.markdown).not.toContain("short");
  });
});

describe("readPage — markdown serialization", () => {
  const wrap = (inner: string) =>
    `<body><article>${inner}<p>padding paragraph to ensure the container scores as content.</p></article></body>`;

  it("serializes headings, links, code, lists, and tables", () => {
    const result = readPage(
      wrap(`
        <h2>Section</h2>
        <p>See <a href="/other">this</a> and <code>foo()</code>.</p>
        <ul><li>one</li><li>two</li></ul>
        <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
        <pre><code>const x = 1;</code></pre>
      `),
      URL,
    );
    expect(result.markdown).toContain("## Section");
    expect(result.markdown).toContain("[this](https://example.com/other)");
    expect(result.markdown).toContain("`foo()`");
    expect(result.markdown).toContain("- one");
    expect(result.markdown).toContain("| A | B |");
    expect(result.markdown).toMatch(/```\nconst x = 1;\n```/);
  });

  it("removes script/style and escapes hostile page text", () => {
    const result = readPage(
      wrap(`
        <p># Not a heading</p>
        <p>&lt;img src=x onerror=alert(1)&gt;</p>
        <script>evil()</script>
        <style>.x{color:red}</style>
        <p>run <code>a\`b</code></p>
      `),
      URL,
    );
    expect(result.markdown).toContain("\\# Not a heading");
    expect(result.markdown).toContain("\\<img");
    expect(result.markdown).not.toContain("evil()");
    expect(result.markdown).not.toContain("color:red");
    expect(result.markdown).toContain("``a`b``");
  });

  it("truncates oversized markdown under an explicit budget", () => {
    const long = "word ".repeat(200);
    const result = readPage(wrap(`<p>${long}</p>`), URL, {
      maxMarkdownChars: 40,
    });
    expect(result.markdown.length).toBe(40);
    expect(result.truncated).toBe(true);
  });

  it("handles empty input without throwing", () => {
    expect(() => readPage("", URL)).not.toThrow();
    const result = readPage("", URL);
    expect(result.markdown).toBe("");
    expect(result.textLength).toBe(0);
    expect(result.truncated).toBe(false);
  });
});

describe("readPage — fixture secrets", () => {
  it("may include visible page text in an explicit read, while metadata stays free of passwords", () => {
    const result = readPage(FIXTURE, "https://example.com/observation");
    expect(result.markdown).toContain("Visible body text for the clean reader");
    // Underscores are Markdown-escaped in page text.
    expect(result.markdown).toContain("access\\_token=SECRET\\_PAGE\\_TEXT");
    expect(result.markdown).not.toContain("Related chrome noise");
    expect(result.markdown).not.toContain("Copyright noise");
    // Password field values are not text nodes; ensure we do not invent them.
    expect(result.markdown).not.toContain("hunter2-secret");
    const metadata = JSON.stringify({
      title: result.title,
      byline: result.byline,
      url: result.url,
      textLength: result.textLength,
      truncated: result.truncated,
    });
    expect(metadata).not.toContain("hunter2-secret");
    expect(metadata).not.toContain("SECRET_PAGE_TEXT");
    expect(metadata).not.toContain("access_token");
  });
});
