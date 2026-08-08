import YAML from "yaml";
import { getVaultBasename } from "@/features/notes/vault/vault-path";

const FRONTMATTER_BOUNDARY = "---";
const TITLE_HEADING_PATTERN = /^#\s+(.+?)\s*$/;

export const NEW_NOTE_BODY_PLACEHOLDER = "输入你想说的";

export type EditableNoteTitleStorage = "frontmatter" | "heading" | "virtual";

export type EditableNoteSource = {
  bodyLineStart: number;
  bodySource: string;
  frontmatter: Record<string, unknown>;
  hasSpacerAfterTitleHeading: boolean;
  path: string;
  title: string;
  titleStorage: EditableNoteTitleStorage;
};

function parseFrontmatterPreservingBody(rawSource: string) {
  if (!rawSource.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
    return {
      bodySource: rawSource,
      frontmatter: {},
    };
  }

  const endOffset = rawSource.indexOf(
    `\n${FRONTMATTER_BOUNDARY}\n`,
    FRONTMATTER_BOUNDARY.length + 1,
  );

  if (endOffset === -1) {
    return {
      bodySource: rawSource,
      frontmatter: {},
    };
  }

  const rawFrontmatter = rawSource.slice(FRONTMATTER_BOUNDARY.length + 1, endOffset);
  const parsed = YAML.parse(rawFrontmatter);

  return {
    bodySource: rawSource.slice(endOffset + FRONTMATTER_BOUNDARY.length + 2),
    frontmatter:
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {},
  };
}

function extractLeadingTitleHeading(bodySource: string) {
  const newlineIndex = bodySource.indexOf("\n");
  const firstLine =
    newlineIndex === -1 ? bodySource : bodySource.slice(0, newlineIndex);
  const headingMatch = firstLine.match(TITLE_HEADING_PATTERN);

  if (!headingMatch) {
    return null;
  }

  let remainder = newlineIndex === -1 ? "" : bodySource.slice(newlineIndex + 1);
  let hasSpacerAfterTitleHeading = false;

  if (remainder.startsWith("\n")) {
    hasSpacerAfterTitleHeading = true;
    remainder = remainder.slice(1);
  }

  return {
    bodyLineStart: 1 + (hasSpacerAfterTitleHeading ? 1 : 0),
    bodySource: remainder,
    hasSpacerAfterTitleHeading,
    title: headingMatch[1].trim(),
  };
}

function serializeFrontmatter(frontmatter: Record<string, unknown>) {
  const entries = Object.entries(frontmatter).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    return null;
  }

  const yamlSource = YAML.stringify(Object.fromEntries(entries)).trimEnd();

  return `${FRONTMATTER_BOUNDARY}\n${yamlSource}\n${FRONTMATTER_BOUNDARY}`;
}

function composeRawNoteSource(
  frontmatter: Record<string, unknown>,
  bodySource: string,
) {
  const frontmatterBlock = serializeFrontmatter(frontmatter);

  if (!frontmatterBlock) {
    return bodySource;
  }

  if (!bodySource) {
    return `${frontmatterBlock}\n`;
  }

  return `${frontmatterBlock}\n${bodySource}`;
}

function buildBodyWithTitleHeading(
  title: string,
  bodySource: string,
  hasSpacerAfterTitleHeading: boolean,
) {
  if (!bodySource) {
    return `# ${title}`;
  }

  return `# ${title}${hasSpacerAfterTitleHeading ? "\n\n" : "\n"}${bodySource}`;
}

export function parseEditableNoteSource(
  rawSource: string,
  path: string,
): EditableNoteSource {
  const { bodySource, frontmatter } = parseFrontmatterPreservingBody(rawSource);
  const fallbackTitle = getVaultBasename(path);
  const frontmatterTitle =
    typeof frontmatter.title === "string" ? frontmatter.title.trim() : "";
  const headingTitle = extractLeadingTitleHeading(bodySource);

  if (frontmatterTitle) {
    return {
      bodyLineStart:
        headingTitle?.title === frontmatterTitle ? headingTitle.bodyLineStart : 0,
      bodySource:
        headingTitle?.title === frontmatterTitle ? headingTitle.bodySource : bodySource,
      frontmatter,
      hasSpacerAfterTitleHeading:
        headingTitle?.title === frontmatterTitle
          ? headingTitle.hasSpacerAfterTitleHeading
          : false,
      path,
      title: frontmatterTitle,
      titleStorage: "frontmatter",
    };
  }

  if (headingTitle) {
    return {
      bodyLineStart: headingTitle.bodyLineStart,
      bodySource: headingTitle.bodySource,
      frontmatter,
      hasSpacerAfterTitleHeading: headingTitle.hasSpacerAfterTitleHeading,
      path,
      title: headingTitle.title || fallbackTitle,
      titleStorage: "heading",
    };
  }

  return {
    bodyLineStart: 0,
    bodySource,
    frontmatter,
    hasSpacerAfterTitleHeading: true,
    path,
    title: fallbackTitle,
    titleStorage: "virtual",
  };
}

export function composeEditableNoteSource(
  source: EditableNoteSource,
  nextState: {
    bodySource: string;
    title: string;
  },
) {
  const nextTitle = nextState.title.trim() || getVaultBasename(source.path);

  if (source.titleStorage === "frontmatter") {
    return composeRawNoteSource(
      {
        ...source.frontmatter,
        title: nextTitle,
      },
      nextState.bodySource,
    );
  }

  if (source.titleStorage === "heading") {
    return composeRawNoteSource(
      source.frontmatter,
      buildBodyWithTitleHeading(
        nextTitle,
        nextState.bodySource,
        source.hasSpacerAfterTitleHeading,
      ),
    );
  }

  if (nextTitle !== source.title) {
    return composeRawNoteSource(
      source.frontmatter,
      buildBodyWithTitleHeading(nextTitle, nextState.bodySource, true),
    );
  }

  return composeRawNoteSource(source.frontmatter, nextState.bodySource);
}
