/**
 * 移植 vmark cjkFormatter 时所依赖的两个外部小工具的本地实现，避免拉入
 * vmark 其余基础设施。
 *
 * - splitTableCells: 按未转义、未在内联代码内的 `|` 切分表格行（移植自
 *   vmark `src/utils/tableParser.ts`）。
 * - cjkFmtWarn: 带命名空间的告警日志（vmark `@/utils/debug` 的等价替身）。
 */

/** 按管道符切分 Markdown 表格单元格，跳过转义与内联代码中的 `|`。 */
export function splitTableCells(content: string): string[] {
  const cells: string[] = [];
  let cellStart = 0;
  let escaped = false;
  let inCode = false;
  let codeFenceLen = 0;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === "`") {
      let runLen = 1;
      while (i + runLen < content.length && content[i + runLen] === "`") {
        runLen++;
      }

      if (!inCode) {
        inCode = true;
        codeFenceLen = runLen;
      } else if (runLen === codeFenceLen) {
        inCode = false;
        codeFenceLen = 0;
      }

      i += runLen - 1;
      continue;
    }

    if (ch === "|" && !inCode) {
      cells.push(content.slice(cellStart, i));
      cellStart = i + 1;
    }
  }

  cells.push(content.slice(cellStart));
  return cells;
}

/** CJK 格式化器内部告警（仅开发期打印）。 */
export function cjkFmtWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[cjk-formatter]", ...args);
  }
}
