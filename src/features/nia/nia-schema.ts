import niaDefinitionContract from "../../../electron/shared/nia-definition-contract.cjs";
import type {
  NiaDefinitionAst,
  NiaDefinitionErrorCode,
  NiaStepRef,
} from "../../../electron/shared/nia-definition-contract.cjs";

export type { NiaDefinitionAst, NiaDefinitionErrorCode, NiaStepRef };

export const NIA_SOURCE_COMPATIBILITY = niaDefinitionContract.NIA_SOURCE_COMPATIBILITY;
export const NIA_DEFINITION_SCOPES = niaDefinitionContract.NIA_DEFINITION_SCOPES;
export const NIA_DEFINITION_ACTIONS = niaDefinitionContract.NIA_DEFINITION_ACTIONS;
export const NIA_DEFINITION_APPROVALS = niaDefinitionContract.NIA_DEFINITION_APPROVALS;
export const NIA_DEFINITION_IO_TYPES = niaDefinitionContract.NIA_DEFINITION_IO_TYPES;
export const NIA_DEFINITION_ERROR_CODES = niaDefinitionContract.NIA_DEFINITION_ERROR_CODES;
export const NIA_DEFINITION_LIMITS = niaDefinitionContract.NIA_DEFINITION_LIMITS;
export const niaDefinitionAstSchema = niaDefinitionContract.niaDefinitionAstSchema;
export const niaStepRefSchema = niaDefinitionContract.niaStepRefSchema;
export const NiaDefinitionError = niaDefinitionContract.NiaDefinitionError;
