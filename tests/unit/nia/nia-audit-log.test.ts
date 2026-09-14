import { describe, expect, it } from "vitest";
import { appendNiaAuditEvent, loadNiaAuditLog } from "@/features/nia/nia-audit-log";
function storage() { const records = new Map<string, string>(); return { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); } }; }
describe("Nia audit log", () => { it("records local, bounded operational evidence", () => { const local = storage(); appendNiaAuditEvent(local, { category: "memory", action: "confirmed", detail: "User approved a preference.", targetId: "memory-1", createdAt: 1, id: "audit-1" }); expect(loadNiaAuditLog(local)).toEqual([expect.objectContaining({ action: "confirmed", category: "memory", targetId: "memory-1" })]); }); });
