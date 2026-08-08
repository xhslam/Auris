/**
 * Immutable built-in Nia definitions shipped with Auris.
 *
 * Each entry stores only raw canonical `nia: v1` Markdown+frontmatter
 * source text. Both the renderer-side registry and the main-process
 * `nia-definition-store.cjs` independently reparse this source through the
 * packaged `nia-definition-contract.cjs` — a pre-built AST is never trusted
 * as authoritative, even for code-shipped built-ins.
 */
import niaDefinitionContract from "../../../electron/shared/nia-definition-contract.cjs";
import type { NiaDefinitionAst } from "../../../electron/shared/nia-definition-contract.cjs";

export type { NiaDefinitionAst };

export interface BuiltInNiaDefinitionSource {
  readonly name: string;
  readonly source: string;
}

const IMPROVE_CLARITY_SOURCE = `---
nia: v1
id: improve-clarity
description: Improve clarity and flow while preserving voice and intent.
scope: selection
category: editing
action: replace
approval: ask
input:
  type: text
  description: Selected text to improve
output:
  type: text
  description: Improved text
tags:
  - editing
  - clarity
---

You are an expert editor. Improve the clarity, flow, and conciseness of the
following text while preserving the author's voice and intent.

Return only the improved text — no explanations.

{{content}}
`;

const SUMMARIZE_SOURCE = `---
nia: v1
id: summarize
description: Summarize the selection or document into a short digest.
scope: document
category: summarizing
action: insert
approval: ask
input:
  type: text
  description: Text to summarize
output:
  type: text
  description: Summary
tags:
  - summarizing
---

Summarize the following text into a concise digest that captures the key
points. Preserve important names, numbers, and decisions.

{{content}}
`;

export const BUILT_IN_NIA_DEFINITIONS: readonly BuiltInNiaDefinitionSource[] = Object.freeze([
  Object.freeze({ name: "improve-clarity", source: IMPROVE_CLARITY_SOURCE }),
  Object.freeze({ name: "summarize", source: SUMMARIZE_SOURCE }),
]);

/**
 * Reparse a built-in source through the packaged contract. Callers should
 * prefer this over hand-authoring a parsed AST so the built-in and any
 * installed/legacy definition always go through the same trusted parser.
 */
export function parseBuiltInNiaDefinition(entry: BuiltInNiaDefinitionSource): NiaDefinitionAst {
  return niaDefinitionContract.parseNiaDefinitionMarkdown(entry.source);
}
