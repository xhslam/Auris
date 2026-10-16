import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  exchangeRealtimeSession,
  proxyRealtimeSdp,
  readCodexCredential,
  resolveAuthPath,
} = require("../../../../../electron/nia/companion/codex-credential.cjs");

const NOW = Date.parse("2026-09-02T10:00:00.000Z");
const ACCESS_TOKEN = jwt(Math.floor(NOW / 1000) + 3_600);

function jwt(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp, sub: "fixture-user" })).toString("base64url");
  return `fixture-header.${payload}.fixture-signature`;
}

function authJson(accessToken = ACCESS_TOKEN): string {
  return JSON.stringify({
    auth_mode: "chatgpt",
    last_refresh: "2026-09-01T09:00:00.000Z",
    tokens: { access_token: accessToken, refresh_token: "fixture-refresh-token" },
  });
}

function response(status: number, body: string): Response {
  return new Response(body, { status });
}

describe("Codex credential location and parsing", () => {
  it("prefers $CODEX_HOME/auth.json", () => {
    expect(resolveAuthPath({ env: { CODEX_HOME: "/custom/codex" }, home: "/home/alice" })).toBe(
      path.join("/custom/codex", "auth.json"),
    );
  });

  it("falls back to ~/.codex/auth.json", () => {
    expect(resolveAuthPath({ env: {}, home: "/home/alice" })).toBe(
      path.join("/home/alice", ".codex", "auth.json"),
    );
  });

  it("reads the injected auth file and exposes only an opaque credential handle", async () => {
    const readFile = vi.fn(async () => authJson());
    const result = await readCodexCredential({
      env: { CODEX_HOME: "/fixture/codex" },
      home: "/unused",
      now: () => NOW,
      readFile,
    });

    expect(readFile).toHaveBeenCalledWith("/fixture/codex/auth.json", "utf8");
    expect(result).toMatchObject({
      ok: true,
      authPath: "/fixture/codex/auth.json",
      expiresAt: new Date(NOW + 3_600_000).toISOString(),
      lastRefresh: "2026-09-01T09:00:00.000Z",
    });
    expect(result.credential).toEqual({ type: "codex-oauth" });
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(result)).not.toContain("fixture-refresh-token");
  });

  it.each([
    ["missing file", Object.assign(new Error("not found"), { code: "ENOENT" }), "CODEX_AUTH_MISSING"],
    ["unreadable file", Object.assign(new Error(`denied ${ACCESS_TOKEN}`), { code: "EACCES" }), "CODEX_AUTH_UNREADABLE"],
  ])("classifies a %s without leaking file or token errors", async (_label, failure, code) => {
    const result = await readCodexCredential({
      env: { CODEX_HOME: "/fixture/codex" },
      home: "/unused",
      now: () => NOW,
      readFile: async () => { throw failure; },
    });

    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(result)).not.toContain("/fixture/codex");
  });

  it("distinguishes malformed JSON from a missing access token", async () => {
    const malformed = await readCodexCredential({
      env: {}, home: "/fixture", now: () => NOW, readFile: async () => "not JSON",
    });
    const noToken = await readCodexCredential({
      env: {}, home: "/fixture", now: () => NOW, readFile: async () => JSON.stringify({ tokens: {} }),
    });

    expect(malformed).toMatchObject({ ok: false, error: { code: "CODEX_AUTH_MALFORMED" } });
    expect(noToken).toMatchObject({ ok: false, error: { code: "CODEX_ACCESS_TOKEN_MISSING" } });
  });

  it("reads JWT exp and rejects a token inside the two-minute expiry margin", async () => {
    const expiredToken = jwt(Math.floor(NOW / 1000) + 60);
    const result = await readCodexCredential({
      env: {}, home: "/fixture", now: () => NOW, readFile: async () => authJson(expiredToken),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CODEX_TOKEN_EXPIRED", recovery: expect.stringContaining("codex") },
    });
    expect(JSON.stringify(result)).not.toContain(expiredToken);
  });
});

