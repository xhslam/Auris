import { describe, expect, it } from "vitest";
import { assertNiaLiveClientInstanceId, createNiaLiveSessionPayload, NIA_LIVE_MODEL } from "@/features/nia/nia-live-session-config";
describe("Nia GPT Live session configuration", () => {
  it("builds a short-lived gpt-realtime-2.1 session that disables model tools by default", () => { const payload = createNiaLiveSessionPayload({ clientInstanceId: "a".repeat(32), voice: "marin" }); expect(payload.body).toMatchObject({ expires_after: { seconds: 300 }, session: { model: NIA_LIVE_MODEL, type: "realtime", tool_choice: "none", output_modalities: ["audio"], audio: { output: { voice: "marin" } } } }); });
  it("rejects unbounded or unsafe client identifiers", () => { expect(() => assertNiaLiveClientInstanceId("short")).toThrow(); expect(() => assertNiaLiveClientInstanceId("x".repeat(129))).toThrow(); });
});
