/** Thin typed adapter over the packaged Nia YAML parser and runner. */
import niaWorkflowContract from "../../../electron/shared/nia-workflow-contract.cjs";
import type {
  NiaWorkflowAdapters,
  NiaWorkflowAst,
  NiaWorkflowErrorCode,
  NiaWorkflowInput,
  NiaWorkflowRunOptions,
  NiaWorkflowRunResult,
  NiaWorkflowStep,
  NiaWorkflowStepOutput,
} from "../../../electron/shared/nia-workflow-contract.cjs";

export type {
  NiaWorkflowAdapters,
  NiaWorkflowAst,
  NiaWorkflowErrorCode,
  NiaWorkflowInput,
  NiaWorkflowRunOptions,
  NiaWorkflowRunResult,
  NiaWorkflowStep,
  NiaWorkflowStepOutput,
};

export const NIA_WORKFLOW_FAMILY = niaWorkflowContract.NIA_WORKFLOW_FAMILY;
export const NIA_WORKFLOW_LIMITS = niaWorkflowContract.NIA_WORKFLOW_LIMITS;
export const NIA_WORKFLOW_ERROR_CODES = niaWorkflowContract.NIA_WORKFLOW_ERROR_CODES;
export const niaWorkflowAstSchema = niaWorkflowContract.niaWorkflowAstSchema;
export const NiaWorkflowError = niaWorkflowContract.NiaWorkflowError;
export const assertRawNiaWorkflowSource = niaWorkflowContract.assertRawNiaWorkflowSource;
export const parseNiaWorkflowYaml = niaWorkflowContract.parseNiaWorkflowYaml;
export const reparseTrustedNiaWorkflowSource =
  niaWorkflowContract.reparseTrustedNiaWorkflowSource;
export const topologicalSortSteps = niaWorkflowContract.topologicalSortSteps;
export const interpolateNiaWorkflowValue =
  niaWorkflowContract.interpolateNiaWorkflowValue;
export const runNiaWorkflow = niaWorkflowContract.runNiaWorkflow;
