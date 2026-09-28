import {
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import {
  CodeBlockPreviewWidget,
  ImagePreviewWidget,
  MathInlinePreviewWidget,
  MathBlockPreviewWidget,
  normalizeLanguage,
  resolveMarkdownImageSource,
} from "@/features/notes/editor/code-block-preview";
import {
  createWikiLinkResolver,
  type WikiLinkResolver,
} from "@/features/notes/documents/backlinks";
import type { NoteDocument } from "@/features/notes/documents/document-types";
import {
  getWikiLinkLabel,
  parseWikiLinkTarget,
} from "@/features/notes/documents/wiki-link-navigation";
import { findCompatibleMathDelimiterSpans } from "@/features/notes/markdown/notes-markdown-dialect";

const HEADING_PATTERN = /^(#{1,6})\s+/;
const TASK_PATTERN = /^(\s*)([-*+])\s+\[([ xX])\](\s*)/;
const UNORDERED_LIST_PATTERN = /^(\s*)([-*+])(\s+)/;
const ORDERED_LIST_PATTERN = /^(\s*)(\d+[.)])(\s+)/;
const CALLOUT_PATTERN = /^(\s{0,3}>\s*)\[!([^\]]+)\]\s*(.*)$/;
const QUOTE_PATTERN = /^(\s{0,3}>\s?)(.*)$/;
const HORIZONTAL_RULE_PATTERN = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const FENCE_PATTERN = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;
const IMAGE_PATTERN = /^\s*!\[([^\]]*)\]\((.*)\)\s*$/;
const MATH_BLOCK_OPEN_PATTERN = /^\s*(\$\$|(\\{1,3})\[)\s*$/;
const MATH_DOLLAR_CLOSE_PATTERN = /^\s*\$\$\s*$/;
const MATH_BRACKET_CLOSE_PATTERN = /^\s*(\\{1,3})\]\s*$/;

type EditableLineRange = {
  from: number;
  to: number;
};

type LineDescriptor =
  | {
      kind: "callout-body";
      prefixLength: number;
      tone: string;
    }
  | {
      kind: "callout-title";
      prefixLength: number;
      tone: string;
    }
  | {
      depth: number;
      kind: "heading";
      prefixLength: number;
    }
  | {
      kind: "horizontal-rule";
    }
  | {
      kind: "ordered-list";
      marker: string;
      markerFrom: number;
      markerTo: number;
    }
  | {
      kind: "quote";
      prefixLength: number;
    }
  | {
      checked: boolean;
      kind: "task";
      markerFrom: number;
      markerTo: number;
    }
  | {
      kind: "unordered-list";
      markerFrom: number;
      markerTo: number;
    };

type CodeBlockRange = {
  from: number;
  language: string;
  text: string;
  to: number;
};

type MixedRenderingEnvironment = {
  resolveImageUrl?: (source: string) => string | null;
  getDocuments?: () => NoteDocument[];
  onOpenWikiLink?: (target: string) => void;
};

const WIKI_LINK_PATTERN = /\[\[([^\]]+)\]\]/g;

export function deriveMixedEditableLineRange(state: EditorState): EditableLineRange {
  const { main } = state.selection;

  return {
    from: state.doc.lineAt(main.from).number - 1,
    to: state.doc.lineAt(main.to).number - 1,
  };
}

export function shouldSuspendMixedRendering(input: {
  composing: boolean;
  compositionStarted: boolean;
}) {
  return input.composing || input.compositionStarted;
}

const setMixedRenderingSuspended = StateEffect.define<boolean>();
const refreshMixedRendering = StateEffect.define<null>();

const mixedRenderingSuspendedField = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setMixedRenderingSuspended)) {
        return effect.value;
      }
    }

    return value;
  },
});

