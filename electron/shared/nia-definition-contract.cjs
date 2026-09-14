"use strict";

/**
 * Canonical, packaged parser/normalizer/serializer for Nia definition files
 * (single-prompt Markdown+frontmatter documents) and their legacy VMark
 * "Genie" equivalents.
 *
 * This module is the *only* authority for turning raw Markdown text into a
 * trusted internal AST. Callers — including the Electron main process — must
 * always reparse raw source through `parseNiaDefinitionMarkdown` /
 * `reparseTrustedSource`; a renderer-supplied normalized object is never
 * treated as authoritative.
 */

const YAML = require("yaml");
const { z } = require("zod");

const NIA_SOURCE_COMPATIBILITY = Object.freeze([
  "canonical_v1",
  "legacy_genie_v1",
  "legacy_genie_v0",
]);

const NIA_DEFINITION_SCOPES = Object.freeze(["selection", "document", "workflow-step"]);
const NIA_DEFINITION_ACTIONS = Object.freeze(["replace", "insert", "append", "none"]);
const NIA_DEFINITION_APPROVALS = Object.freeze(["ask", "never"]);
const NIA_DEFINITION_IO_TYPES = Object.freeze(["text"]);
const NIA_STEP_REF_FAMILIES = Object.freeze(["nia", "genie"]);
const NIA_STEP_REF_SOURCE_COMPATIBILITY = Object.freeze(["canonical", "legacy_genie"]);

const NIA_DEFINITION_ERROR_CODES = Object.freeze([
  "SOURCE_NOT_RAW_MARKDOWN",
  "SOURCE_TOO_LARGE",
  "FRONTMATTER_REQUIRED",
  "FRONTMATTER_TOO_LARGE",
  "FRONTMATTER_INVALID_YAML",
  "FRONTMATTER_UNSAFE_YAML",
  "STRUCTURE_TOO_DEEP",
  "CONFLICTING_VERSION_KEYS",
  "UNSUPPORTED_VERSION",
  "INVALID_DEFINITION_SHAPE",
  "BODY_REQUIRED",
  "INVALID_STEP_REF",
  "DUPLICATE_DEFINITION_ID",
]);

const NIA_DEFINITION_LIMITS = Object.freeze({
  maxSourceBytes: 256 * 1024,
  maxFrontmatterBytes: 64 * 1024,
  maxStructureDepth: 8,
  maxAliasCount: 0,
  id: 128,
  name: 64,
  description: 4_096,
  category: 64,
  model: 160,
  tag: 64,
  maxTags: 32,
  ioAccept: 16,
  ioDescription: 2_000,
  bodyBytes: 200 * 1024,
  context: 50,
});

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u;
const MODEL_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_.:-]{0,158}[A-Za-z0-9])?$/u;
const STEP_REF_PATTERN = /^(nia|genie)\/([a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?)$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

function hasControlCharacters(value) {
  return CONTROL_CHARACTER_PATTERN.test(value);
}

function isFreeOfTraversal(value) {
  return !value.includes("..");
}

const niaDefinitionErrorCodeSchema = z.enum(NIA_DEFINITION_ERROR_CODES);

class NiaDefinitionError extends Error {
  constructor(code, message, details) {
    const parsedCode = niaDefinitionErrorCodeSchema.parse(code);
    super(message);
    this.name = "NiaDefinitionError";
    this.code = parsedCode;
    if (details !== undefined) this.details = details;
  }
}

function createNiaDefinitionError(code, message, details) {
  return new NiaDefinitionError(code, message, details);
}

/** Slug-only identifiers (`id`, `category`, tag entries) cannot express `..`, `/`, or `\`. */
const slugIdentifierSchema = z
  .string()
  .min(1)
  .max(NIA_DEFINITION_LIMITS.name)
  .regex(SLUG_PATTERN, "Must be a lowercase slug (letters, digits, `-`, `_`).")
  .refine(isFreeOfTraversal, "Path traversal sequences are not allowed.")
  .refine((value) => !hasControlCharacters(value), "Control characters are not allowed.");

const definitionIdSchema = z
  .string()
  .min(1)
  .max(NIA_DEFINITION_LIMITS.id)
  .regex(SLUG_PATTERN, "Must be a lowercase slug (letters, digits, `-`, `_`).")
  .refine(isFreeOfTraversal, "Path traversal sequences are not allowed.")
  .refine((value) => !hasControlCharacters(value), "Control characters are not allowed.");

const modelIdSchema = z
  .string()
  .min(1)
  .max(NIA_DEFINITION_LIMITS.model)
  .regex(MODEL_ID_PATTERN, "Must be a bounded model identifier.")
  .refine(isFreeOfTraversal, "Path traversal sequences are not allowed.")
  .refine((value) => !hasControlCharacters(value), "Control characters are not allowed.");

const freeformTextSchema = (maxLength) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => !hasControlCharacters(value), "Control characters are not allowed.");

