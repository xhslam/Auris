"use client";

import { useMemo } from "react";
import {
  parseStructuredData,
  type StructuredDataFormat,
} from "@/features/notes/formats/structured-data";
import { detectStructuredSchema } from "@/features/notes/formats/structured-schema";

const MAX_TREE_DEPTH = 12;
const MAX_TREE_NODES = 750;

function scalarLabel(value: unknown) {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return typeof value;
}

type TreeRow = {
  count: number | null;
  depth: number;
  key: string;
  label: string;
  value: string | null;
};

function flattenStructuredValue(value: unknown): TreeRow[] {
  const rows: TreeRow[] = [];
  const pending = [{ depth: 0, key: "root", label: "root", value }];

  while (pending.length > 0 && rows.length < MAX_TREE_NODES) {
    const current = pending.pop();
    if (!current) break;

    const entries =
      current.depth < MAX_TREE_DEPTH
        ? Array.isArray(current.value)
          ? current.value.map((item, index) => [String(index), item] as const)
          : current.value && typeof current.value === "object"
            ? Object.entries(current.value as Record<string, unknown>)
            : null
        : null;

    rows.push({
      count: entries?.length ?? null,
      depth: current.depth,
      key: current.key,
      label: current.label,
      value:
        entries
          ? null
          : current.depth >= MAX_TREE_DEPTH &&
              current.value &&
              typeof current.value === "object"
            ? "…"
            : scalarLabel(current.value),
    });

    entries
      ?.slice()
      .reverse()
      .forEach(([label, child]) => {
        pending.push({
          depth: current.depth + 1,
          key: `${current.key}/${label}`,
          label,
          value: child,
        });
      });
  }

  if (pending.length > 0) {
    rows.push({
      count: null,
      depth: 0,
      key: "preview-limit",
      label: "…",
      value: "已达到 750 个节点的预览上限",
    });
  }

  return rows;
}

export function StructuredDataPreview({
  format,
  path = "",
  source,
}: {
  format: StructuredDataFormat;
  path?: string;
  source: string;
}) {
  const result = useMemo(
    () => parseStructuredData(format, source),
    [format, source],
  );

  if (!result.ok) {
    return (
      <div className="notes-v2__structured-error" role="alert">
        <strong>结构预览无法解析</strong>
        <span>{result.error.message}</span>
      </div>
    );
  }

  const rows = flattenStructuredValue(result.value);
  const schema = detectStructuredSchema(format, path, result.value);

  return (
    <div className="notes-v2__structured-preview">
      {schema ? (
        <section
          aria-label="识别到的结构类型"
          className="notes-v2__structured-schema"
          data-schema={schema.id}
        >
          <div>
            <strong>{schema.label}</strong>
            <span>{schema.summary}</span>
          </div>
          <dl>
            {schema.sections.map((section) => (
              <div key={section.label}>
                <dt>{section.label}</dt>
                <dd>{section.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <ul aria-label={`${format.toUpperCase()} 结构预览`} role="tree">
        {rows.map((row) => (
          <li
            aria-level={row.depth + 1}
            aria-selected="false"
            key={row.key}
            role="treeitem"
            style={{ paddingInlineStart: `${row.depth * 16}px` }}
          >
            <span className="notes-v2__structured-key">{row.label}</span>
            {row.count === null ? (
              <span className="notes-v2__structured-value">{row.value}</span>
            ) : (
              <span className="notes-v2__structured-count">{row.count} 项</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