function formatCalloutTone(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function isLineEditable(lineNumber: number, editableRange: EditableLineRange) {
  return lineNumber >= editableRange.from && lineNumber <= editableRange.to;
}

function createLineDecoration(className: string) {
  return Decoration.line({
    class: className,
  });
}

function hideSyntaxPrefix(builder: RangeSetBuilder<Decoration>, from: number, to: number) {
  if (from >= to) {
    return;
  }

  builder.add(
    from,
    to,
    Decoration.replace({
      widget: new HiddenSyntaxWidget(),
    }),
  );
}

function addLineClass(
  builder: RangeSetBuilder<Decoration>,
  lineFrom: number,
  className: string,
) {
  builder.add(lineFrom, lineFrom, createLineDecoration(className));
}

function isRangeEditable(
  editableRange: EditableLineRange,
  startLine: number,
  endLine: number,
) {
  return editableRange.from <= endLine && editableRange.to >= startLine;
}

function parseStandaloneImage(text: string) {
  const match = text.match(IMAGE_PATTERN);

  if (!match) {
    return null;
  }

  const rawDestination = match[2]?.trim() ?? "";

  if (!rawDestination) {
    return null;
  }

  const destinationMatch = rawDestination.match(
    /^(.*?)(?:\s+(?:"([^"]*)"|'([^']*)'|([^)]+)))?$/,
  );

  let source = destinationMatch?.[1]?.trim() ?? rawDestination;

  if (source.startsWith("<") && source.endsWith(">")) {
    source = source.slice(1, -1).trim();
  }

  return {
    alt: match[1]?.trim() ?? "",
    source,
    title:
      destinationMatch?.[2] ??
      destinationMatch?.[3] ??
      destinationMatch?.[4] ??
      "",
  };
}

function describeLine(
  text: string,
  activeCalloutTone: string | null,
): {
  descriptor: LineDescriptor | null;
  nextCalloutTone: string | null;
} {
  if (!text.trim()) {
    return {
      descriptor: null,
      nextCalloutTone: null,
    };
  }

  const calloutMatch = text.match(CALLOUT_PATTERN);

  if (calloutMatch) {
    const titleText = calloutMatch[3] ?? "";

    return {
      descriptor: {
        kind: "callout-title",
        prefixLength: text.length - titleText.length,
        tone: calloutMatch[2].toLowerCase(),
      },
      nextCalloutTone: calloutMatch[2].toLowerCase(),
    };
  }

  const quoteMatch = text.match(QUOTE_PATTERN);

  if (quoteMatch) {
    if (activeCalloutTone) {
      return {
        descriptor: {
          kind: "callout-body",
          prefixLength: quoteMatch[1].length,
          tone: activeCalloutTone,
        },
        nextCalloutTone: activeCalloutTone,
      };
    }

    return {
      descriptor: {
        kind: "quote",
        prefixLength: quoteMatch[1].length,
      },
      nextCalloutTone: null,
    };
  }

  const headingMatch = text.match(HEADING_PATTERN);

  if (headingMatch) {
    return {
      descriptor: {
        depth: headingMatch[1].length,
        kind: "heading",
        prefixLength: headingMatch[0].length,
      },
      nextCalloutTone: null,
    };
  }

  const taskMatch = text.match(TASK_PATTERN);

  if (taskMatch) {
    const markerFrom = taskMatch[1].length;

    return {
      descriptor: {
        checked: taskMatch[3].toLowerCase() === "x",
        kind: "task",
        markerFrom,
        markerTo: taskMatch[0].length,
      },
      nextCalloutTone: null,
    };
  }

  const unorderedMatch = text.match(UNORDERED_LIST_PATTERN);

  if (unorderedMatch) {
    const markerFrom = unorderedMatch[1].length;

    return {
      descriptor: {
        kind: "unordered-list",
        markerFrom,
        markerTo:
          unorderedMatch[1].length +
          unorderedMatch[2].length +
          unorderedMatch[3].length,
      },
      nextCalloutTone: null,
    };
  }

  const orderedMatch = text.match(ORDERED_LIST_PATTERN);

  if (orderedMatch) {
    const markerFrom = orderedMatch[1].length;

    return {
      descriptor: {
        kind: "ordered-list",
        marker: orderedMatch[2],
        markerFrom,
        markerTo:
          orderedMatch[1].length +
          orderedMatch[2].length +
          orderedMatch[3].length,
      },
      nextCalloutTone: null,
    };
  }

  if (HORIZONTAL_RULE_PATTERN.test(text)) {
    return {
      descriptor: {
        kind: "horizontal-rule",
      },
      nextCalloutTone: null,
    };
  }

  return {
    descriptor: null,
    nextCalloutTone: null,
  };
}

function addCodeBlockDecoration(
  builder: RangeSetBuilder<Decoration>,
  block: CodeBlockRange,
) {
  builder.add(
    block.from,
    block.to,
    Decoration.replace({
      block: true,
      inclusive: true,
      widget: new CodeBlockPreviewWidget({
        language: block.language,
        text: block.text,
      }),
    }),
  );
}

function addImageDecoration(
  builder: RangeSetBuilder<Decoration>,
  input: {
    alt: string;
    resolvedSrc: string | null;
    source: string;
    title: string;
    from: number;
    to: number;
  },
) {
  builder.add(
    input.from,
    input.to,
    Decoration.replace({
      block: true,
      inclusive: true,
      widget: new ImagePreviewWidget({
        alt: input.alt,
        resolvedSrc: input.resolvedSrc,
        source: input.source,
        title: input.title,
      }),
    }),
  );
}

function addMathDecoration(
  builder: RangeSetBuilder<Decoration>,
  block: { from: number; text: string; to: number },
) {
  builder.add(
    block.from,
    block.to,
    Decoration.replace({
      block: true,
      inclusive: true,
      widget: new MathBlockPreviewWidget({
        text: block.text,
      }),
    }),
  );
}

function isEscapedDollar(text: string, index: number) {
  let backslashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}

function isInlineMathSpan(text: string, from: number, to: number) {
  const body = text.slice(from + 1, to);

  if (!body.trim() || /^\s|\s$/.test(body)) {
    return false;
  }

  return true;
}

type InlineSpan = {
  decoration: Decoration;
  from: number;
  to: number;
};

function collectInlineMathSpans(line: {
  from: number;
  text: string;
}): InlineSpan[] {
  const spans: InlineSpan[] = [];

  for (const span of findCompatibleMathDelimiterSpans(line.text)) {
    spans.push({
      decoration: Decoration.replace({
        widget: new MathInlinePreviewWidget({
          display: span.kind === "display",
          text: span.content,
        }),
      }),
      from: line.from + span.start,
      to: line.from + span.end,
    });
  }

  let searchStart = 0;

  while (searchStart < line.text.length) {
    const open = line.text.indexOf("$", searchStart);

    if (open < 0) {
      break;
    }

    if (line.text[open + 1] === "$" || isEscapedDollar(line.text, open)) {
      searchStart = open + 1;
      continue;
    }

    let close = -1;
    let cursor = open + 1;

    while (cursor < line.text.length) {
      const candidate = line.text.indexOf("$", cursor);

      if (candidate < 0) {
        break;
      }

      if (
        line.text[candidate + 1] === "$" ||
        isEscapedDollar(line.text, candidate)
      ) {
        cursor = candidate + 1;
        continue;
      }

      if (!isInlineMathSpan(line.text, open, candidate)) {
        cursor = candidate + 1;
        continue;
      }

      close = candidate;
      break;
    }

    if (close < 0) {
      searchStart = open + 1;
      continue;
    }

    const mathText = line.text.slice(open + 1, close).trim();

    spans.push({
      decoration: Decoration.replace({
        widget: new MathInlinePreviewWidget({
          text: mathText,
        }),
      }),
      from: line.from + open,
      to: line.from + close + 1,
    });

    searchStart = close + 1;
    if (searchStart <= open) {
      searchStart = open + 1;
    }
  }

  return spans;
}

function collectWikiLinkSpans(
  line: { from: number; text: string },
  environment: MixedRenderingEnvironment | undefined,
  resolveExists: (token: string) => boolean,
): InlineSpan[] {
  const spans: InlineSpan[] = [];

  for (const match of line.text.matchAll(WIKI_LINK_PATTERN)) {
    const innerToken = match[1] ?? "";
    const start = match.index ?? 0;

    if (!innerToken.trim()) {
      continue;
    }

    spans.push({
      decoration: Decoration.replace({
        widget: new WikiLinkWidget(
          innerToken,
          getWikiLinkLabel(innerToken),
          resolveExists(innerToken),
          environment?.onOpenWikiLink,
        ),
      }),
      from: line.from + start,
      to: line.from + start + match[0].length,
    });
  }

  return spans;
}

// Inline math spans and wiki-link widgets share the same builder, which
// requires ranges sorted by `from`. Collect both, sort, and drop overlaps
// before adding so the RangeSetBuilder invariant holds on mixed lines.
function addInlineDecorations(
  builder: RangeSetBuilder<Decoration>,
  line: { from: number; text: string },
  environment: MixedRenderingEnvironment | undefined,
  resolveExists: (token: string) => boolean,
) {
  // Fast path: the vast majority of lines contain neither inline math nor a
  // wiki link, so skip the scans/allocation/sort entirely for them.
  const hasMath =
    line.text.includes("$") ||
    line.text.includes("\\(") ||
    line.text.includes("\\[");
  const hasWikiLink = line.text.includes("[[");

  if (!hasMath && !hasWikiLink) {
    return;
  }

  const spans = [
    ...(hasMath ? collectInlineMathSpans(line) : []),
    ...(hasWikiLink ? collectWikiLinkSpans(line, environment, resolveExists) : []),
  ].sort((a, b) => a.from - b.from || a.to - b.to);

  let lastTo = -1;

  for (const span of spans) {
    if (span.from < lastTo) {
      continue;
    }

    builder.add(span.from, span.to, span.decoration);
    lastTo = span.to;
  }
}

class HiddenSyntaxWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const element = document.createElement("span");
    element.className = "notes-v2__cm-widget notes-v2__cm-widget--hidden";
    element.setAttribute("aria-hidden", "true");
    return element;
  }
}

class MarkerWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly className: string,
  ) {
    super();
  }

  eq(other: MarkerWidget) {
    return other.label === this.label && other.className === this.className;
  }

  toDOM() {
    const element = document.createElement("span");
    element.className = `notes-v2__cm-widget ${this.className}`;
    element.setAttribute("aria-hidden", "true");
    element.textContent = this.label;
    return element;
  }
}

class WikiLinkWidget extends WidgetType {
  constructor(
    private readonly token: string,
    private readonly label: string,
    private readonly exists: boolean,
    private readonly onOpen?: (target: string) => void,
  ) {
    super();
  }

  eq(other: WikiLinkWidget) {
    return (
      other.token === this.token &&
      other.label === this.label &&
      other.exists === this.exists
    );
  }

  toDOM() {
    const element = document.createElement("span");
    element.className = `notes-v2__cm-widget notes-v2__cm-wikilink ${
      this.exists
        ? "notes-v2__cm-wikilink--exists"
        : "notes-v2__cm-wikilink--missing"
    }`;
    element.textContent = this.label;
    element.setAttribute("role", "link");
    element.setAttribute(
      "data-wikilink-target",
      parseWikiLinkTarget(this.token),
    );

    // Obsidian-style: a plain click on the rendered link jumps to the target,
    // while the raw `[[...]]` stays editable on the active line (where no
    // widget is rendered). stopPropagation prevents CodeMirror from also
    // starting a text selection.
    element.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.onOpen?.(this.token);
    });

    return element;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(private readonly checked: boolean) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }

  toDOM() {
    const label = document.createElement("label");
    label.className =
      "notes-v2__cm-widget notes-v2__cm-widget--checkbox notes-v2__reading-task";
    label.setAttribute("aria-hidden", "true");

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.disabled = true;

    label.append(input);

    return label;
  }
}