const descriptionSchema = freeformTextSchema(NIA_DEFINITION_LIMITS.description);
const scopeSchema = z.enum(NIA_DEFINITION_SCOPES);
const categorySchema = slugIdentifierSchema.max(NIA_DEFINITION_LIMITS.category);
const actionSchema = z.enum(NIA_DEFINITION_ACTIONS);
const approvalSchema = z.enum(NIA_DEFINITION_APPROVALS);
const contextSchema = z.number().int().min(0).max(NIA_DEFINITION_LIMITS.context);
const tagSchema = slugIdentifierSchema.max(NIA_DEFINITION_LIMITS.tag);
const tagsSchema = z.array(tagSchema).min(1).max(NIA_DEFINITION_LIMITS.maxTags);
const ioAcceptSchema = z
  .string()
  .min(1)
  .max(NIA_DEFINITION_LIMITS.ioAccept)
  .regex(/^[a-z0-9]+$/u, "Must be a bounded lowercase file-kind token.");
const ioDescriptionSchema = freeformTextSchema(NIA_DEFINITION_LIMITS.ioDescription);

const ioSchema = z
  .object({
    type: z.enum(NIA_DEFINITION_IO_TYPES),
    accept: ioAcceptSchema.optional(),
    description: ioDescriptionSchema.optional(),
  })
  .strict();

const DEFINITION_CORE_SHAPE = Object.freeze({
  id: definitionIdSchema.optional(),
  description: descriptionSchema,
  scope: scopeSchema,
  category: categorySchema.optional(),
  model: modelIdSchema.optional(),
  action: actionSchema.optional(),
  context: contextSchema.optional(),
  approval: approvalSchema.optional(),
  input: ioSchema.optional(),
  output: ioSchema.optional(),
  tags: tagsSchema.optional(),
});

const canonicalFrontmatterSchema = z
  .object({
    nia: z.literal("v1"),
    ...DEFINITION_CORE_SHAPE,
  })
  .strict();

const legacyGenieV1FrontmatterSchema = z
  .object({
    genie: z.literal("v1"),
    ...DEFINITION_CORE_SHAPE,
  })
  .strict();

const legacyGenieV0FrontmatterSchema = z
  .object({
    ...DEFINITION_CORE_SHAPE,
  })
  .strict();

const niaDefinitionAstSchema = z
  .object({
    version: z.literal("v1"),
    sourceCompatibility: z.enum(NIA_SOURCE_COMPATIBILITY),
    id: definitionIdSchema.optional(),
    description: descriptionSchema,
    scope: scopeSchema,
    category: categorySchema.optional(),
    model: modelIdSchema.optional(),
    action: actionSchema.optional(),
    context: contextSchema.optional(),
    approval: approvalSchema.optional(),
    input: ioSchema.optional(),
    output: ioSchema.optional(),
    tags: tagsSchema.optional(),
    body: z.string().min(1).max(NIA_DEFINITION_LIMITS.bodyBytes),
    diagnostics: z.array(z.string()).optional(),
  })
  .strict();

const niaStepRefSchema = z
  .object({
    family: z.literal("nia"),
    name: slugIdentifierSchema,
    sourceCompatibility: z.enum(NIA_STEP_REF_SOURCE_COMPATIBILITY),
  })
  .strict();

function byteLength(text) {
  return Buffer.byteLength(text, "utf8");
}

function assertRawDefinitionSource(value) {
  if (typeof value !== "string") {
    throw createNiaDefinitionError(
      "SOURCE_NOT_RAW_MARKDOWN",
      "Definition source must be raw Markdown text, not a pre-parsed object.",
    );
  }
  if (byteLength(value) > NIA_DEFINITION_LIMITS.maxSourceBytes) {
    throw createNiaDefinitionError(
      "SOURCE_TOO_LARGE",
      `Definition source exceeds the ${NIA_DEFINITION_LIMITS.maxSourceBytes} byte limit.`,
    );
  }
  return value;
}

