import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  NIA_WORKFLOW_LIMITS,
  parseNiaWorkflowYaml,
  runNiaWorkflow,
  type NiaWorkflowAdapters,
} from "@/features/workflows/nia-workflow-runner";

const canonical = readFileSync(
  resolve(process.cwd(), "tests/fixtures/workflows/nia-pipeline-v1.yaml"),
  "utf8",
);
const legacy = readFileSync(
  resolve(process.cwd(), "tests/fixtures/workflows/genie-pipeline-v1.yaml"),
  "utf8",
);

describe("Nia YAML workflow runner", () => {
  it("runs dependencies deterministically, resolves definitions, and never grants browser authority", async () => {
    const events: string[] = [];
    const resolveDefinition = vi.fn(async ({ uses }: { uses: string }) => ({
      body: `Definition ${uses}`,
      model: "allowed-model",
    }));
    const executePrompt = vi.fn(async ({ input }: { input: string }) => ({
      text: `rewritten:${input}`,
    }));
    const executeAction = vi.fn(async ({ params }: { params: Record<string, string> }) => ({
      text: params.content,
    }));
    const result = await runNiaWorkflow({
      source: canonical,
      inputs: { notes: "  rough notes  " },
      adapters: {
        resolveDefinition,
        executePrompt,
        executeAction,
        requestApproval: vi.fn(async () => true),
      },
      runId: "run-canonical",
      onEvent: (event) => events.push(`${event.type}:${event.stepId || "run"}:${event.status || ""}`),
    });

    expect(result.ok).toBe(true);
    expect(Object.keys(result.outputs)).toEqual(["rewrite", "polish", "decide", "normalize", "save"]);
    expect(result.outputs.normalize.text).toContain("Polished:");
    expect(Object.isFrozen(result.outputs)).toBe(true);
    expect(Object.isFrozen(result.outputs.rewrite)).toBe(true);
    expect(executePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ model: "allowed-model", grantsBrowserAuthority: false }),
    );
    expect(events.at(0)).toBe("started:run:");
    expect(events.at(-1)).toBe("completed:run:");
  });

  it("normalizes legacy genie/* references onto the same resolver with diagnostics", async () => {
    const seen: string[] = [];
    const result = await runNiaWorkflow({
      source: legacy,
      adapters: {
        resolveDefinition: vi.fn(async ({ uses }) => {
          seen.push(uses);
          return { body: uses };
        }),
        executePrompt: vi.fn(async ({ input }) => ({ text: `ok:${input}` })),
        executeAction: vi.fn(async ({ params }) => ({ text: params.content })),
        requestApproval: vi.fn(async () => true),
      },
    });
    expect(result.ok).toBe(true);
    expect(seen).toEqual(["nia/rewrite-in-english", "nia/translate"]);
    expect(result.diagnostics?.join(" ")).toContain("legacy uses");
  });

  it("topologically orders out-of-order declarations and skips dependent branches", async () => {
    const source = `name: branches\nnia: v1\nsteps:\n  - id: last\n    uses: nia/template\n    depends_on: skipped\n    with:\n      template: "never"\n  - id: skipped\n    uses: nia/template\n    if: "false"\n    with:\n      template: "skip"\n  - id: first\n    uses: nia/template\n    with:\n      template: "first"\n`;
    const result = await runNiaWorkflow({ source });
    expect(result.ok).toBe(true);
    expect(Object.keys(result.outputs)).toEqual(["first"]);
    expect(result.events.filter((event) => event.status === "skipped")).toEqual([
      expect.objectContaining({ stepId: "skipped", reason: "condition_false" }),
      expect.objectContaining({ stepId: "last", reason: "dependency_skipped" }),
    ]);
  });

  it("fails closed for missing approval services, denial, and provider errors", async () => {
    const approvalSource = `name: approval\nnia: v1\nsteps:\n  - id: notify\n    uses: action/notify\n    approval: ask\n    with:\n      content: hi\n`;
    const missing = await runNiaWorkflow({
      source: approvalSource,
      adapters: { executeAction: vi.fn() },
    });
    expect(missing.error?.code).toBe("APPROVAL_DENIED");
    expect(missing.events).toContainEqual(expect.objectContaining({ status: "failed", stepId: "notify" }));

    const denied = await runNiaWorkflow({
      source: approvalSource,
      adapters: {
        executeAction: vi.fn(),
        requestApproval: vi.fn(async () => false),
      },
    });
    expect(denied.error?.code).toBe("APPROVAL_DENIED");

    const failed = await runNiaWorkflow({
      source: `name: fail\nnia: v1\nsteps:\n  - id: p\n    uses: nia/prompt\n    with:\n      definition: x\n`,
      adapters: {
        resolveDefinition: vi.fn(async () => ({ body: "x" })),
        executePrompt: vi.fn(async () => {
          throw new Error("provider offline");
        }),
      },
    });
    expect(failed.error?.code).toBe("STEP_FAILED");
    expect(failed.error?.message).toContain("provider offline");
  });

  it("cancels deterministically and treats interpolation as data, not code", async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelled = await runNiaWorkflow({
      source: `name: cancel\nnia: v1\nsteps:\n  - id: t\n    uses: nia/template\n    with:\n      template: ok\n`,
      signal: controller.signal,
    });
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.events.map((event) => event.type)).toEqual(["started", "cancelled"]);

    const inert = await runNiaWorkflow({
      source: `name: inert\nnia: v1\ninputs:\n  raw:\n    type: text\nsteps:\n  - id: t\n    uses: nia/template\n    with:\n      template: "{{input}}"\n      input: "{raw}"\n`,
      inputs: { raw: "$(touch /tmp/never) ${process.env.SECRET}" },
    });
    expect(inert.outputs.t.text).toBe("$(touch /tmp/never) ${process.env.SECRET}");
  });

  it("enforces cycles, step/runtime/output/depth bounds and unknown keys", async () => {
    expect(() => parseNiaWorkflowYaml(
      `name: cycle\nnia: v1\nsteps:\n  - id: a\n    uses: nia/template\n    depends_on: b\n    with: { template: a }\n  - id: b\n    uses: nia/template\n    depends_on: a\n    with: { template: b }\n`,
    )).toThrow(/cycle/u);

    const tooMany = Array.from({ length: NIA_WORKFLOW_LIMITS.maxSteps + 1 }, (_, index) =>
      `  - id: s${index}\n    uses: nia/template\n    with: { template: x }`,
    ).join("\n");
    expect(() => parseNiaWorkflowYaml(`name: many\nnia: v1\nsteps:\n${tooMany}\n`)).toThrow(
      /step limit/u,
    );
    expect(() => parseNiaWorkflowYaml(
      `name: unknown\nnia: v1\nshell: true\nsteps:\n  - uses: nia/template\n    with: { template: x }\n`,
    )).toThrow(/unknown key/u);

    const output = await runNiaWorkflow({
      source: `name: output\nnia: v1\nlimits: { max_output_bytes: 4 }\nsteps:\n  - id: t\n    uses: nia/template\n    with: { template: "12345" }\n`,
    });
    expect(output.error?.code).toBe("OUTPUT_TOO_LARGE");

    let clock = 0;
    const runtime = await runNiaWorkflow({
      source: `name: runtime\nnia: v1\nlimits: { max_runtime_ms: 1 }\nsteps:\n  - id: t\n    uses: nia/template\n    with: { template: x }\n`,
      now: () => (clock += 2),
    });
    expect(runtime.error?.code).toBe("RUNTIME_EXCEEDED");

    const hanging = await runNiaWorkflow({
      source: `name: hanging\nnia: v1\nlimits: { max_runtime_ms: 5 }\nsteps:\n  - id: p\n    uses: nia/prompt\n    with: { definition: x }\n`,
      adapters: {
        resolveDefinition: vi.fn(async () => ({ body: "x" })),
        executePrompt: vi.fn(() => new Promise<{ text: string }>(() => undefined)),
      },
    });
    expect(hanging.error?.code).toBe("RUNTIME_EXCEEDED");
  });
});

