import YAML from "yaml";

export type ParsedFrontmatterDocument = {
  bodySource: string;
  frontmatter: Record<string, unknown>;
  rawFrontmatter: string | null;
};

const FRONTMATTER_BOUNDARY = "---";

export function parseFrontmatterDocument(source: string): ParsedFrontmatterDocument {
  if (!source.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
    return {
      bodySource: source.trim(),
      frontmatter: {},
      rawFrontmatter: null,
    };
  }

  const endOffset = source.indexOf(`\n${FRONTMATTER_BOUNDARY}\n`, FRONTMATTER_BOUNDARY.length + 1);

  if (endOffset === -1) {
    return {
      bodySource: source.trim(),
      frontmatter: {},
      rawFrontmatter: null,
    };
  }

  const rawFrontmatter = source.slice(FRONTMATTER_BOUNDARY.length + 1, endOffset);
  const bodySource = source.slice(endOffset + FRONTMATTER_BOUNDARY.length + 2).trim();
  const parsed = YAML.parse(rawFrontmatter);

  return {
    bodySource,
    frontmatter:
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {},
    rawFrontmatter,
  };
}
