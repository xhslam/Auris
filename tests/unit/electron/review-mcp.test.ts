import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);

describe("Review MCP public tools", () => {
  it("discovers separate read/write annotations and maps validated requests to the Review route", async () => {
    const { createAurisNotesMcpServer } = await import(pathToFileURL(resolve("electron/auris-notes-mcp-server.mjs")).href);
    const request = vi.fn(async () => ({ created: true, project: { id: "p1" } }));
    const server = createAurisNotesMcpServer({ request });
    const client = new Client({ name: "review-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    try {
      const { tools } = await client.listTools();
      expect(tools.find(tool => tool.name === "auris_review_read")).toMatchObject({ annotations: { readOnlyHint: true, destructiveHint: false } });
      expect(tools.find(tool => tool.name === "auris_review")).toMatchObject({ annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } });
      expect(await client.callTool({ name: "auris_review", arguments: { action: "create_project", name: "数学" } })).toMatchObject({ structuredContent: { result: { created: true } } });
      expect(request).toHaveBeenLastCalledWith("review.mcp.action", { action: "create_project", name: "数学" });
      await client.callTool({ name: "auris_review_read", arguments: { action: "list_projects" } });
      expect(request).toHaveBeenLastCalledWith("review.mcp.action", { action: "list_projects" });
      request.mockClear();
      for (const args of [
        { action: "create_knowledge_point", title: "X" },
        { action: "create_knowledge_point", title: "X", project_id: "p1", start_date: "2026-02-30" },
        { action: "create_project", name: " " },
        { action: "delete_project", name: "X" },
      ]) {
        expect(await client.callTool({ name: "auris_review", arguments: args })).toMatchObject({ isError: true });
      }
      expect(await client.callTool({ name: "auris_review_read", arguments: { action: "create_project", name: "X" } })).toMatchObject({ isError: true });
      expect(request).not.toHaveBeenCalled();
      request.mockRejectedValueOnce(new Error("REVIEW_PERSIST_FAILED"));
      expect(await client.callTool({ name: "auris_review", arguments: { action: "create_project", name: "X" } })).toMatchObject({ isError: true, structuredContent: { ok: false } });
    } finally { await client.close(); await server.close(); }
  });
});

describe("Review/Notes preload request isolation", () => {
  it("responds exactly once per family, catches synchronous errors and removes listeners", async () => {
    type Api = { onRequest: (listener: (request: unknown) => unknown) => () => void };
    let api: { notesMcp: Api; reviewMcp: Api };
    const handlers = new Set<(event: unknown, payload: unknown) => void>();
    const invoke = vi.fn(async () => undefined);
    runInNewContext(readFileSync(resolve("electron/preload.cjs"), "utf8"), {
      require: (id: string) => id === "electron" ? {
        contextBridge: { exposeInMainWorld: (name: string, value: typeof api) => { if (name === "shadowingDesktop") api = value; } },
        ipcRenderer: { invoke, on: (channel: string, fn: (event: unknown, payload: unknown) => void) => { if (channel === "shadowing:notes-mcp:request") handlers.add(fn); }, removeListener: (_: string, fn: (event: unknown, payload: unknown) => void) => handlers.delete(fn) },
      } : require(resolve("electron", id)),
      Promise, Map, Set, Object, Error, TypeError, setTimeout, clearTimeout,
    });
    const notes = vi.fn(() => ({ notes: true }));
    const review = vi.fn(() => { throw new Error("REVIEW_STORAGE_INVALID"); });
    const offNotes = api!.notesMcp.onRequest(notes);
    const offReview = api!.reviewMcp.onRequest(review);
    expect(invoke).toHaveBeenCalledWith("shadowing:review-mcp:set-ready", true);
    invoke.mockClear();
    for (const handler of handlers) handler(null, { bridgeRequestId: "r1", request: { method: "review.mcp.action" } });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("shadowing:notes-mcp:reject-request", "r1", "REVIEW_STORAGE_INVALID"));
    expect(notes).not.toHaveBeenCalled();
    expect(review).toHaveBeenCalledOnce();
    invoke.mockClear();
    for (const handler of handlers) handler(null, { bridgeRequestId: "n1", request: { method: "notes.mcp.session" } });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    expect(invoke).toHaveBeenCalledWith("shadowing:notes-mcp:resolve-request", "n1", { notes: true });
    expect(review).toHaveBeenCalledOnce();
    offNotes(); offReview();
    expect(handlers.size).toBe(0);
    expect(invoke).toHaveBeenLastCalledWith("shadowing:review-mcp:set-ready", false);
  });
});
