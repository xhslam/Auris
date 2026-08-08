"use client";

import { Fragment, useMemo } from "react";

type NotesBreadcrumbBarProps = {
  /** Active note path relative to the vault, e.g. "20-Areas/英文学习/day12.md". */
  path: string | null;
  /** Vault / directory display name, shown as the leading segment when present. */
  vaultName?: string | null;
};

function stripMarkdownExtension(segment: string) {
  return segment.replace(/\.(md|markdown)$/i, "");
}

/**
 * Centered, low-weight breadcrumb that mirrors Obsidian's "folder / … / file"
 * path shown above the document body. Purely presentational — it reflects the
 * active note's location without changing navigation behaviour.
 */
export function NotesBreadcrumbBar({ path, vaultName }: NotesBreadcrumbBarProps) {
  const segments = useMemo(() => {
    if (!path) {
      return [] as string[];
    }

    const parts = path
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .map(stripMarkdownExtension);

    const lead = vaultName?.trim();

    return lead ? [lead, ...parts] : parts;
  }, [path, vaultName]);

  if (segments.length === 0) {
    return null;
  }

  return (
    <nav aria-label="文档路径" className="notes-v2__breadcrumb">
      <ol className="notes-v2__breadcrumb-list">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;

          return (
            <Fragment key={`${segment}-${index}`}>
              <li
                className="notes-v2__breadcrumb-item"
                data-current={isLast ? "true" : "false"}
              >
                {segment}
              </li>
              {isLast ? null : (
                <li aria-hidden="true" className="notes-v2__breadcrumb-sep">
                  /
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
