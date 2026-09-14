/**
 * Thin typed adapter over the packaged Nia YAML workflow action registry.
 */
import niaWorkflowContract from "../../../electron/shared/nia-workflow-contract.cjs";
import type {
  NiaActionRegistry,
  NiaWorkflowActionName,
  NiaWorkflowUsesClassification,
} from "../../../electron/shared/nia-workflow-contract.cjs";

export type { NiaActionRegistry, NiaWorkflowActionName, NiaWorkflowUsesClassification };

export const NIA_WORKFLOW_BUILTIN_USES = niaWorkflowContract.NIA_WORKFLOW_BUILTIN_USES;
export const NIA_WORKFLOW_ACTION_ALLOWLIST = niaWorkflowContract.NIA_WORKFLOW_ACTION_ALLOWLIST;
export const NIA_WORKFLOW_TRANSFORM_OPS = niaWorkflowContract.NIA_WORKFLOW_TRANSFORM_OPS;
export const createNiaActionRegistry = niaWorkflowContract.createNiaActionRegistry;
export const classifyNiaWorkflowUses = niaWorkflowContract.classifyNiaWorkflowUses;
export const isAllowedNiaWorkflowAction = niaWorkflowContract.isAllowedNiaWorkflowAction;
