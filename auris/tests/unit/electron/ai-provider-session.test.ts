import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildBrowserLikeUserAgent,
  getAiProviderTrustedOrigins,
  isTrustedProviderOrigin,
} = require("../../../electron/ai-provider-session.cjs");

describe("ai-provider-session", () => {
  it("builds a browser-like user agent without Electron markers", () => {
    const userAgent = buildBrowserLikeUserAgent({
      chromeVersion: "136.0.7103.93",
      platform: "win32",
    });

    expect(userAgent).toContain("Mozilla/5.0");
    expect(userAgent).toContain("Chrome/136.0.7103.93");
    expect(userAgent).not.toContain("Electron/");
  });

  it("combines provider url origins with extra trusted origins", () => {
    const trustedOrigins = getAiProviderTrustedOrigins({
      trustedOrigins: ["https://accounts.google.com/o/oauth2/v2/auth"],
      url: "https://gemini.google.com/app",
    });

    expect(Array.from(trustedOrigins)).toEqual(
      expect.arrayContaining([
        "https://accounts.google.com",
        "https://gemini.google.com",
      ]),
    );
  });

  it("matches trusted origins from full urls", () => {
    const trustedOrigins = new Set(["https://chatgpt.com"]);

    expect(
      isTrustedProviderOrigin(
        trustedOrigins,
        "https://chatgpt.com/c/123",
        "https://chatgpt.com/backend-api/files",
      ),
    ).toBe(true);
    expect(
      isTrustedProviderOrigin(trustedOrigins, "https://example.com/upload"),
    ).toBe(false);
  });
});
