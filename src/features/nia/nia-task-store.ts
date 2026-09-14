"use client";
import { create } from "zustand";
import { appendNiaAuditEvent } from "@/features/nia/nia-audit-log";

export const NIA_TASK_STORAGE_KEY = "auris.nia.tasks.v1";
export const NIA_TASK_LIMIT = 50;
export type NiaTaskStatus = "planned" | "running" | "paused" | "completed" | "cancelled" | "failed";
export type NiaTaskEvidence = Readonly<{ createdAt: number; id: string; source: "user" | "context" | "tool" | "assistant"; summary: string }>;
export type NiaTaskStep = Readonly<{ id: string; status: "pending" | "running" | "completed" | "skipped"; title: string }>;
export type NiaTask = Readonly<{ createdAt: number; evidence: readonly NiaTaskEvidence[]; id: string; objective: string; status: NiaTaskStatus; steps: readonly NiaTaskStep[]; updatedAt: number }>;
type LocalStorage = Pick<Storage, "getItem" | "setItem">;
function localStorageOrNull(): LocalStorage | null { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } }
function id(prefix: string) { return `nia-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function normalizeTask(raw: unknown): NiaTask | null { if (!raw || typeof raw !== "object") return null; const task = raw as Partial<NiaTask>; const createdAt = Number(task.createdAt); const updatedAt = Number(task.updatedAt); if (typeof task.id !== "string" || typeof task.objective !== "string" || !Array.isArray(task.steps) || !Array.isArray(task.evidence) || !Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || !["planned", "running", "paused", "completed", "cancelled", "failed"].includes(task.status ?? "")) return null; return Object.freeze({ id: task.id, objective: task.objective.slice(0, 800), status: task.status as NiaTaskStatus, createdAt, updatedAt, steps: task.steps.filter((step): step is NiaTaskStep => Boolean(step && typeof step.id === "string" && typeof step.title === "string" && ["pending", "running", "completed", "skipped"].includes(step.status))).slice(0, 12), evidence: task.evidence.filter((item): item is NiaTaskEvidence => Boolean(item && typeof item.id === "string" && typeof item.summary === "string" && Number.isFinite(item.createdAt) && ["user", "context", "tool", "assistant"].includes(item.source))).slice(-60) }); }
function loadTasks(storage = localStorageOrNull()) { if (!storage) return [] as readonly NiaTask[]; try { const raw = JSON.parse(storage.getItem(NIA_TASK_STORAGE_KEY) ?? "[]") as unknown; return Array.isArray(raw) ? Object.freeze(raw.map(normalizeTask).filter((task): task is NiaTask => Boolean(task)).slice(-NIA_TASK_LIMIT)) : []; } catch { return []; } }
function saveTasks(tasks: readonly NiaTask[], storage = localStorageOrNull()) { if (!storage) return; try { storage.setItem(NIA_TASK_STORAGE_KEY, JSON.stringify(tasks.slice(-NIA_TASK_LIMIT))); } catch { /* Task persistence is local and optional. */ } }
function persist(set: (next: (state: NiaTaskStore) => Partial<NiaTaskStore>) => void, updater: (tasks: readonly NiaTask[]) => readonly NiaTask[]) { set((state) => { const tasks = updater(state.tasks); saveTasks(tasks); return { tasks }; }); }
type NiaTaskStore = { hydrated: boolean; tasks: readonly NiaTask[]; hydrate: () => void; createTask: (objective: string) => NiaTask | null; setStatus: (taskId: string, status: NiaTaskStatus) => void; completeStep: (taskId: string, stepId: string) => void; addEvidence: (taskId: string, input: Omit<NiaTaskEvidence, "id" | "createdAt">) => void; };
export const useNiaTaskStore = create<NiaTaskStore>()((set) => ({
  hydrated: false, tasks: [],
  hydrate: () => set({ hydrated: true, tasks: loadTasks() }),
  createTask: (objective) => { const text = objective.trim(); if (text.length < 2 || text.length > 800) return null; const now = Date.now(); const task: NiaTask = Object.freeze({ id: id("task"), objective: text, status: "planned", createdAt: now, updatedAt: now, steps: [Object.freeze({ id: id("step"), title: "Clarify objective and collect explicit evidence", status: "pending" as const })], evidence: [] }); persist(set, (tasks) => [...tasks, task].slice(-NIA_TASK_LIMIT)); appendNiaAuditEvent(localStorageOrNull(), { category: "task", action: "created", detail: `Created task: ${text.slice(0, 180)}`, targetId: task.id }); return task; },
  setStatus: (taskId, status) => persist(set, (tasks) => tasks.map((task) => task.id === taskId ? Object.freeze({ ...task, status, updatedAt: Date.now() }) : task)),
  completeStep: (taskId, stepId) => persist(set, (tasks) => tasks.map((task) => task.id === taskId ? Object.freeze({ ...task, updatedAt: Date.now(), steps: task.steps.map((step) => step.id === stepId ? Object.freeze({ ...step, status: "completed" as const }) : step) }) : task)),
  addEvidence: (taskId, input) => { const summary = input.summary.trim(); if (!summary || summary.length > 1200) return; const evidence = Object.freeze({ id: id("evidence"), createdAt: Date.now(), source: input.source, summary }); persist(set, (tasks) => tasks.map((task) => task.id === taskId ? Object.freeze({ ...task, updatedAt: Date.now(), evidence: [...task.evidence, evidence].slice(-60) }) : task)); appendNiaAuditEvent(localStorageOrNull(), { category: "task", action: "evidence_added", detail: `Added ${input.source} evidence.`, targetId: taskId }); },
}));
export function __resetNiaTaskStoreForTests() { useNiaTaskStore.setState({ hydrated: false, tasks: [] }); }
