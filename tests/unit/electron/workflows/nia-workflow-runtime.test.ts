import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  NiaWorkflowRuntimeError,
  createNiaWorkflowRuntime,
} = require("../../../../electron/workflows/nia-workflow-runtime.cjs");

const canonical = readFileSync(
  resolve(process.cwd(), "tests/fixtures/workflows/nia-pipeline-v1.yaml"),
  "utf8",
);

function createRuntime(overrides: Record<string, unknown> = {}) {
  return createNiaWorkflowRuntime({
    createRunId: () => "main-owned-run",
    definitionRepository: {
      resolveUsesRef: vi.fn(async (uses: string) => ({ body: uses, model: "model-ok" })),
    },
    executePrompt: vi.fn(async ({ input }: { input: string }) => ({ text: `prompt:${input}` })),
    actionAdapters: {
      "save-file": vi.fn(async ({ params }: { params: Record<string, string> }) => ({
        text: params.content,
      })),
    },
    approvalService: { request: vi.fn(async () => true) },
    ...overrides,
  });
}

describe("main Nia workflow runtime", () => {
  it("reparses raw YAML, owns run identity, and isolates run state by owner", async () => {
    const runtime = createRuntime();
    const events: Array<Record<string, unknown>> = [];
    runtime.subscribe("renderer:1", (event: Record<string, unknown>) => events.push(event));
    const started = await runtime.startRun({
      ownerId: "renderer:1",
      request: { source: canonical, inputs: { notes: "rough" } },
    });
    expect(started.runId).toBe("main-owned-run");
    await vi.waitFor(() => expect(runtime.getRun({
      runId: started.runId,
      ownerId: "renderer:1",
    }).status).toBe("completed"));
    expect(events.at(0)?.type).toBe("started");
    expect(events.at(-1)?.type).toBe("completed");
    expect(() => runtime.getRun({ runId: started.runId, ownerId: "renderer:2" })).toThrow(
      /another owner/u,
    );
  });

  it("rejects forged renderer AST/action/token fields before execution", async () => {
    const runtime = createRuntime();
    for (const forged of [
      { ast: { family: "nia_yaml" } },
      { source: canonical, resolvedAction: "save-file" },
      { source: canonical, operationToken: "lease" },
      { source: canonical, payloadHash: "fake" },
    ]) {
      await expect(runtime.startRun({ ownerId: 1, request: forged })).rejects.toBeInstanceOf(
        NiaWorkflowRuntimeError,
      );
    }
  });

  it("supports only injected trusted stored references and reparses their raw source", async () => {
    const resolveStoredSource = vi.fn(async (ref: string) => (ref === "workflow-1" ? canonical : null));
    const runtime = createRuntime({
      createRunId: () => "stored-run",
      resolveStoredSource,
    });
    const started = await runtime.startRun({
      ownerId: 1,
      request: { storedRef: "workflow-1", inputs: { notes: "rough" } },
    });
    expect(started.runId).toBe("stored-run");
    expect(resolveStoredSource).toHaveBeenCalledWith("workflow-1");
    await expect(runtime.startRun({
      ownerId: 1,
      request: { storedRef: "../escape", inputs: {} },
    })).rejects.toMatchObject({ code: "STORED_SOURCE_UNAVAILABLE" });
  });

  it("fails closed without action approval and cancels owner runs exactly once", async () => {
    const actionSource = `name: action\nnia: v1\nsteps:\n  - id: save\n    uses: action/save-file\n    with:\n      path: out.md\n      content: data\n`;
    const denied = createRuntime({ approvalService: null, createRunId: () => "denied-run" });
    const deniedStart = await denied.startRun({ ownerId: 2, request: { source: actionSource } });
    await vi.waitFor(() => expect(denied.getRun({
      runId: deniedStart.runId,
      ownerId: 2,
    }).status).toBe("failed"));
    expect(denied.getRun({ runId: deniedStart.runId, ownerId: 2 }).error.code).toBe(
      "STEP_FAILED",
    );

    let finish!: (value: { text: string }) => void;
    const hanging = createRuntime({
      createRunId: () => "cancel-run",
      executePrompt: vi.fn(() => new Promise((resolvePromise) => { finish = resolvePromise; })),
    });
    const events: Array<Record<string, unknown>> = [];
    hanging.subscribe(3, (event: Record<string, unknown>) => events.push(event));
    const started = await hanging.startRun({
      ownerId: 3,
      request: {
        source: `name: prompt\nnia: v1\nsteps:\n  - id: p\n    uses: nia/prompt\n    with: { definition: x }\n`,
      },
    });
    await vi.waitFor(() => expect(typeof finish).toBe("function"));
    expect(hanging.cancelRun({ runId: started.runId, ownerId: 3 }).cancelled).toBe(true);
    finish({ text: "late" });
    await Promise.resolve();
    expect(events.filter((event) => event.type === "cancelled")).toHaveLength(1);
    expect(events.some((event) => event.type === "completed")).toBe(false);
  });
});