/**
 * 这一组守的是一个真实缺陷：`executeBuiltinStep` 解析出定义后，只把用户原文
 * 交给 `executePrompt`，`definition.body` 被整条丢掉——于是
 * `uses: nia/improve-clarity` 发给模型的只有用户的原始文本，那句
 * "You are an expert editor…" 从未送达。
 *
 * 它能长期存活，是因为这个文件里所有既有用例都把 `executePrompt` 换成
 * `({ input }) => …`，正好替换掉了本该做合成的那道缝，然后只断言 `model` 与
 * `grantsBrowserAuthority`。所以下面的断言必须落在**发给 provider 的那一份
 * 文本**上，而不是落在 `input` 上。
 */
describe("Nia workflow definition prompt composition", () => {
  it("sends the definition body to the provider, not just the user's text", async () => {
    const executePrompt = vi.fn<NonNullable<NiaWorkflowAdapters["executePrompt"]>>(
      async () => ({ text: "ok" }),
    );

    await runNiaWorkflow({
      source: canonical,
      inputs: { notes: "rough notes" },
      adapters: {
        resolveDefinition: vi.fn(async () => ({
          body: "You are an expert editor.\n\n{{content}}",
          model: "allowed-model",
        })),
        executePrompt,
        executeAction: vi.fn(async ({ params }: { params: Record<string, string> }) => ({
          text: params.content,
        })),
        requestApproval: vi.fn(async () => true),
      },
      runId: "run-composition",
    });

    const call = executePrompt.mock.calls[0]?.[0];
    expect(call?.prompt).toBe("You are an expert editor.\n\nrough notes");
    // `input` 仍是用户原文，供需要区分二者的适配器使用。
    expect(call?.input).toBe("rough notes");
  });

  it("appends the content when the body declares no insertion point", async () => {
    const executePrompt = vi.fn<NonNullable<NiaWorkflowAdapters["executePrompt"]>>(
      async () => ({ text: "ok" }),
    );

    await runNiaWorkflow({
      source: canonical,
      inputs: { notes: "rough notes" },
      adapters: {
        resolveDefinition: vi.fn(async () => ({
          // 没有 {{content}}：把指令单独发出去，模型会收到「改进下面这段」而
          // 下面什么都没有。
          body: "Improve the following text.",
          model: "allowed-model",
        })),
        executePrompt,
        executeAction: vi.fn(async ({ params }: { params: Record<string, string> }) => ({
          text: params.content,
        })),
        requestApproval: vi.fn(async () => true),
      },
      runId: "run-composition-append",
    });

    const call = executePrompt.mock.calls[0]?.[0];
    expect(call?.prompt).toBe("Improve the following text.\n\n---\n\nrough notes");
  });
});
