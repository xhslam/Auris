import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import WebSocket from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";

import canonical from "../../../electron/shared/browser-contract.cjs";

const require = createRequire(import.meta.url);
const { createNotesMcpBridge } = require("../../../electron/notes-mcp-bridge.cjs");
const { createBrowserCommandDispatcher } = require(
  "../../../electron/browser/browser-command-dispatcher.cjs",
);
const { createBrowserRegistry } = require("../../../electron/browser/browser-registry.cjs");

const NOTES_TOOL_SNAPSHOT = JSON.stringify([
  {
    description: "Discover the selected Auris vault and open note tabs.",
    inputSchema: {
      type: "object",
      properties: { action: { type: "string", const: "get_state" } },
      required: ["action"],
      $schema: "http://json-schema.org/draft-07/schema#",
    },
    name: "auris_session",
  },
  {
    description: "Create, open, save, close, or switch a note tab in the selected Auris vault.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["new", "open", "save", "close", "switch_tab"] },
        force: { type: "boolean" },
        path: { type: "string" },
        tab_id: { type: "string" },
      },
      required: ["action"],
      $schema: "http://json-schema.org/draft-07/schema#",
    },
    name: "auris_workspace",
  },
  {
    description: "Read or revision-safely replace the complete Markdown source of an open Auris note.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["read", "write"] },
        content: { type: "string" },
        expected_revision: { type: "string" },
        tab_id: { type: "string" },
      },
      required: ["action"],
      $schema: "http://json-schema.org/draft-07/schema#",
    },
    name: "auris_document",
  },
  {
    description: "Read or revision-safely replace the current selection in the focused Auris note.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["get", "set"] },
        content: { type: "string" },
        expected_revision: { type: "string" },
      },
      required: ["action"],
      $schema: "http://json-schema.org/draft-07/schema#",
    },
    name: "auris_selection",
  },
]);

