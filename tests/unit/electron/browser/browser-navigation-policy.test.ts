import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createBrowserNavigationPolicy,
} = require("../../../../electron/browser/browser-navigation-policy.cjs");

describe("browser navigation policy", () => {
  it("rejects credentialed, malformed, special-scheme, and backslash URLs", async () => {
    const policy = createBrowserNavigationPolicy({
      allowLoopback: false,
      resolveDns: async () => ["93.184.216.34"],
    });
    for (const url of [
      "https://user:pass@example.com/",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://example.com/\\evil",
      "not a url",
      "http://",
    ]) {
      await expect(policy.resolveDestination(url), url).resolves.toMatchObject({
        allowed: false,
      });
    }
    await expect(policy.resolveDestination("  https://example.com/ok  ")).resolves.toMatchObject({
      allowed: true,
      url: "https://example.com/ok",
    });
  });

  it("blocks private, loopback, metadata, and alternate numeric hosts unless loopback is allowed", async () => {
    const strict = createBrowserNavigationPolicy({ allowLoopback: false });
    for (const url of [
      "http://127.0.0.1/",
      "http://localhost/",
      "http://192.168.1.1/",
      "http://10.0.0.1/",
      "http://169.254.169.254/",
      "http://metadata.google.internal/",
      "http://2130706433/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
    ]) {
      await expect(strict.resolveDestination(url), url).resolves.toMatchObject({ allowed: false });
    }

    const loopback = createBrowserNavigationPolicy({ allowLoopback: true });
    await expect(loopback.resolveDestination("http://127.0.0.1/dev")).resolves.toMatchObject({
      allowed: true,
    });
    await expect(loopback.resolveDestination("http://192.168.1.1/")).resolves.toMatchObject({
      allowed: false,
    });
  });

  it("validates every resolved address and revalidates redirect destinations", async () => {
    const resolveDns = vi.fn(async (hostname: string) => {
      if (hostname === "safe.example") return ["93.184.216.34"];
      if (hostname === "evil.example") return ["127.0.0.1"];
      return ["8.8.8.8"];
    });
    const policy = createBrowserNavigationPolicy({
      allowLoopback: false,
      resolveDns,
      resolutionTimeoutMs: 50,
    });

    await expect(policy.resolveDestination("https://safe.example/")).resolves.toMatchObject({
      allowed: true,
      addresses: ["93.184.216.34"],
    });
    await expect(policy.resolveDestination("https://evil.example/")).resolves.toMatchObject({
      allowed: false,
      reason: "BLOCKED_ADDRESS",
    });

    const redirect = await policy.revalidateDestination(
      "https://safe.example/",
      "https://evil.example/next",
    );
    expect(redirect).toMatchObject({ allowed: false, reason: "BLOCKED_ADDRESS" });
    expect(resolveDns).toHaveBeenCalled();
  });

  it("rotates policyEpoch when settings or partition capability change", () => {
    const policy = createBrowserNavigationPolicy({ allowLoopback: false });
    const first = policy.getPolicyEpoch();
    policy.rotatePolicyEpoch({ reason: "settings-changed" });
    expect(policy.getPolicyEpoch()).toBe(first + 1);
    policy.rotatePolicyEpoch({ reason: "partition-capability-changed" });
    expect(policy.getPolicyEpoch()).toBe(first + 2);
  });
});