function buildMixedLineDecorations(
  state: EditorState,
  environment: MixedRenderingEnvironment | undefined,
  resolveExists: (token: string) => boolean,
): DecorationSet {
  if (state.field(mixedRenderingSuspendedField)) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const editableRange = deriveMixedEditableLineRange(state);
  let activeCalloutTone: string | null = null;
  let activeCodeBlock:
    | {
        fenceChar: string;
        fenceLength: number;
        from: number;
        language: string;
        startLineNumber: number;
        textLines: string[];
      }
    | null = null;
  let activeMathBlock:
    | {
        delimiter: string;
        from: number;
        startLineNumber: number;
        textLines: string[];
      }
    | null = null;

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const lineIndex = line.number - 1;

    if (activeCodeBlock) {
      const closingMatch = line.text.match(
        new RegExp(
          `^\\s{0,3}${activeCodeBlock.fenceChar}{${activeCodeBlock.fenceLength},}\\s*$`,
        ),
      );

      if (closingMatch) {
        const codeBlock: CodeBlockRange = {
          from: activeCodeBlock.from,
          language: activeCodeBlock.language,
          text: activeCodeBlock.textLines.join("\n").trimEnd(),
          to: line.to,
        };

        if (
          !isRangeEditable(
            editableRange,
            activeCodeBlock.startLineNumber - 1,
            lineIndex,
          )
        ) {
          addCodeBlockDecoration(builder, codeBlock);
        }

        activeCodeBlock = null;
        continue;
      }

      activeCodeBlock.textLines.push(line.text);
      continue;
    }

    if (activeMathBlock) {
      const bracketCloseMatch = line.text.match(MATH_BRACKET_CLOSE_PATTERN);
      const isClosingDelimiter =
        activeMathBlock.delimiter === "$$"
          ? MATH_DOLLAR_CLOSE_PATTERN.test(line.text)
          : bracketCloseMatch?.[1]?.length ===
            activeMathBlock.delimiter.length - 1;
      if (isClosingDelimiter) {
        if (
          !isRangeEditable(
            editableRange,
            activeMathBlock.startLineNumber - 1,
            lineIndex,
          )
        ) {
          addMathDecoration(builder, {
            from: activeMathBlock.from,
            text: activeMathBlock.textLines.join("\n").trimEnd(),
            to: line.to,
          });
        }

        activeMathBlock = null;
        continue;
      }

      activeMathBlock.textLines.push(line.text);
      continue;
    }

    const fenceMatch = line.text.match(FENCE_PATTERN);

    if (fenceMatch) {
      activeCodeBlock = {
        fenceChar: fenceMatch[2][0],
        fenceLength: fenceMatch[2].length,
        from: line.from,
        language: normalizeLanguage(fenceMatch[3] ?? ""),
        startLineNumber: lineNumber,
        textLines: [],
      };
      continue;
    }

    const mathBlockOpen = line.text.match(MATH_BLOCK_OPEN_PATTERN);
    if (mathBlockOpen) {
      activeMathBlock = {
        delimiter: mathBlockOpen[1],
        from: line.from,
        startLineNumber: lineNumber,
        textLines: [],
      };
      continue;
    }

    const image = parseStandaloneImage(line.text);

    if (image && !isRangeEditable(editableRange, lineIndex, lineIndex)) {
      addImageDecoration(builder, {
        alt: image.alt,
        from: line.from,
        resolvedSrc:
          environment?.resolveImageUrl?.(image.source) ??
          resolveMarkdownImageSource(image.source, null),
        source: image.source,
        title: image.title,
        to: line.to,
      });
      continue;
    }

    const { descriptor, nextCalloutTone } = describeLine(
      line.text,
      activeCalloutTone,
    );

    activeCalloutTone = nextCalloutTone;
    const lineEditable = isLineEditable(lineIndex, editableRange);

    if (!descriptor) {
      if (!lineEditable) {
        addInlineDecorations(
          builder,
          {
            from: line.from,
            text: line.text,
          },
          environment,
          resolveExists,
        );
      }
      continue;
    }

    if (lineEditable) {
      // For heading lines: keep the heading font-size class even when the
      // cursor is on that line so the font size doesn't jump as the user
      // types. The raw `#` prefix stays visible (no prefix hiding), making
      // it clear the line is being edited while the visual weight is preserved.
      if (descriptor.kind === "heading") {
        addLineClass(
          builder,
          line.from,
          `notes-v2__cm-line--heading-${Math.min(descriptor.depth, 3)}`,
        );
      }
      continue;
    }

    switch (descriptor.kind) {
      case "heading": {
        addLineClass(
          builder,
          line.from,
          `notes-v2__cm-line--heading-${Math.min(descriptor.depth, 3)}`,
        );
        hideSyntaxPrefix(builder, line.from, line.from + descriptor.prefixLength);
        break;
      }
      case "task": {
        addLineClass(builder, line.from, "notes-v2__cm-line--task");
        builder.add(
          line.from + descriptor.markerFrom,
          line.from + descriptor.markerTo,
          Decoration.replace({
            widget: new CheckboxWidget(descriptor.checked),
          }),
        );
        break;
      }
      case "unordered-list": {
        addLineClass(builder, line.from, "notes-v2__cm-line--list-item");
        builder.add(
          line.from + descriptor.markerFrom,
          line.from + descriptor.markerTo,
          Decoration.replace({
            widget: new MarkerWidget(
              "•",
              "notes-v2__cm-widget--bullet-marker",
            ),
          }),
        );
        break;
      }
      case "ordered-list": {
        addLineClass(builder, line.from, "notes-v2__cm-line--ordered-item");
        builder.add(
          line.from + descriptor.markerFrom,
          line.from + descriptor.markerTo,
          Decoration.replace({
            widget: new MarkerWidget(
              descriptor.marker,
              "notes-v2__cm-widget--ordered-marker",
            ),
          }),
        );
        break;
      }
      case "quote": {
        addLineClass(builder, line.from, "notes-v2__cm-line--quote");
        hideSyntaxPrefix(builder, line.from, line.from + descriptor.prefixLength);
        break;
      }
      case "callout-title": {
        addLineClass(
          builder,
          line.from,
          "notes-v2__cm-line--callout notes-v2__cm-line--callout-title",
        );
        builder.add(
          line.from,
          line.from + descriptor.prefixLength,
          Decoration.replace({
            widget: new MarkerWidget(
              formatCalloutTone(descriptor.tone),
              "notes-v2__cm-widget--callout-label",
            ),
          }),
        );
        break;
      }
      case "callout-body": {
        addLineClass(
          builder,
          line.from,
          "notes-v2__cm-line--callout notes-v2__cm-line--callout-body",
        );
        hideSyntaxPrefix(builder, line.from, line.from + descriptor.prefixLength);
        break;
      }
      case "horizontal-rule": {
        addLineClass(builder, line.from, "notes-v2__cm-line--horizontal-rule");
        hideSyntaxPrefix(builder, line.from, line.to);
        break;
      }
    }

    addInlineDecorations(
      builder,
      {
        from: line.from,
        text: line.text,
      },
      environment,
      resolveExists,
    );
  }

  if (
    activeCodeBlock &&
    !isRangeEditable(
      editableRange,
      activeCodeBlock.startLineNumber - 1,
      state.doc.lines - 1,
    )
  ) {
    addCodeBlockDecoration(builder, {
      from: activeCodeBlock.from,
      language: activeCodeBlock.language,
      text: activeCodeBlock.textLines.join("\n").trimEnd(),
      to: state.doc.length,
    });
  }

  if (
    activeMathBlock &&
    !isRangeEditable(
      editableRange,
      activeMathBlock.startLineNumber - 1,
      state.doc.lines - 1,
    )
  ) {
    addMathDecoration(builder, {
      from: activeMathBlock.from,
      text: activeMathBlock.textLines.join("\n").trimEnd(),
      to: state.doc.length,
    });
  }

  return builder.finish();
}

