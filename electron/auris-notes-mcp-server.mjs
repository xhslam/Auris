#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import WebSocket from "ws";
import { z } from "zod";
import {
  BROWSER_TOOL_DESCRIPTION,
  BROWSER_READ_TOOL_DESCRIPTION,
  browserMutationToolMcpInputSchema,
  browserReadToolMcpInputSchema,
  createBrowserPublicError,
  createBrowserToolErrorResult,
  createBrowserToolSuccessResult,
  getBrowserActionTimeoutMs,
  getBrowserTransportTimeoutMs,
  parseBrowserMutationToolInput,
  parseBrowserReadToolInput,
  serializeBrowserError,
} from "./mcp/browser-tool-contract.mjs";
import {
  WORKFLOW_TOOL_DESCRIPTION,
  normalizeWorkflowToolInput,
  workflowToolInputSchema,
} from "./mcp/workflow-tool-contract.mjs";

import {
  REVIEW_READ_TOOL_DESCRIPTION,
  REVIEW_MUTATION_TOOL_DESCRIPTION,
  reviewReadToolInputSchema,
  reviewMutationToolInputSchema,
} from "./mcp/review-tool-contract.mjs";

const require = createRequire(import.meta.url);
const { parseMcpDiscovery } = require("./auris-mcp-config.cjs");
const { BROWSER_DISPATCH_ERROR_CODE } = require("./browser/browser-mcp-router.cjs");
const { browserEvidenceSchema } = require("./browser/browser-evidence.cjs");

const APP_NAME = "auris";
const DISCOVERY_FILE_NAME = "auris-notes-mcp-port";
export const NOTES_REQUEST_TIMEOUT_MS = 10_000;
const BROWSER_BRIDGE_TIMEOUT_ERROR_CODE = -32001;
const BRIDGE_TRANSPORT_ERROR_CODES = new Set(["TIMEOUT", "CONNECTION_CLOSED"]);

export const NOTES_ACTIONS = [
  "get_state",
  "read",
  "get_selection",
  "replace_selection",
];

const ACTION_METHODS = {
  get_state: "notes.getState",
  get_selection: "notes.getSelection",
  read: "notes.read",
  replace_selection: "notes.replaceSelection",
};

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function toolError(message) {
  const payload = { error: { message: String(message) }, ok: false };
  return {
    content: [{ text: String(message), type: "text" }],
    isError: true,
    structuredContent: payload,
  };
}

function toolSuccess(data) {
  const result = data === undefined ? null : data;
  return {
    content: [{ text: JSON.stringify(result, null, 2), type: "text" }],
    structuredContent: { result },
  };
}

const GENERIC_OUTPUT_SCHEMA = {
  error: z.unknown().optional(),
  ok: z.literal(false).optional(),
  result: z.unknown().optional(),
};

export class AurisBridgeTransportError extends Error {
  constructor(code, message) {
    if (!BRIDGE_TRANSPORT_ERROR_CODES.has(code)) {
      throw new TypeError("Unsupported Auris bridge transport error code.");
    }
    super(message);
    this.name = "AurisBridgeTransportError";
    this.code = code;
  }
}

function browserToolError(error, action) {
  if (error instanceof AurisBridgeTransportError) {
    return createBrowserToolErrorResult(createBrowserPublicError(error.code, { action }));
  }
  return createBrowserToolErrorResult(error);
}

function ownKeysExactly(value, expected) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    return isDeepStrictEqual(actual, [...expected].sort());
  } catch {
    return false;
  }
}

function parseBrowserDispatcherErrorData(data) {
  try {
    if (!ownKeysExactly(data, ["error", "kind", "version"])) throw new TypeError();
    if (data.kind !== "auris.browser.error" || data.version !== 1) throw new TypeError();
    const error = data.error;
    const expectedErrorKeys = error?.metadata === undefined
      ? ["code", "message"]
      : ["code", "message", "metadata"];
    if (!ownKeysExactly(error, expectedErrorKeys)) throw new TypeError();
    const publicError = createBrowserPublicError(error.code, error.metadata);
    if (!isDeepStrictEqual(serializeBrowserError(publicError), error)) throw new TypeError();
    return publicError;
  } catch {
    return createBrowserPublicError("CAPABILITY_NOT_VERIFIED");
  }
}