describe("Realtime credential exchange and SDP proxy", () => {
  async function credential() {
    const result = await readCodexCredential({
      env: {}, home: "/fixture", now: () => NOW, readFile: async () => authJson(),
    });
    if (!result.ok) throw new Error("fixture credential failed");
    return result.credential;
  }

  it("matches Mochi's pinned session request and keeps both secrets opaque", async () => {
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<ReturnType<typeof response>>>(async () => response(200, JSON.stringify({ value: "ek_fixture-secret", expires_at: 1_800_000_000 })));
    const result = await exchangeRealtimeSession({ credential: await credential(), fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(init).toMatchObject({
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ session: { type: "realtime", model: "gpt-realtime-2.1" } }),
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(result).toMatchObject({ ok: true, model: "gpt-realtime-2.1", expiresAt: 1_800_000_000 });
    expect(result.session).toEqual({ type: "realtime-session" });
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(result)).not.toContain("ek_fixture-secret");
  });

  it("turns an upstream refusal into a stable redacted error", async () => {
    const fetchImpl = vi.fn(async () => response(401, `refused ${ACCESS_TOKEN} ek_leak`));
    const result = await exchangeRealtimeSession({ credential: await credential(), fetchImpl });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CODEX_CREDENTIAL_REFUSED", status: 401, recovery: expect.stringContaining("codex") },
    });
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(result)).not.toContain("ek_leak");
  });

  it("aborts a session exchange at its injected deadline", async () => {
    let abortSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      abortSignal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        abortSignal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const setTimeoutImpl = (callback: () => void) => { callback(); return 1; };
    const result = await exchangeRealtimeSession({
      credential: await credential(), fetchImpl, setTimeoutImpl, clearTimeoutImpl: () => undefined,
    });

    expect(abortSignal?.aborted).toBe(true);
    expect(result).toMatchObject({ ok: false, error: { code: "CODEX_UPSTREAM_TIMEOUT" } });
  });

  it("keeps the session deadline active until a stalled response body is consumed", async () => {
    let fireDeadline: (() => void) | undefined;
    let bodyStarted = false;
    let bodySignal: AbortSignal | undefined;
    const clearTimeoutImpl = vi.fn();
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      text: () => {
        bodyStarted = true;
        bodySignal = init.signal as AbortSignal;
        return new Promise<string>(() => undefined);
      },
    } as Response));

    const pending = exchangeRealtimeSession({
      credential: await credential(),
      fetchImpl,
      setTimeoutImpl: (callback: () => void) => { fireDeadline = callback; return 41; },
      clearTimeoutImpl,
    });
    await vi.waitFor(() => expect(bodyStarted).toBe(true));
    expect(clearTimeoutImpl).not.toHaveBeenCalled();
    fireDeadline?.();

    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: "CODEX_UPSTREAM_TIMEOUT" } });
    expect(bodySignal?.aborted).toBe(true);
    expect(clearTimeoutImpl).toHaveBeenCalledWith(41);
  });

  it("proxies the offer with Mochi's request shape and returns the SDP answer", async () => {
    const minted = await exchangeRealtimeSession({
      credential: await credential(),
      fetchImpl: async () => response(200, JSON.stringify({ value: "ek_fixture-secret" })),
    });
    if (!minted.ok) throw new Error("fixture session failed");
    const fetchImpl = vi.fn(async () => response(201, "v=0 answer\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111"));

    const result = await proxyRealtimeSdp({ offer: "v=0 offer", session: minted.session, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/calls?model=gpt-realtime-2.1",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer ek_fixture-secret", "Content-Type": "application/sdp" },
        body: "v=0 offer",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result).toEqual({ ok: true, answer: "v=0 answer\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111" });
  });

  it("keeps the SDP deadline active until a stalled answer body is consumed", async () => {
    const minted = await exchangeRealtimeSession({
      credential: await credential(),
      fetchImpl: async () => response(200, JSON.stringify({ value: "ek_fixture-secret" })),
    });
    if (!minted.ok) throw new Error("fixture session failed");
    let fireDeadline: (() => void) | undefined;
    let bodyStarted = false;
    let bodySignal: AbortSignal | undefined;
    const clearTimeoutImpl = vi.fn();
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 201,
      text: () => {
        bodyStarted = true;
        bodySignal = init.signal as AbortSignal;
        return new Promise<string>(() => undefined);
      },
    } as Response));

    const pending = proxyRealtimeSdp({
      offer: "v=0 offer",
      session: minted.session,
      fetchImpl,
      setTimeoutImpl: (callback: () => void) => { fireDeadline = callback; return 42; },
      clearTimeoutImpl,
    });
    await vi.waitFor(() => expect(bodyStarted).toBe(true));
    expect(clearTimeoutImpl).not.toHaveBeenCalled();
    fireDeadline?.();

    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: "REALTIME_SDP_TIMEOUT" } });
    expect(bodySignal?.aborted).toBe(true);
    expect(clearTimeoutImpl).toHaveBeenCalledWith(42);
  });
});
