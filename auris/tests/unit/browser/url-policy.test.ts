import { describe, expect, it } from "vitest";

import {
  canonicalizeBrowserUrl,
  canonicalizeOrigin,
  describeOriginPattern,
  isOriginGranted,
  isOriginPattern,
  originForAgent,
  originKey,
  originMatchesPattern,
  urlForAgent,
  urlForPersistence,
  validateAiNavigationUrl,
} from "../../../src/features/browser/url-policy";

// Cases adapted from VMark `src/lib/browser/url.test.ts` (xiaolai/vmark@7c409688).
describe("canonicalizeBrowserUrl", () => {
  it("lowercases scheme and host", () => {
    expect(canonicalizeBrowserUrl("HTTPS://EXAMPLE.COM/Path")).toBe(
      "https://example.com/Path",
    );
  });

  it("drops default ports (443/80)", () => {
    expect(canonicalizeBrowserUrl("https://example.com:443/a")).toBe(
      "https://example.com/a",
    );
    expect(canonicalizeBrowserUrl("http://example.com:80/a")).toBe(
      "http://example.com/a",
    );
  });

  it("keeps non-default ports", () => {
    expect(canonicalizeBrowserUrl("https://example.com:8443/a")).toBe(
      "https://example.com:8443/a",
    );
  });

  it("normalizes a bare origin to a trailing-slash path", () => {
    expect(canonicalizeBrowserUrl("https://example.com")).toBe(
      "https://example.com/",
    );
  });

  it("drops the fragment (same document)", () => {
    expect(canonicalizeBrowserUrl("https://example.com/a#section")).toBe(
      "https://example.com/a",
    );
    expect(canonicalizeBrowserUrl("https://example.com/a#x")).toBe(
      canonicalizeBrowserUrl("https://example.com/a#y"),
    );
  });

  it("preserves the query string", () => {
    expect(canonicalizeBrowserUrl("https://example.com/s?q=1&r=2")).toBe(
      "https://example.com/s?q=1&r=2",
    );
  });

  it("punycodes IDN hosts", () => {
    expect(canonicalizeBrowserUrl("https://ドメイン.example/x")).toBe(
      "https://xn--eckwd4c7c.example/x",
    );
  });

  it("strips a trailing dot on the host", () => {
    expect(canonicalizeBrowserUrl("https://example.com./a")).toBe(
      "https://example.com/a",
    );
  });

  it("returns null for non-http(s) schemes", () => {
    expect(canonicalizeBrowserUrl("file:///etc/passwd")).toBeNull();
    expect(canonicalizeBrowserUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalizeBrowserUrl("about:blank")).toBeNull();
    expect(canonicalizeBrowserUrl("data:text/html,x")).toBeNull();
    expect(canonicalizeBrowserUrl("blob:https://example.com/uuid")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(canonicalizeBrowserUrl("")).toBeNull();
    expect(canonicalizeBrowserUrl("not a url")).toBeNull();
    expect(canonicalizeBrowserUrl("https://")).toBeNull();
  });

  it("returns null for empty-label hosts", () => {
    expect(canonicalizeBrowserUrl("https://.com/a")).toBeNull();
    expect(canonicalizeBrowserUrl("https://a..b.com/a")).toBeNull();
  });

  it("preserves userinfo — credentialed URLs for different users must not dedup together", () => {
    expect(canonicalizeBrowserUrl("https://alice:pw@example.com/x")).toBe(
      "https://alice:pw@example.com/x",
    );
    expect(canonicalizeBrowserUrl("https://alice@example.com/x")).not.toBe(
      canonicalizeBrowserUrl("https://bob@example.com/x"),
    );
    expect(canonicalizeBrowserUrl("https://alice@example.com/x")).not.toBe(
      canonicalizeBrowserUrl("https://example.com/x"),
    );
  });

  it("preserves an empty query delimiter (`/path?` is not `/path`)", () => {
    expect(canonicalizeBrowserUrl("https://example.com/path?")).toBe(
      "https://example.com/path?",
    );
    expect(canonicalizeBrowserUrl("https://example.com/?#frag")).toBe(
      "https://example.com/?",
    );
  });
});

// Adapted from VMark `src/lib/browser/url.test.ts`.
describe("urlForAgent — credentials never cross to the AI", () => {
  it("strips embedded credentials entirely — username as well as password", () => {
    expect(urlForAgent("https://alice:hunter2@example.com/x")).toBe(
      "https://example.com/x",
    );
    expect(urlForAgent("https://alice:hunter2@example.com/x")).not.toContain(
      "hunter2",
    );
    expect(urlForAgent("https://alice@example.com/x")).toBe(
      "https://example.com/x",
    );
  });

  it("keeps scheme/host/port/path for the AI to reason about where it is", () => {
    expect(urlForAgent("https://example.com/docs/42")).toBe(
      "https://example.com/docs/42",
    );
    expect(urlForAgent("https://example.com:8443/x")).toBe(
      "https://example.com:8443/x",
    );
  });

  it("strips the query string and fragment — they carry tokens the AI must not see", () => {
    expect(
      urlForAgent("https://service.example/callback?access_token=SECRET"),
    ).toBe("https://service.example/callback");
    expect(
      urlForAgent("https://service.example/callback?access_token=SECRET"),
    ).not.toContain("SECRET");
    expect(urlForAgent("https://example.com/x#access_token=SECRET")).toBe(
      "https://example.com/x",
    );
    expect(urlForAgent("https://example.com/docs/42?q=a&b=2#frag")).toBe(
      "https://example.com/docs/42",
    );
  });

  it("passes through a url it cannot parse rather than inventing one", () => {
    expect(urlForAgent("about:blank")).toBe("about:blank");
    expect(urlForAgent("")).toBe("");
  });
});

// Adapted from VMark `src/lib/browser/url.test.ts`.
describe("originForAgent — origin only, for approval envelopes", () => {
  it("keeps scheme/host/port but drops path, query, fragment, and userinfo", () => {
    expect(originForAgent("https://example.com/magic-login/SECRET?t=1#f")).toBe(
      "https://example.com",
    );
    expect(
      originForAgent("https://example.com/magic-login/SECRET"),
    ).not.toContain("SECRET");
    expect(originForAgent("https://example.com:8443/x")).toBe(
      "https://example.com:8443",
    );
    expect(originForAgent("https://alice:pw@example.com/x")).toBe(
      "https://example.com",
    );
  });

  it("fails closed for an opaque origin — scheme only, never the payload", () => {
    expect(originForAgent("data:text/html,<h1>SECRET</h1>")).toBe(
      "data:(opaque)",
    );
    expect(originForAgent("data:text/html,<h1>SECRET</h1>")).not.toContain(
      "SECRET",
    );
    expect(originForAgent("about:blank")).toBe("about:(opaque)");
    expect(originForAgent("")).toBe("(unknown origin)");
  });
});

// Adapted from VMark `src/lib/browser/url.test.ts`.
describe("urlForPersistence — a secret is not ours to write to disk", () => {
  it("strips an embedded password", () => {
    expect(urlForPersistence("https://alice:hunter2@example.com/x")).toBe(
      "https://alice@example.com/x",
    );
    expect(
      urlForPersistence("https://alice:hunter2@example.com/x"),
    ).not.toContain("hunter2");
  });

  it("KEEPS the username — it names the destination, and it is not a secret", () => {
    expect(urlForPersistence("https://alice@example.com/x")).toBe(
      "https://alice@example.com/x",
    );
  });

  it("changes nothing about a url that carries no credential", () => {
    expect(urlForPersistence("https://example.com/docs/42?q=a#frag")).toBe(
      "https://example.com/docs/42?q=a#frag",
    );
  });

  it("passes an unparseable url through rather than inventing one", () => {
    expect(urlForPersistence("about:blank")).toBe("about:blank");
    expect(urlForPersistence("")).toBe("");
  });
});

// Cases adapted from VMark `src/lib/browser/origin/originGuard.test.ts`.
describe("canonicalizeOrigin", () => {
  it.each([
    ["https://example.com", "https://example.com:443"],
    ["http://example.com", "http://example.com:80"],
    ["https://example.com:443", "https://example.com:443"],
    ["http://example.com:80", "http://example.com:80"],
    ["https://example.com:8443", "https://example.com:8443"],
    ["HTTPS://Example.COM", "https://example.com:443"],
    ["https://example.com.", "https://example.com:443"],
    ["https://example.com./", "https://example.com:443"],
    ["https://user:pass@example.com/path?q=1#frag", "https://example.com:443"],
    ["https://例え.jp", "https://xn--r8jz45g.jp:443"],
    ["https://xn--r8jz45g.jp", "https://xn--r8jz45g.jp:443"],
  ] as const)("canonicalizes %s → %s", (input, expected) => {
    const origin = canonicalizeOrigin(input);
    expect(origin).not.toBeNull();
    expect(originKey(origin!)).toBe(expected);
  });

  it.each([
    ["about:blank"],
    ["data:text/html,<p>x</p>"],
    ["blob:https://example.com/uuid"],
    ["file:///etc/passwd"],
    ["ftp://example.com"],
    ["ws://example.com"],
    ["wss://example.com"],
    ["javascript:alert(1)"],
    [""],
    ["not a url"],
    ["//example.com"],
    ["https://"],
    ["example.com"],
    ["https://.."],
    ["https://.com"],
    ["https://a..b.com"],
  ] as const)("rejects %s → null", (input) => {
    expect(canonicalizeOrigin(input)).toBeNull();
  });

  it("normalizes a Unicode ideographic full stop (U+3002) to an ASCII dot", () => {
    const origin = canonicalizeOrigin("https://例え。jp");
    expect(origin).not.toBeNull();
    expect(originKey(origin!)).toBe("https://xn--r8jz45g.jp:443");
  });
});

describe("originMatchesPattern", () => {
  const target = (url: string) => canonicalizeOrigin(url)!;

  it("matches exact origin", () => {
    expect(
      originMatchesPattern(target("https://example.com"), "https://example.com"),
    ).toBe(true);
  });

  it("does NOT match a subdomain without an explicit wildcard", () => {
    expect(
      originMatchesPattern(
        target("https://sub.example.com"),
        "https://example.com",
      ),
    ).toBe(false);
  });

  it("matches a subdomain with an explicit wildcard", () => {
    expect(
      originMatchesPattern(
        target("https://sub.example.com"),
        "https://*.example.com",
      ),
    ).toBe(true);
  });

  it("matches a deep subdomain with a wildcard", () => {
    expect(
      originMatchesPattern(
        target("https://a.b.example.com"),
        "https://*.example.com",
      ),
    ).toBe(true);
  });

  it("wildcard does NOT match the apex domain", () => {
    expect(
      originMatchesPattern(
        target("https://example.com"),
        "https://*.example.com",
      ),
    ).toBe(false);
  });

  it("wildcard does NOT match a look-alike suffix", () => {
    expect(
      originMatchesPattern(
        target("https://notexample.com"),
        "https://*.example.com",
      ),
    ).toBe(false);
    expect(
      originMatchesPattern(
        target("https://evil-example.com"),
        "https://*.example.com",
      ),
    ).toBe(false);
  });

  it("enforces scheme and port match", () => {
    expect(
      originMatchesPattern(target("http://example.com"), "https://example.com"),
    ).toBe(false);
    expect(
      originMatchesPattern(
        target("https://example.com"),
        "https://example.com:443",
      ),
    ).toBe(true);
    expect(
      originMatchesPattern(
        target("https://example.com:8443"),
        "https://example.com",
      ),
    ).toBe(false);
  });

  it("canonicalizes IDN on both sides", () => {
    expect(
      originMatchesPattern(target("https://例え.jp"), "https://xn--r8jz45g.jp"),
    ).toBe(true);
    expect(
      originMatchesPattern(target("https://例え.jp"), "https://例え.jp"),
    ).toBe(true);
  });

  it("SECURITY: a pattern with userinfo must not be reinterpreted into another authority", () => {
    expect(
      originMatchesPattern(
        target("https://sub.evil.com"),
        "https://*.example.com@evil.com",
      ),
    ).toBe(false);
    expect(isOriginPattern("https://*.example.com@evil.com")).toBe(false);
    expect(isOriginPattern("https://example.com@evil.com")).toBe(false);
  });

  it("SECURITY: a pattern with a path, query, or fragment is rejected", () => {
    expect(isOriginPattern("https://example.com/path")).toBe(false);
    expect(isOriginPattern("https://example.com?q=1")).toBe(false);
    expect(isOriginPattern("https://example.com#frag")).toBe(false);
    expect(isOriginPattern("https://*.example.com/admin")).toBe(false);
  });
});

describe("isOriginPattern / describeOriginPattern / isOriginGranted", () => {
  it.each([
    "https://example.com",
    "http://example.com",
    "https://example.com:8443",
    "https://*.example.com",
    "https://*.a.b.example.com",
  ])("accepts valid pattern %s", (pattern) => {
    expect(isOriginPattern(pattern)).toBe(true);
  });

  it.each([
    "not-a-url",
    "about:blank",
    "https://*",
    "https://*.",
    "https://",
    "",
    "ws://example.com",
    "https://ex*ample.com",
  ])("rejects invalid pattern %s", (pattern) => {
    expect(isOriginPattern(pattern)).toBe(false);
  });

  it("describes exact and wildcard patterns", () => {
    expect(describeOriginPattern("https://example.com")).toEqual({
      wildcard: false,
      scheme: "https",
      host: "example.com",
      port: 443,
    });
    expect(describeOriginPattern("https://*.sub.example.com")).toEqual({
      wildcard: true,
      scheme: "https",
      host: "sub.example.com",
      port: 443,
    });
    expect(describeOriginPattern("https://*.example.com@evil.com")).toBeNull();
  });

  it("grants / denies with default-deny semantics", () => {
    const grants = ["https://zhihu.com", "https://*.zhihu.com"];
    expect(isOriginGranted("https://zhuanlan.zhihu.com/p/1", grants)).toBe(
      true,
    );
    expect(isOriginGranted("https://weibo.com", grants)).toBe(false);
    expect(isOriginGranted("about:blank", ["https://*.zhihu.com"])).toBe(false);
    expect(isOriginGranted("https://example.com", [])).toBe(false);
  });
});

// Adapted from VMark `src-tauri/src/browser/ai_policy.test.rs`, plus Auris adversarial cases.
describe("validateAiNavigationUrl", () => {
  it("accepts public http(s) URLs and returns the trimmed value", () => {
    expect(validateAiNavigationUrl("  https://Example.com/path  ", false)).toEqual({
      ok: true,
      url: "https://Example.com/path",
    });
  });

  it("rejects unsupported schemes, credentials, and backslash authority tricks", () => {
    for (const url of [
      "file:///etc/passwd",
      "data:text/html,hello",
      "javascript:alert(1)",
      "blob:https://example.com/uuid",
      "https://user:password@example.com/",
      "https://example.com\\@127.0.0.1/",
    ]) {
      expect(validateAiNavigationUrl(url, false)).toEqual({ ok: false });
    }
  });

  it("rejects loopback, private, link-local, metadata, and special-use destinations", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://127.1/",
      "http://2130706433/",
      "http://0x7f000001/",
      "http://0177.0.0.1/",
      "http://localhost/",
      "http://[::1]/",
      "http://10.0.0.1/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://192.0.2.1/",
      "http://198.18.0.1/",
      "http://[2001:db8::1]/",
      "https://metadata.google.internal/",
      "https://metadata/",
      "https://instance-data/",
      "https://LOCALHOST./",
      "https://app.localhost/",
    ]) {
      expect(validateAiNavigationUrl(url, false), url).toEqual({ ok: false });
    }
  });

  it("can enable loopback for development without opening private ranges", () => {
    expect(validateAiNavigationUrl("http://127.0.0.1:8080/", true)).toEqual({
      ok: true,
      url: "http://127.0.0.1:8080/",
    });
    expect(validateAiNavigationUrl("http://localhost:3000/", true)).toEqual({
      ok: true,
      url: "http://localhost:3000/",
    });
    expect(validateAiNavigationUrl("http://app.localhost:3000/", true)).toEqual(
      {
        ok: true,
        url: "http://app.localhost:3000/",
      },
    );
    expect(validateAiNavigationUrl("http://192.168.1.1/", true)).toEqual({
      ok: false,
    });
  });

  it("applies the same decision to redirect destinations", () => {
    expect(
      validateAiNavigationUrl("https://cdn.example/redirect?to=http://127.0.0.1/", false),
    ).toEqual({
      ok: true,
      url: "https://cdn.example/redirect?to=http://127.0.0.1/",
    });
    expect(validateAiNavigationUrl("http://127.0.0.1/after-redirect", false)).toEqual({
      ok: false,
    });
  });
});
