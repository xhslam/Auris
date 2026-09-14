"use strict";

const { createProviderExtractor } = require("./shared.cjs");

module.exports = createProviderExtractor({
  contentSelectors: ["main", "article", "[data-testid^='conversation-turn-']"],
  providerId: "chatgpt",
  titleSelectors: ["main h1", "article h1", "header h1"],
});
