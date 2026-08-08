"use strict";

/**
 * Canonical, packaged parser/schema/compiler/step-policy for browser Markdown
 * workflows (distinct from Nia YAML pipelines).
 *
 * Main must always reparse raw Markdown through this module. A renderer-supplied
 * AST or compiled intent is never authoritative, and compilation grants no
 * browser authority.
 */

const YAML = require("yaml");
const { z } = require("zod");

const BROWSER_WORKFLOW_FAMILY = "browser_markdown";

const BROWSER_WORKFLOW_STEP_KINDS = Object.freeze([
  "api",
  "action",
  "goal",
  "confirm",
  "extract",
]);

const BROWSER_WORKFLOW_INPUT_TYPES = Object.freeze(["text", "secret"]);

const BROWSER_WORKFLOW_TRIGGERS = Object.freeze(["manual"]);

const BROWSER_WORKFLOW_ERROR_CODES = Object.freeze([
  "SOURCE_NOT_RAW_MARKDOWN",
  "SOURCE_TOO_LARGE",
  "FRONTMATTER_REQUIRED",
  "FRONTMATTER_TOO_LARGE",
  "FRONTMATTER_INVALID_YAML",
  "FRONTMATTER_UNSAFE_YAML",
  "STRUCTURE_TOO_DEEP",
  "INVALID_WORKFLOW_SHAPE",
  "MISSING_SITE",
  "NO_STEPS",
  "UNKNOWN_STEP_KIND",
  "MALFORMED_STEP",
  "ARBITRARY_JAVASCRIPT",
  "UNSAFE_SCHEME",
  "UNBOUNDED_CONTROL_FLOW",
  "UNDECLARED_SECRET",
  "UNDECLARED_VARIABLE",
  "PATH_TRAVERSAL",
  "SELECTOR_TOO_LARGE",
  "PAYLOAD_TOO_LARGE",
  "CONFIRMATION_REQUIRED",
  "INVALID_ACTION",
  "UNTRUSTED_AST",
]);

const BROWSER_WORKFLOW_LIMITS = Object.freeze({
  maxSourceBytes: 256 * 1024,
  maxFrontmatterBytes: 64 * 1024,
  maxStructureDepth: 8,
  maxAliasCount: 0,
  site: 253,
  trigger: 64,
  inputName: 64,
  inputDescription: 2_000,
  maxInputs: 32,
  maxSteps: 100,
  stepText: 4_000,
  selector: 512,
  payload: 2_000,
  url: 2_048,
});

