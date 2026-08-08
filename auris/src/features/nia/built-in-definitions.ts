/**
 * Immutable built-in Nia definitions shipped with Auris.
 *
 * The raw sources now live in `electron/shared/nia-builtin-definitions.cjs`
 * so the main process (CommonJS, cannot `require` a TS module) can pass them
 * into the definition store. Before that move the sources existed only on the
 * TS side, so main created the store with `builtins: []` and the two built-ins
 * were never actually installed — only tests read them.
 *
 * Each entry stores only raw canonical `nia: v1` Markdown+frontmatter source
 * text. Both this module and the main-process `nia-definition-store.cjs`
 * independently reparse that source through the packaged
 * `nia-definition-contract.cjs` — a pre-built AST is never trusted as
 * authoritative, even for code-shipped built-ins.
 */
import niaBuiltinDefinitions from "../../../electron/shared/nia-builtin-definitions.cjs";
import niaDefinitionContract from "../../../electron/shared/nia-definition-contract.cjs";
import type { NiaDefinitionAst } from "../../../electron/shared/nia-definition-contract.cjs";

export type { NiaDefinitionAst };

export interface BuiltInNiaDefinitionSource {
  readonly name: string;
  readonly source: string;
}

export const BUILT_IN_NIA_DEFINITIONS: readonly BuiltInNiaDefinitionSource[] =
  niaBuiltinDefinitions.BUILT_IN_NIA_DEFINITIONS;

/**
 * Reparse a built-in source through the packaged contract. Callers should
 * prefer this over hand-authoring a parsed AST so the built-in and any
 * installed/legacy definition always go through the same trusted parser.
 */
export function parseBuiltInNiaDefinition(entry: BuiltInNiaDefinitionSource): NiaDefinitionAst {
  return niaDefinitionContract.parseNiaDefinitionMarkdown(entry.source);
}