function defaultDiscoveryDirectory() {
  const home = homedir();

  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", APP_NAME);
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), APP_NAME);
    default:
      return join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), APP_NAME);
  }
}

export function getDiscoveryPath(environment = process.env) {
  return environment.AURIS_NOTES_MCP_PORT_FILE
    ? resolve(environment.AURIS_NOTES_MCP_PORT_FILE)
    : join(defaultDiscoveryDirectory(), DISCOVERY_FILE_NAME);
}

export function parseDiscovery(content) {
  const { port, token } = parseMcpDiscovery(content);
  return { port, token };
}

export class AurisNotesBridgeClient {
  constructor({
    clientId = process.env.AURIS_MCP_CLIENT_ID ?? "",
    clientToken = process.env.AURIS_MCP_CLIENT_TOKEN ?? "",
    discoveryPath = getDiscoveryPath(),
    timeoutMs = NOTES_REQUEST_TIMEOUT_MS,
    WebSocketImpl = WebSocket,
  } = {}) {
    this.clientId = clientId;
    this.clientToken = clientToken;
    this.discoveryPath = discoveryPath;
    this.timeoutMs = timeoutMs;
    this.WebSocketImpl = WebSocketImpl;
    this.socket = null;
    this.nextRequestId = 0;
    this.pending = new Map();
  }

  async request(method, params, options) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    return this.send(method, params, options);
  }

  async connect() {
    this.close();

    let discovery;
    try {
      discovery = parseDiscovery(await readFile(this.discoveryPath, "utf8"));
    } catch (error) {
      throw new Error(
        `Cannot discover Auris Notes MCP bridge at ${this.discoveryPath}. Is Auris running? ${errorMessage(error)}`,
      );
    }

    const socket = new this.WebSocketImpl(`ws://127.0.0.1:${discovery.port}/notes-mcp`);
    this.socket = socket;
    socket.on("message", (payload) => this.handleMessage(payload));
    socket.on("close", () => this.handleClose());
    socket.on("error", () => this.handleClose());

    await new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        rejectPromise(new AurisBridgeTransportError(
          "TIMEOUT",
          "Timed out connecting to Auris Notes MCP bridge.",
        ));
      }, this.timeoutMs);
      socket.once("open", () => {
        clearTimeout(timer);
        resolvePromise();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        rejectPromise(new AurisBridgeTransportError(
          "CONNECTION_CLOSED",
          `Unable to connect to Auris Notes MCP bridge: ${error.message}`,
        ));
      });
    });

    const auth = await this.send("auth", {
      client_id: this.clientId,
      client_token: this.clientToken,
      token: discovery.token,
    });
    if (!auth || auth.ok !== true) {
      throw new Error("Auris Notes MCP bridge rejected authentication.");
    }
  }

  close() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.rejectPending("Auris Notes MCP bridge connection closed.");
  }

  send(method, params, { timeoutMs = this.timeoutMs } = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new AurisBridgeTransportError(
        "CONNECTION_CLOSED",
        "Auris Notes MCP bridge is not connected.",
      ));
    }

    const id = `auris_mcp_${++this.nextRequestId}`;

    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new AurisBridgeTransportError(
          "TIMEOUT",
          `Auris Notes MCP request timed out: ${method}`,
        ));
      }, timeoutMs);

      this.pending.set(id, { reject: rejectPromise, resolve: resolvePromise, timer });
      try {
        this.socket.send(JSON.stringify({ id, jsonrpc: "2.0", method, ...(params ? { params } : {}) }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        rejectPromise(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  handleMessage(payload) {
    let message;
    try {
      message = JSON.parse(payload.toString("utf8"));
    } catch {
      return;
    }

    const pending = this.pending.get(String(message?.id));
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(String(message.id));
    if (message.error) {
      if (message.error.code === BROWSER_BRIDGE_TIMEOUT_ERROR_CODE) {
        pending.reject(new AurisBridgeTransportError(
          "TIMEOUT",
          "Auris Browser MCP request timed out.",
        ));
        return;
      }
      if (message.error.code === BROWSER_DISPATCH_ERROR_CODE) {
        pending.reject(parseBrowserDispatcherErrorData(message.error.data));
        return;
      }
      pending.reject(new Error(String(message.error.message ?? "Auris Notes MCP bridge request failed.")));
      return;
    }
    pending.resolve(message.result);
  }

  handleClose() {
    this.socket = null;
    this.rejectPending("Auris Notes MCP bridge connection closed.");
  }

  rejectPending(message) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new AurisBridgeTransportError("CONNECTION_CLOSED", message));
      this.pending.delete(id);
    }
  }
}

