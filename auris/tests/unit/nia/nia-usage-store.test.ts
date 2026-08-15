import { describe, expect, it } from "vitest";
import { loadNiaUsage, recordNiaLiveUsage, recordNiaTextUsage } from "@/features/nia/nia-usage-store";
function storage() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; }
describe("Nia local usage telemetry", () => { it("separates REST, CLI, Live and fallback counters without estimating cost", () => { const local = storage(); recordNiaTextUsage({ providerKind: "rest" }, local); recordNiaTextUsage({ providerKind: "cli", fallback: true }, local); recordNiaLiveUsage(local); expect(loadNiaUsage(local)).toMatchObject({ restRequests: 1, cliRequests: 1, liveSessions: 1, fallbackEvents: 1 }); }); });
