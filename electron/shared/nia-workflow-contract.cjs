"use strict";

/**
 * Canonical, packaged parser/schema/registry/runner for Nia YAML workflows
 * (distinct from browser Markdown workflows).
 *
 * Main must always reparse raw YAML through this module. A renderer-supplied
 * AST, resolved action, dependency output, or payload hash is never
 * authoritative. Execution never uses eval, Function, shell interpolation,
 * or arbitrary module loading.
 */

const YAML = require("yaml");
const { z } = require("zod");
const { normalizeUsesRef } = require("./nia-definition-contract.cjs");
const { composeNiaPrompt } = require("./nia-prompt-composition.cjs");

const NIA_WORKFLOW_FAMILY = "nia_yaml";

const NIA_WORKFLOW_BUILTIN_USES = Object.freeze([
  "nia/prompt",
  "nia/template",
  "nia/choose",
  "nia/transform",
]);

const NIA_WORKFLOW_ACTION_ALLOWLIST = Object.freeze([
  "save-file",
  "read-file",
  "notify",
  "copy",
  "notes-apply",
  "browser-act",
]);

const NIA_WORKFLOW_TRANSFORM_OPS = Object.freeze([
  "trim",
  "uppercase",
  "lowercase",
  "replace_literal",
  "json_stringify",
]);

const NIA_WORKFLOW_EVENT_TYPES = Object.freeze([
  "started",
  "step",
  "completed",
  "failed",
  "cancelled",
]);

const NIA_WORKFLOW_STEP_STATUSES = Object.freeze([
  "started",
  "completed",
  "skipped",
  "failed",
]);

const NIA_WORKFLOW_IO_TYPES = Object.freeze(["text"]);
const NIA_WORKFLOW_APPROVALS = Object.freeze(["auto", "ask"]);

const NIA_WORKFLOW_ERROR_CODES = Object.freeze([
  "SOURCE_NOT_RAW_YAML",
  "SOURCE_TOO_LARGE",
  "YAML_INVALID",
  "YAML_UNSAFE",
  "STRUCTURE_TOO_DEEP",
  "INVALID_WORKFLOW_SHAPE",
  "MISSING_NAME",
  "NO_STEPS",
  "TOO_MANY_STEPS",
  "DUPLICATE_STEP_ID",
  "UNKNOWN_DEPENDENCY",
  "DEPENDENCY_CYCLE",
  "UNKNOWN_ACTION",
  "UNKNOWN_TRANSFORM",
  "INVALID_USES",
  "UNDECLARED_VARIABLE",
  "INTERPOLATION_FAILED",
  "OUTPUT_TOO_LARGE",
  "RUNTIME_EXCEEDED",
  "MAX_DEPTH_EXCEEDED",
  "STEP_FAILED",
  "APPROVAL_DENIED",
  "CANCELLED",
  "UNTRUSTED_AST",
  "MIXED_FAMILY",
]);

const NIA_WORKFLOW_LIMITS = Object.freeze({
  maxSourceBytes: 256 * 1024,
  maxStructureDepth: 8,
  maxAliasCount: 0,
  maxSteps: 50,
  maxInputs: 32,
  maxDependsOn: 16,
  name: 160,
  description: 4_096,
  stepId: 64,
  uses: 160,
  withKey: 64,
  withValue: 16_384,
  inputName: 64,
  inputDescription: 2_000,
  maxOutputBytes: 1 * 1024 * 1024,
  maxRuntimeMs: 5 * 60 * 1000,
  model: 160,
  template: 32_768,
});

const STEP_ID_PATTERN = /^[a-zA-Z_][\w-]{0,63}$/u;
const INPUT_NAME_PATTERN = /^[a-zA-Z_][\w-]{0,63}$/u;
const VAR_REF_RE = /(?<!\{)\{([a-zA-Z_][\w.-]*)\}(?!\})/gu;
const TEMPLATE_PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/gu;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
const TRUSTED_ASTS = new WeakSet();

const niaWorkflowErrorCodeSchema = z.enum(NIA_WORKFLOW_ERROR_CODES);

class NiaWorkflowError extends Error {
  constructor(code, message, details) {
    const parsedCode = niaWorkflowErrorCodeSchema.parse(code);
    super(message);
    this.name = "NiaWorkflowError";
    this.code = parsedCode;
    if (details !== undefined) this.details = details;
  }
}

function createNiaWorkflowError(code, message, details) {
  return new NiaWorkflowError(code, message, details);
}

function byteLength(text) {
  return Buffer.byteLength(text, "utf8");
}

function hasControlCharacters(value) {
  return CONTROL_CHARACTER_PATTERN.test(value);
}

function assertKnownKeys(value, allowedKeys, label) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw createNiaWorkflowError(
        "INVALID_WORKFLOW_SHAPE",
        `${label} contains unknown key "${key}".`,
      );
    }
  }
}

function assertStructureDepth(value, limit, depth) {
  if (depth > limit) {
    throw createNiaWorkflowError(
      "STRUCTURE_TOO_DEEP",
      `Workflow structure exceeds the maximum nesting depth of ${limit}.`,
    );
  }
  if (Array.isArray(value)) {
    for (const item of value) assertStructureDepth(item, limit, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) assertStructureDepth(child, limit, depth + 1);
  }
}

