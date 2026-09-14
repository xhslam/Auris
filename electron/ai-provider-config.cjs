"use strict";

const AI_PROVIDERS = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    partition: "persist:shadowing-ai-chatgpt",
    trustedOrigins: [
      "https://chat.openai.com",
      "https://auth.openai.com",
    ],
    url: "https://chatgpt.com",
  },
  {
    id: "gemini",
    label: "Gemini",
    partition: "persist:shadowing-ai-gemini",
    trustedOrigins: [
      "https://accounts.google.com",
    ],
    url: "https://gemini.google.com",
  },
  {
    id: "google",
    label: "Google",
    partition: "persist:shadowing-ai-google",
    trustedOrigins: [
      "https://accounts.google.com",
    ],
    url: "https://www.google.com/search?udm=50",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    partition: "persist:shadowing-ai-deepseek",
    trustedOrigins: [],
    url: "https://chat.deepseek.com",
  },
];

const AI_PROVIDER_IDS = AI_PROVIDERS.map((provider) => provider.id);

function getAiProviderById(id) {
  return AI_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

module.exports = {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  getAiProviderById,
};
