import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const require = createRequire(import.meta.url);
const {
  INITIAL_NOTE_REVISION,
  INITIAL_NOTE_SOURCE,
  spawnElectronTestApp,
} = require("./electron-browser-test-app.cjs") as {
  INITIAL_NOTE_REVISION: string;
  INITIAL_NOTE_SOURCE: string;
  spawnElectronTestApp: (options?: {
    discoveryPath?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  }) => {
    child: unknown;
    discoveryPath: string;
    ready: Promise<{
      controlOrigin: string;
      discoveryPath: string;
      fixtureOrigin: string;
      type: "ready";
    }>;
    stop: () => Promise<void>;
  };
};

const AURIS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MCP_SERVER_PATH = path.join(AURIS_ROOT, "electron", "auris-notes-mcp-server.mjs");

export { INITIAL_NOTE_REVISION, INITIAL_NOTE_SOURCE };

export type StdioMcpClient = {
  callTool: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{
    isError?: boolean;
    payload: unknown;
    raw: Awaited<ReturnType<Client["callTool"]>>;
  }>;
  close: () => Promise<void>;
};

function parseToolPayload(result: Awaited<ReturnType<Client["callTool"]>>) {
  const text = Array.isArray(result.content)
    ? result.content.find((part) => part.type === "text" && typeof part.text === "string")
    : null;
  if (!text || text.type !== "text") {
    return result;
  }
  try {
    return JSON.parse(text.text);
  } catch {
    return text.text;
  }
}

export async function createStdioMcpClient(options: {
  discoveryPath: string;
  env?: NodeJS.ProcessEnv;
  name?: string;
}): Promise<StdioMcpClient> {
  const transport = new StdioClientTransport({
    args: [MCP_SERVER_PATH],
    command: process.execPath,
    env: {
      AURIS_NOTES_MCP_PORT_FILE: options.discoveryPath,
      ...options.env,
    },
    stderr: "pipe",
  });
  const client = new Client({
    name: options.name ?? "auris-mcp-browser-integration",
    version: "0.1.0",
  });
  await client.connect(transport);

  return {
    async callTool(name, args = {}) {
      const raw = await client.callTool({ arguments: args, name });
      return {
        isError: raw.isError === true,
        payload: parseToolPayload(raw),
        raw,
      };
    },
    async close() {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
    },
  };
}

export function browserErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: { code?: unknown } }).error;
  return typeof error?.code === "string" ? error.code : null;
}

export function browserErrorMetadata(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const metadata = (payload as { error?: { metadata?: unknown } }).error?.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : null;
}

export type ControlClient = {
  listPendingNotes: () => Promise<unknown[]>;
  resolveApproval: (input: {
    approvalId: string;
    decision?: "allow_once" | "deny";
    windowId: string;
  }) => Promise<unknown>;
  snapshotApprovals: () => Promise<{ pendingApprovals?: Array<Record<string, unknown>> }>;
  shutdown: () => Promise<void>;
};

export function createControlClient(controlOrigin: string): ControlClient {
  return {
    async listPendingNotes() {
      const response = await fetch(`${controlOrigin}/pending-notes`);
      if (!response.ok) throw new Error(`pending-notes failed: ${response.status}`);
      return response.json() as Promise<unknown[]>;
    },
    async resolveApproval(input) {
      const response = await fetch(`${controlOrigin}/approvals/resolve`, {
        body: JSON.stringify(input),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(`resolveApproval failed: ${response.status}`);
      return response.json();
    },
    async snapshotApprovals() {
      const response = await fetch(`${controlOrigin}/approvals`);
      if (!response.ok) throw new Error(`approvals snapshot failed: ${response.status}`);
      return response.json() as Promise<{ pendingApprovals?: Array<Record<string, unknown>> }>;
    },
    async shutdown() {
      await fetch(`${controlOrigin}/shutdown`, { method: "POST" }).catch(() => undefined);
    },
  };
}

export type SpawnedTestApp = {
  control: ControlClient;
  controlOrigin: string;
  discoveryPath: string;
  fixtureOrigin: string;
  stop: () => Promise<void>;
};

export async function launchBrowserResearchTestApp(): Promise<SpawnedTestApp> {
  const app = spawnElectronTestApp();
  const ready = await app.ready;
  return {
    control: createControlClient(ready.controlOrigin),
    controlOrigin: ready.controlOrigin,
    discoveryPath: ready.discoveryPath,
    fixtureOrigin: ready.fixtureOrigin,
    stop: () => app.stop(),
  };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function extractControl(payload: unknown) {
  const record = asRecord(payload);
  const control = asRecord(record.control);
  return {
    controlEpoch: Number(control.controlEpoch),
    leaseToken: String(control.leaseToken ?? ""),
    navigationGeneration: Number(control.navigationGeneration),
    tabId: String(control.tabId ?? ""),
    windowId: String(control.windowId ?? ""),
  };
}

export async function approveAndRetry(
  client: StdioMcpClient,
  control: ControlClient,
  args: Record<string, unknown>,
) {
  const first = await client.callTool("auris_browser", args);
  expectApprovalRequired(first.payload);
  const metadata = browserErrorMetadata(first.payload);
  const approvalId = String(metadata?.approvalId ?? "");
  const windowId = String(metadata?.windowId ?? args.windowId ?? "");
  expect(approvalId.length).toBeGreaterThan(8);
  await control.resolveApproval({
    approvalId,
    decision: "allow_once",
    windowId,
  });
  return client.callTool("auris_browser", {
    ...args,
    approvalId,
  });
}

function expectApprovalRequired(payload: unknown) {
  if (browserErrorCode(payload) !== "APPROVAL_REQUIRED") {
    throw new Error(`Expected APPROVAL_REQUIRED, got ${JSON.stringify(payload)}`);
  }
}
