import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createDiagnosticsStore } = require("../../../../../electron/nia/companion/diagnostics-store.cjs");

describe("companion diagnostics store", () => {
  it("keeps a bounded chronological history with stable metadata and recovery guidance", () => {
    let tick = 0;
    const store = createDiagnosticsStore({
      capacity: 2,
      now: () => Date.parse("2026-09-02T10:00:00.000Z") + tick++ * 1_000,
    });

    store.note({ component: "credential", code: "CODEX_AUTH_MISSING", detail: { source: "codex" }, recovery: "Run `codex` once to sign in." });
    store.note({ component: "transport", code: "REALTIME_SDP_REFUSED", detail: { status: 400 }, recovery: "Rest Nia, then wake her again." });
    store.note({ component: "microphone", code: "MICROPHONE_DENIED", detail: null, recovery: "Allow microphone access in System Settings." });

    expect(store.list()).toEqual([
      expect.objectContaining({ id: "diagnostic-2", timestamp: "2026-09-02T10:00:01.000Z", component: "transport", code: "REALTIME_SDP_REFUSED", recovery: "Rest Nia, then wake her again." }),
      expect.objectContaining({ id: "diagnostic-3", timestamp: "2026-09-02T10:00:02.000Z", component: "microphone", code: "MICROPHONE_DENIED", recovery: "Allow microphone access in System Settings." }),
    ]);
  });

  it("recursively redacts credentials, secrets, full SDP, and transcript bodies", () => {
    const store = createDiagnosticsStore({ now: () => Date.parse("2026-09-02T10:00:00.000Z"), capacity: 10 });
    const token = "header.eyJleHAiOjE4MDAwMDAwMDB9.signature";
    store.note({
      component: "transport",
      code: "REALTIME_SDP_REFUSED",
      recovery: "Try again.",
      detail: {
        accessToken: "opaque-access-value",
        nested: { clientSecret: "plain-client-secret", authorization: `Bearer ${token}` },
        message: "request failed with token=plain-assignment-secret",
        offer: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111",
        response: { sdp: "v=0\r\nm=audio answer" },
        transcript: { body: "private words from the learner", role: "user" },
        safe: { status: 400 },
      },
    });

    const serialized = JSON.stringify(store.list());
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("opaque-access-value");
    expect(serialized).not.toContain("plain-client-secret");
    expect(serialized).not.toContain("plain-assignment-secret");
    expect(serialized).not.toContain("m=audio");
    expect(serialized).not.toContain("private words");
    expect(store.list()[0].detail.safe).toEqual({ status: 400 });
    expect(store.list()[0].detail.transcript.role).toBe("user");
  });

  it("redacts project keys, encoded auth JSON, and nested transcript text without hiding safe prose", () => {
    const store = createDiagnosticsStore({ now: () => Date.parse("2026-09-02T10:00:00.000Z"), capacity: 10 });
    const projectKey = "sk-proj-fixture-do-not-keep";
    const encodedToken = "opaque-json-access-token";
    const safeText = "The access token documentation is safe ordinary text without a credential value.";
    store.note({
      component: "transport",
      code: "REALTIME_SDP_REFUSED",
      recovery: "Try again.",
      detail: {
        providerMessage: `upstream mentioned ${projectKey}`,
        encoded: JSON.stringify({ access_token: encodedToken, status: 401 }),
        transcript: { role: "assistant", segment: { text: "private nested transcript words" } },
        safeText,
        tokenCount: 128,
        contentType: "application/json",
      },
    });

    const [entry] = store.list();
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain(projectKey);
    expect(serialized).not.toContain(encodedToken);
    expect(serialized).not.toContain("private nested transcript words");
    expect(entry.detail.safeText).toBe(safeText);
    expect(entry.detail.tokenCount).toBe(128);
    expect(entry.detail.contentType).toBe("application/json");
    expect(entry.detail.transcript.role).toBe("assistant");
    expect(JSON.parse(entry.detail.encoded)).toEqual({ access_token: "[REDACTED]", status: 401 });
  });

  it("publishes immutable snapshots, supports unsubscribe, and notifies on clear", () => {
    const store = createDiagnosticsStore({ now: () => Date.parse("2026-09-02T10:00:00.000Z"), capacity: 5 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.note({ component: "credential", code: "CODEX_AUTH_MISSING", recovery: "Sign in." });
    expect(listener).toHaveBeenLastCalledWith([expect.objectContaining({ code: "CODEX_AUTH_MISSING" })]);
    const published = listener.mock.calls[0][0];
    expect(Object.isFrozen(published)).toBe(true);
    expect(Object.isFrozen(published[0])).toBe(true);

    store.clear();
    expect(listener).toHaveBeenLastCalledWith([]);
    unsubscribe();
    store.note({ component: "transport", code: "REALTIME_FAILED", recovery: "Try again." });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("rejects unstable codes and incomplete diagnostic records", () => {
    const store = createDiagnosticsStore({ now: () => 0, capacity: 5 });
    expect(() => store.note({ component: "credential", code: "free form", recovery: "Try again." })).toThrow(TypeError);
    expect(() => store.note({ component: "", code: "VALID_CODE", recovery: "Try again." })).toThrow(TypeError);
    expect(() => store.note({ component: "credential", code: "VALID_CODE", recovery: "" })).toThrow(TypeError);
  });
});
