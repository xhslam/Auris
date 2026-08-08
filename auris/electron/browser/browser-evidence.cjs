"use strict";

const {
  browserAuthorityOperationSchema,
  browserToolActionSchema,
} = require("../shared/browser-contract.cjs");
const { z } = require("zod");

const BROWSER_EVIDENCE_LIMITS = Object.freeze({
  approvals: 32,
  citations: 64,
  excerptText: 8_192,
  excerpts: 16,
  ref: 128,
  refs: 128,
  screenshots: 16,
  sourceId: 128,
  title: 512,
  url: 2_048,
});

const APPROVAL_DECISIONS = Object.freeze(["deny", "allow_once"]);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const SCREENSHOT_REF_PATTERN = /^screenshot-[0-9a-f]{32}$/u;
const INVALID_METADATA_CONTROLS = /\p{Cc}/u;
const INVALID_CONTENT_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

function redactedFinalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!url.hostname) return "";
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function sourceOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function canonicalAccessTime(value) {
  if (typeof value !== "string" || value.length > 64) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString();
}

function isSafeIdentifier(value, maximum) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && IDENTIFIER_PATTERN.test(value)
    && !INVALID_METADATA_CONTROLS.test(value);
}

function isSafeMetadata(value) {
  return typeof value === "string"
    && !INVALID_METADATA_CONTROLS.test(value);
}

function isSafeContent(value) {
  return typeof value === "string"
    && value.length > 0
    && !INVALID_CONTENT_CONTROLS.test(value);
}

const identifierSchema = (maximum) => z.string()
  .min(1)
  .max(maximum)
  .regex(IDENTIFIER_PATTERN)
  .refine((value) => !INVALID_METADATA_CONTROLS.test(value));

const sourceIdSchema = identifierSchema(BROWSER_EVIDENCE_LIMITS.sourceId);
const refSchema = identifierSchema(BROWSER_EVIDENCE_LIMITS.ref);

const evidenceSourceSchema = z.object({
  accessedAt: z.string().max(64).refine((value) => canonicalAccessTime(value) === value),
  finalUrl: z.string().max(BROWSER_EVIDENCE_LIMITS.url).refine(
    (value) => redactedFinalUrl(value) === value,
  ),
  origin: z.string().max(BROWSER_EVIDENCE_LIMITS.url),
  title: z.string().max(BROWSER_EVIDENCE_LIMITS.title).refine(
    (value) => !INVALID_METADATA_CONTROLS.test(value),
  ),
}).strict().superRefine((source, context) => {
  if (sourceOrigin(source.finalUrl) !== source.origin) {
    context.addIssue({ code: "custom", message: "Evidence origin must match finalUrl." });
  }
});

const evidenceExcerptSchema = z.object({
  sourceId: sourceIdSchema,
  text: z.string().min(1).max(BROWSER_EVIDENCE_LIMITS.excerptText).refine(
    (value) => !INVALID_CONTENT_CONTROLS.test(value),
  ),
}).strict();

const evidenceRefSchema = z.object({
  generation: z.number().int().safe().nonnegative(),
  ref: refSchema,
}).strict();

const evidenceScreenshotSchema = z.object({
  evidenceRef: z.string().regex(SCREENSHOT_REF_PATTERN),
}).strict();

const evidenceApprovalSchema = z.object({
  action: browserToolActionSchema,
  decision: z.enum(APPROVAL_DECISIONS),
  operation: browserAuthorityOperationSchema,
}).strict();

const evidenceCitationSchema = z.object({
  draftRange: z.object({
    end: z.number().int().safe().nonnegative(),
    start: z.number().int().safe().nonnegative(),
  }).strict().refine((range) => range.end >= range.start, {
    message: "Citation range end must not precede start.",
  }),
  sourceId: sourceIdSchema,
}).strict();

