import { parse as parseToml } from "smol-toml";
import { parseDocument } from "yaml";
import type { NotesFormatId } from "@/features/notes/formats/format-registry";

const STRUCTURED_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

export type StructuredDataFormat = Extract<
  NotesFormatId,
  "json" | "jsonl" | "toml" | "yaml"
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
