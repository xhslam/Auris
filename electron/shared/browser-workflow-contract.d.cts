import type { z } from "zod";

declare namespace browserWorkflowContract {
  const BROWSER_WORKFLOW_FAMILY: "browser_markdown";
  const BROWSER_WORKFLOW_STEP_KINDS: readonly BrowserWorkflowStepKind[];
  const BROWSER_WORKFLOW_INPUT_TYPES: readonly BrowserWorkflowInputType[];
  const BROWSER_WORKFLOW_TRIGGERS: readonly BrowserWorkflowTrigger[];
  const BROWSER_WORKFLOW_ERROR_CODES: readonly BrowserWorkflowErrorCode[];
  const BROWSER_WORKFLOW_LIMITS: Readonly<{
    maxSourceBytes: number;
    maxFrontmatterBytes: number;
    maxStructureDepth: number;
    maxAliasCount: number;
    site: number;
    trigger: number;
    inputName: number;
    inputDescription: number;
    maxInputs: number;
    maxSteps: number;
    stepText: number;
    selector: number;
    payload: number;
    url: number;
  }>;

  const browserWorkflowAstSchema: z.ZodType<BrowserWorkflowAst>;

  function createBrowserWorkflowError(
    code: BrowserWorkflowErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): BrowserWorkflowError;
  function assertRawBrowserWorkflowSource(value: unknown): string;
  function parseBrowserWorkflowMarkdown(source: string): BrowserWorkflowAst;
  function reparseTrustedBrowserWorkflowSource(
    input: string | { source: string; [key: string]: unknown },
  ): BrowserWorkflowAst;
  function compileBrowserWorkflow(ast: BrowserWorkflowAst): CompiledBrowserWorkflow;
  function compileBrowserWorkflowFromSource(source: string): CompiledBrowserWorkflow;
  function stepWrites(step: BrowserWorkflowStep): boolean;
  function stepRetryable(step: BrowserWorkflowStep): boolean;
  function requiresPrecedingConfirm(
    step: BrowserWorkflowStep,
    workflow: Pick<BrowserWorkflowAst, "inputs" | "steps">,
  ): boolean;

  type BrowserWorkflowStepKind = "api" | "action" | "goal" | "confirm" | "extract";
  type BrowserWorkflowInputType = "text" | "secret";
  type BrowserWorkflowTrigger = "manual";

  type BrowserWorkflowErrorCode =
    | "SOURCE_NOT_RAW_MARKDOWN"
    | "SOURCE_TOO_LARGE"
    | "FRONTMATTER_REQUIRED"
    | "FRONTMATTER_TOO_LARGE"
    | "FRONTMATTER_INVALID_YAML"
    | "FRONTMATTER_UNSAFE_YAML"
    | "STRUCTURE_TOO_DEEP"
    | "INVALID_WORKFLOW_SHAPE"
    | "MISSING_SITE"
    | "NO_STEPS"
    | "UNKNOWN_STEP_KIND"
    | "MALFORMED_STEP"
    | "ARBITRARY_JAVASCRIPT"
    | "UNSAFE_SCHEME"
    | "UNBOUNDED_CONTROL_FLOW"
    | "UNDECLARED_SECRET"
    | "UNDECLARED_VARIABLE"
    | "PATH_TRAVERSAL"
    | "SELECTOR_TOO_LARGE"
    | "PAYLOAD_TOO_LARGE"
    | "CONFIRMATION_REQUIRED"
    | "INVALID_ACTION"
    | "UNTRUSTED_AST";

  type BrowserWorkflowInput = Readonly<{
    name: string;
    type: BrowserWorkflowInputType;
    description?: string;
  }>;

  type BrowserWorkflowStep = Readonly<{
    index: number;
    kind: BrowserWorkflowStepKind;
    text: string;
    line: number;
  }>;

  type BrowserWorkflowAst = Readonly<{
    family: "browser_markdown";
    site: string;
    inputs: readonly BrowserWorkflowInput[];
    trigger?: BrowserWorkflowTrigger;
    steps: readonly BrowserWorkflowStep[];
  }>;

  type BrowserWorkflowInputSlot = Readonly<{
    name: string;
    type: BrowserWorkflowInputType;
    slot: `input:${string}`;
  }>;

  type CompiledPageTarget = Readonly<{
    expectedOrigin: string;
    generationSemantics: "fresh_per_attempt";
    refSemantics: "generation_bound";
    operation: string;
    target?: Readonly<{ kind: "selector" | "ref"; selector?: string; ref?: string }>;
  }>;

  type CompiledStepIntent =
    | Readonly<{ action: "navigate"; url: string }>
    | Readonly<{ action: "wait"; milliseconds: number }>
    | Readonly<{ action: "read"; description: string }>
    | Readonly<{
        action: "act";
        variant: "click";
        target: Readonly<{ kind: "selector"; selector: string }>;
      }>
    | Readonly<{
        action: "act";
        variant: "type";
        text:
          | Readonly<{ kind: "literal"; value: string }>
          | Readonly<{ kind: "input_slot"; name: string; type: BrowserWorkflowInputType }>;
        target: Readonly<{ kind: "selector"; selector: string }>;
      }>
    | Readonly<{ action: "act"; variant: "key"; key: string }>
    | Readonly<{ type: "human_pause"; message: string }>
    | Readonly<{
        type: "nia_proposal";
        prompt: string;
        bounded: true;
        requiresCompileReview: true;
      }>
    | Readonly<{
        type: "guarded_api";
        method: string;
        url: string;
        operation: "read" | "publish";
        placeholder: true;
      }>;

  type CompiledBrowserWorkflowStep = Readonly<{
    index: number;
    kind: BrowserWorkflowStepKind;
    line: number;
    sourceText: string;
    intent: CompiledStepIntent;
    pageTarget?: CompiledPageTarget;
    requiresApproval: boolean;
    secretSlots: readonly string[];
  }>;

  type BrowserWorkflowApprovalPoint = Readonly<{
    stepIndex: number;
    kind: BrowserWorkflowStepKind;
    reason: "human_pause" | "nia_compile_review" | "sensitive_operation";
  }>;

  type CompiledBrowserWorkflow = Readonly<{
    family: "browser_markdown";
    site: string;
    expectedOrigin: string;
    trigger?: BrowserWorkflowTrigger;
    inputs: readonly BrowserWorkflowInputSlot[];
    steps: readonly CompiledBrowserWorkflowStep[];
    approvalPoints: readonly BrowserWorkflowApprovalPoint[];
    grantsAuthority: false;
  }>;

  class BrowserWorkflowError extends Error {
    readonly code: BrowserWorkflowErrorCode;
    readonly details?: Record<string, unknown>;
  }
}

export = browserWorkflowContract;
