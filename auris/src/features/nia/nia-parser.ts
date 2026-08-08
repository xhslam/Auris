import niaDefinitionContract from "../../../electron/shared/nia-definition-contract.cjs";
import type { NiaDefinitionAst } from "../../../electron/shared/nia-definition-contract.cjs";

export type { NiaDefinitionAst };

export const assertRawDefinitionSource = niaDefinitionContract.assertRawDefinitionSource;
export const parseNiaDefinitionMarkdown = niaDefinitionContract.parseNiaDefinitionMarkdown;
export const reparseTrustedSource = niaDefinitionContract.reparseTrustedSource;
export const serializeNiaDefinitionMarkdown = niaDefinitionContract.serializeNiaDefinitionMarkdown;
export const assertUniqueDefinitionIds = niaDefinitionContract.assertUniqueDefinitionIds;