function assertRawNiaWorkflowSource(value) {
  if (typeof value !== "string") {
    throw createNiaWorkflowError(
      "SOURCE_NOT_RAW_YAML",
      "Nia workflow source must be raw YAML text, not a pre-parsed object.",
    );
  }
  if (byteLength(value) > NIA_WORKFLOW_LIMITS.maxSourceBytes) {
    throw createNiaWorkflowError(
      "SOURCE_TOO_LARGE",
      `Nia workflow source exceeds the ${NIA_WORKFLOW_LIMITS.maxSourceBytes} byte limit.`,
    );
  }
  return value;
}

function parseYamlDocument(source) {
  let documents;
  try {
    documents = YAML.parseAllDocuments(source, {
      schema: "core",
      merge: false,
      maxAliasCount: NIA_WORKFLOW_LIMITS.maxAliasCount,
      uniqueKeys: true,
      strict: true,
    });
  } catch (error) {
    throw createNiaWorkflowError("YAML_INVALID", `Invalid YAML: ${error.message || error}`);
  }
  if (!documents || documents.length !== 1) {
    throw createNiaWorkflowError("YAML_INVALID", "Nia workflows must contain exactly one YAML document.");
  }
  const doc = documents[0];
  if (doc.errors && doc.errors.length > 0) {
    throw createNiaWorkflowError("YAML_INVALID", `Invalid YAML: ${doc.errors[0].message}`);
  }
  if (doc.warnings && doc.warnings.some((w) => /alias/i.test(String(w.message || w)))) {
    throw createNiaWorkflowError("YAML_UNSAFE", "YAML aliases are not allowed in Nia workflows.");
  }
  const raw = doc.toJS({ maxAliasCount: 0 });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "Workflow root must be a mapping.");
  }
  assertStructureDepth(raw, NIA_WORKFLOW_LIMITS.maxStructureDepth, 0);
  return raw;
}

function asStringMap(value, label) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `${label} must be a mapping.`);
  }
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof key !== "string" || key.length === 0 || key.length > NIA_WORKFLOW_LIMITS.withKey) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Invalid ${label} key.`);
    }
    if (typeof entry !== "string" && typeof entry !== "number" && typeof entry !== "boolean") {
      throw createNiaWorkflowError(
        "INVALID_WORKFLOW_SHAPE",
        `${label}.${key} must be a scalar string/number/boolean.`,
      );
    }
    const text = String(entry);
    if (text.length > NIA_WORKFLOW_LIMITS.withValue) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `${label}.${key} exceeds value size limit.`);
    }
    if (hasControlCharacters(text)) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `${label}.${key} contains control characters.`);
    }
    out[key] = text;
  }
  return out;
}

function normalizeDependsOn(rawStep) {
  const value =
    rawStep.depends_on !== undefined
      ? rawStep.depends_on
      : rawStep.dependsOn !== undefined
        ? rawStep.dependsOn
        : rawStep.needs;
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    if (value.length > NIA_WORKFLOW_LIMITS.maxDependsOn) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "Too many depends_on entries.");
    }
    return [...value];
  }
  throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "depends_on/needs must be a string or string list.");
}

function classifyNiaWorkflowUses(uses) {
  if (typeof uses !== "string" || uses.length === 0 || uses.length > NIA_WORKFLOW_LIMITS.uses) {
    throw createNiaWorkflowError("INVALID_USES", "Step uses must be a non-empty string.", { uses });
  }
  if (hasControlCharacters(uses) || uses.includes("..") || uses.includes("\\")) {
    throw createNiaWorkflowError("INVALID_USES", "Step uses contains illegal characters.", { uses });
  }

  if (uses.startsWith("action/")) {
    const action = uses.slice("action/".length);
    if (!NIA_WORKFLOW_ACTION_ALLOWLIST.includes(action)) {
      throw createNiaWorkflowError("UNKNOWN_ACTION", `Action "${action}" is not allowlisted.`, {
        uses,
        action,
      });
    }
    return Object.freeze({
      kind: "action",
      family: "action",
      name: action,
      canonicalUses: `action/${action}`,
      sourceCompatibility: "canonical",
    });
  }

  let ref;
  try {
    ref = normalizeUsesRef(uses);
  } catch (error) {
    if (error && error.name === "NiaDefinitionError") {
      throw createNiaWorkflowError("INVALID_USES", error.message, { uses, cause: error.code });
    }
    throw createNiaWorkflowError("INVALID_USES", `Unsupported uses value: ${uses}`, { uses });
  }

  const canonicalUses = `nia/${ref.name}`;
  if (NIA_WORKFLOW_BUILTIN_USES.includes(canonicalUses)) {
    return Object.freeze({
      kind: "builtin",
      family: "nia",
      name: ref.name,
      canonicalUses,
      sourceCompatibility: ref.sourceCompatibility,
    });
  }

  return Object.freeze({
    kind: "definition",
    family: "nia",
    name: ref.name,
    canonicalUses,
    sourceCompatibility: ref.sourceCompatibility,
  });
}

function isAllowedNiaWorkflowAction(name) {
  return NIA_WORKFLOW_ACTION_ALLOWLIST.includes(name);
}

function createNiaActionRegistry(overrides) {
  const extras = overrides && typeof overrides === "object" ? overrides : {};
  const actions = new Map();
  for (const name of NIA_WORKFLOW_ACTION_ALLOWLIST) {
    actions.set(name, extras[name] || null);
  }
  for (const key of Object.keys(extras)) {
    if (!NIA_WORKFLOW_ACTION_ALLOWLIST.includes(key)) {
      throw createNiaWorkflowError("UNKNOWN_ACTION", `Cannot register non-allowlisted action "${key}".`);
    }
  }
  return Object.freeze({
    list() {
      return [...NIA_WORKFLOW_ACTION_ALLOWLIST];
    },
    has(name) {
      return isAllowedNiaWorkflowAction(name);
    },
    get(name) {
      if (!isAllowedNiaWorkflowAction(name)) {
        throw createNiaWorkflowError("UNKNOWN_ACTION", `Action "${name}" is not allowlisted.`);
      }
      return actions.get(name);
    },
    builtins() {
      return [...NIA_WORKFLOW_BUILTIN_USES];
    },
    classify(uses) {
      return classifyNiaWorkflowUses(uses);
    },
  });
}

function parseInputs(rawInputs) {
  if (rawInputs === undefined || rawInputs === null) return [];
  if (typeof rawInputs !== "object" || Array.isArray(rawInputs)) {
    throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "inputs must be a mapping.");
  }
  const inputs = [];
  for (const [name, decl] of Object.entries(rawInputs)) {
    if (!INPUT_NAME_PATTERN.test(name) || name.length > NIA_WORKFLOW_LIMITS.inputName) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Invalid input name "${name}".`);
    }
    if (!decl || typeof decl !== "object" || Array.isArray(decl)) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Input "${name}" must be a mapping.`);
    }
    assertKnownKeys(decl, ["type", "description"], `Input "${name}"`);
    const type = decl.type === undefined ? "text" : decl.type;
    if (!NIA_WORKFLOW_IO_TYPES.includes(type)) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Input "${name}" has unsupported type.`);
    }
    const description =
      decl.description === undefined
        ? undefined
        : typeof decl.description === "string"
          ? decl.description
          : null;
    if (description === null || (description && description.length > NIA_WORKFLOW_LIMITS.inputDescription)) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Input "${name}" description is invalid.`);
    }
    if (description && hasControlCharacters(description)) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Input "${name}" description has control characters.`);
    }
    inputs.push(
      Object.freeze({
        name,
        type,
        ...(description ? { description } : {}),
      }),
    );
  }
  if (inputs.length > NIA_WORKFLOW_LIMITS.maxInputs) {
    throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "Too many workflow inputs.");
  }
  return inputs;
}

