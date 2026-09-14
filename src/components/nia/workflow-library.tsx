"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WorkflowRunView, type WorkflowRunState } from "@/components/nia/workflow-run-view";
import { getWorkflowBridge, type WorkflowEvent } from "@/features/workflows/workflow-bridge";

type Family = "nia_yaml" | "browser_markdown";

export function WorkflowLibrary({ host, browserTarget = null, importedSource = null }: {
  host: unknown;
  browserTarget?: Readonly<{ windowId: string; tabId: string }> | null;
  importedSource?: string | null;
}) {
  const bridge = useMemo(() => getWorkflowBridge(host), [host]);
  const [family, setFamily] = useState<Family>("nia_yaml");
  const [source, setSource] = useState("");
  const [library, setLibrary] = useState<Record<string, unknown> | null>(null);
  const [run, setRun] = useState<WorkflowRunState | null>(null);
  const runRef = useRef<WorkflowRunState | null>(null);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof importedSource === "string" && importedSource.trim()) {
      setFamily("browser_markdown");
      setSource(importedSource);
      setMessage("Recording imported into Workflow source · 录制已导入源文本");
    }
  }, [importedSource]);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    void bridge.list().then((value) => { if (active) setLibrary(value as Record<string, unknown>); }).catch((error) => {
      if (active) setMessage(error instanceof Error ? error.message : "Unable to load workflows.");
    });
    const unsubscribe = bridge.subscribe((event) => {
      setEvents((current) => [...current, event].slice(-100));
      const activeRun = runRef.current;
      if (activeRun?.runId === event.runId) {
        void bridge.getState(activeRun.family, activeRun.runId).then((value) => setRun(value as WorkflowRunState));
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [bridge]);

  useEffect(() => { runRef.current = run; }, [run]);

  if (!bridge) return null;
  return (
    <section aria-label="Workflow library" className="nia-workflow-library">
      <header><strong>Workflows · 工作流</strong><span>{library ? "ready" : "loading"}</span></header>
      <label>
        Family · 类型
        <select aria-label="Workflow family" onChange={(event) => setFamily(event.target.value as Family)} value={family}>
          <option value="nia_yaml">Nia YAML</option>
          <option value="browser_markdown">Browser Markdown</option>
        </select>
      </label>
      <label>
        Source · 源文本
        <textarea aria-label="Workflow source" onChange={(event) => setSource(event.target.value)} rows={5} value={source} />
      </label>
      <button disabled={!source} onClick={() => {
        void bridge.validate(family, source).then(() => setMessage("Workflow is valid.")).catch((error) => setMessage(error instanceof Error ? error.message : "Invalid workflow."));
      }} type="button">Validate · 校验</button>
      <button disabled={!source || (family === "browser_markdown" && !browserTarget)} onClick={() => {
        const request = {
          source,
          inputs: {},
          ...(family === "browser_markdown" && browserTarget ? { target: browserTarget } : {}),
        };
        void bridge.start(family, request).then((value) => {
          setRun(value as WorkflowRunState);
          setEvents([]);
        }).catch((error) => setMessage(error instanceof Error ? error.message : "Unable to start workflow."));
      }} type="button">Start · 开始</button>
      {message ? <p aria-live="polite">{message}</p> : null}
      {run ? <WorkflowRunView
        events={events}
        onCancel={() => {
          void bridge.cancel(run.family, run.runId).then((value) => setRun(value as WorkflowRunState));
        }}
        onResume={run.family === "browser_markdown" ? ({ approved, approvalId }) => {
          void bridge.resume(run.family, run.runId, {
            approved,
            ...(approvalId ? { approvalId } : {}),
          }).then((value) => setRun(value as WorkflowRunState)).catch((error) => {
            setMessage(error instanceof Error ? error.message : "Unable to resume workflow.");
          });
        } : undefined}
        state={run}
      /> : null}
    </section>
  );
}
