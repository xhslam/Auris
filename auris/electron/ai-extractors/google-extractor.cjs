"use strict";

const { createProviderExtractor } = require("./shared.cjs");

module.exports = createProviderExtractor({
  contentSelectors: ["main", "#search", "[role='main']"],
  providerId: "google",
  titleSelectors: ["main h1", "header h1", "title"],
});
