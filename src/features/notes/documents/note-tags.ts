import YAML from "yaml";

const BOUNDARY = "---";

/**
 * Insert/replace the `tags` entry inside a note's YAML frontmatter while
 * leaving every other frontmatter key and the body untouched.
 *
 * Tags written here are searchable and shown in the Properties panel, but the
 * frontmatter block is stripped from both the rich-text and reading views, so
 * the visible note never changes. CJK tags are fully supported (unlike inline
 * `#tag`, which only matches ASCII).
 */
export function setNoteTags(rawSource: string, tags: string[]): string {
  const normalized = Array.from(
    new Set(tags.map((tag) => tag.trim().replace(/^#+/, "").trim()).filter(Boolean)),
  );

  const hasFrontmatter = rawSource.startsWith(`${BOUNDARY}\n`);

  if (!hasFrontmatter) {
    if (normalized.length === 0) {
      return rawSource;
    }
    const block = YAML.stringify({ tags: normalized }).replace(/\n+$/, "");
    return `${BOUNDARY}\n${block}\n${BOUNDARY}\n\n${rawSource.replace(/^\n+/, "")}`;
  }

  const endOffset = rawSource.indexOf(`\n${BOUNDARY}\n`, BOUNDARY.length + 1);

  if (endOffset === -1) {
    // Malformed (no closing boundary) — treat the whole thing as body.
    if (normalized.length === 0) {
      return rawSource;
    }
    const block = YAML.stringify({ tags: normalized }).replace(/\n+$/, "");
    return `${BOUNDARY}\n${block}\n${BOUNDARY}\n\n${rawSource.replace(/^\n+/, "")}`;
  }

  const rawFrontmatter = rawSource.slice(BOUNDARY.length + 1, endOffset);
  const body = rawSource.slice(endOffset + BOUNDARY.length + 2);

  const lines = rawFrontmatter.split("\n");
  const kept: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (/^(tags|tag)\s*:/i.test(lines[index])) {
      // Drop this entry plus any indented list items that belong to it.
      let next = index + 1;
      while (next < lines.length && /^\s+\S/.test(lines[next])) {
        next += 1;
      }
      index = next - 1;
      continue;
    }
    kept.push(lines[index]);
  }

  const keptText = kept.join("\n").trim();
  const tagsBlock =
    normalized.length > 0 ? YAML.stringify({ tags: normalized }).replace(/\n+$/, "") : "";
  const nextFrontmatter = [keptText, tagsBlock].filter(Boolean).join("\n");

  if (!nextFrontmatter) {
    // Nothing left in the frontmatter — drop the block entirely.
    return body.replace(/^\n+/, "");
  }

  return `${BOUNDARY}\n${nextFrontmatter}\n${BOUNDARY}\n${body}`;
}
