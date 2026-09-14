"use strict";

const { JSDOM } = require("jsdom");

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function findFirstMatchingElement(document, selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);

    if (element) {
      return element;
    }
  }

  return null;
}

function deriveConversationId(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "";
  } catch {
    return "";
  }
}

function extractConversationFromDocument(config, document, url) {
  const contentRoot =
    findFirstMatchingElement(document, config.contentSelectors) ?? document.body;
  const titleElement = findFirstMatchingElement(document, config.titleSelectors);
  const content = normalizeText(contentRoot?.textContent ?? "");
  const title =
    normalizeText(titleElement?.textContent ?? "") ||
    normalizeText(document.title) ||
    "Untitled Conversation";

  if (!content) {
    return null;
  }

  return {
    content,
    conversationId: deriveConversationId(url),
    provider: config.providerId,
    timestamp: Date.now(),
    title,
    url,
  };
}

function extractConversationFromHtml(config, html, url) {
  const dom = new JSDOM(html, { url });
  return extractConversationFromDocument(config, dom.window.document, url);
}

function buildExtractorScript(config) {
  const serializedConfig = JSON.stringify(config);

  return `(() => {
    const config = ${serializedConfig};
    const normalizeText = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
    const findFirstMatchingElement = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element;
        }
      }
      return null;
    };
    const deriveConversationId = (href) => {
      try {
        const parsed = new URL(href);
        const segments = parsed.pathname.split("/").filter(Boolean);
        return segments[segments.length - 1] ?? "";
      } catch {
        return "";
      }
    };
    const contentRoot = findFirstMatchingElement(config.contentSelectors) ?? document.body;
    const titleElement = findFirstMatchingElement(config.titleSelectors);
    const content = normalizeText(contentRoot?.innerText ?? contentRoot?.textContent ?? "");
    const title =
      normalizeText(titleElement?.textContent ?? "") ||
      normalizeText(document.title) ||
      "Untitled Conversation";
    if (!content) {
      return null;
    }
    return {
      content,
      conversationId: deriveConversationId(window.location.href),
      provider: config.providerId,
      timestamp: Date.now(),
      title,
      url: window.location.href,
    };
  })();`;
}

function createProviderExtractor(config) {
  return {
    config,
    extractConversationFromHtml(html, url) {
      return extractConversationFromHtml(config, html, url);
    },
    getExtractorScript() {
      return buildExtractorScript(config);
    },
  };
}

module.exports = {
  createProviderExtractor,
};
