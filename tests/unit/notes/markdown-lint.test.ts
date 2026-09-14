import { describe, expect, it } from "vitest";
import { lintMarkdown } from "@/features/notes/editor/markdown-lint";

describe("lintMarkdown", () => {
  it("reports structural markdown problems with line positions", () => {
    const issues = lintMarkdown(
      "# Same\n# Same\n[broken](url\n\n```ts\nconst x = 1;  \n",
    );

    expect(issues.map((issue) => issue.ruleId)).toEqual([
      "duplicate-heading",
      "malformed-link",
      "trailing-whitespace",
      "unclosed-fence",
    ]);
    expect(issues.at(-1)?.line).toBe(5);
  });

  it("ignores markdown-looking content inside a closed code fence", () => {
    expect(lintMarkdown("```\n# Same\n# Same\n```\n")).toEqual([]);
  });
});
