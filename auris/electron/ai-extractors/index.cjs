"use strict";

const chatgptExtractor = require("./chatgpt-extractor.cjs");
const geminiExtractor = require("./gemini-extractor.cjs");
const googleExtractor = require("./google-extractor.cjs");
const deepseekExtractor = require("./deepseek-extractor.cjs");

const EXTRACTORS = {
  chatgpt: chatgptExtractor,
  deepseek: deepseekExtractor,
  gemini: geminiExtractor,
  google: googleExtractor,
};

const AI_EXTRACTOR_PROVIDER_IDS = Object.keys(EXTRACTORS);

function getExtractor(providerId) {
  const extractor = EXTRACTORS[providerId];

  if (!extractor) {
    throw new Error(`Unsupported AI extractor provider: ${providerId}`);
  }

  return extractor;
}

function extractConversationFromHtmlForProvider(providerId, html, url) {
  return getExtractor(providerId).extractConversationFromHtml(html, url);
}

function getExtractorScriptForProvider(providerId) {
  return getExtractor(providerId).getExtractorScript();
}

module.exports = {
  AI_EXTRACTOR_PROVIDER_IDS,
  extractConversationFromHtmlForProvider,
  getExtractorScriptForProvider,
};