function createMixedRenderingField(environment?: MixedRenderingEnvironment) {
  // Cache the wiki-link resolver by the documents array reference so the
  // (potentially expensive) target lookup is only rebuilt when the vault's
  // documents actually change, not on every keystroke.
  let cachedDocuments: NoteDocument[] | null = null;
  let cachedResolver: WikiLinkResolver | null = null;

  const resolveExists = (token: string): boolean => {
    const documents = environment?.getDocuments?.() ?? [];

    if (documents !== cachedDocuments || !cachedResolver) {
      cachedDocuments = documents;
      cachedResolver = createWikiLinkResolver(documents);
    }

    return cachedResolver(token);
  };

  return StateField.define<DecorationSet>({
    create(state) {
      return buildMixedLineDecorations(state, environment, resolveExists);
    },
    update(value, transaction) {
      if (transaction.effects.some((effect) => effect.is(refreshMixedRendering))) {
        return buildMixedLineDecorations(
          transaction.state,
          environment,
          resolveExists,
        );
      }

      // If the suspended state changed (e.g. IME composition start/end),
      // we must rebuild regardless of other conditions.
      if (transaction.effects.some((e) => e.is(setMixedRenderingSuspended))) {
        return buildMixedLineDecorations(
          transaction.state,
          environment,
          resolveExists,
        );
      }

      // If the document content didn't change, check whether the editable
      // line range (cursor / selection span) shifted. Decorations are
      // position-independent for non-editable lines, so we only need to
      // rebuild when the set of "currently editable" lines changes.
      if (!transaction.docChanged) {
        const prevRange = deriveMixedEditableLineRange(transaction.startState);
        const nextRange = deriveMixedEditableLineRange(transaction.state);

        if (
          prevRange.from === nextRange.from &&
          prevRange.to === nextRange.to
        ) {
          // Neither content nor editable range changed — reuse existing
          // decorations. This avoids an O(n) full-document scan on cursor
          // movements that stay within the same line.
          return value;
        }
      }

      return buildMixedLineDecorations(
        transaction.state,
        environment,
        resolveExists,
      );
    },
  });
}

export function refreshNotesMixedRendering(view: EditorView | null) {
  view?.dispatch({ effects: refreshMixedRendering.of(null) });
}

export function createNotesMixedRendering(
  environment?: MixedRenderingEnvironment,
) {
  const notesMixedRenderingField = createMixedRenderingField(environment);

  return [
    mixedRenderingSuspendedField,
    notesMixedRenderingField,
    EditorView.decorations.from(notesMixedRenderingField),
    EditorView.updateListener.of((update) => {
      const nextSuspended = shouldSuspendMixedRendering(update.view);
      const currentSuspended = update.state.field(mixedRenderingSuspendedField);

      if (nextSuspended === currentSuspended) {
        return;
      }

      update.view.dispatch({
        effects: setMixedRenderingSuspended.of(nextSuspended),
      });
    }),
  ];
}

export const notesMixedRendering = createNotesMixedRendering();