const FRONTMATTER_BOUNDARY = "---";

function splitFrontmatterSource(source) {
  if (!source.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
    throw createNiaDefinitionError(
      "FRONTMATTER_REQUIRED",
      "Nia/Genie definitions must start with a `---` YAML frontmatter block.",
    );
  }
  const endOffset = source.indexOf(`\n${FRONTMATTER_BOUNDARY}\n`, FRONTMATTER_BOUNDARY.length + 1);
  if (endOffset === -1) {
    throw createNiaDefinitionError(
      "FRONTMATTER_REQUIRED",
      "Nia/Genie definitions must close the `---` YAML frontmatter block.",
    );
  }
  const rawFrontmatter = source.slice(FRONTMATTER_BOUNDARY.length + 1, endOffset);
  const body = source.slice(endOffset + FRONTMATTER_BOUNDARY.length + 2).trim();
  return { rawFrontmatter, body };
}

function assertStructureDepth(value, limit, depth) {
  if (depth > limit) {
    throw createNiaDefinitionError(
      "STRUCTURE_TOO_DEEP",
      `Frontmatter structure exceeds the maximum nesting depth of ${limit}.`,
    );
  }
  if (Array.isArray(value)) {
    for (const item of value) assertStructureDepth(item, limit, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) assertStructureDepth(value[key], limit, depth + 1);
  }
}