function parseDefaults(raw) {
  if (raw === undefined || raw === null) return Object.freeze({});
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "defaults must be a mapping.");
  }
  assertKnownKeys(raw, ["model", "approval"], "defaults");
  const defaults = {};
  if (raw.model !== undefined) {
    if (typeof raw.model !== "string" || raw.model.length === 0 || raw.model.length > NIA_WORKFLOW_LIMITS.model) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "defaults.model is invalid.");
    }
    defaults.model = raw.model;
  }
  if (raw.approval !== undefined) {
    if (!NIA_WORKFLOW_APPROVALS.includes(raw.approval)) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "defaults.approval must be auto|ask.");
    }
    defaults.approval = raw.approval;
  }
  return Object.freeze(defaults);
}

function parseLimits(raw) {
  const limits = {
    maxSteps: NIA_WORKFLOW_LIMITS.maxSteps,
    maxRuntimeMs: NIA_WORKFLOW_LIMITS.maxRuntimeMs,
    maxOutputBytes: NIA_WORKFLOW_LIMITS.maxOutputBytes,
    maxStructureDepth: NIA_WORKFLOW_LIMITS.maxStructureDepth,
  };
  if (raw === undefined || raw === null) return Object.freeze(limits);
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "limits must be a mapping.");
  }
  assertKnownKeys(
    raw,
    ["max_steps", "maxSteps", "max_runtime_ms", "maxRuntimeMs", "max_output_bytes", "maxOutputBytes"],
    "limits",
  );
  const maxSteps = raw.max_steps ?? raw.maxSteps;
  const maxRuntimeMs = raw.max_runtime_ms ?? raw.maxRuntimeMs;
  const maxOutputBytes = raw.max_output_bytes ?? raw.maxOutputBytes;
  if (maxSteps !== undefined) {
    const n = Number(maxSteps);
    if (!Number.isInteger(n) || n < 1 || n > NIA_WORKFLOW_LIMITS.maxSteps) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "limits.max_steps is out of range.");
    }
    limits.maxSteps = n;
  }
  if (maxRuntimeMs !== undefined) {
    const n = Number(maxRuntimeMs);
    if (!Number.isInteger(n) || n < 1 || n > NIA_WORKFLOW_LIMITS.maxRuntimeMs) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "limits.max_runtime_ms is out of range.");
    }
    limits.maxRuntimeMs = n;
  }
  if (maxOutputBytes !== undefined) {
    const n = Number(maxOutputBytes);
    if (!Number.isInteger(n) || n < 1 || n > NIA_WORKFLOW_LIMITS.maxOutputBytes) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "limits.max_output_bytes is out of range.");
    }
    limits.maxOutputBytes = n;
  }
  return Object.freeze(limits);
}

