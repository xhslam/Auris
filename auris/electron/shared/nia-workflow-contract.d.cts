import type { z } from "zod";

declare namespace niaWorkflowContract {
  const NIA_WORKFLOW_FAMILY: "nia_yaml";
  const NIA_WORKFLOW_BUILTIN_USES: readonly NiaWorkflowBuiltinUses[];
  const NIA_WORKFLOW_ACTION_ALLOWLIST: readonly NiaWorkflowActionName[];
  const NIA_WORKFLOW_TRANSFORM_OPS: readonly NiaWorkflowTransformOp[];
  const NIA_WORKFLOW_EVENT_TYPES: readonly NiaWorkflowEventType[];
  const NIA_WORKFLOW_STEP_STATUSES: readonly NiaWorkflowStepStatus[];
  const NIA_WORKFLOW_IO_TYPES: readonly ["text"];
  const NIA_WORKFLOW_APPROVALS: readonly ["auto", "ask"];
  const NIA_WORKFLOW_ERROR_CODES: readonly NiaWorkflowErrorCode[];
  const NIA_WORKFLOW_LIMITS: Readonly<{
    maxSourceBytes: number;
    maxStructureDepth: number;
    maxAliasCount: number;
    maxSteps: number;
    maxInputs: number;
    maxDependsOn: number;
    name: number;
    description: number;
    stepId: number;
    uses: number;
    withKey: number;
    withValue: number;
    inputName: number;
    inputDescription: number;
    maxOutputBytes: number;
    maxRuntimeMs: number;
    model: number;
    template: number;
  }>;

  const niaWorkflowAstSchema: z.ZodType<NiaWorkflowAst>;

  function createNiaWorkflowError(
    code: NiaWorkflowErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): NiaWorkflowError;
  function assertRawNiaWorkflowSource(value: unknown): string;
  function parseNiaWorkflowYaml(source: string): NiaWorkflowAst;
  function reparseTrustedNiaWorkflowSource(
    input: string | { source: string; [key: string]: unknown },
  ): NiaWorkflowAst;
  function classifyNiaWorkflowUses(uses: string): NiaWorkflowUsesClassification;
  function isAllowedNiaWorkflowAction(name: string): boolean;
  function createNiaActionRegistry(
    overrides?: Partial<Record<NiaWorkflowActionName, unknown>>,
  ): NiaActionRegistry;
  function topologicalSortSteps(steps: readonly NiaWorkflowStep[]): NiaWorkflowStep[];
  function interpolateNiaWorkflowValue(
    template: string,
    context: { inputs?: Record<string, string>; outputs?: Record<string, NiaWorkflowStepOutput> },
  ): string;
  function runNiaWorkflow(options: NiaWorkflowRunOptions): Promise<NiaWorkflowRunResult>;

  type NiaWorkflowBuiltinUses =
    | "nia/prompt"
    | "nia/template"
    | "nia/choose"
    | "nia/transform";
  type NiaWorkflowActionName =
    | "save-file"
    | "read-file"
    | "notify"
    | "copy"
    | "notes-apply"
    | "browser-act";
  type NiaWorkflowTransformOp =
    | "trim"
    | "uppercase"
    | "lowercase"
    | "replace_literal"
    | "json_stringify";
  type NiaWorkflowEventType = "started" | "step" | "completed" | "failed" | "cancelled";
  type NiaWorkflowStepStatus = "started" | "completed" | "skipped" | "failed";
  type NiaWorkflowErrorCode =
    | "SOURCE_NOT_RAW_YAML"
    | "SOURCE_TOO_LARGE"
    | "YAML_INVALID"
    | "YAML_UNSAFE"
    | "STRUCTURE_TOO_DEEP"
    | "INVALID_WORKFLOW_SHAPE"
    | "MISSING_NAME"
    | "NO_STEPS"
    | "TOO_MANY_STEPS"
    | "DUPLICATE_STEP_ID"
    | "UNKNOWN_DEPENDENCY"
    | "DEPENDENCY_CYCLE"
    | "UNKNOWN_ACTION"
    | "UNKNOWN_TRANSFORM"
    | "INVALID_USES"
    | "UNDECLARED_VARIABLE"
    | "INTERPOLATION_FAILED"
    | "OUTPUT_TOO_LARGE"
    | "RUNTIME_EXCEEDED"
    | "MAX_DEPTH_EXCEEDED"
    | "STEP_FAILED"
    | "APPROVAL_DENIED"
    | "CANCELLED"
    | "UNTRUSTED_AST"
    | "MIXED_FAMILY";