function parseFrontmatterObject(rawFrontmatter) {
  if (byteLength(rawFrontmatter) > NIA_DEFINITION_LIMITS.maxFrontmatterBytes) {
    throw createNiaDefinitionError(
      "FRONTMATTER_TOO_LARGE",
      `Frontmatter exceeds the ${NIA_DEFINITION_LIMITS.maxFrontmatterBytes} byte limit.`,
    );
  }

  let document;
  try {
    document = YAML.parseDocument(rawFrontmatter, {
      schema: "core",
      version: "1.2",
      merge: false,
      uniqueKeys: true,
      strict: true,
      maxAliasCount: NIA_DEFINITION_LIMITS.maxAliasCount,
    });
  } catch (error) {
    throw createNiaDefinitionError(
      "FRONTMATTER_INVALID_YAML",
      `Frontmatter is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (document.errors.length > 0) {
    throw createNiaDefinitionError(
      "FRONTMATTER_INVALID_YAML",
      `Frontmatter is not valid YAML: ${document.errors[0].message}`,
    );
  }
  if (document.warnings.length > 0) {
    throw createNiaDefinitionError(
      "FRONTMATTER_UNSAFE_YAML",
      `Frontmatter uses an unsupported YAML feature: ${document.warnings[0].message}`,
    );
  }

  let raw;
  try {
    raw = document.toJS({ maxAliasCount: NIA_DEFINITION_LIMITS.maxAliasCount });
  } catch (error) {
    throw createNiaDefinitionError(
      "FRONTMATTER_UNSAFE_YAML",
      `Frontmatter rejected as unsafe YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw createNiaDefinitionError(
      "INVALID_DEFINITION_SHAPE",
      "Frontmatter must be a YAML mapping of definition fields.",
    );
  }

  assertStructureDepth(raw, NIA_DEFINITION_LIMITS.maxStructureDepth, 0);
  return raw;
}

function detectVariant(raw) {
  const hasNia = Object.prototype.hasOwnProperty.call(raw, "nia");
  const hasGenie = Object.prototype.hasOwnProperty.call(raw, "genie");

  if (hasNia && hasGenie) {
    throw createNiaDefinitionError(
      "CONFLICTING_VERSION_KEYS",
      "A definition cannot declare both `nia` and `genie` version keys.",
    );
  }
  if (hasNia) {
    if (raw.nia !== "v1") {
      throw createNiaDefinitionError(
        "UNSUPPORTED_VERSION",
        `Unsupported nia version: ${JSON.stringify(raw.nia)}`,
        { family: "nia", version: raw.nia },
      );
    }
    return "canonical_v1";
  }
  if (hasGenie) {
    if (raw.genie !== "v1") {
      throw createNiaDefinitionError(
        "UNSUPPORTED_VERSION",
        `Unsupported genie version: ${JSON.stringify(raw.genie)}`,
        { family: "genie", version: raw.genie },
      );
    }
    return "legacy_genie_v1";
  }
  return "legacy_genie_v0";
}

function schemaForVariant(variant) {
  switch (variant) {
    case "canonical_v1":
      return canonicalFrontmatterSchema;
    case "legacy_genie_v1":
      return legacyGenieV1FrontmatterSchema;
    case "legacy_genie_v0":
      return legacyGenieV0FrontmatterSchema;
    default:
      throw new TypeError(`Unsupported internal variant: ${variant}`);
  }
}

function diagnosticsForVariant(variant) {
  switch (variant) {
    case "legacy_genie_v1":
      return ["Imported from a legacy `genie: v1` definition; re-export produces canonical `nia: v1`."];
    case "legacy_genie_v0":
      return ["Imported from an unversioned legacy Genie definition; re-export produces canonical `nia: v1`."];
    default:
      return [];
  }
}

function normalizeToAst(variant, fields, body) {
  const diagnostics = diagnosticsForVariant(variant);
  const ast = {
    version: "v1",
    sourceCompatibility: variant,
    ...(fields.id !== undefined ? { id: fields.id } : {}),
    description: fields.description,
    scope: fields.scope,
    ...(fields.category !== undefined ? { category: fields.category } : {}),
    ...(fields.model !== undefined ? { model: fields.model } : {}),
    ...(fields.action !== undefined ? { action: fields.action } : {}),
    ...(fields.context !== undefined ? { context: fields.context } : {}),
    ...(fields.approval !== undefined ? { approval: fields.approval } : {}),
    ...(fields.input !== undefined ? { input: Object.freeze({ ...fields.input }) } : {}),
    ...(fields.output !== undefined ? { output: Object.freeze({ ...fields.output }) } : {}),
    ...(fields.tags !== undefined ? { tags: Object.freeze([...fields.tags]) } : {}),
    body,
    ...(diagnostics.length > 0 ? { diagnostics: Object.freeze(diagnostics) } : {}),
  };
  return Object.freeze(ast);
}

/**
 * Parse raw Markdown+frontmatter source into the canonical internal Nia v1
 * AST. This is the single trusted entry point: it never accepts a
 * pre-parsed/normalized object, only a raw string.
 */
function parseNiaDefinitionMarkdown(source) {
  assertRawDefinitionSource(source);
  const { rawFrontmatter, body } = splitFrontmatterSource(source);
  const raw = parseFrontmatterObject(rawFrontmatter);
  const variant = detectVariant(raw);
  const shapeSchema = schemaForVariant(variant);

  const result = shapeSchema.safeParse(raw);
  if (!result.success) {
    throw createNiaDefinitionError(
      "INVALID_DEFINITION_SHAPE",
      `Definition frontmatter failed validation: ${result.error.issues.map((issue) => issue.message).join("; ")}`,
      { issues: result.error.issues },
    );
  }

  if (body.length === 0) {
    throw createNiaDefinitionError("BODY_REQUIRED", "Definition body (prompt text) must not be empty.");
  }

  return normalizeToAst(variant, result.data, body);
}

/**
 * Reparse a trusted stored/raw source. Accepts either the raw Markdown
 * string directly, or a record shaped like `{ source, ... }` — any other
 * attached fields (including a forged `ast`/`sourceCompatibility`) are never
 * read and are silently ignored; only `.source` (or the string itself) is
 * ever parsed.
 */
function reparseTrustedSource(input) {
  const source = typeof input === "string" ? input : input && typeof input === "object" ? input.source : undefined;
  assertRawDefinitionSource(source);
  return parseNiaDefinitionMarkdown(source);
}

/**
 * Serialize a normalized AST back to canonical `nia: v1` Markdown+frontmatter.
 * Only canonical fields are ever written; legacy `sourceCompatibility` and
 * `diagnostics` markers are never re-emitted into the exported file.
 */
function serializeNiaDefinitionMarkdown(ast) {
  const parsed = niaDefinitionAstSchema.parse(ast);
  const frontmatterObject = { nia: "v1" };
  if (parsed.id !== undefined) frontmatterObject.id = parsed.id;
  frontmatterObject.description = parsed.description;
  frontmatterObject.scope = parsed.scope;
  if (parsed.category !== undefined) frontmatterObject.category = parsed.category;
  if (parsed.model !== undefined) frontmatterObject.model = parsed.model;
  if (parsed.action !== undefined) frontmatterObject.action = parsed.action;
  if (parsed.context !== undefined) frontmatterObject.context = parsed.context;
  if (parsed.approval !== undefined) frontmatterObject.approval = parsed.approval;
  if (parsed.input !== undefined) frontmatterObject.input = parsed.input;
  if (parsed.output !== undefined) frontmatterObject.output = parsed.output;
  if (parsed.tags !== undefined && parsed.tags.length > 0) frontmatterObject.tags = [...parsed.tags];

  const yamlText = YAML.stringify(frontmatterObject, { schema: "core" }).trimEnd();
  return `---\n${yamlText}\n---\n\n${parsed.body}\n`;
}

function assertUniqueDefinitionIds(definitions) {
  if (!Array.isArray(definitions)) {
    throw createNiaDefinitionError(
      "INVALID_DEFINITION_SHAPE",
      "Expected an array of parsed definitions to check for duplicate ids.",
    );
  }
  const seen = new Set();
  for (const definition of definitions) {
    const id = definition && typeof definition === "object" ? definition.id : undefined;
    if (id === undefined) continue;
    if (seen.has(id)) {
      throw createNiaDefinitionError("DUPLICATE_DEFINITION_ID", `Duplicate definition id "${id}".`, { id });
    }
    seen.add(id);
  }
  return true;
}

/**
 * Normalize a workflow step `uses:` reference. Canonical references use the
 * `nia/<name>` form; legacy references use `genie/<name>` and are mapped to
 * the same canonical `nia` family with a `legacy_genie` compatibility marker.
 * The `<name>` segment is restricted to a path-traversal-safe slug.
 */
function normalizeUsesRef(value) {
  if (typeof value !== "string") {
    throw createNiaDefinitionError("INVALID_STEP_REF", "Step reference must be a string.");
  }
  const match = STEP_REF_PATTERN.exec(value);
  if (!match) {
    throw createNiaDefinitionError(
      "INVALID_STEP_REF",
      `Step reference "${value}" is not a valid nia/<name> or genie/<name> reference.`,
    );
  }
  const [, family, name] = match;
  return Object.freeze(
    niaStepRefSchema.parse({
      family: "nia",
      name,
      sourceCompatibility: family === "genie" ? "legacy_genie" : "canonical",
    }),
  );
}

function parseNiaStepRef(value) {
  return normalizeUsesRef(value);
}

function serializeUsesRef(ref) {
  const parsed = niaStepRefSchema.parse(ref);
  return `nia/${parsed.name}`;
}

exports.NIA_SOURCE_COMPATIBILITY = NIA_SOURCE_COMPATIBILITY;
exports.NIA_DEFINITION_SCOPES = NIA_DEFINITION_SCOPES;
exports.NIA_DEFINITION_ACTIONS = NIA_DEFINITION_ACTIONS;
exports.NIA_DEFINITION_APPROVALS = NIA_DEFINITION_APPROVALS;
exports.NIA_DEFINITION_IO_TYPES = NIA_DEFINITION_IO_TYPES;
exports.NIA_STEP_REF_FAMILIES = NIA_STEP_REF_FAMILIES;
exports.NIA_STEP_REF_SOURCE_COMPATIBILITY = NIA_STEP_REF_SOURCE_COMPATIBILITY;
exports.NIA_DEFINITION_ERROR_CODES = NIA_DEFINITION_ERROR_CODES;
exports.NIA_DEFINITION_LIMITS = NIA_DEFINITION_LIMITS;
exports.niaDefinitionAstSchema = niaDefinitionAstSchema;
exports.niaStepRefSchema = niaStepRefSchema;
exports.canonicalFrontmatterSchema = canonicalFrontmatterSchema;
exports.legacyGenieV1FrontmatterSchema = legacyGenieV1FrontmatterSchema;
exports.legacyGenieV0FrontmatterSchema = legacyGenieV0FrontmatterSchema;
exports.NiaDefinitionError = NiaDefinitionError;
exports.createNiaDefinitionError = createNiaDefinitionError;
exports.assertRawDefinitionSource = assertRawDefinitionSource;
exports.parseNiaDefinitionMarkdown = parseNiaDefinitionMarkdown;
exports.reparseTrustedSource = reparseTrustedSource;
exports.serializeNiaDefinitionMarkdown = serializeNiaDefinitionMarkdown;
exports.assertUniqueDefinitionIds = assertUniqueDefinitionIds;
exports.normalizeUsesRef = normalizeUsesRef;
exports.parseNiaStepRef = parseNiaStepRef;
exports.serializeUsesRef = serializeUsesRef;