function parseSteps(rawSteps, workflowLimits) {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw createNiaWorkflowError("NO_STEPS", "Workflow must declare at least one step.");
  }
  if (rawSteps.length > workflowLimits.maxSteps) {
    throw createNiaWorkflowError(
      "TOO_MANY_STEPS",
      `Workflow exceeds the ${workflowLimits.maxSteps} step limit.`,
    );
  }

  const steps = [];
  const seenIds = new Set();
  const diagnostics = [];

  for (let index = 0; index < rawSteps.length; index += 1) {
    const rawStep = rawSteps[index];
    if (!rawStep || typeof rawStep !== "object" || Array.isArray(rawStep)) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Step at index ${index} must be a mapping.`);
    }
    assertKnownKeys(
      rawStep,
      ["id", "uses", "with", "depends_on", "dependsOn", "needs", "approval", "model", "if", "when"],
      `Step at index ${index}`,
    );
    if (typeof rawStep.uses !== "string") {
      throw createNiaWorkflowError("INVALID_USES", `Step at index ${index} is missing uses.`);
    }
    const classified = classifyNiaWorkflowUses(rawStep.uses);
    if (classified.sourceCompatibility === "legacy_genie") {
      diagnostics.push(`Normalized legacy uses "${rawStep.uses}" to "${classified.canonicalUses}".`);
    }

    const id =
      typeof rawStep.id === "string" && rawStep.id.length > 0
        ? rawStep.id
        : classified.name;
    if (!STEP_ID_PATTERN.test(id) || id.length > NIA_WORKFLOW_LIMITS.stepId) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Invalid step id "${id}".`);
    }
    if (seenIds.has(id)) {
      throw createNiaWorkflowError("DUPLICATE_STEP_ID", `Duplicate step id "${id}".`, { id });
    }
    seenIds.add(id);

    const dependsOn = normalizeDependsOn(rawStep);
    for (const dep of dependsOn) {
      if (!STEP_ID_PATTERN.test(dep)) {
        throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Invalid depends_on id "${dep}".`);
      }
    }

    const withMap = asStringMap(rawStep.with, `steps[${id}].with`);
    let approval;
    if (rawStep.approval !== undefined) {
      if (!NIA_WORKFLOW_APPROVALS.includes(rawStep.approval)) {
        throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Step "${id}" approval must be auto|ask.`);
      }
      approval = rawStep.approval;
    }
    let model;
    if (rawStep.model !== undefined) {
      if (
        typeof rawStep.model !== "string" ||
        rawStep.model.length === 0 ||
        rawStep.model.length > NIA_WORKFLOW_LIMITS.model
      ) {
        throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Step "${id}" model is invalid.`);
      }
      model = rawStep.model;
    }
    let condition;
    if (rawStep.if !== undefined || rawStep.when !== undefined) {
      const cond = rawStep.if !== undefined ? rawStep.if : rawStep.when;
      if (typeof cond !== "string" || cond.length === 0 || cond.length > NIA_WORKFLOW_LIMITS.withValue) {
        throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Step "${id}" condition is invalid.`);
      }
      condition = cond;
    }

    steps.push(
      Object.freeze({
        id,
        uses: classified.canonicalUses,
        originalUses: rawStep.uses,
        classified,
        with: Object.freeze({ ...withMap }),
        dependsOn: Object.freeze([...dependsOn]),
        ...(approval ? { approval } : {}),
        ...(model ? { model } : {}),
        ...(condition ? { condition } : {}),
        index: index + 1,
      }),
    );
  }

  for (const step of steps) {
    for (const dep of step.dependsOn) {
      if (!seenIds.has(dep)) {
        throw createNiaWorkflowError(
          "UNKNOWN_DEPENDENCY",
          `Step "${step.id}" depends on unknown step "${dep}".`,
          { stepId: step.id, dependency: dep },
        );
      }
    }
  }

  return { steps, diagnostics };
}