const SITE_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/u;
const INPUT_NAME_PATTERN = /^[a-zA-Z_][\w-]{0,63}$/u;
const VAR_REF_RE = /\{([a-zA-Z_][\w-]*)\}/gu;
const STEP_RE = /^\s*(?:\d+\.|-)?\s*([a-z]+)\s*:\s*(.*)$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
const UNSAFE_SCHEME_RE = /^(?:javascript|data|file|vbscript|about|blob):/iu;
const JS_ACTION_RE =
  /\b(?:execute_js|executejavascript|eval\s*\(|new\s+Function\b|<script\b)/iu;
const LOOP_KIND_RE = /^(?:while|for|loop|repeat|retry)$/u;
const READ_KINDS = new Set(["extract", "confirm"]);
const HUMAN_GATE_KINDS = new Set(["confirm"]);
const TRUSTED_ASTS = new WeakSet();

const browserWorkflowErrorCodeSchema = z.enum(BROWSER_WORKFLOW_ERROR_CODES);

class BrowserWorkflowError extends Error {
  constructor(code, message, details) {
    const parsedCode = browserWorkflowErrorCodeSchema.parse(code);
    super(message);
    this.name = "BrowserWorkflowError";
    this.code = parsedCode;
    if (details !== undefined) this.details = details;
  }
}

function createBrowserWorkflowError(code, message, details) {
  return new BrowserWorkflowError(code, message, details);
}

function byteLength(text) {
  return Buffer.byteLength(text, "utf8");
}

function hasControlCharacters(value) {
  return CONTROL_CHARACTER_PATTERN.test(value);
}

function containsTraversal(value) {
  return value.includes("..") || value.includes("\\") || value.includes("\0");
}

function assertRawBrowserWorkflowSource(value) {
  if (typeof value !== "string") {
    throw createBrowserWorkflowError(
      "SOURCE_NOT_RAW_MARKDOWN",
      "Browser workflow source must be raw Markdown text, not a pre-parsed object.",
    );
  }
  if (byteLength(value) > BROWSER_WORKFLOW_LIMITS.maxSourceBytes) {
    throw createBrowserWorkflowError(
      "SOURCE_TOO_LARGE",
      `Browser workflow source exceeds the ${BROWSER_WORKFLOW_LIMITS.maxSourceBytes} byte limit.`,
    );
  }
  return value;
}

const siteSchema = z
  .string()
  .min(1)
  .max(BROWSER_WORKFLOW_LIMITS.site)
  .regex(SITE_PATTERN, "Must be a hostname site id.")
  .refine((value) => !containsTraversal(value), "Path traversal sequences are not allowed.")
  .refine((value) => !hasControlCharacters(value), "Control characters are not allowed.");

const inputNameSchema = z
  .string()
  .min(1)
  .max(BROWSER_WORKFLOW_LIMITS.inputName)
  .regex(INPUT_NAME_PATTERN, "Must be a valid input variable name.")
  .refine((value) => !containsTraversal(value), "Path traversal sequences are not allowed.");

const inputDescriptionSchema = z
  .string()
  .min(1)
  .max(BROWSER_WORKFLOW_LIMITS.inputDescription)
  .refine((value) => !hasControlCharacters(value), "Control characters are not allowed.");

const inputDeclSchema = z
  .object({
    type: z.enum(BROWSER_WORKFLOW_INPUT_TYPES),
    description: inputDescriptionSchema.optional(),
  })
  .strict();

const stepSchema = z
  .object({
    index: z.number().int().min(1).max(BROWSER_WORKFLOW_LIMITS.maxSteps),
    kind: z.enum(BROWSER_WORKFLOW_STEP_KINDS),
    text: z
      .string()
      .min(1)
      .max(BROWSER_WORKFLOW_LIMITS.stepText)
      .refine((value) => !hasControlCharacters(value), "Control characters are not allowed."),
    line: z.number().int().min(1),
  })
  .strict();

const browserWorkflowAstSchema = z
  .object({
    family: z.literal(BROWSER_WORKFLOW_FAMILY),
    site: siteSchema,
    inputs: z
      .array(
        z
          .object({
            name: inputNameSchema,
            type: z.enum(BROWSER_WORKFLOW_INPUT_TYPES),
            description: inputDescriptionSchema.optional(),
          })
          .strict(),
      )
      .max(BROWSER_WORKFLOW_LIMITS.maxInputs),
    trigger: z.enum(BROWSER_WORKFLOW_TRIGGERS).optional(),
    steps: z.array(stepSchema).min(1).max(BROWSER_WORKFLOW_LIMITS.maxSteps),
  })
  .strict();

function assertStructureDepth(value, limit, depth) {
  if (depth > limit) {
    throw createBrowserWorkflowError(
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

function splitFrontmatterSource(source) {
  const normalized = source.startsWith("\uFEFF") ? source.slice(1) : source;
  if (!normalized.startsWith("---\n") && normalized !== "---") {
    throw createBrowserWorkflowError(
      "FRONTMATTER_REQUIRED",
      "Browser workflows must start with a `---` YAML frontmatter block.",
    );
  }
  const endOffset = normalized.indexOf("\n---\n", 4);
  if (endOffset === -1) {
    throw createBrowserWorkflowError(
      "FRONTMATTER_REQUIRED",
      "Browser workflows must close the `---` YAML frontmatter block.",
    );
  }
  return {
    rawFrontmatter: normalized.slice(4, endOffset),
    body: normalized.slice(endOffset + 5),
    bodyStartLine: normalized.slice(0, endOffset + 5).split("\n").length,
  };
}

function parseFrontmatterObject(rawFrontmatter) {
  if (byteLength(rawFrontmatter) > BROWSER_WORKFLOW_LIMITS.maxFrontmatterBytes) {
    throw createBrowserWorkflowError(
      "FRONTMATTER_TOO_LARGE",
      `Frontmatter exceeds the ${BROWSER_WORKFLOW_LIMITS.maxFrontmatterBytes} byte limit.`,
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
      maxAliasCount: BROWSER_WORKFLOW_LIMITS.maxAliasCount,
    });
  } catch (error) {
    throw createBrowserWorkflowError(
      "FRONTMATTER_INVALID_YAML",
      `Frontmatter is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (document.errors.length > 0) {
    throw createBrowserWorkflowError(
      "FRONTMATTER_INVALID_YAML",
      `Frontmatter is not valid YAML: ${document.errors[0].message}`,
    );
  }
  if (document.warnings.length > 0) {
    throw createBrowserWorkflowError(
      "FRONTMATTER_UNSAFE_YAML",
      `Frontmatter uses an unsupported YAML feature: ${document.warnings[0].message}`,
    );
  }

  let raw;
  try {
    raw = document.toJS({ maxAliasCount: BROWSER_WORKFLOW_LIMITS.maxAliasCount });
  } catch (error) {
    throw createBrowserWorkflowError(
      "FRONTMATTER_UNSAFE_YAML",
      `Frontmatter rejected as unsafe YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw createBrowserWorkflowError(
      "INVALID_WORKFLOW_SHAPE",
      "Frontmatter must be a YAML mapping of workflow fields.",
    );
  }

  assertStructureDepth(raw, BROWSER_WORKFLOW_LIMITS.maxStructureDepth, 0);
  return raw;
}

function normalizeInputs(rawInputs) {
  if (rawInputs === undefined || rawInputs === null) return [];
  if (typeof rawInputs !== "object" || Array.isArray(rawInputs)) {
    throw createBrowserWorkflowError(
      "INVALID_WORKFLOW_SHAPE",
      "Workflow inputs must be a mapping of name → { type, description? }.",
    );
  }

  const inputs = [];
  const seen = new Set();
  for (const [name, decl] of Object.entries(rawInputs)) {
    const parsedName = inputNameSchema.parse(name);
    if (seen.has(parsedName)) {
      throw createBrowserWorkflowError(
        "INVALID_WORKFLOW_SHAPE",
        `Duplicate input variable "${parsedName}".`,
      );
    }
    seen.add(parsedName);
    const parsedDecl = inputDeclSchema.parse(decl);
    inputs.push({
      name: parsedName,
      type: parsedDecl.type,
      ...(parsedDecl.description ? { description: parsedDecl.description } : {}),
    });
  }
  if (inputs.length > BROWSER_WORKFLOW_LIMITS.maxInputs) {
    throw createBrowserWorkflowError(
      "INVALID_WORKFLOW_SHAPE",
      `Workflow declares more than ${BROWSER_WORKFLOW_LIMITS.maxInputs} inputs.`,
    );
  }
  return inputs;
}

function parseSteps(body, bodyStartLine) {
  const lines = body.split("\n");
  const steps = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const line = bodyStartLine + i;
    const match = STEP_RE.exec(raw);
    const text = match ? match[2].trim() : "";
    if (!match || text === "") {
      throw createBrowserWorkflowError(
        "MALFORMED_STEP",
        `Step must be "<kind>: <text>" (got: ${trimmed}).`,
        { line },
      );
    }
    const kind = match[1];
    if (LOOP_KIND_RE.test(kind)) {
      throw createBrowserWorkflowError(
        "UNBOUNDED_CONTROL_FLOW",
        `Unbounded control-flow step kind "${kind}" is not allowed.`,
        { line },
      );
    }
    if (!BROWSER_WORKFLOW_STEP_KINDS.includes(kind)) {
      throw createBrowserWorkflowError(
        "UNKNOWN_STEP_KIND",
        `Unknown step kind "${kind}" (expected ${BROWSER_WORKFLOW_STEP_KINDS.join(", ")}).`,
        { line },
      );
    }
    if (text.length > BROWSER_WORKFLOW_LIMITS.stepText) {
      throw createBrowserWorkflowError(
        "PAYLOAD_TOO_LARGE",
        `Step text exceeds the ${BROWSER_WORKFLOW_LIMITS.stepText} character limit.`,
        { line },
      );
    }
    if (hasControlCharacters(text)) {
      throw createBrowserWorkflowError(
        "MALFORMED_STEP",
        "Step text must not contain control characters.",
        { line },
      );
    }
    steps.push({ index: steps.length + 1, kind, text, line });
  }
  if (steps.length === 0) {
    throw createBrowserWorkflowError("NO_STEPS", "Workflow has no steps.");
  }
  if (steps.length > BROWSER_WORKFLOW_LIMITS.maxSteps) {
    throw createBrowserWorkflowError(
      "INVALID_WORKFLOW_SHAPE",
      `Workflow exceeds the ${BROWSER_WORKFLOW_LIMITS.maxSteps} step limit.`,
    );
  }
  return steps;
}

function collectVariableRefs(text) {
  const names = [];
  for (const match of text.matchAll(VAR_REF_RE)) names.push(match[1]);
  return names;
}

function assertNoArbitraryJavaScript(step) {
  if (JS_ACTION_RE.test(step.text)) {
    throw createBrowserWorkflowError(
      "ARBITRARY_JAVASCRIPT",
      "Arbitrary JavaScript is not allowed in browser workflow steps.",
      { line: step.line, stepIndex: step.index },
    );
  }
}

function extractUrls(text) {
  const urls = [];
  const re = /\b(?:https?|javascript|data|file|vbscript|about|blob):[^\s"']+/giu;
  for (const match of text.matchAll(re)) urls.push(match[0]);
  return urls;
}

function assertSafeSchemes(step) {
  for (const url of extractUrls(step.text)) {
    if (UNSAFE_SCHEME_RE.test(url) || !/^https:\/\//iu.test(url)) {
      // Allow only https for authored workflow destinations.
      if (!/^https:\/\//iu.test(url)) {
        throw createBrowserWorkflowError(
          "UNSAFE_SCHEME",
          `Unsafe or non-HTTPS URL scheme in step: ${url.split(":")[0]}:`,
          { line: step.line, stepIndex: step.index },
        );
      }
    }
  }
}

function assertNoTraversal(step) {
  if (containsTraversal(step.text)) {
    throw createBrowserWorkflowError(
      "PATH_TRAVERSAL",
      "Path traversal sequences are not allowed in workflow steps.",
      { line: step.line, stepIndex: step.index },
    );
  }
}

function parseQuoted(text, startIndex) {
  if (text[startIndex] !== '"') return null;
  let end = startIndex + 1;
  let escaped = false;
  while (end < text.length) {
    const ch = text[end];
    if (escaped) {
      escaped = false;
      end += 1;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      end += 1;
      continue;
    }
    if (ch === '"') {
      return { value: text.slice(startIndex + 1, end), end: end + 1 };
    }
    end += 1;
  }
  return null;
}

function assertSelectorSize(selector, line, stepIndex) {
  if (selector.length > BROWSER_WORKFLOW_LIMITS.selector) {
    throw createBrowserWorkflowError(
      "SELECTOR_TOO_LARGE",
      `Selector exceeds the ${BROWSER_WORKFLOW_LIMITS.selector} character limit.`,
      { line, stepIndex },
    );
  }
}

function assertPayloadSize(payload, line, stepIndex) {
  if (payload.length > BROWSER_WORKFLOW_LIMITS.payload) {
    throw createBrowserWorkflowError(
      "PAYLOAD_TOO_LARGE",
      `Payload exceeds the ${BROWSER_WORKFLOW_LIMITS.payload} character limit.`,
      { line, stepIndex },
    );
  }
}

function parseActionCommand(step) {
  const text = step.text.trim();
  assertNoArbitraryJavaScript(step);

  const navigateMatch = /^navigate\s+to\s+(\S+)$/iu.exec(text);
  if (navigateMatch) {
    const url = navigateMatch[1];
    if (UNSAFE_SCHEME_RE.test(url) || !/^https:\/\//iu.test(url)) {
      throw createBrowserWorkflowError("UNSAFE_SCHEME", `Unsafe navigate URL: ${url}`, {
        line: step.line,
        stepIndex: step.index,
      });
    }
    if (url.length > BROWSER_WORKFLOW_LIMITS.url) {
      throw createBrowserWorkflowError("PAYLOAD_TOO_LARGE", "Navigate URL is too large.", {
        line: step.line,
        stepIndex: step.index,
      });
    }
    return { action: "navigate", url, sensitive: false, write: false, operation: "navigate" };
  }

  const clickMatch = /^click\s+(.+)$/iu.exec(text);
  if (clickMatch) {
    const targetRaw = clickMatch[1].trim();
    const quoted = parseQuoted(targetRaw, 0);
    const selector = quoted ? quoted.value : targetRaw;
    assertSelectorSize(selector, step.line, step.index);
    if (containsTraversal(selector)) {
      throw createBrowserWorkflowError("PATH_TRAVERSAL", "Selector path traversal is not allowed.", {
        line: step.line,
        stepIndex: step.index,
      });
    }
    return {
      action: "act",
      variant: "click",
      target: { kind: "selector", selector },
      sensitive: true,
      write: true,
      operation: "click",
    };
  }

  const typeMatch = /^type\s+(.+?)\s+into\s+(.+)$/iu.exec(text);
  if (typeMatch) {
    const valueRaw = typeMatch[1].trim();
    const targetRaw = typeMatch[2].trim();
    const valueQuoted = parseQuoted(valueRaw, 0);
    const payload = valueQuoted ? valueQuoted.value : valueRaw;
    assertPayloadSize(payload, step.line, step.index);
    const targetQuoted = parseQuoted(targetRaw, 0);
    const selector = targetQuoted ? targetQuoted.value : targetRaw;
    assertSelectorSize(selector, step.line, step.index);
    if (containsTraversal(selector)) {
      throw createBrowserWorkflowError("PATH_TRAVERSAL", "Selector path traversal is not allowed.", {
        line: step.line,
        stepIndex: step.index,
      });
    }
    const slotMatch = /^\{([a-zA-Z_][\w-]*)\}$/u.exec(payload);
    return {
      action: "act",
      variant: "type",
      text: slotMatch
        ? { kind: "input_slot", name: slotMatch[1] }
        : { kind: "literal", value: payload },
      target: { kind: "selector", selector },
      sensitive: false, // upgraded after input lookup
      write: true,
      operation: "type",
    };
  }

  const waitMatch = /^wait\s+(\d+)$/iu.exec(text);
  if (waitMatch) {
    const milliseconds = Number(waitMatch[1]);
    if (!Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > 60_000) {
      throw createBrowserWorkflowError("INVALID_ACTION", "Wait duration must be 0–60000 ms.", {
        line: step.line,
        stepIndex: step.index,
      });
    }
    return { action: "wait", milliseconds, sensitive: false, write: false, operation: "read" };
  }

  const keyMatch = /^key\s+(\S+)$/iu.exec(text);
  if (keyMatch) {
    const key = keyMatch[1];
    if (key.length > 64) {
      throw createBrowserWorkflowError("PAYLOAD_TOO_LARGE", "Key payload is too large.", {
        line: step.line,
        stepIndex: step.index,
      });
    }
    return {
      action: "act",
      variant: "key",
      key,
      sensitive: true,
      write: true,
      operation: "key",
    };
  }

  throw createBrowserWorkflowError(
    "INVALID_ACTION",
    `Unsupported or closed Browser action text: ${text}`,
    { line: step.line, stepIndex: step.index },
  );
}

function parseApiCommand(step) {
  const match = /^(GET|HEAD|POST|PUT|PATCH|DELETE)\s+(\S+)$/u.exec(step.text.trim());
  if (!match) {
    throw createBrowserWorkflowError(
      "INVALID_ACTION",
      "API steps must be `<METHOD> <https-url>`.",
      { line: step.line, stepIndex: step.index },
    );
  }
  const method = match[1];
  const url = match[2];
  if (UNSAFE_SCHEME_RE.test(url) || !/^https:\/\//iu.test(url)) {
    throw createBrowserWorkflowError("UNSAFE_SCHEME", `Unsafe API URL: ${url}`, {
      line: step.line,
      stepIndex: step.index,
    });
  }
  if (url.length > BROWSER_WORKFLOW_LIMITS.url) {
    throw createBrowserWorkflowError("PAYLOAD_TOO_LARGE", "API URL is too large.", {
      line: step.line,
      stepIndex: step.index,
    });
  }
  const mutating = method !== "GET" && method !== "HEAD";
  return {
    type: "guarded_api",
    method,
    url,
    operation: mutating ? "publish" : "read",
    placeholder: true,
    sensitive: mutating,
    write: mutating,
  };
}

function stepWrites(step) {
  if (READ_KINDS.has(step.kind)) return false;
  if (step.kind === "extract" || step.kind === "confirm") return false;
  if (step.kind === "action") {
    const command = parseActionCommand(step);
    return Boolean(command.write);
  }
  if (step.kind === "api") {
    return Boolean(parseApiCommand(step).write);
  }
  // goal defaults to write (fail-safe), matching upstream classify.ts
  return true;
}

function stepRetryable(step) {
  return !HUMAN_GATE_KINDS.has(step.kind);
}

function isSensitiveStep(step, inputByName) {
  if (step.kind === "confirm" || step.kind === "extract") return false;
  if (step.kind === "goal") return false;
  if (step.kind === "api") return Boolean(parseApiCommand(step).sensitive);
  if (step.kind === "action") {
    const command = parseActionCommand(step);
    if (command.sensitive) return true;
    if (command.variant === "type" && command.text?.kind === "input_slot") {
      const decl = inputByName.get(command.text.name);
      return decl?.type === "secret";
    }
    return false;
  }
  return false;
}

function requiresPrecedingConfirm(step, workflow) {
  const inputByName = new Map(workflow.inputs.map((input) => [input.name, input]));
  return isSensitiveStep(step, inputByName);
}

function assertVariableBindings(steps, inputs) {
  const inputByName = new Map(inputs.map((input) => [input.name, input]));
  for (const step of steps) {
    for (const name of collectVariableRefs(step.text)) {
      const decl = inputByName.get(name);
      if (!decl) {
        // Secret-shaped names get a more specific code when missing.
        if (/password|secret|token|key|credential/iu.test(name)) {
          throw createBrowserWorkflowError(
            "UNDECLARED_SECRET",
            `Step references undeclared secret "{${name}}".`,
            { line: step.line, stepIndex: step.index, name },
          );
        }
        throw createBrowserWorkflowError(
          "UNDECLARED_VARIABLE",
          `Step references undeclared variable "{${name}}".`,
          { line: step.line, stepIndex: step.index, name },
        );
      }
    }
  }
}

function assertConfirmationPolicy(steps, inputs) {
  const workflow = { inputs, steps };
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (!requiresPrecedingConfirm(step, workflow)) continue;
    const previous = steps[i - 1];
    if (!previous || previous.kind !== "confirm") {
      throw createBrowserWorkflowError(
        "CONFIRMATION_REQUIRED",
        `Sensitive step ${step.index} (${step.kind}) requires a preceding confirm step.`,
        { line: step.line, stepIndex: step.index },
      );
    }
  }
}

function validateParsedSteps(steps, inputs) {
  for (const step of steps) {
    // Scheme checks precede JS heuristics so `javascript:`/`file:` surface as UNSAFE_SCHEME.
    assertSafeSchemes(step);
    assertNoArbitraryJavaScript(step);
    assertNoTraversal(step);
    if (step.kind === "action") parseActionCommand(step);
    if (step.kind === "api") parseApiCommand(step);
  }
  assertVariableBindings(steps, inputs);
  assertConfirmationPolicy(steps, inputs);
}

function sealAst(ast) {
  const frozenSteps = Object.freeze(ast.steps.map((step) => Object.freeze({ ...step })));
  const frozenInputs = Object.freeze(
    ast.inputs.map((input) => Object.freeze({ ...input })),
  );
  const sealed = Object.freeze({
    family: ast.family,
    site: ast.site,
    inputs: frozenInputs,
    ...(ast.trigger ? { trigger: ast.trigger } : {}),
    steps: frozenSteps,
  });
  TRUSTED_ASTS.add(sealed);
  return sealed;
}

function parseBrowserWorkflowMarkdown(source) {
  assertRawBrowserWorkflowSource(source);
  const { rawFrontmatter, body, bodyStartLine } = splitFrontmatterSource(source);
  const raw = parseFrontmatterObject(rawFrontmatter);

  const bannedKeys = ["maxRetries", "loop", "retry", "retries", "while", "for", "uses", "nia", "genie"];
  for (const key of Object.keys(raw)) {
    if (bannedKeys.includes(key)) {
      throw createBrowserWorkflowError(
        "INVALID_WORKFLOW_SHAPE",
        `Frontmatter key "${key}" is not allowed on browser Markdown workflows.`,
      );
    }
  }

  const allowedKeys = new Set(["site", "inputs", "trigger"]);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      throw createBrowserWorkflowError(
        "INVALID_WORKFLOW_SHAPE",
        `Unknown frontmatter key "${key}".`,
      );
    }
  }

  if (raw.site === undefined || raw.site === null || raw.site === "") {
    throw createBrowserWorkflowError("MISSING_SITE", "Front-matter is missing required `site`.");
  }
  if (typeof raw.site === "string" && containsTraversal(raw.site)) {
    throw createBrowserWorkflowError("PATH_TRAVERSAL", "Path traversal is not allowed in site.");
  }

  let site;
  try {
    site = siteSchema.parse(raw.site);
  } catch (error) {
    if (typeof raw.site === "string" && containsTraversal(raw.site)) {
      throw createBrowserWorkflowError("PATH_TRAVERSAL", "Path traversal is not allowed in site.");
    }
    throw createBrowserWorkflowError(
      "INVALID_WORKFLOW_SHAPE",
      `Invalid site: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const inputs = normalizeInputs(raw.inputs);
  let trigger;
  if (raw.trigger !== undefined) {
    try {
      trigger = z.enum(BROWSER_WORKFLOW_TRIGGERS).parse(raw.trigger);
    } catch {
      throw createBrowserWorkflowError(
        "INVALID_WORKFLOW_SHAPE",
        `Unsupported trigger: ${JSON.stringify(raw.trigger)}`,
      );
    }
  }

  const steps = parseSteps(body, bodyStartLine);
  validateParsedSteps(steps, inputs);

  return sealAst(
    browserWorkflowAstSchema.parse({
      family: BROWSER_WORKFLOW_FAMILY,
      site,
      inputs,
      ...(trigger ? { trigger } : {}),
      steps,
    }),
  );
}

function reparseTrustedBrowserWorkflowSource(input) {
  if (typeof input === "string") return parseBrowserWorkflowMarkdown(input);
  if (!input || typeof input !== "object" || typeof input.source !== "string") {
    throw createBrowserWorkflowError(
      "SOURCE_NOT_RAW_MARKDOWN",
      "Trusted workflow records must provide a raw Markdown `.source` string.",
    );
  }
  return parseBrowserWorkflowMarkdown(input.source);
}

function expectedOriginForSite(site) {
  return `https://${site}`;
}

function inputSlot(name) {
  return `input:${name}`;
}

function pageTarget(site, operation, target) {
  return Object.freeze({
    expectedOrigin: expectedOriginForSite(site),
    generationSemantics: "fresh_per_attempt",
    refSemantics: "generation_bound",
    operation,
    ...(target ? { target: Object.freeze({ ...target }) } : {}),
  });
}

function resolveTypeText(command, inputByName) {
  if (command.text.kind === "literal") {
    return { kind: "literal", value: command.text.value };
  }
  const decl = inputByName.get(command.text.name);
  return {
    kind: "input_slot",
    name: command.text.name,
    type: decl.type,
  };
}

function compileStep(step, workflow, inputByName) {
  const base = { index: step.index, kind: step.kind, line: step.line, sourceText: step.text };

  if (step.kind === "confirm") {
    return Object.freeze({
      ...base,
      intent: Object.freeze({ type: "human_pause", message: step.text }),
      requiresApproval: true,
      secretSlots: Object.freeze([]),
    });
  }

  if (step.kind === "extract") {
    return Object.freeze({
      ...base,
      intent: Object.freeze({ action: "read", description: step.text }),
      pageTarget: pageTarget(workflow.site, "read"),
      requiresApproval: false,
      secretSlots: Object.freeze([]),
    });
  }

  if (step.kind === "goal") {
    return Object.freeze({
      ...base,
      intent: Object.freeze({
        type: "nia_proposal",
        prompt: step.text,
        bounded: true,
        requiresCompileReview: true,
      }),
      pageTarget: pageTarget(workflow.site, "read"),
      requiresApproval: true,
      secretSlots: Object.freeze([]),
    });
  }

  if (step.kind === "api") {
    const api = parseApiCommand(step);
    const secretSlots = collectVariableRefs(step.text)
      .filter((name) => inputByName.get(name)?.type === "secret")
      .map(inputSlot);
    return Object.freeze({
      ...base,
      intent: Object.freeze({
        type: "guarded_api",
        method: api.method,
        url: api.url,
        operation: api.operation,
        placeholder: true,
      }),
      pageTarget: pageTarget(workflow.site, api.operation),
      requiresApproval: api.sensitive,
      secretSlots: Object.freeze(secretSlots),
    });
  }

  // action
  const command = parseActionCommand(step);
  const secretSlots = [];
  let intent;
  if (command.action === "navigate") {
    intent = { action: "navigate", url: command.url };
  } else if (command.action === "wait") {
    intent = { action: "wait", milliseconds: command.milliseconds };
  } else if (command.variant === "click") {
    intent = { action: "act", variant: "click", target: command.target };
  } else if (command.variant === "key") {
    intent = { action: "act", variant: "key", key: command.key };
  } else if (command.variant === "type") {
    const text = resolveTypeText(command, inputByName);
    if (text.kind === "input_slot" && text.type === "secret") {
      secretSlots.push(inputSlot(text.name));
    }
    intent = {
      action: "act",
      variant: "type",
      text,
      target: command.target,
    };
  } else {
    throw createBrowserWorkflowError("INVALID_ACTION", "Unable to compile action intent.", {
      stepIndex: step.index,
    });
  }

  return Object.freeze({
    ...base,
    intent: Object.freeze(intent),
    pageTarget: pageTarget(workflow.site, command.operation, command.target),
    requiresApproval: requiresPrecedingConfirm(step, workflow),
    secretSlots: Object.freeze(secretSlots),
  });
}

function compileBrowserWorkflow(ast) {
  if (!TRUSTED_ASTS.has(ast)) {
    throw createBrowserWorkflowError(
      "UNTRUSTED_AST",
      "compileBrowserWorkflow only accepts ASTs sealed by parseBrowserWorkflowMarkdown.",
    );
  }

  const parsed = browserWorkflowAstSchema.parse(ast);
  const inputByName = new Map(parsed.inputs.map((input) => [input.name, input]));
  const steps = parsed.steps.map((step) => compileStep(step, parsed, inputByName));
  const approvalPoints = steps
    .filter((step) => step.requiresApproval)
    .map((step) =>
      Object.freeze({
        stepIndex: step.index,
        kind: step.kind,
        reason:
          step.kind === "confirm"
            ? "human_pause"
            : step.kind === "goal"
              ? "nia_compile_review"
              : "sensitive_operation",
      }),
    );

  return Object.freeze({
    family: BROWSER_WORKFLOW_FAMILY,
    site: parsed.site,
    expectedOrigin: expectedOriginForSite(parsed.site),
    ...(parsed.trigger ? { trigger: parsed.trigger } : {}),
    inputs: Object.freeze(
      parsed.inputs.map((input) =>
        Object.freeze({
          name: input.name,
          type: input.type,
          slot: inputSlot(input.name),
        }),
      ),
    ),
    steps: Object.freeze(steps),
    approvalPoints: Object.freeze(approvalPoints),
    grantsAuthority: false,
  });
}

function compileBrowserWorkflowFromSource(source) {
  return compileBrowserWorkflow(parseBrowserWorkflowMarkdown(source));
}

module.exports = {
  BROWSER_WORKFLOW_FAMILY,
  BROWSER_WORKFLOW_STEP_KINDS,
  BROWSER_WORKFLOW_INPUT_TYPES,
  BROWSER_WORKFLOW_TRIGGERS,
  BROWSER_WORKFLOW_ERROR_CODES,
  BROWSER_WORKFLOW_LIMITS,
  browserWorkflowAstSchema,
  BrowserWorkflowError,
  createBrowserWorkflowError,
  assertRawBrowserWorkflowSource,
  parseBrowserWorkflowMarkdown,
  reparseTrustedBrowserWorkflowSource,
  compileBrowserWorkflow,
  compileBrowserWorkflowFromSource,
  stepWrites,
  stepRetryable,
  requiresPrecedingConfirm,
};