function loadMcpServer() {
  return import(
    pathToFileURL(resolve(process.cwd(), "electron/auris-notes-mcp-server.mjs")).href,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Auris Notes MCP server", () => {
  it("parses the versioned discovery record published by the Electron bridge", async () => {
    const { parseDiscovery } = await loadMcpServer();

    expect(
      parseDiscovery(JSON.stringify({
        instance_id: "instance-1",
        pid: 123,
        port: 4567,
        token: "token-1",
        version: 1,
      })),
    ).toEqual({ port: 4567, token: "token-1" });
  });

  it("maps the read action to the private Notes bridge", async () => {
    const { createAurisNotesToolHandler } = await loadMcpServer();
    const requests: Array<{ method: string; params?: Record<string, unknown> }> = [];
    const handler = createAurisNotesToolHandler({
      request: async (method: string, params?: Record<string, unknown>) => {
        requests.push({ method, params });
        return { revision: "r1", source: "# Daily" };
      },
    });

    const result = await handler({ action: "read" });

    expect(requests).toEqual([{ method: "notes.read", params: undefined }]);
    expect(result).toEqual({
      content: [{ text: JSON.stringify({ revision: "r1", source: "# Daily" }, null, 2), type: "text" }],
      structuredContent: {
        result: { revision: "r1", source: "# Daily" },
      },
    });
  });

  it("returns structured Notes bridge failures without violating the declared output schema", async () => {
    const { createAurisNotesMcpServer } = await loadMcpServer();
    const server = createAurisNotesMcpServer({
      request: async () => {
        throw new Error("Notes renderer is not ready.");
      },
    });
    const client = new Client({ name: "auris-notes-errors", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const result = await client.callTool({
        arguments: { action: "get_state" },
        name: "auris_session",
      });
      expect(result).toMatchObject({
        isError: true,
        structuredContent: {
          error: { message: "Notes renderer is not ready." },
          ok: false,
        },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects selection replacement without a revision before it reaches the bridge", async () => {
    const { createAurisNotesToolHandler } = await loadMcpServer();
    const handler = createAurisNotesToolHandler({
      request: async () => {
        throw new Error("Bridge must not be called.");
      },
    });

    await expect(
      handler({ action: "replace_selection", content: "Practise" }),
    ).resolves.toMatchObject({ isError: true });
  });

  it("adds evidence to auris_document while preserving every pre-existing Notes schema byte-for-byte", async () => {
    const { createAurisNotesMcpServer } = await loadMcpServer();
    const server = createAurisNotesMcpServer({
      request: async () => ({ revision: "r1", source: "# Daily" }),
    });
    const client = new Client({ name: "auris-notes-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map(({ name }) => name)).toEqual([
        "auris_session",
        "auris_workspace",
        "auris_document",
        "auris_selection",
        "auris_browser_read",
        "auris_browser",
        "auris_workflow",
      ]);
      expect(tools.tools.filter(({ name }) => name === "auris_browser")).toHaveLength(1);
      const notesCompatibilityProjection = tools.tools
        .filter(({ name }) =>
          [
            "auris_session",
            "auris_workspace",
            "auris_document",
            "auris_selection",
          ].includes(name),
        )
        .map(({ description, inputSchema, name }) => {
          if (name !== "auris_document") return { description, inputSchema, name };
          const properties = Object.fromEntries(
            Object.entries(inputSchema.properties ?? {}).filter(([key]) => key !== "evidence"),
          );
          return { description, inputSchema: { ...inputSchema, properties }, name };
        });
      expect(JSON.stringify(notesCompatibilityProjection)).toBe(NOTES_TOOL_SNAPSHOT);
      const documentTool = tools.tools.find(({ name }) => name === "auris_document");
      expect(documentTool?.inputSchema.properties?.evidence).toMatchObject({
        additionalProperties: false,
        properties: {
          approvals: { maxItems: 32, type: "array" },
          citations: { maxItems: 64, type: "array" },
          excerpts: { maxItems: 16, type: "array" },
          refs: { maxItems: 128, type: "array" },
          screenshots: { maxItems: 16, type: "array" },
          source: { additionalProperties: false, type: "object" },
          version: { const: 1, type: "number" },
        },
        required: ["source", "version"],
        type: "object",
      });
      expect(tools.tools.find(({ name }) => name === "auris_browser")).toMatchObject({
        description: expect.stringContaining("acquire_control"),
        name: "auris_browser",
      });
      expect(tools.tools.find(({ name }) => name === "auris_browser_read")).toMatchObject({
        description: expect.stringContaining("get_state"),
        name: "auris_browser_read",
      });
      expect(tools.tools.find(({ name }) => name === "auris_session")).toMatchObject({
        annotations: {
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          readOnlyHint: true,
        },
        title: "Auris Session State",
      });
      expect(tools.tools.find(({ name }) => name === "auris_browser_read")).toMatchObject({
        annotations: {
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
          readOnlyHint: true,
        },
        title: "Auris Browser (read-only)",
      });
      expect(tools.tools.find(({ name }) => name === "auris_browser")).toMatchObject({
        annotations: {
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
          readOnlyHint: false,
        },
        title: "Auris Browser",
      });
      expect(tools.tools.find(({ name }) => name === "auris_browser")?.inputSchema).toMatchObject({
        additionalProperties: false,
        anyOf: expect.any(Array),
        properties: {
          action: { enum: expect.arrayContaining(["open", "act", "execute_js"]) },
          leaseToken: { maxLength: 512, minLength: 16, type: "string" },
          source: { maxLength: 65_536, minLength: 1, type: "string" },
          url: { maxLength: 2_048, minLength: 1, type: "string" },
          windowId: { maxLength: 128, minLength: 1, type: "string" },
        },
        type: "object",
      });
      const alternatives = (tools.tools.find(({ name }) => name === "auris_browser")?.inputSchema as unknown as {
        anyOf: Array<{
          additionalProperties: boolean;
          properties: Record<string, {
            const?: string;
            description?: string;
            format?: string;
            pattern?: string;
          }>;
          required: string[];
        }>;
      }).anyOf;
      const forAction = (action: string) => alternatives.filter(
        (alternative) => alternative.properties.action.const === action,
      );

      expect(alternatives).toHaveLength(15);
      expect(forAction("get_state")).toEqual([]);
      const readAlternatives = (tools.tools.find(({ name }) => name === "auris_browser_read")?.inputSchema as unknown as {
        anyOf: Array<{
          additionalProperties: boolean;
          properties: Record<string, { const?: string }>;
          required: string[];
        }>;
      }).anyOf;
      expect(readAlternatives).toHaveLength(7);
      expect(
        readAlternatives.filter(
          (alternative) => alternative.properties.action.const === "get_state",
        ),
      ).toEqual([
        expect.objectContaining({
          additionalProperties: false,
          properties: { action: expect.any(Object) },
          required: ["action"],
        }),
      ]);
      expect(forAction("open")[0]).toMatchObject({
        additionalProperties: false,
        required: ["action", "url"],
      });
      expect(forAction("open")[0]?.properties.url).toMatchObject({
        description: expect.stringContaining("Credential-free HTTP(S)"),
        format: "uri",
        pattern: expect.any(String),
      });
      const publicUrlPattern = new RegExp(String(forAction("open")[0]?.properties.url.pattern));
      expect(publicUrlPattern.test("https://example.com/path")).toBe(true);
      expect(publicUrlPattern.test("http://example.com/path")).toBe(true);
      expect(publicUrlPattern.test("ftp://example.com/path")).toBe(false);
      expect(publicUrlPattern.test("https://user:password@example.com/path")).toBe(false);
      expect(forAction("acquire_control").map(({ required }) => required)).toEqual([
        ["action"],
        ["action", "windowId", "tabId"],
      ]);
      expect(forAction("execute_js")[0]?.required).toEqual(expect.arrayContaining([
        "action",
        "source",
        "windowId",
        "tabId",
        "navigationGeneration",
        "controlEpoch",
        "leaseToken",
      ]));
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("keeps every pre-evidence auris_document input on the existing request shape", async () => {
    const { createAurisNotesMcpServer } = await loadMcpServer();
    const request = vi.fn(async () => ({ revision: "r1", source: "# Daily" }));
    const server = createAurisNotesMcpServer({ request });
    const client = new Client({ name: "auris-notes-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const oldInputs = [
        { action: "read" },
        { action: "read", tab_id: "Inbox/Daily.md" },
        {
          action: "write",
          content: "# Updated",
          expected_revision: "sha256-current",
          tab_id: "Inbox/Daily.md",
        },
      ];

      for (const [index, input] of oldInputs.entries()) {
        const result = await client.callTool({ arguments: input, name: "auris_document" });
        expect(request).toHaveBeenNthCalledWith(index + 1, "notes.mcp.document", input);
        expect(request.mock.calls[index]).toHaveLength(2);
        expect(result).toMatchObject({
          content: [{ text: expect.stringContaining('"source": "# Daily"'), type: "text" }],
        });
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("passes only a strict bounded evidence bundle through auris_document", async () => {
    const { createAurisNotesMcpServer } = await loadMcpServer();
    const request = vi.fn(async () => ({ pending_review: { id: "review-1" } }));
    const server = createAurisNotesMcpServer({ request });
    const client = new Client({ name: "auris-evidence-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const evidence = {
      excerpts: [{ sourceId: "source-1", text: "Visible page content" }],
      source: {
        accessedAt: "2026-07-19T08:30:00.000Z",
        finalUrl: "https://example.com/report",
        origin: "https://example.com",
        title: "Research",
      },
      version: 1,
    };

    try {
      const accepted = await client.callTool({
        arguments: {
          action: "write",
          content: "# Draft",
          evidence,
          expected_revision: "sha256-current",
        },
        name: "auris_document",
      });
      expect(accepted).not.toMatchObject({ isError: true });
      expect(request).toHaveBeenCalledWith("notes.mcp.document", {
        action: "write",
        content: "# Draft",
        evidence,
        expected_revision: "sha256-current",
      });

      for (const unsafeEvidence of [
        { ...evidence, leaseToken: "lease_1234567890abcdef" },
        { ...evidence, lease_token: "lease_abcdef1234567890" },
        { ...evidence, excerpts: [{ sourceId: "source-1", text: "x".repeat(8_193) }] },
        { ...evidence, sessionId: "keychain-session-private" },
        { ...evidence, keychainId: "private-profile" },
        { ...evidence, approvals: [{
          action: "act",
          decision: "allow_once",
          operation: "type",
          payloadHash: "raw-hash",
        }] },
        { ...evidence, approvals: [{
          action: "act",
          decision: "allow_once",
          operation: "type",
          typedValue: "hunter2",
        }] },
        { ...evidence, approvals: [{
          action: "ACT",
          decision: "allow_once",
          operation: "click",
        }] },
      ]) {
        const before = request.mock.calls.length;
        const rejected = await client.callTool({
          arguments: {
            action: "write",
            content: "# Draft",
            evidence: unsafeEvidence,
            expected_revision: "sha256-current",
          },
          name: "auris_document",
        });
        expect(rejected).toMatchObject({ isError: true });
        expect(request).toHaveBeenCalledTimes(before);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("routes Browser calls with an explicit action timeout and a larger transport timeout", async () => {
    const { createAurisNotesMcpServer } = await loadMcpServer();
    const request = vi.fn(async () => ({ ok: true, result: { windowId: "window-one" } }));
    const server = createAurisNotesMcpServer({ request });
    const client = new Client({ name: "auris-browser-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      await client.callTool({
        arguments: { action: "open", url: "https://example.com" },
        name: "auris_browser",
      });

      expect(request).toHaveBeenCalledWith(
        "browser.mcp.action",
        {
          actionTimeoutMs: 12_000,
          request: { action: "open", url: "https://example.com" },
        },
        { timeoutMs: 13_000 },
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("routes family-discriminated workflow calls through the authenticated bridge", async () => {
    const { createAurisNotesMcpServer } = await loadMcpServer();
    const request = vi.fn(async () => ({ capabilities: {}, definitions: [] }));
    const server = createAurisNotesMcpServer({ request });
    const client = new Client({ name: "auris-workflow-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      await client.callTool({ arguments: { action: "list" }, name: "auris_workflow" });
      expect(request).toHaveBeenCalledWith(
        "workflow.mcp.action",
        { action: "list" },
        { timeoutMs: 10_000 },
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns opaque session summaries without credential values to MCP clients", async () => {
    const { createAurisNotesMcpServer } = await loadMcpServer();
    const request = vi.fn(async () => ({
      ok: true,
      result: {
        capabilities: {
          cookieReplay: true,
          localStorageReplay: true,
          namedProfiles: true,
        },
        cookieCount: 1,
        localStorageItemCount: 2,
        name: "research.login",
        originCount: 1,
      },
    }));
    const server = createAurisNotesMcpServer({ request });
    const client = new Client({ name: "auris-browser-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const result = await client.callTool({
        arguments: {
          action: "session_save",
          approvalId: "approval-session",
          controlEpoch: 1,
          leaseToken: "lease_1234567890abcdef",
          name: "research.login",
          navigationGeneration: 0,
          tabId: "tab-one",
          windowId: "window-one",
        },
        name: "auris_browser",
      });
      const text = String((result.content as Array<{ text: string }>)[0]?.text || "");
      expect(result).not.toMatchObject({ isError: true });
      expect(text).toContain("research.login");
      expect(text).toContain("cookieCount");
      expect(text).not.toContain("super-secret");
      expect(text).not.toContain("document.cookie");
      expect(text).not.toMatch(/"value"\s*:/);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns APPROVAL_REQUIRED from the grouped tool as a completed response", async () => {
    const { createAurisNotesMcpServer } = await loadMcpServer();
    const approval = {
      ok: false,
      error: {
        code: "APPROVAL_REQUIRED",
        message: "approval required",
        metadata: { action: "navigate", origin: "https://example.com" },
      },
    };
    const request = vi.fn(async () => approval);
    const server = createAurisNotesMcpServer({ request });
    const client = new Client({ name: "auris-browser-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const result = await client.callTool({
        arguments: {
          action: "navigate",
          url: "https://example.com/next",
          windowId: "window-one",
          tabId: "tab-one",
          navigationGeneration: 1,
          controlEpoch: 2,
          leaseToken: "lease_1234567890abcdef",
        },
        name: "auris_browser",
      });

      expect(result).not.toMatchObject({ isError: true });
      expect(JSON.parse(String((result.content as Array<{ text: string }>)[0]?.text))).toEqual(approval);
      expect(request).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("retains the fixed ten-second timeout for existing Notes transport requests", async () => {
    vi.useFakeTimers();
    const { AurisNotesBridgeClient } = await loadMcpServer();
    const client = new AurisNotesBridgeClient();
    client.socket = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
    };

    const pending = client.send("notes.mcp.document", { action: "read" });
    let settled = false;
    void pending.catch(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toThrow("Auris Notes MCP request timed out: notes.mcp.document");
  });

  it("applies the Browser transport override without changing the Notes client default", async () => {
    vi.useFakeTimers();
    const {
      AurisBridgeTransportError,
      AurisNotesBridgeClient,
      NOTES_REQUEST_TIMEOUT_MS,
    } = await loadMcpServer();
    const client = new AurisNotesBridgeClient();
    client.socket = { readyState: WebSocket.OPEN, send: vi.fn() };

    expect(NOTES_REQUEST_TIMEOUT_MS).toBe(10_000);
    expect(client.timeoutMs).toBe(10_000);
    const pending = client.send("browser.mcp.action", {}, { timeoutMs: 13_000 });
    let settled = false;
    void pending.catch(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(12_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toThrow("Auris Notes MCP request timed out: browser.mcp.action");
    await expect(pending).rejects.toMatchObject({
      code: "TIMEOUT",
      name: AurisBridgeTransportError.name,
    });
  });

  it("classifies a real pending Browser request closed by the transport", async () => {
    vi.useFakeTimers();
    const { AurisBridgeTransportError, AurisNotesBridgeClient } = await loadMcpServer();
    const client = new AurisNotesBridgeClient();
    client.socket = { readyState: WebSocket.OPEN, send: vi.fn() };
    const pending = client.send("browser.mcp.action", {}, { timeoutMs: 13_000 });

    client.handleClose();

    await expect(pending).rejects.toMatchObject({
      code: "CONNECTION_CLOSED",
      name: AurisBridgeTransportError.name,
    });
    expect(client.pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans pending state and timers when WebSocket.send throws synchronously", async () => {
    vi.useFakeTimers();
    const { AurisNotesBridgeClient } = await loadMcpServer();
    const client = new AurisNotesBridgeClient();
    client.socket = {
      readyState: WebSocket.OPEN,
      send: vi.fn(() => {
        throw new Error("send exploded");
      }),
    };

    await expect(client.send("notes.mcp.document", { action: "read" })).rejects.toThrow(
      "send exploded",
    );
    expect(client.pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles a real pending Browser approval response and clears its timer immediately", async () => {
    vi.useFakeTimers();
    const { AurisNotesBridgeClient } = await loadMcpServer();
    const sent: Array<{ id: string }> = [];
    const client = new AurisNotesBridgeClient();
    client.socket = {
      readyState: WebSocket.OPEN,
      send: vi.fn((payload: string) => sent.push(JSON.parse(payload) as { id: string })),
    };
    const approval = {
      ok: false,
      error: {
        code: "APPROVAL_REQUIRED",
        message: "approval required",
        metadata: { action: "navigate", origin: "https://example.com" },
      },
    };

    const pending = client.send("browser.mcp.action", {}, { timeoutMs: 13_000 });
    expect(client.pending.size).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    client.handleMessage(Buffer.from(JSON.stringify({ id: sent[0]?.id, result: approval })));

    await expect(pending).resolves.toEqual(approval);
    expect(client.pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(13_000);
    expect(client.pending.size).toBe(0);
  });

  it.each([
    ["TIMEOUT", "TIMEOUT"],
    ["CONNECTION_CLOSED", "CONNECTION_CLOSED"],
    ["UNTRUSTED", "CAPABILITY_NOT_VERIFIED"],
  ])("maps trusted Browser transport %s errors without exposing arbitrary failures", async (kind, code) => {
    const {
      AurisBridgeTransportError,
      createAurisNotesMcpServer,
    } = await loadMcpServer();
    const error = kind === "UNTRUSTED"
      ? new Error("secret bearer token must not leak")
      : new AurisBridgeTransportError(kind, "internal transport detail");
    const server = createAurisNotesMcpServer({ request: async () => { throw error; } });
    const client = new Client({ name: "auris-browser-errors", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const result = await client.callTool({
        arguments: { action: "open", url: "https://example.com" },
        name: "auris_browser",
      });
      const payload = JSON.parse(String((result.content as Array<{ text: string }>)[0]?.text));

      expect(result).toMatchObject({ isError: true });
      expect(payload.error.code).toBe(code);
      expect(JSON.stringify(payload)).not.toContain("internal transport detail");
      expect(JSON.stringify(payload)).not.toContain("bearer token");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it.each([
    [-32001, "TIMEOUT"],
    [-32000, "CAPABILITY_NOT_VERIFIED"],
  ])("maps bridge JSON-RPC error %i to safe Browser error %s", async (bridgeCode, expectedCode) => {
    const {
      AurisNotesBridgeClient,
      createAurisNotesMcpServer,
    } = await loadMcpServer();
    const sent: Array<{ id: string }> = [];
    const bridgeClient = new AurisNotesBridgeClient();
    bridgeClient.socket = {
      close: vi.fn(),
      readyState: WebSocket.OPEN,
      send: vi.fn((payload: string) => sent.push(JSON.parse(payload) as { id: string })),
    };
    const server = createAurisNotesMcpServer({
      request: (...args: Parameters<typeof bridgeClient.send>) => bridgeClient.send(...args),
    });
    const mcpClient = new Client({ name: "auris-browser-timeout", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    try {
      const pending = mcpClient.callTool({
        arguments: { action: "open", url: "https://example.com" },
        name: "auris_browser",
      });
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      bridgeClient.handleMessage(Buffer.from(JSON.stringify({
        error: {
          code: bridgeCode,
          message: "internal router details must not leak",
        },
        id: sent[0]?.id,
        jsonrpc: "2.0",
      })));
      const result = await pending;
      const payload = JSON.parse(String((result.content as Array<{ text: string }>)[0]?.text));

      expect(result).toMatchObject({ isError: true });
      expect(payload.error.code).toBe(expectedCode);
      expect(JSON.stringify(payload)).not.toContain("internal router details");
      expect(bridgeClient.pending.size).toBe(0);
    } finally {
      bridgeClient.close();
      await mcpClient.close();
      await server.close();
    }
  });

  it.each(["LEASE_LOST", "STALE_NAVIGATION"] as const)(
    "preserves trusted dispatcher code %s as an MCP tool error",
    async (code) => {
      const { AurisNotesBridgeClient, createAurisNotesMcpServer } = await loadMcpServer();
      const sent: Array<{ id: string }> = [];
      const bridgeClient = new AurisNotesBridgeClient();
      bridgeClient.socket = {
        close: vi.fn(),
        readyState: WebSocket.OPEN,
        send: vi.fn((payload: string) => sent.push(JSON.parse(payload) as { id: string })),
      };
      const server = createAurisNotesMcpServer({
        request: (...args: Parameters<typeof bridgeClient.send>) => bridgeClient.send(...args),
      });
      const mcpClient = new Client({ name: "auris-browser-typed", version: "0.1.0" });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

      try {
        const pending = mcpClient.callTool({
          arguments: { action: "open", url: "https://example.com" },
          name: "auris_browser",
        });
        await vi.waitFor(() => expect(sent).toHaveLength(1));
        bridgeClient.handleMessage(Buffer.from(JSON.stringify({
          error: {
            code: -32002,
            data: {
              error: {
                code,
                message: canonical.BROWSER_ERROR_MESSAGES_ZH[code],
                metadata: { tabId: "tab-one", windowId: "window-one" },
              },
              kind: "auris.browser.error",
              version: 1,
            },
            message: "Browser MCP dispatcher rejected the request.",
          },
          id: sent[0]?.id,
          jsonrpc: "2.0",
        })));
        const result = await pending;
        const payload = JSON.parse(String((result.content as Array<{ text: string }>)[0]?.text));
        expect(result).toMatchObject({ isError: true });
        expect(payload.error).toMatchObject({
          code,
          metadata: { tabId: "tab-one", windowId: "window-one" },
        });
      } finally {
        bridgeClient.close();
        await mcpClient.close();
        await server.close();
      }
    },
  );

  it("downgrades malformed dedicated Browser error data without leaking extras", async () => {
    const { AurisNotesBridgeClient } = await loadMcpServer();
    const client = new AurisNotesBridgeClient();
    const sent: Array<{ id: string }> = [];
    client.socket = {
      readyState: WebSocket.OPEN,
      send: vi.fn((payload: string) => sent.push(JSON.parse(payload) as { id: string })),
    };
    const pending = client.send("browser.mcp.action", {}, { timeoutMs: 13_000 });
    client.handleMessage(Buffer.from(JSON.stringify({
      error: {
        code: -32002,
        data: {
          error: {
            code: "OWNER_MISMATCH",
            message: canonical.BROWSER_ERROR_MESSAGES_ZH.OWNER_MISMATCH,
            metadata: { leaseToken: "must-not-leak" },
          },
          extra: "secret-extra",
          kind: "auris.browser.error",
          version: 1,
        },
      },
      id: sent[0]?.id,
    })));
    await expect(pending).rejects.toMatchObject({ code: "CAPABILITY_NOT_VERIFIED" });
    await expect(pending).rejects.not.toThrow(/must-not-leak|secret-extra/);
  });

  it("preserves sanitized ambiguity targets through the real bridge client and MCP tool", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "auris-browser-error-"));
    const discoveryPath = join(temporaryDirectory, "discovery.json");
    let discovery = "";
    const registry = createBrowserRegistry();
    for (const [title, url] of [
      ["Research one", "https://one.example/path?token=secret"],
      ["Research two", "https://two.example/path#fragment"],
    ]) {
      const window = registry.createWindow();
      const tab = registry.createTab(window.windowId, {
        automationMode: "AiSandbox",
        title,
        url,
      });
      registry.setTabLifecycle(window.windowId, tab.tabId, "ready");
    }
    const dispatcher = createBrowserCommandDispatcher({
      createAiSandboxTarget: async () => { throw new Error("open is not used"); },
      destroyTarget: async () => undefined,
      partitionSelector: { select: () => { throw new Error("open is not used"); } },
      registry,
    });
    const bridge = createNotesMcpBridge({
      dispatchBrowserRequest: (request: Record<string, unknown>) => dispatcher.dispatch(request),
      getWindow: () => null,
      logger: vi.fn(),
      removeDiscovery: vi.fn(),
      releaseBrowserOwnership: (connectionId: string) => dispatcher.releaseOwnership(connectionId),
      verifyClientCredential: async ({ clientId, clientToken }: {
        clientId: string;
        clientToken: string;
      }) => clientId === "test-client" && clientToken === "test-token"
        ? { id: clientId, kind: "installed-mcp-client", verified: true }
        : null,
      writeDiscovery: (content: string) => { discovery = content; },
    });
    const { AurisNotesBridgeClient, createAurisNotesMcpServer } = await loadMcpServer();
    const bridgeClient = new AurisNotesBridgeClient({
      clientId: "test-client",
      clientToken: "test-token",
      discoveryPath,
    });
    const server = createAurisNotesMcpServer({
      request: (...args: Parameters<typeof bridgeClient.request>) => bridgeClient.request(...args),
    });
    const mcpClient = new Client({ name: "auris-browser-real-error", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await bridge.start();
      await writeFile(discoveryPath, discovery, "utf8");
      await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
      const result = await mcpClient.callTool({
        arguments: { action: "acquire_control" },
        name: "auris_browser",
      });
      const payload = JSON.parse(String((result.content as Array<{ text: string }>)[0]?.text));

      expect(result).toMatchObject({ isError: true });
      expect(payload.error).toMatchObject({
        code: "AMBIGUOUS_TARGET",
        metadata: {
          targets: [
            {
              tabId: "browser-tab-1",
              title: "Research one",
              url: "https://one.example/path",
              windowId: "browser-window-1",
            },
            {
              tabId: "browser-tab-2",
              title: "Research two",
              url: "https://two.example/path",
              windowId: "browser-window-2",
            },
          ],
        },
      });
      expect(JSON.stringify(payload)).not.toMatch(/must-not-leak|token=|user:pass/);
    } finally {
      bridgeClient.close();
      bridge.close();
      await mcpClient.close().catch(() => undefined);
      await server.close().catch(() => undefined);
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