  type NiaWorkflowUsesClassification = Readonly<{
    kind: "builtin" | "action" | "definition";
    family: "nia" | "action";
    name: string;
    canonicalUses: string;
    sourceCompatibility: "canonical" | "legacy_genie";
  }>;

  type NiaWorkflowInput = Readonly<{
    name: string;
    type: "text";
    description?: string;
  }>;

  type NiaWorkflowStep = Readonly<{
    id: string;
    uses: string;
    originalUses: string;
    classified: NiaWorkflowUsesClassification;
    with: Readonly<Record<string, string>>;
    dependsOn: readonly string[];
    approval?: "auto" | "ask";
    model?: string;
    condition?: string;
    index: number;
  }>;

  type NiaWorkflowAst = Readonly<{
    family: "nia_yaml";
    name: string;
    description?: string;
    version?: "v1";
    sourceCompatibility: "canonical_v1" | "legacy_genie_v1";
    inputs: readonly NiaWorkflowInput[];
    defaults: Readonly<{ model?: string; approval?: "auto" | "ask" }>;
    limits: Readonly<{
      maxSteps: number;
      maxRuntimeMs: number;
      maxOutputBytes: number;
      maxStructureDepth: number;
    }>;
    steps: readonly NiaWorkflowStep[];
    diagnostics?: readonly string[];
  }>;

  type NiaWorkflowStepOutput = Readonly<{
    text: string;
    choice?: string;
  }>;

  type NiaWorkflowEvent = Readonly<{
    type: NiaWorkflowEventType;
    runId: string;
    family?: "nia_yaml";
    name?: string;
    stepId?: string;
    uses?: string;
    status?: NiaWorkflowStepStatus;
    reason?: string;
    output?: NiaWorkflowStepOutput;
    outputs?: Readonly<Record<string, NiaWorkflowStepOutput>>;
    code?: NiaWorkflowErrorCode;
    message?: string;
    details?: unknown;
    stepCount?: number;
    sourceCompatibility?: string;
    diagnostics?: readonly string[];
    originalUses?: string;
  }>;

  type NiaWorkflowAdapters = Readonly<{
    resolveDefinition?: (args: {
      uses: string;
      name: string;
      sourceCompatibility: string;
      step: NiaWorkflowStep;
    }) => Promise<null | {
      body?: string;
      model?: string;
      [key: string]: unknown;
    }>;
    executePrompt?: (args: {
      definition: { body?: string; model?: string; [key: string]: unknown };
      input: string;
      model?: string;
      step: NiaWorkflowStep;
      grantsBrowserAuthority: false;
    }) => Promise<{ text: string }>;
    executeAction?: (args: {
      action: string;
      uses: string;
      params: Record<string, string>;
      step: NiaWorkflowStep;
    }) => Promise<{ text?: string; content?: string; [key: string]: unknown }>;
    requestApproval?: (args: {
      runId: string;
      step: NiaWorkflowStep;
      params: Record<string, string>;
      preview: string;
    }) => Promise<boolean>;
    defaultModel?: string;
  }>;

  type NiaWorkflowRunOptions = Readonly<{
    source?: string;
    ast?: NiaWorkflowAst;
    inputs?: Record<string, string>;
    adapters?: NiaWorkflowAdapters;
    onEvent?: (event: NiaWorkflowEvent) => void;
    signal?: { aborted: boolean };
    runId?: string;
    now?: () => number;
    maxRuntimeMs?: number;
    maxOutputBytes?: number;
  }>;

  type NiaWorkflowRunResult = Readonly<{
    ok: boolean;
    cancelled?: boolean;
    runId: string;
    family: "nia_yaml";
    name: string;
    outputs: Readonly<Record<string, NiaWorkflowStepOutput>>;
    events: readonly NiaWorkflowEvent[];
    diagnostics?: readonly string[];
    error?: NiaWorkflowError;
  }>;

  type NiaActionRegistry = Readonly<{
    list(): string[];
    has(name: string): boolean;
    get(name: string): unknown;
    builtins(): string[];
    classify(uses: string): NiaWorkflowUsesClassification;
  }>;

  class NiaWorkflowError extends Error {
    readonly code: NiaWorkflowErrorCode;
    readonly details?: Record<string, unknown>;
  }
}

export = niaWorkflowContract;
