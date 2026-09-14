#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SOURCE = "/Users/apple/Documents/文件区/05-word";
const DEFAULT_OUTPUT = path.join(
  process.cwd(),
  "src/features/dictionary/personal-vocab/word-index.json",
);

const sourceDir = process.argv[2] ?? DEFAULT_SOURCE;
const outputPath = process.argv[3] ?? DEFAULT_OUTPUT;

function stripInlineMarkdown(value) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function normalizeLookupKey(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, "")
    .replace(/[^a-z']+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseSourceInfo(lines) {
  const source = {};

  for (const rawLine of lines) {
    const line = rawLine.replace(/^[-*]\s*/, "").trim();
    const match = line.match(/^\*\*([^*]+)\*\*:\s*(.+)$/);

    if (!match) {
      continue;
    }

    const [, label, value] = match;
    const normalizedValue = value.trim();

    if (label === "源表序号") {
      source.sourceIndex = Number.parseInt(normalizedValue, 10);
    } else if (label === "考频") {
      source.frequency = Number.parseInt(normalizedValue, 10);
    } else if (label === "PDF 原编号") {
      source.pdfIndex = Number.parseInt(normalizedValue, 10);
    } else if (label === "来源段落") {
      source.sourceParagraph = normalizedValue;
    }
  }

  return source;
}

function parseSections(bodyLines) {
  const sections = [];
  let current = null;

  for (const rawLine of bodyLines) {
    const heading = rawLine.match(/^#{2,3}\s+(.+?)\s*$/);

    if (heading) {
      current = {
        title: heading[1].trim(),
        lines: [],
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    const withoutQuote = rawLine.replace(/^>\s?/, "");
    const withoutBullet = /^\s*[-*]\s+/.test(withoutQuote)
      ? withoutQuote.replace(/^\s*[-*]\s+/, "")
      : withoutQuote;
    const line = stripInlineMarkdown(withoutBullet);

    if (line) {
      current.lines.push(line);
    }
  }

  return sections;
}

function findMetadataValue(lines, labels) {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(
    `^\\s*(?:[-*]\\s*)?\\*\\*(?:${labelPattern})[：:]\\*\\*\\s*(.+?)\\s*$`,
  );

  for (const rawLine of lines) {
    const match = rawLine.match(pattern);

    if (match) {
      return stripInlineMarkdown(match[1]);
    }
  }

  return "";
}

function findSectionValue(sections, titles) {
  const section = sections.find((candidate) => titles.includes(candidate.title));
  return section?.lines.find(Boolean) ?? "";
}

function findWordHeading(lines, fileName) {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^#{1,2}\s+(.+?)\s*$/);

    if (!match) {
      continue;
    }

    const heading = match[1].trim();
    // A vocabulary title always starts with an English word or phrase. This
    // intentionally skips section headings such as "## 核心语义" and supports
    // both legacy "## Word" files and newer "# Word" files.
    if (!/^[a-z][a-z0-9'’/().,& -]*(?:\s{2,}|\s+[\[/]|$)/i.test(heading)) {
      continue;
    }

    return { heading, index };
  }

  throw new Error(`Missing word heading in ${fileName}`);
}

function parseEntry(filePath, fileName) {
  const markdown = fs.readFileSync(filePath, "utf8");
  const lines = markdown.split(/\r?\n/);
  const { heading, index: headingIndex } = findWordHeading(lines, fileName);
  const headingMatch = heading.match(/^(.+?)\s{2,}(.+)$/);
  const word = (headingMatch ? headingMatch[1] : heading.split(/\s+/)[0]).trim();
  const headingTail = (headingMatch ? headingMatch[2] : heading.slice(word.length)).trim();
  const headingPronunciations = Array.from(headingTail.matchAll(/\/[^/\n]+\/|\[[^\]\n]+\]/g)).map(
    (match) => match[0],
  );
  const headingDefinition = stripInlineMarkdown(
    headingTail.replace(/\/[^/\n]+\/|\[[^\]\n]+\]/g, "").trim(),
  );
  const bodyLines = lines.slice(headingIndex + 1);
  const sections = parseSections(bodyLines);
  const sourceSection = sections.find((section) => section.title === "来源信息");
  const partOfSpeechMatch = sections
    .flatMap((section) => section.lines)
    .join(" ")
    .match(/词性线索是\s*([^。；，,\s]+)/);
  const definition =
    headingDefinition ||
    findMetadataValue(bodyLines, ["释义", "定义", "解释"]) ||
    findSectionValue(sections, ["本文含义", "核心语义"]);
  const metadataPronunciation = findMetadataValue(bodyLines, ["音标", "发音"]);
  const pronunciations = headingPronunciations.length
    ? headingPronunciations
    : metadataPronunciation
      ? [metadataPronunciation]
      : [];
  const partOfSpeech =
    partOfSpeechMatch?.[1] ?? findMetadataValue(bodyLines, ["词性"]);

  return {
    definition,
    fileName,
    lookupKey: normalizeLookupKey(word),
    partOfSpeech,
    pronunciations,
    sections,
    source: sourceSection ? parseSourceInfo(sourceSection.lines) : {},
    word,
  };
}

function buildPersonalVocabIndex(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Personal vocab source directory does not exist: ${sourceDir}`);
  }

  const files = fs
    .readdirSync(sourceDir)
    .filter((fileName) => /^\d{4}-.+\.md$/i.test(fileName) && fileName !== "0000-index.md")
    .sort((a, b) => a.localeCompare(b, "en"));

  const entriesByKey = new Map();
  const duplicateKeys = [];

  for (const fileName of files) {
    const entry = parseEntry(path.join(sourceDir, fileName), fileName);

    if (!entry.lookupKey) {
      throw new Error(`Could not derive a lookup key from ${fileName}`);
    }

    if (!entry.definition) {
      throw new Error(`Missing definition in ${fileName}`);
    }

    if (entriesByKey.has(entry.lookupKey)) {
      duplicateKeys.push(entry.lookupKey);
      continue;
    }

    entriesByKey.set(entry.lookupKey, entry);
  }

  if (duplicateKeys.length) {
    console.warn(
      `Skipped ${duplicateKeys.length} duplicate entries; kept the first file in filename order: ${[
        ...new Set(duplicateKeys),
      ]
        .slice(0, 12)
        .join(", ")}`,
    );
  }

  return {
    duplicateKeys: [...new Set(duplicateKeys)],
    entries: [...entriesByKey.values()],
  };
}

function main() {
  const { entries } = buildPersonalVocabIndex(sourceDir);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        entryCount: entries.length,
        entries,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Synced ${entries.length} personal vocab entries to ${outputPath}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildPersonalVocabIndex,
  findWordHeading,
  normalizeLookupKey,
  parseEntry,
};
