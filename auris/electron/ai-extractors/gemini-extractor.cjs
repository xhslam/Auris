"use strict";

const { createProviderExtractor } = require("./shared.cjs");

module.exports = createProviderExtractor({
  contentSelectors: ["main", "article", "[role='main']"],
  providerId: "gemini",
  titleSelectors: ["main h1", "article h1", "header h1"],
});
