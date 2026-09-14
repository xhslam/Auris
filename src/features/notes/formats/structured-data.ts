import { parse as parseToml } from "smol-toml";
import { parseDocument } from "yaml";
import type { NotesFormatId } from "@/features/notes/formats/format-registry";

const STRUCTURED_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

export type StructuredDataFormat = Extract<
  NotesFormatId,
  "csv" | "json" | "jsonl" | "toml" | "tsv" | "yaml"
>;

export type StructuredDataResult =
  | { ok: true; value: unknown }
  | {
      ok: false;
      error: {
        column?: number;
        line?: number;
        message: string;
      };
    };

function parseDelimited(source: string, delimiter: string): unknown[] {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
      else { quoted = !quoted; }
      continue;
    }
    if (!quoted && character === delimiter) { row.push(cell); cell = ""; continue; }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    cell += character;
  }
  if (quoted) throw new Error("Delimited data contains an unterminated quoted field.");
  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  if (rows.length === 0) return [];
  const [header, ...data] = rows;
  return data.slice(0, 1000).map((values) => Object.fromEntries(header.map((name, index) => [name || `column_${index + 1}`, values[index] ?? ""])));
}
function errorResult(error: unknown): StructuredDataResult {
  if (error instanceof Error) {
    return {
      ok: false,
      error: {
        message: error.message.slice(0, 500),
      },
    };
  }
  return {
    ok: false,
    error: {
      message: "Structured data could not be parsed.",
    },
  };
}

export function parseStructuredData(
  format: StructuredDataFormat,
  source: string,
): StructuredDataResult {
  if (new TextEncoder().encode(source).byteLength > STRUCTURED_PREVIEW_MAX_BYTES) {
    return {
      ok: false,
      error: {
        message: "Structured preview is limited to 2 MiB.",
      },
    };
  }

  try {
    if (format === "csv" || format === "tsv") {
      return { ok: true, value: parseDelimited(source, format === "csv" ? "," : "\t") };
    }
    if (format === "json") {
      return { ok: true, value: JSON.parse(source) as unknown };
    }
    if (format === "jsonl") {
      return {
        ok: true,
        value: source
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line) as unknown),
      };
    }
    if (format === "toml") {
      return { ok: true, value: parseToml(source) };
    }

    const document = parseDocument(source, {
      schema: "core",
    });
    if (document.errors.length > 0) {
      const [first] = document.errors;
      return {
        ok: false,
        error: {
          message: first?.message.slice(0, 500) ?? "YAML could not be parsed.",
        },
      };
    }
    return { ok: true, value: document.toJS({ maxAliasCount: 0 }) };
  } catch (error) {
    return errorResult(error);
  }
}