function topologicalSortSteps(steps) {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const inDegree = new Map();
  const adjacency = new Map();

  for (const step of steps) {
    inDegree.set(step.id, 0);
    adjacency.set(step.id, []);
  }
  for (const step of steps) {
    for (const dep of step.dependsOn) {
      adjacency.get(dep).push(step.id);
      inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
    }
  }

  const queue = [];
  for (const step of steps) {
    if ((inDegree.get(step.id) || 0) === 0) queue.push(step.id);
  }

  const ordered = [];
  while (queue.length > 0) {
    const id = queue.shift();
    ordered.push(byId.get(id));
    for (const next of adjacency.get(id) || []) {
      const nextDegree = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }

  if (ordered.length !== steps.length) {
    throw createNiaWorkflowError("DEPENDENCY_CYCLE", "Workflow step dependencies contain a cycle.");
  }
  return ordered;
}

const niaWorkflowAstSchema = z
  .object({
    family: z.literal(NIA_WORKFLOW_FAMILY),
    name: z.string().min(1).max(NIA_WORKFLOW_LIMITS.name),
    description: z.string().max(NIA_WORKFLOW_LIMITS.description).optional(),
    version: z.literal("v1").optional(),
    sourceCompatibility: z.enum(["canonical_v1", "legacy_genie_v1"]),
    inputs: z.array(
      z
        .object({
          name: z.string(),
          type: z.enum(NIA_WORKFLOW_IO_TYPES),
          description: z.string().optional(),
        })
        .strict(),
    ),
    defaults: z
      .object({
        model: z.string().optional(),
        approval: z.enum(NIA_WORKFLOW_APPROVALS).optional(),
      })
      .strict(),
    limits: z
      .object({
        maxSteps: z.number().int().positive(),
        maxRuntimeMs: z.number().int().positive(),
        maxOutputBytes: z.number().int().positive(),
        maxStructureDepth: z.number().int().positive(),
      })
      .strict(),
    steps: z.array(z.any()).min(1),
    diagnostics: z.array(z.string()).optional(),
  })
  .strict();

function detectMixedBrowserFamily(raw) {
  if (raw && typeof raw === "object" && typeof raw.site === "string" && Array.isArray(raw.steps) === false) {
    return true;
  }
  if (raw && typeof raw === "object" && typeof raw.site === "string" && typeof raw.trigger === "string") {
    return true;
  }
  return false;
}

function parseNiaWorkflowYaml(source) {
  assertRawNiaWorkflowSource(source);
  const raw = parseYamlDocument(source);

  assertKnownKeys(
    raw,
    ["name", "description", "nia", "genie", "inputs", "defaults", "limits", "steps"],
    "Workflow root",
  );

  if (detectMixedBrowserFamily(raw)) {
    throw createNiaWorkflowError(
      "MIXED_FAMILY",
      "Browser Markdown workflow shape cannot be parsed as a Nia YAML pipeline.",
    );
  }

  if (typeof raw.name !== "string" || raw.name.trim().length === 0) {
    throw createNiaWorkflowError("MISSING_NAME", "Workflow name is required.");
  }
  if (raw.name.length > NIA_WORKFLOW_LIMITS.name || hasControlCharacters(raw.name)) {
    throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "Workflow name is invalid.");
  }

  let description;
  if (raw.description !== undefined) {
    if (typeof raw.description !== "string" || raw.description.length > NIA_WORKFLOW_LIMITS.description) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "Workflow description is invalid.");
    }
    if (hasControlCharacters(raw.description)) {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "Workflow description has control characters.");
    }
    description = raw.description;
  }

  const limits = parseLimits(raw.limits);
  const { steps, diagnostics } = parseSteps(raw.steps, limits);
  topologicalSortSteps(steps);

  const hasLegacy = steps.some((step) => step.classified.sourceCompatibility === "legacy_genie");
  const versionMarker = raw.nia === "v1" || raw.nia === "v1.0" ? "v1" : undefined;
  if (raw.nia !== undefined && versionMarker === undefined) {
    throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Unsupported nia workflow version: ${raw.nia}`);
  }
  if (raw.genie !== undefined) {
    throw createNiaWorkflowError(
      "INVALID_WORKFLOW_SHAPE",
      "Conflicting genie version key is not allowed on Nia YAML workflows; use uses: genie/* for legacy steps.",
    );
  }

  const sealed = Object.freeze({
    family: NIA_WORKFLOW_FAMILY,
    name: raw.name.trim(),
    ...(description ? { description } : {}),
    ...(versionMarker ? { version: "v1" } : {}),
    sourceCompatibility: hasLegacy && !versionMarker ? "legacy_genie_v1" : "canonical_v1",
    inputs: Object.freeze(parseInputs(raw.inputs)),
    defaults: parseDefaults(raw.defaults),
    limits,
    steps: Object.freeze(steps),
    ...(diagnostics.length > 0 ? { diagnostics: Object.freeze(diagnostics) } : {}),
  });

  niaWorkflowAstSchema.parse(sealed);
  TRUSTED_ASTS.add(sealed);
  return sealed;
}

function reparseTrustedNiaWorkflowSource(input) {
  if (typeof input === "string") return parseNiaWorkflowYaml(input);
  if (!input || typeof input !== "object" || typeof input.source !== "string") {
    throw createNiaWorkflowError(
      "SOURCE_NOT_RAW_YAML",
      "Trusted workflow records must provide a raw YAML `.source` string.",
    );
  }
  return parseNiaWorkflowYaml(input.source);
}

function assertTrustedAst(ast) {
  if (!TRUSTED_ASTS.has(ast)) {
    throw createNiaWorkflowError(
      "UNTRUSTED_AST",
      "Runner only accepts ASTs sealed by parseNiaWorkflowYaml.",
    );
  }
}

function lookupVar(path, inputs, outputs) {
  if (Object.prototype.hasOwnProperty.call(inputs, path)) {
    return inputs[path];
  }
  if (path.includes(".")) {
    const [stepId, ...rest] = path.split(".");
    const stepOut = outputs[stepId];
    if (!stepOut) {
      throw createNiaWorkflowError("UNDECLARED_VARIABLE", `Unknown step output reference "{${path}}".`, {
        path,
      });
    }
    const field = rest.join(".");
    if (field === "output" || field === "outputs.text") {
      if (stepOut.text === undefined) {
        throw createNiaWorkflowError("UNDECLARED_VARIABLE", `Step "${stepId}" has no text output.`, {
          path,
        });
      }
      return stepOut.text;
    }
    if (Object.prototype.hasOwnProperty.call(stepOut, field)) {
      return stepOut[field];
    }
    throw createNiaWorkflowError("UNDECLARED_VARIABLE", `Unknown output field "{${path}}".`, { path });
  }
  if (Object.prototype.hasOwnProperty.call(outputs, path) && outputs[path].text !== undefined) {
    return outputs[path].text;
  }
  throw createNiaWorkflowError("UNDECLARED_VARIABLE", `Unknown variable "{${path}}".`, { path });
}

function interpolateNiaWorkflowValue(template, context) {
  if (typeof template !== "string") {
    throw createNiaWorkflowError("INTERPOLATION_FAILED", "Interpolation target must be a string.");
  }
  const inputs = (context && context.inputs) || {};
  const outputs = (context && context.outputs) || {};
  return template.replace(VAR_REF_RE, (_match, path) => {
    const value = lookupVar(path, inputs, outputs);
    if (typeof value !== "string") {
      throw createNiaWorkflowError("INTERPOLATION_FAILED", `Variable "{${path}}" is not a string.`);
    }
    return value;
  });
}

function fillTemplate(template, withMap) {
  if (typeof template !== "string" || template.length > NIA_WORKFLOW_LIMITS.template) {
    throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "Template is missing or too large.");
  }
  const unbound = [];
  const filled = template.replace(TEMPLATE_PLACEHOLDER_RE, (whole, key) => {
    if (Object.prototype.hasOwnProperty.call(withMap, key)) return withMap[key];
    if (key === "content" && Object.prototype.hasOwnProperty.call(withMap, "input")) {
      return withMap.input;
    }
    if (key === "context") return withMap.context || "";
    unbound.push(key);
    return whole;
  });
  if (unbound.length > 0) {
    throw createNiaWorkflowError(
      "INTERPOLATION_FAILED",
      `Unbound template placeholders: ${unbound.map((k) => `{{${k}}}`).join(", ")}`,
      { unbound },
    );
  }
  return filled;
}

function applyTransform(op, input, params) {
  if (!NIA_WORKFLOW_TRANSFORM_OPS.includes(op)) {
    throw createNiaWorkflowError("UNKNOWN_TRANSFORM", `Transform op "${op}" is not allowlisted.`);
  }
  switch (op) {
    case "trim":
      return input.trim();
    case "uppercase":
      return input.toUpperCase();
    case "lowercase":
      return input.toLowerCase();
    case "replace_literal": {
      const from = params.from;
      const to = params.to === undefined ? "" : params.to;
      if (typeof from !== "string") {
        throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", "replace_literal requires with.from.");
      }
      return input.split(from).join(to);
    }
    case "json_stringify":
      return JSON.stringify(input);
    default:
      throw createNiaWorkflowError("UNKNOWN_TRANSFORM", `Transform op "${op}" is not allowlisted.`);
  }
}

function evaluateCondition(condition, context) {
  const trimmed = condition.trim();
  if (trimmed === "false" || trimmed === "0") return false;
  if (trimmed === "true" || trimmed === "1") return true;
  const interpolated = interpolateNiaWorkflowValue(trimmed, context).trim();
  if (interpolated === "false" || interpolated === "0" || interpolated === "") return false;
  return true;
}

function assertOutputSize(text, maxOutputBytes, stepId) {
  if (typeof text !== "string") {
    throw createNiaWorkflowError("STEP_FAILED", `Step "${stepId}" output must be text.`);
  }
  if (byteLength(text) > maxOutputBytes) {
    throw createNiaWorkflowError(
      "OUTPUT_TOO_LARGE",
      `Step "${stepId}" output exceeds the ${maxOutputBytes} byte limit.`,
      { stepId },
    );
  }
}

function emitEvent(onEvent, event) {
  if (typeof onEvent === "function") onEvent(Object.freeze({ ...event }));
}

async function awaitWithinRuntime(promise, remainingMs, runId) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    throw createNiaWorkflowError("RUNTIME_EXCEEDED", "Workflow exceeded max runtime.", { runId });
  }
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(createNiaWorkflowError(
            "RUNTIME_EXCEEDED",
            "Workflow exceeded max runtime.",
            { runId },
          ));
        }, remainingMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function executeBuiltinStep(step, params, adapters) {
  const name = step.classified.name;
  if (name === "prompt" || step.classified.kind === "definition") {
    const definitionName =
      step.classified.kind === "definition"
        ? step.classified.name
        : params.definition || params.uses || params.name;
    if (!definitionName) {
      throw createNiaWorkflowError(
        "STEP_FAILED",
        `Step "${step.id}" (${step.uses}) requires a definition name.`,
      );
    }
    if (typeof adapters.resolveDefinition !== "function") {
      throw createNiaWorkflowError("STEP_FAILED", "Definition resolver is not configured.");
    }
    const definition = await adapters.resolveDefinition({
      uses: `nia/${definitionName}`,
      name: definitionName,
      sourceCompatibility: step.classified.sourceCompatibility,
      step,
    });
    if (!definition) {
      throw createNiaWorkflowError("STEP_FAILED", `Definition "nia/${definitionName}" was not found.`);
    }
    if (typeof adapters.executePrompt !== "function") {
      throw createNiaWorkflowError("STEP_FAILED", "Prompt executor is not configured.");
    }
    const model = step.model || params.model || definition.model || adapters.defaultModel;
    const promptInput = params.input || params.content || params.prompt || "";
    // 合成 definition.body（模板）与用户内容。在这里做而不是留给每个
    // `executePrompt` 实现，是因为之前正是这样丢掉的：适配器只收到 `input`，
    // body 从未参与，于是 `uses: nia/improve-clarity` 发给模型的只有用户原文，
    // 那条 "You are an expert editor…" 指令从未送达。合成规则属于合约层，
    // 不属于某一个执行器。
    const prompt = composeNiaPrompt({
      body: definition.body,
      content: promptInput,
      context: typeof params.context === "string" ? params.context : "",
    });
    const result = await adapters.executePrompt({
      definition,
      // `input` 保留为用户原文，供需要区分二者的适配器使用；`prompt` 才是要
      // 发给 provider 的那一份。
      input: promptInput,
      prompt,
      model,
      step,
      grantsBrowserAuthority: false,
    });
    const text = result && typeof result.text === "string" ? result.text : "";
    return { text };
  }

  if (name === "template") {
    const template = params.template || params.body || "";
    return { text: fillTemplate(template, params) };
  }

  if (name === "choose") {
    const when = params.when || params.if || "";
    const thenValue = params.then === undefined ? "true" : params.then;
    const elseValue = params.else === undefined ? "false" : params.else;
    let matched = false;
    if (params.equals !== undefined) matched = when === params.equals;
    else if (params.contains !== undefined) matched = when.includes(params.contains);
    else matched = Boolean(when) && when !== "false" && when !== "0";
    return { text: matched ? thenValue : elseValue, choice: matched ? "then" : "else" };
  }

  if (name === "transform") {
    const op = params.op || params.transform;
    const input = params.input || params.content || "";
    return { text: applyTransform(op, input, params) };
  }

  throw createNiaWorkflowError("INVALID_USES", `Unknown builtin step "${step.uses}".`);
}

async function executeActionStep(step, params, adapters) {
  const action = step.classified.name;
  if (typeof adapters.executeAction !== "function") {
    throw createNiaWorkflowError("STEP_FAILED", "Action executor is not configured.");
  }
  const result = await adapters.executeAction({
    action,
    uses: step.uses,
    params,
    step,
  });
  const text =
    result && typeof result.text === "string"
      ? result.text
      : result && typeof result.content === "string"
        ? result.content
        : "";
  return { text, ...(result && typeof result === "object" ? result : {}) };
}

function freezeOutputs(outputs) {
  const frozen = {};
  for (const [stepId, value] of Object.entries(outputs)) {
    frozen[stepId] = Object.freeze({ ...value });
  }
  return Object.freeze(frozen);
}

/**
 * Run a sealed AST (or raw source that will be reparsed) through the
 * dependency-aware sequential scheduler.
 */
async function runNiaWorkflow(options) {
  const opts = options && typeof options === "object" ? options : {};
  const onEvent = opts.onEvent;
  const adapters = opts.adapters && typeof opts.adapters === "object" ? opts.adapters : {};
  const signal = opts.signal;
  const startedAt = typeof opts.now === "function" ? opts.now() : Date.now();
  const wallStartedAt = Date.now();

  let ast = opts.ast;
  if (opts.source !== undefined) {
    ast = parseNiaWorkflowYaml(opts.source);
  } else if (ast) {
    assertTrustedAst(ast);
  } else {
    throw createNiaWorkflowError("SOURCE_NOT_RAW_YAML", "runNiaWorkflow requires source or a trusted ast.");
  }

  const runId =
    typeof opts.runId === "string" && opts.runId.length > 0
      ? opts.runId
      : `nia-wf-${startedAt.toString(36)}`;

  const inputValues = {};
  const provided = opts.inputs && typeof opts.inputs === "object" ? opts.inputs : {};
  for (const decl of ast.inputs) {
    if (!Object.prototype.hasOwnProperty.call(provided, decl.name)) {
      throw createNiaWorkflowError("UNDECLARED_VARIABLE", `Missing workflow input "${decl.name}".`);
    }
    const value = provided[decl.name];
    if (typeof value !== "string") {
      throw createNiaWorkflowError("INVALID_WORKFLOW_SHAPE", `Input "${decl.name}" must be a string.`);
    }
    inputValues[decl.name] = value;
  }
  if (ast.inputs.length === 0) {
    // Legacy workflows with zero declared inputs may still receive free-form values.
    for (const [key, value] of Object.entries(provided)) {
      if (typeof value === "string") inputValues[key] = value;
    }
  } else {
    for (const key of Object.keys(provided)) {
      if (!ast.inputs.some((decl) => decl.name === key)) {
        throw createNiaWorkflowError("UNDECLARED_VARIABLE", `Undeclared workflow input "${key}".`);
      }
    }
  }

  const ordered = topologicalSortSteps(ast.steps);
  const outputs = {};
  const skipped = new Set();
  const events = [];
  let activeStep = null;
  let totalOutputBytes = 0;

  const track = (event) => {
    events.push(event);
    emitEvent(onEvent, event);
  };

  track({
    type: "started",
    runId,
    family: NIA_WORKFLOW_FAMILY,
    name: ast.name,
    stepCount: ordered.length,
    sourceCompatibility: ast.sourceCompatibility,
    diagnostics: ast.diagnostics ? [...ast.diagnostics] : [],
  });

  const maxRuntimeMs = Math.min(
    ast.limits.maxRuntimeMs,
    opts.maxRuntimeMs || ast.limits.maxRuntimeMs,
  );
  const maxOutputBytes = Math.min(
    ast.limits.maxOutputBytes,
    opts.maxOutputBytes || ast.limits.maxOutputBytes,
  );

  try {
    for (const step of ordered) {
      if (signal && signal.aborted) {
        throw createNiaWorkflowError("CANCELLED", "Workflow run was cancelled.", { runId });
      }
      const now = typeof opts.now === "function" ? opts.now() : Date.now();
      if (now - startedAt > maxRuntimeMs) {
        throw createNiaWorkflowError("RUNTIME_EXCEEDED", "Workflow exceeded max runtime.", { runId });
      }

      const depsSkipped = step.dependsOn.some((dep) => skipped.has(dep));
      if (depsSkipped) {
        skipped.add(step.id);
        track({
          type: "step",
          runId,
          stepId: step.id,
          uses: step.uses,
          status: "skipped",
          reason: "dependency_skipped",
        });
        continue;
      }

      const context = { inputs: inputValues, outputs };
      if (step.condition) {
        const shouldRun = evaluateCondition(step.condition, context);
        if (!shouldRun) {
          skipped.add(step.id);
          track({
            type: "step",
            runId,
            stepId: step.id,
            uses: step.uses,
            status: "skipped",
            reason: "condition_false",
          });
          continue;
        }
      }

      track({
        type: "step",
        runId,
        stepId: step.id,
        uses: step.uses,
        status: "started",
        originalUses: step.originalUses,
        sourceCompatibility: step.classified.sourceCompatibility,
      });
      activeStep = step;

      const resolvedWith = {};
      for (const [key, value] of Object.entries(step.with)) {
        resolvedWith[key] = interpolateNiaWorkflowValue(value, context);
      }

      const approval = step.approval || ast.defaults.approval || "auto";
      if (approval === "ask") {
        if (typeof adapters.requestApproval !== "function") {
          throw createNiaWorkflowError(
            "APPROVAL_DENIED",
            `Step "${step.id}" requires an approval service.`,
            { stepId: step.id },
          );
        }
        const approved = await awaitWithinRuntime(
          adapters.requestApproval({
            runId,
            step,
            params: resolvedWith,
            preview: resolvedWith.input || resolvedWith.content || resolvedWith.prompt || step.uses,
          }),
          maxRuntimeMs - (Date.now() - wallStartedAt),
          runId,
        );
        if (!approved) {
          throw createNiaWorkflowError("APPROVAL_DENIED", `Step "${step.id}" approval was denied.`, {
            stepId: step.id,
          });
        }
      }

      let result;
      try {
        if (step.classified.kind === "action") {
          result = await awaitWithinRuntime(
            executeActionStep(step, resolvedWith, adapters),
            maxRuntimeMs - (Date.now() - wallStartedAt),
            runId,
          );
        } else {
          result = await awaitWithinRuntime(
            executeBuiltinStep(step, resolvedWith, adapters),
            maxRuntimeMs - (Date.now() - wallStartedAt),
            runId,
          );
        }
      } catch (error) {
        if (error instanceof NiaWorkflowError) throw error;
        throw createNiaWorkflowError("STEP_FAILED", error.message || String(error), {
          stepId: step.id,
          cause: error,
        });
      }

      const text = result && typeof result.text === "string" ? result.text : "";
      assertOutputSize(text, maxOutputBytes, step.id);
      totalOutputBytes += byteLength(text);
      if (totalOutputBytes > maxOutputBytes) {
        throw createNiaWorkflowError(
          "OUTPUT_TOO_LARGE",
          `Workflow output exceeds the ${maxOutputBytes} byte limit.`,
          { stepId: step.id },
        );
      }
      const finishedAt = typeof opts.now === "function" ? opts.now() : Date.now();
      if (finishedAt - startedAt > maxRuntimeMs) {
        throw createNiaWorkflowError("RUNTIME_EXCEEDED", "Workflow exceeded max runtime.", { runId });
      }
      const stepOutput = Object.freeze({
        text,
        ...(result && result.choice ? { choice: result.choice } : {}),
      });
      outputs[step.id] = stepOutput;

      track({
        type: "step",
        runId,
        stepId: step.id,
        uses: step.uses,
        status: "completed",
        output: stepOutput,
      });
      activeStep = null;
    }

    track({
      type: "completed",
      runId,
      family: NIA_WORKFLOW_FAMILY,
      name: ast.name,
      outputs: freezeOutputs(outputs),
    });
    return Object.freeze({
      ok: true,
      runId,
      family: NIA_WORKFLOW_FAMILY,
      name: ast.name,
      outputs: freezeOutputs(outputs),
      events: Object.freeze([...events]),
      diagnostics: ast.diagnostics ? [...ast.diagnostics] : [],
    });
  } catch (error) {
    const code = error instanceof NiaWorkflowError ? error.code : "STEP_FAILED";
    if (activeStep) {
      track({
        type: "step",
        runId,
        stepId: activeStep.id,
        uses: activeStep.uses,
        status: "failed",
        code,
        message: error.message || String(error),
      });
      activeStep = null;
    }
    const failedEvent = {
      type: code === "CANCELLED" ? "cancelled" : "failed",
      runId,
      family: NIA_WORKFLOW_FAMILY,
      name: ast.name,
      code,
      message: error.message || String(error),
      details: error.details,
    };
    track(failedEvent);
    if (code === "CANCELLED") {
      return Object.freeze({
        ok: false,
        cancelled: true,
        runId,
        family: NIA_WORKFLOW_FAMILY,
        name: ast.name,
        outputs: freezeOutputs(outputs),
        events: Object.freeze([...events]),
        error: error instanceof NiaWorkflowError ? error : createNiaWorkflowError("CANCELLED", error.message),
      });
    }
    return Object.freeze({
      ok: false,
      cancelled: false,
      runId,
      family: NIA_WORKFLOW_FAMILY,
      name: ast.name,
      outputs: freezeOutputs(outputs),
      events: Object.freeze([...events]),
      error: error instanceof NiaWorkflowError ? error : createNiaWorkflowError("STEP_FAILED", error.message),
    });
  }
}

module.exports = {
  NIA_WORKFLOW_FAMILY,
  NIA_WORKFLOW_BUILTIN_USES,
  NIA_WORKFLOW_ACTION_ALLOWLIST,
  NIA_WORKFLOW_TRANSFORM_OPS,
  NIA_WORKFLOW_EVENT_TYPES,
  NIA_WORKFLOW_STEP_STATUSES,
  NIA_WORKFLOW_IO_TYPES,
  NIA_WORKFLOW_APPROVALS,
  NIA_WORKFLOW_ERROR_CODES,
  NIA_WORKFLOW_LIMITS,
  niaWorkflowAstSchema,
  NiaWorkflowError,
  createNiaWorkflowError,
  assertRawNiaWorkflowSource,
  parseNiaWorkflowYaml,
  reparseTrustedNiaWorkflowSource,
  classifyNiaWorkflowUses,
  isAllowedNiaWorkflowAction,
  createNiaActionRegistry,
  topologicalSortSteps,
  interpolateNiaWorkflowValue,
  runNiaWorkflow,
};
