export type MarkdownLintSeverity = "error" | "warning";

export type MarkdownLintIssue = {
  column: number;
  line: number;
  message: string;
  ruleId:
    | "duplicate-heading"
    | "malformed-link"
    | "table-column-count"
    | "trailing-whitespace"
    | "unclosed-fence";
  severity: MarkdownLintSeverity;
};

export function lintMarkdown(source: string): MarkdownLintIssue[] {
  const issues: MarkdownLintIssue[] = [];
  const headings = new Map<string, number>();
  const lines = source.split(/\r?\n/);
  let openFence: { line: number; marker: string } | null = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trailingWhitespace = line.match(/[ \t]+$/);
    if (trailingWhitespace && line.trim()) {
      issues.push({
        column: line.length - trailingWhitespace[0].length + 1,
        line: lineNumber,
        message: "行尾包含多余空白。",
        ruleId: "trailing-whitespace",
        severity: "warning",
      });
    }

    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence?.[1]) {
      const marker = fence[1][0] ?? "`";
      openFence =
        openFence?.marker === marker ? null : { line: lineNumber, marker };
      return;
    }

    if (openFence) {
      return;
    }

    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading?.[1]) {
      const normalized = heading[1].trim().toLocaleLowerCase();
      const previousLine = headings.get(normalized);
      if (previousLine) {
        issues.push({
          column: 1,
          line: lineNumber,
          message: `标题与第 ${previousLine} 行重复。`,
          ruleId: "duplicate-heading",
          severity: "warning",
        });
      } else {
        headings.set(normalized, lineNumber);
      }
    }

    const malformedLink = line.match(/\[[^\]]+\]\([^)\s]*$/);
    if (malformedLink) {
      issues.push({
        column: (malformedLink.index ?? 0) + 1,
        line: lineNumber,
        message: "Markdown 链接缺少右括号。",
        ruleId: "malformed-link",
        severity: "error",
      });
    }

    if (
      line.includes("|") &&
      index > 0 &&
      /^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/.test(lines[index - 1] ?? "")
    ) {
      const expected = (lines[index - 1]?.match(/\|/g) ?? []).length;
      const actual = (line.match(/\|/g) ?? []).length;
      if (expected !== actual) {
        issues.push({
          column: 1,
          line: lineNumber,
          message: "表格列数与分隔行不一致。",
          ruleId: "table-column-count",
          severity: "warning",
        });
      }
    }
  });

  const unclosedFence = openFence as { line: number; marker: string } | null;
  if (unclosedFence) {
    issues.push({
      column: 1,
      line: unclosedFence.line,
      message: "代码围栏未闭合。",
      ruleId: "unclosed-fence",
      severity: "error",
    });
  }

  return issues;
}
