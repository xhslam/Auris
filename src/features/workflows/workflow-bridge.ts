export const WORKFLOW_COMMANDS = [
  "list",
  "inspect",
  "validate",
  "start",
  "get_state",
  "cancel",
  "resume",
] as const;
export type WorkflowCommand = (typeof WORKFLOW_COMMANDS)[number];

export type WorkflowEvent = Readonly<{
  type: string;
  runId: string;
  family: "browser_markdown" | "nia_yaml";
  stepIndex?: number;
  code?: string;
}>;

type NativeWorkflowBridge = {
  invoke(command: WorkflowCommand, payload?: Record<string, unknown>): Promise<unknown>;
  subscribe(listener: (event: WorkflowEvent) => void): boolean;
  unsubscribe(listener: (event: WorkflowEvent) => void): boolean;
};

export function createWorkflowBridge(native: NativeWorkflowBridge) {
  const invoke = (command: WorkflowCommand, payload: Record<string, unknown> = {}) => native.invoke(command, payload);
  return Object.freeze({
    list: () => invoke("list"),
    inspect: (family: "nia_yaml" | "browser_markdown", definitionId: string) => invoke("inspect", { family, definitionId }),
    validate: (family: "nia_yaml" | "browser_markdown", source: string) => invoke("validate", { family, source }),
    start: (family: "nia_yaml" | "browser_markdown", request: Record<string, unknown>) => invoke("start", { family, request }),
    getState: (family: "nia_yaml" | "browser_markdown", runId: string) => invoke("get_state", { family, runId }),
    cancel: (family: "nia_yaml" | "browser_markdown", runId: string) => invoke("cancel", { family, runId }),
    resume: (
      family: "nia_yaml" | "browser_markdown",
      runId: string,
      options: { approved: boolean; approvalId?: string } = { approved: false },
    ) => invoke("resume", {
      family,
      runId,
      approved: options.approved === true,
      ...(typeof options.approvalId === "string" ? { approvalId: options.approvalId } : {}),
    }),
    subscribe(listener: (event: WorkflowEvent) => void) {
      native.subscribe(listener);
      return () => { native.unsubscribe(listener); };
    },
  });
}

export function getWorkflowBridge(host: unknown = globalThis) {
  const record = host as {
    aurisWorkflows?: Partial<NativeWorkflowBridge>;
    shadowingDesktop?: { workflows?: Partial<NativeWorkflowBridge> };
  } | null;
  const native = record?.aurisWorkflows ?? record?.shadowingDesktop?.workflows;
  if (!native || typeof native.invoke !== "function" || typeof native.subscribe !== "function" || typeof native.unsubscribe !== "function") return null;
  return createWorkflowBridge(native as NativeWorkflowBridge);
}

declare global { interface Window { aurisWorkflows?: NativeWorkflowBridge } }
