export const NIA_AUDIT_STORAGE_KEY = "auris.nia.audit.v1";
export const NIA_AUDIT_EVENT_LIMIT = 200;

export type NiaAuditCategory = "memory" | "task" | "tool" | "model" | "voice";
export type NiaAuditEvent = Readonly<{
  action: string;
  category: NiaAuditCategory;
  createdAt: number;
  detail: string;
  id: string;
  targetId?: string;
}>;

type AuditStorage = Pick<Storage, "getItem" | "setItem">;

function safeStorage(storage: AuditStorage | null | undefined) {
  return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function" ? storage : null;
}
function newId() { return `nia-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function bounded(value: string, limit: number) { return value.trim().slice(0, limit); }
function validCategory(value: unknown): value is NiaAuditCategory {
  return value === "memory" || value === "task" || value === "tool" || value === "model" || value === "voice";
}
function normalize(raw: unknown): NiaAuditEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<NiaAuditEvent>;
  const createdAt = Number(value.createdAt);
  if (typeof value.id !== "string" || typeof value.action !== "string" || typeof value.detail !== "string" || !validCategory(value.category) || !Number.isFinite(createdAt)) return null;
  return Object.freeze({
    id: bounded(value.id, 160), action: bounded(value.action, 120), category: value.category, detail: bounded(value.detail, 600), createdAt,
    ...(typeof value.targetId === "string" && value.targetId.trim() ? { targetId: bounded(value.targetId, 240) } : {}),
  });
}

export function loadNiaAuditLog(storage: AuditStorage | null | undefined): readonly NiaAuditEvent[] {
  const target = safeStorage(storage);
  if (!target) return [];
  try {
    const raw = JSON.parse(target.getItem(NIA_AUDIT_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? Object.freeze(raw.map(normalize).filter((event): event is NiaAuditEvent => Boolean(event)).slice(-NIA_AUDIT_EVENT_LIMIT)) : [];
  } catch { return []; }
}

export function appendNiaAuditEvent(storage: AuditStorage | null | undefined, input: Omit<NiaAuditEvent, "id" | "createdAt"> & Partial<Pick<NiaAuditEvent, "id" | "createdAt">>) {
  const target = safeStorage(storage);
  const event = normalize({ ...input, id: input.id ?? newId(), createdAt: input.createdAt ?? Date.now() });
  if (!event) throw new TypeError("Invalid Nia audit event.");
  if (!target) return event;
  const next = [...loadNiaAuditLog(target), event].slice(-NIA_AUDIT_EVENT_LIMIT);
  try { target.setItem(NIA_AUDIT_STORAGE_KEY, JSON.stringify(next)); } catch { /* Audit is local-only and must not break work. */ }
  return event;
}
