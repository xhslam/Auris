"use client";
import { useEffect, useMemo, useState } from "react";
import { loadNiaAuditLog } from "@/features/nia/nia-audit-log";
import { activeNiaMemories, confirmNiaMemory, createNiaMemoryCandidate, formatNiaConfirmedMemoriesForPrompt, loadNiaMemories, persistNiaMemoryCandidate, revokeNiaMemory, type NiaMemoryKind, type NiaMemoryRecord } from "@/features/nia/nia-memory-service";
import { useNiaTaskStore } from "@/features/nia/nia-task-store";

function storageOrNull() { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } }
const kindLabel: Record<NiaMemoryKind, string> = { preference: "Preference · 偏好", goal: "Goal · 目标", learning_evidence: "Learning evidence · 学习证据" };

export function NiaOperationsPanel({ onMemoryContextChange }: { onMemoryContextChange: (value: string) => void }) {
  const [memoryKind, setMemoryKind] = useState<NiaMemoryKind>("preference");
  const [memoryText, setMemoryText] = useState("");
  const [memories, setMemories] = useState<readonly NiaMemoryRecord[]>([]);
  const [taskText, setTaskText] = useState("");
  const [auditVersion, setAuditVersion] = useState(0);
  const tasks = useNiaTaskStore((state) => state.tasks);
  const hydrateTasks = useNiaTaskStore((state) => state.hydrate);
  const createTask = useNiaTaskStore((state) => state.createTask);
  const setTaskStatus = useNiaTaskStore((state) => state.setStatus);

  useEffect(() => { const storage = storageOrNull(); setMemories(loadNiaMemories(storage)); hydrateTasks(); }, [hydrateTasks]);
  const active = useMemo(() => activeNiaMemories(memories), [memories]);
  useEffect(() => { onMemoryContextChange(formatNiaConfirmedMemoriesForPrompt(active)); }, [active, onMemoryContextChange]);
  const refreshMemory = () => { setMemories(loadNiaMemories(storageOrNull())); setAuditVersion((value) => value + 1); };
  const candidates = memories.filter((memory) => memory.status === "candidate");
  const audit = useMemo(() => loadNiaAuditLog(storageOrNull()).slice(-8).reverse(), [auditVersion, memories, tasks]);

  return <section aria-label="Nia operations" className="nia-operations">
    <details className="nia-operations__group">
      <summary>Tasks · 任务 <small>{tasks.filter((task) => task.status === "running" || task.status === "planned").length} active</small></summary>
      <form onSubmit={(event) => { event.preventDefault(); if (createTask(taskText)) { setTaskText(""); setAuditVersion((value) => value + 1); } }}>
        <input aria-label="Nia task objective" maxLength={800} onChange={(event) => setTaskText(event.target.value)} placeholder="Plan a learning task…" value={taskText} />
        <button type="submit">Add · 添加</button>
      </form>
      <ol className="nia-operations__list">{tasks.slice().reverse().slice(0, 5).map((task) => <li key={task.id}><div><strong>{task.objective}</strong><small>{task.status} · {task.evidence.length} evidence</small></div><span>{task.status === "planned" ? <button onClick={() => { setTaskStatus(task.id, "running"); setAuditVersion((value) => value + 1); }} type="button">Start</button> : task.status === "running" ? <button onClick={() => setTaskStatus(task.id, "paused")} type="button">Pause</button> : task.status === "paused" ? <button onClick={() => setTaskStatus(task.id, "running")} type="button">Resume</button> : null}{["planned", "running", "paused"].includes(task.status) ? <button onClick={() => setTaskStatus(task.id, "cancelled")} type="button">Cancel</button> : null}</span></li>)}</ol>
    </details>
    <details className="nia-operations__group">
      <summary>Memory · 记忆 <small>{active.length} confirmed</small></summary>
      <p className="nia-operations__notice">Nia uses only confirmed, non-expired memories. You can revoke them at any time.</p>
      <form onSubmit={(event) => { event.preventDefault(); try { const candidate = createNiaMemoryCandidate({ content: memoryText, kind: memoryKind, source: "user" }); persistNiaMemoryCandidate(storageOrNull(), candidate); setMemoryText(""); refreshMemory(); } catch { /* The input limits communicate the accepted range. */ } }}>
        <select aria-label="Nia memory kind" onChange={(event) => setMemoryKind(event.target.value as NiaMemoryKind)} value={memoryKind}>{Object.entries(kindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input aria-label="Nia memory content" maxLength={1600} minLength={2} onChange={(event) => setMemoryText(event.target.value)} placeholder="e.g. Prefer concise bilingual explanations" value={memoryText} />
        <button type="submit">Propose · 提议</button>
      </form>
      {candidates.length ? <div className="nia-operations__pending"><strong>Needs your confirmation · 待确认</strong>{candidates.map((memory) => <p key={memory.id}><span>{memory.content}</span><button onClick={() => { confirmNiaMemory(storageOrNull(), memory.id); refreshMemory(); }} type="button">Confirm · 确认</button><button onClick={() => { revokeNiaMemory(storageOrNull(), memory.id); refreshMemory(); }} type="button">Discard</button></p>)}</div> : null}
      <ol className="nia-operations__list">{active.map((memory) => <li key={memory.id}><div><strong>{kindLabel[memory.kind]}</strong><small>{memory.content}</small></div><button onClick={() => { revokeNiaMemory(storageOrNull(), memory.id); refreshMemory(); }} type="button">Revoke · 撤销</button></li>)}</ol>
    </details>
    <details className="nia-operations__group">
      <summary>Audit · 审计 <small>local-only</small></summary>
      <ol className="nia-operations__audit">{audit.length ? audit.map((event) => <li key={event.id}><strong>{event.category} · {event.action}</strong><small>{event.detail}</small></li>) : <li>No logged operations yet.</li>}</ol>
    </details>
  </section>;
}