const browserEvidenceSchema = z.object({
  approvals: z.array(evidenceApprovalSchema).max(BROWSER_EVIDENCE_LIMITS.approvals).optional(),
  citations: z.array(evidenceCitationSchema).max(BROWSER_EVIDENCE_LIMITS.citations).optional(),
  excerpts: z.array(evidenceExcerptSchema).max(BROWSER_EVIDENCE_LIMITS.excerpts).optional(),
  refs: z.array(evidenceRefSchema).max(BROWSER_EVIDENCE_LIMITS.refs).optional(),
  screenshots: z.array(evidenceScreenshotSchema).max(BROWSER_EVIDENCE_LIMITS.screenshots).optional(),
  source: evidenceSourceSchema,
  version: z.literal(1),
}).strict().superRefine((evidence, context) => {
  const sourceIds = new Set((evidence.excerpts ?? []).map((excerpt) => excerpt.sourceId));
  for (const [index, citation] of (evidence.citations ?? []).entries()) {
    if (!sourceIds.has(citation.sourceId)) {
      context.addIssue({
        code: "custom",
        message: "Citation sourceId must identify an included excerpt.",
        path: ["citations", index, "sourceId"],
      });
    }
  }
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeArray(value, limit, normalizeItem) {
  if (!Array.isArray(value)) return undefined;
  const normalized = [];
  for (const item of value) {
    const result = normalizeItem(record(item));
    if (result) normalized.push(result);
    if (normalized.length >= limit) break;
  }
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeBrowserEvidence(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || input.version !== 1) {
    throw new TypeError("A version 1 Browser evidence bundle is required.");
  }
  const rawSource = record(input.source);
  const finalUrl = redactedFinalUrl(rawSource.finalUrl);
  const accessedAt = canonicalAccessTime(rawSource.accessedAt);
  if (!finalUrl || !accessedAt) {
    throw new TypeError("Browser evidence requires a public final URL and access time.");
  }
  const title = isSafeMetadata(rawSource.title)
    ? rawSource.title.slice(0, BROWSER_EVIDENCE_LIMITS.title)
    : "";
  const excerpts = normalizeArray(
    input.excerpts,
    BROWSER_EVIDENCE_LIMITS.excerpts,
    (item) => isSafeIdentifier(item.sourceId, BROWSER_EVIDENCE_LIMITS.sourceId)
      && isSafeContent(item.text)
      ? { sourceId: item.sourceId, text: item.text.slice(0, BROWSER_EVIDENCE_LIMITS.excerptText) }
      : undefined,
  );
  const sourceIds = new Set((excerpts ?? []).map((excerpt) => excerpt.sourceId));
  const refs = normalizeArray(
    input.refs,
    BROWSER_EVIDENCE_LIMITS.refs,
    (item) => isSafeIdentifier(item.ref, BROWSER_EVIDENCE_LIMITS.ref)
      && Number.isSafeInteger(item.generation)
      && item.generation >= 0
      ? { generation: item.generation, ref: item.ref }
      : undefined,
  );
  const screenshots = normalizeArray(
    input.screenshots,
    BROWSER_EVIDENCE_LIMITS.screenshots,
    (item) => typeof item.evidenceRef === "string"
      && SCREENSHOT_REF_PATTERN.test(item.evidenceRef)
      ? { evidenceRef: item.evidenceRef }
      : undefined,
  );
  const approvals = normalizeArray(
    input.approvals,
    BROWSER_EVIDENCE_LIMITS.approvals,
    (item) => browserToolActionSchema.safeParse(item.action).success
      && browserAuthorityOperationSchema.safeParse(item.operation).success
      && APPROVAL_DECISIONS.includes(item.decision)
      ? { action: item.action, decision: item.decision, operation: item.operation }
      : undefined,
  );
  const citations = normalizeArray(
    input.citations,
    BROWSER_EVIDENCE_LIMITS.citations,
    (item) => {
      const draftRange = record(item.draftRange);
      return isSafeIdentifier(item.sourceId, BROWSER_EVIDENCE_LIMITS.sourceId)
        && sourceIds.has(item.sourceId)
        && Number.isSafeInteger(draftRange.start)
        && Number.isSafeInteger(draftRange.end)
        && draftRange.start >= 0
        && draftRange.end >= draftRange.start
        ? { draftRange: { end: draftRange.end, start: draftRange.start }, sourceId: item.sourceId }
        : undefined;
    },
  );

  return deepFreeze(browserEvidenceSchema.parse({
    ...(approvals ? { approvals } : {}),
    ...(citations ? { citations } : {}),
    ...(excerpts ? { excerpts } : {}),
    ...(refs ? { refs } : {}),
    ...(screenshots ? { screenshots } : {}),
    source: {
      accessedAt,
      finalUrl,
      origin: sourceOrigin(finalUrl),
      title,
    },
    version: 1,
  }));
}

module.exports = {
  APPROVAL_DECISIONS,
  BROWSER_EVIDENCE_LIMITS,
  browserEvidenceSchema,
  normalizeBrowserEvidence,
};
