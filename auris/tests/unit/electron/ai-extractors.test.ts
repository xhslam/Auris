import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  AI_EXTRACTOR_PROVIDER_IDS,
  extractConversationFromHtmlForProvider,
  getExtractorScriptForProvider,
} = require("../../../electron/ai-extractors/index.cjs");

const FIXTURE_HTML = `
  <html>
    <head>
      <title>Conversation Summary</title>
    </head>
    <body>
      <main>
        <article>
          <h1>Study plan</h1>
          <p>Summarize this article in concise English.</p>
        </article>
      </main>
    </body>
  </html>
`;

describe("ai extractors", () => {
  it("extracts normalized conversation content for every configured provider", () => {
    for (const providerId of AI_EXTRACTOR_PROVIDER_IDS) {
      const result = extractConversationFromHtmlForProvider(
        providerId,
        FIXTURE_HTML,
        `https://${providerId}.example.com/chat/123`,
      );

      expect(result).toMatchObject({
        content: expect.stringContaining("Summarize this article"),
        provider: providerId,
      });
      expect(result.title).toBeTruthy();
    }
  });

  it("builds executable extractor scripts for every configured provider", () => {
    for (const providerId of AI_EXTRACTOR_PROVIDER_IDS) {
      expect(getExtractorScriptForProvider(providerId)).toContain("document");
    }
  });
});