function validateToolInput(input) {
  if (!NOTES_ACTIONS.includes(input.action)) {
    return "action must be one of: get_state, read, get_selection, replace_selection";
  }

  if (input.action !== "replace_selection") {
    return null;
  }

  if (typeof input.content !== "string" || !input.content.trim()) {
    return "content must be a non-empty string for replace_selection";
  }
  if (typeof input.expected_revision !== "string" || !input.expected_revision) {
    return "expected_revision must be a non-empty string for replace_selection";
  }
  return null;
}

export function createAurisNotesToolHandler(bridge) {
  return async (input) => {
    const validationError = validateToolInput(input);
    if (validationError) {
      return toolError(validationError);
    }

    const method = ACTION_METHODS[input.action];
    const params = input.action === "replace_selection"
      ? { content: input.content, expected_revision: input.expected_revision }
      : undefined;

    try {
      return toolSuccess(await bridge.request(method, params));
    } catch (error) {
      return toolError(errorMessage(error));
    }
  };
}

export function createAurisNotesMcpServer(bridge = new AurisNotesBridgeClient()) {
  const server = new McpServer({ name: "auris-notes", version: "0.1.0" });
  const call = async (method, input, validate) => {
    const validationError = validate(input);
    if (validationError) return toolError(validationError);

    try {
      return toolSuccess(await bridge.request(method, input));
    } catch (error) {
      return toolError(errorMessage(error));
    }
  };
  const callBrowser = async (input, parseInput) => {
    let normalized;
    try {
      normalized = parseInput(input);
    } catch (error) {
      return browserToolError(error, input?.action);
    }

    const actionTimeoutMs = getBrowserActionTimeoutMs(normalized.request);
    const params = {
      actionTimeoutMs,
      request: normalized.request,
      ...(normalized.target ? { target: normalized.target } : {}),
      ...(normalized.control ? { control: normalized.control } : {}),
      ...(normalized.approvalId ? { approvalId: normalized.approvalId } : {}),
    };

    try {
      const result = await bridge.request(
        "browser.mcp.action",
        params,
        { timeoutMs: getBrowserTransportTimeoutMs(normalized.request) },
      );
      return createBrowserToolSuccessResult(result);
    } catch (error) {
      return browserToolError(error, normalized.request.action);
    }
  };

  server.registerTool("auris_session", {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: true,
    },
    description: "Discover the selected Auris vault and open note tabs.",
    inputSchema: { action: z.literal("get_state") },
    outputSchema: GENERIC_OUTPUT_SCHEMA,
    title: "Auris Session State",
  }, (input) => call("notes.mcp.session", input, () => null));

  server.registerTool("auris_workspace", {
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    },
    description: "Create, open, save, close, or switch a note tab in the selected Auris vault.",
    inputSchema: {
      action: z.enum(["new", "open", "save", "close", "switch_tab"]),
      force: z.boolean().optional(),
      path: z.string().optional(),
      tab_id: z.string().optional(),
    },
    outputSchema: GENERIC_OUTPUT_SCHEMA,
    title: "Auris Notes Workspace",
  }, (input) => call("notes.mcp.workspace", input, () => null));

  server.registerTool("auris_document", {
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    },
    description: "Read or revision-safely replace the complete Markdown source of an open Auris note.",
    inputSchema: {
      action: z.enum(["read", "write"]),
      content: z.string().optional(),
      evidence: browserEvidenceSchema.optional(),
      expected_revision: z.string().optional(),
      tab_id: z.string().optional(),
    },
    outputSchema: GENERIC_OUTPUT_SCHEMA,
    title: "Auris Note Document",
  }, (input) => call("notes.mcp.document", input, (value) =>
    value.action === "write" && typeof value.content !== "string"
      ? "content is required for document write"
      : null,
  ));

  server.registerTool("auris_selection", {
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    },
    description: "Read or revision-safely replace the current selection in the focused Auris note.",
    inputSchema: {
      action: z.enum(["get", "set"]),
      content: z.string().optional(),
      expected_revision: z.string().optional(),
    },
    outputSchema: GENERIC_OUTPUT_SCHEMA,
    title: "Auris Note Selection",
  }, async (input) => {
    if (input.action === "get") {
      return call("notes.getSelection", undefined, () => null);
    }

    return call("notes.replaceSelection", {
      content: input.content,
      expected_revision: input.expected_revision,
    }, (value) => {
      if (typeof value.content !== "string") return "content is required for selection set";
      if (!value.expected_revision) return "expected_revision is required for selection set";
      return null;
    });
  });

  server.registerTool("auris_browser_read", {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      readOnlyHint: true,
    },
    description: BROWSER_READ_TOOL_DESCRIPTION,
    inputSchema: browserReadToolMcpInputSchema,
    outputSchema: GENERIC_OUTPUT_SCHEMA,
    title: "Auris Browser (read-only)",
  }, (input) => callBrowser(input, parseBrowserReadToolInput));

  server.registerTool("auris_browser", {
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    description: BROWSER_TOOL_DESCRIPTION,
    inputSchema: browserMutationToolMcpInputSchema,
    outputSchema: GENERIC_OUTPUT_SCHEMA,
    title: "Auris Browser",
  }, (input) => callBrowser(input, parseBrowserMutationToolInput));

  server.registerTool("auris_workflow", {
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    description: WORKFLOW_TOOL_DESCRIPTION,
    inputSchema: workflowToolInputSchema,
    outputSchema: GENERIC_OUTPUT_SCHEMA,
    title: "Auris Workflow",
  }, async (input) => {
    try {
      const result = await bridge.request(
        "workflow.mcp.action",
        normalizeWorkflowToolInput(input),
        { timeoutMs: NOTES_REQUEST_TIMEOUT_MS },
      );
      return toolSuccess(result);
    } catch (error) {
      return toolError(errorMessage(error));
    }
  });

  for (const [name, schema, description, readOnly] of [
    ["auris_review_read", reviewReadToolInputSchema, REVIEW_READ_TOOL_DESCRIPTION, true],
    ["auris_review", reviewMutationToolInputSchema, REVIEW_MUTATION_TOOL_DESCRIPTION, false],
  ]) {
    server.registerTool(name, {
      annotations: { destructiveHint: false, idempotentHint: readOnly, openWorldHint: false, readOnlyHint: readOnly },
      description,
      inputSchema: schema,
      outputSchema: GENERIC_OUTPUT_SCHEMA,
      title: readOnly ? "Auris Review (read-only)" : "Auris Review Creation",
    }, (input) => call("review.mcp.action", input, () => null));
  }

  return server;
}

async function main() {
  if (process.argv.includes("--health-check")) {
    process.stdout.write(`${JSON.stringify({
      status: "ok",
      tools: [
        "auris_session",
        "auris_workspace",
        "auris_document",
        "auris_selection",
        "auris_browser_read",
        "auris_browser",
        "auris_workflow",
        "auris_review_read",
        "auris_review",
      ],
    })}\n`);
    return;
  }

  const server = createAurisNotesMcpServer();
  await server.connect(new StdioServerTransport());
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    process.stderr.write(`[Auris MCP] ${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
