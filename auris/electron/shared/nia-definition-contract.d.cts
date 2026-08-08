import type { z } from "zod";

declare namespace niaDefinitionContract {
  const NIA_SOURCE_COMPATIBILITY: readonly NiaSourceCompatibility[];
  const NIA_DEFINITION_SCOPES: readonly NiaDefinitionScope[];
  const NIA_DEFINITION_ACTIONS: readonly NiaDefinitionAction[];
  const NIA_DEFINITION_APPROVALS: readonly NiaDefinitionApproval[];
  const NIA_DEFINITION_IO_TYPES: readonly NiaDefinitionIoType[];
  const NIA_STEP_REF_FAMILIES: readonly ["nia", "genie"];
  const NIA_STEP_REF_SOURCE_COMPATIBILITY: readonly NiaStepRefSourceCompatibility[];
  const NIA_DEFINITION_ERROR_CODES: readonly NiaDefinitionErrorCode[];
  const NIA_DEFINITION_LIMITS: Readonly<{
    maxSourceBytes: number;
    maxFrontmatterBytes: number;
    maxStructureDepth: number;
    maxAliasCount: number;
    id: number;
    name: number;
    description: number;
    category: number;
    model: number;
    tag: number;
    maxTags: number;
    ioAccept: number;
    ioDescription: number;
    bodyBytes: number;
    context: number;
  }>;

  const niaDefinitionAstSchema: z.ZodType<NiaDefinitionAst>;
  const niaStepRefSchema: z.ZodType<NiaStepRef>;
  const canonicalFrontmatterSchema: z.ZodType<unknown>;
  const legacyGenieV1FrontmatterSchema: z.ZodType<unknown>;
  const legacyGenieV0FrontmatterSchema: z.ZodType<unknown>;

  function createNiaDefinitionError(
    code: NiaDefinitionErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): NiaDefinitionError;
  function assertRawDefinitionSource(value: unknown): string;
  function parseNiaDefinitionMarkdown(source: string): NiaDefinitionAst;
  function reparseTrustedSource(input: string | { source: string; [key: string]: unknown }): NiaDefinitionAst;
  function serializeNiaDefinitionMarkdown(ast: NiaDefinitionAst): string;
  function assertUniqueDefinitionIds(definitions: readonly Partial<NiaDefinitionAst>[]): true;
  function normalizeUsesRef(value: string): NiaStepRef;
  function parseNiaStepRef(value: string): NiaStepRef;
  function serializeUsesRef(ref: NiaStepRef): string;

  type Brand<T, TBrand extends string> = T & { readonly __niaBrand: TBrand };

  type NiaSourceCompatibility = "canonical_v1" | "legacy_genie_v1" | "legacy_genie_v0";
  type NiaDefinitionScope = "selection" | "document" | "workflow-step";
  type NiaDefinitionAction = "replace" | "insert" | "append" | "none";
  type NiaDefinitionApproval = "ask" | "never";
  type NiaDefinitionIoType = "text";
  type NiaStepRefFamily = "nia" | "genie";
  type NiaStepRefSourceCompatibility = "canonical" | "legacy_genie";

  type NiaDefinitionErrorCode =
    | "SOURCE_NOT_RAW_MARKDOWN"
    | "SOURCE_TOO_LARGE"
    | "FRONTMATTER_REQUIRED"
    | "FRONTMATTER_TOO_LARGE"
    | "FRONTMATTER_INVALID_YAML"
    | "FRONTMATTER_UNSAFE_YAML"
    | "STRUCTURE_TOO_DEEP"
    | "CONFLICTING_VERSION_KEYS"
    | "UNSUPPORTED_VERSION"
    | "INVALID_DEFINITION_SHAPE"
    | "BODY_REQUIRED"
    | "INVALID_STEP_REF"
    | "DUPLICATE_DEFINITION_ID";

  type NiaDefinitionIo = {
    type: NiaDefinitionIoType;
    accept?: string;
    description?: string;
  };

  type NiaDefinitionAst = Readonly<{
    version: "v1";
    sourceCompatibility: NiaSourceCompatibility;
    id?: Brand<string, "NiaDefinitionId">;
    description: string;
    scope: NiaDefinitionScope;
    category?: Brand<string, "NiaDefinitionCategory">;
    model?: Brand<string, "NiaModelId">;
    action?: NiaDefinitionAction;
    context?: number;
    approval?: NiaDefinitionApproval;
    input?: Readonly<NiaDefinitionIo>;
    output?: Readonly<NiaDefinitionIo>;
    tags?: readonly string[];
    body: string;
    diagnostics?: readonly string[];
  }>;

  type NiaStepRef = Readonly<{
    family: "nia";
    name: Brand<string, "NiaStepRefName">;
    sourceCompatibility: NiaStepRefSourceCompatibility;
  }>;

  class NiaDefinitionError extends Error {
    readonly code: NiaDefinitionErrorCode;
    readonly details?: Record<string, unknown>;
  }
}

export = niaDefinitionContract;
