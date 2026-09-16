/**
 * Purpose: register micromark fast paths that make three classes of hostile
 * inline markdown parse in linear time, without changing what any document
 * parses to.
 */
import type { Plugin } from "unified";
import type { Root } from "mdast";
import { attentionWithoutFutileWalks, STOCK_ATTENTION } from "./attention-fast-path";
import { inertCodeTextSequence } from "./code-text-fast-path";
import { inertLabelEnd } from "./label-end-fast-path";
import type { SyntaxExtension } from "./micromark-types";

/** The micromark syntax extension this plugin registers. */
const inlineFastPathsExtension: SyntaxExtension = {
  text: {
    42: [attentionWithoutFutileWalks],
    93: [inertLabelEnd],
    95: [attentionWithoutFutileWalks],
    96: [inertCodeTextSequence],
  },
  disable: { null: [STOCK_ATTENTION] },
};

export const remarkInlineFastPaths: Plugin<[], Root> = function remarkInlineFastPaths() {
  const data = this.data() as { micromarkExtensions?: unknown[] };
  (data.micromarkExtensions ??= []).push(inlineFastPathsExtension);
};
