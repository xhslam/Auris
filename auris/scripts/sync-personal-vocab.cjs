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
    const heading = rawLine.match(/^###\s+(.+?)\s*$/);

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

function parseEntry(filePath, fileName) {
  const markdown = fs.readFileSync(filePath, "utf8");
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.startsWith("## "));

  if (headingIndex === -1) {
    throw new Error(`Missing word heading in ${fileName}`);
  }

  const heading = lines[headingIndex].replace(/^##\s+/, "").trim();
  const headingMatch = heading.match(/^(.+?)\s{2,}(.+)$/);
  const word = (headingMatch ? headingMatch[1] : heading.split(/\s+/)[0]).trim();
  const headingTail = (headingMatch ? headingMatch[2] : heading.slice(word.length)).trim();
  const pronunciations = Array.from(headingTail.matchAll(/\/[^/\n]+\/|\[[^\]\n]+\]/g)).map(
    (match) => match[0],
  );
  const definition = stripInlineMarkdown(
    headingTail.replace(/\/[^/\n]+\/|\[[^\]\n]+\]/g, "").trim(),
  );
  const bodyLines = lines.slice(headingIndex + 1);
  const sections = parseSections(bodyLines);
  const sourceSection = sections.find((section) => section.title === "来源信息");
  const partOfSpeechMatch = sections
    .flatMap((section) => section.lines)
    .join(" ")
    .match(/词性线索是\s*([^。；，,\s]+)/);

  return {
    definition,
    fileName,
    lookupKey: normalizeLookupKey(word),
    partOfSpeech: partOfSpeechMatch?.[1] ?? "",
    pronunciations,
    sections,
    source: sourceSection ? parseSourceInfo(sourceSection.lines) : {},
    word,
  };
}

function main() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Personal vocab source directory does not exist: ${sourceDir}`);
  }

  const files = fs
    .readdirSync(sourceDir)
    .filter((fileName) => /^\d{4}-.+\.md$/i.test(fileName) && fileName !== "0000-index.md")
    .sort((a, b) => a.localeCompare(b, "en"));

  const entries = files.map((fileName) => parseEntry(path.join(sourceDir, fileName), fileName));
  const duplicateKeys = entries
    .map((entry) => entry.lookupKey)
    .filter((key, index, keys) => key && keys.indexOf(key) !== index);

  if (duplicateKeys.length > 0) {
    console.warn(
      `Found duplicate lookup keys; lookup will use the first occurrence: ${[
        ...new Set(duplicateKeys),
      ]
        .slice(0, 12)
        .join(", ")}`,
    );
  }

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

main();
