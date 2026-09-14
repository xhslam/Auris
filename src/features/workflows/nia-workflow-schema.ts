/**
 * Thin adapter over the packaged Nia definition contract's workflow
 * step-reference helpers. Full multi-step Nia YAML workflow graphs land in
 * a later phase task (`nia-workflow-contract.cjs`); until then this module
 * exposes only `uses: nia/<name>` / legacy `uses: genie/<name>` reference
 * normalization for definition-authored steps.
 */
import niaDefinitionContract from "../../../electron/shared/nia-definition-contract.cjs";
import type { NiaStepRef } from "../../../electron/shared/nia-definition-contract.cjs";

export type { NiaStepRef };

export const NIA_STEP_REF_FAMILIES = niaDefinitionContract.NIA_STEP_REF_FAMILIES;
export const NIA_STEP_REF_SOURCE_COMPATIBILITY = niaDefinitionContract.NIA_STEP_REF_SOURCE_COMPATIBILITY;
export const niaStepRefSchema = niaDefinitionContract.niaStepRefSchema;
export const normalizeUsesRef = niaDefinitionContract.normalizeUsesRef;
export const parseNiaStepRef = niaDefinitionContract.parseNiaStepRef;
export const serializeUsesRef = niaDefinitionContract.serializeUsesRef;
