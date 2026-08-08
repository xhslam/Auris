/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createWorkflowSelfHeal } from "@/features/workflows/workflow-self-heal";

const require = createRequire(import.meta.url);
const { createBrowserWorkflowRuntime } = require("../../electron/workflows/browser-workflow-runtime.cjs");
const { compileBrowserWorkflowFromSource } = require("../../electron/shared/browser-workflow-contract.cjs");

const ACTION = `---\nsite: example.com\ninputs: {}\ntrigger: manual\n---\n\n1. confirm: Continue?\n2. action: click "Continue"\n3. extract: result\n`;
const NAVIGATION = `---\nsite: example.com\ninputs: {}\ntrigger: manual\n---\n\n1. action: navigate to https://example.com/next\n2. extract: result\n`;

async function waitForState(runtime: any, runId: string, ownerId: string, status: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = runtime.getState(runId, ownerId);
    if (state.status === status) return state;
    await new Promise((resolveWait) => setTimeout(resolveWait, 0));
  }
  throw new Error(`Run did not reach ${status}`);
}

function dispatcherFixture({ redirected = false } = {}) {
  let leases = 0;
  let actionAttempts = 0;
  const active = new Set<string>();
  const dispatch = vi.fn(async ({ connectionId, params }: Record<string, any>) => {
    if (params.request.action === "acquire_control") {
      const token = `lease-${++leases}`;
      active.add(token);
      return {
        control: { ...params.target, leaseToken: token },
        target: { url: redirected && leases > 1 ? "https://redirect.invalid/" : "https://example.com/" },
      };
    }
    if (params.request.action === "release_control") {
      active.delete(params.control.leaseToken);
      return { released: true };
    }
    if (params.request.action === "act") {
      actionAttempts += 1;
      if (!params.approvalId) {
        throw Object.assign(new Error("approval required"), {
          code: "APPROVAL_REQUIRED",
          metadata: { approvalId: `approval-${connectionId}-${actionAttempts}` },
        });
      }
    }
    return { ok: true };
  });
  return { active, dispatch, get actionAttempts() { return actionAttempts; } };
}

describe("Browser workflow adversarial integration", () => {
  it("handles confirmation, denial, exact retry approval, success, and lease release", async () => {
    const fixture = dispatcherFixture();
    const runtime = createBrowserWorkflowRuntime({ dispatcher: fixture, reviewDefinition: async () => true });
    const denied = await runtime.start({ ownerId: "owner-deny", request: { source: ACTION, target: { windowId: "w1", tabId: "t1" } } });
    await waitForState(runtime, denied.runId, "owner-deny", "awaiting_confirmation");
    runtime.resume(denied.runId, "owner-deny", { approved: false });
    expect(runtime.getState(denied.runId, "owner-deny").status).toBe("cancelled");

    const started = await runtime.start({ ownerId: "owner-ok", request: { source: ACTION, target: { windowId: "w2", tabId: "t2" } } });
    await waitForState(runtime, started.runId, "owner-ok", "awaiting_confirmation");
    runtime.resume(started.runId, "owner-ok", { approved: true });
    const approval = await waitForState(runtime, started.runId, "owner-ok", "awaiting_approval");
    expect(() => runtime.resume(started.runId, "owner-ok", { approved: true, approvalId: "stale" })).toThrow(/Fresh approval/u);
    runtime.resume(started.runId, "owner-ok", { approved: true, approvalId: approval.pending.approvalId });
    await waitForState(runtime, started.runId, "owner-ok", "completed");
    expect(fixture.actionAttempts).toBe(2);
    expect(fixture.active.size).toBe(0);
  });

  it("fails closed after redirect/navigation and releases the current lease", async () => {
    const fixture = dispatcherFixture({ redirected: true });
    const runtime = createBrowserWorkflowRuntime({ dispatcher: fixture, reviewDefinition: async () => true });
    const started = await runtime.start({ ownerId: "redirect-owner", request: { source: NAVIGATION, target: { windowId: "w", tabId: "t" } } });
    const failed = await waitForState(runtime, started.runId, "redirect-owner", "failed");
    expect(failed.error.code).toBe("ORIGIN_MISMATCH");
    expect(fixture.active.size).toBe(0);
  });

  it("cancels on disconnect and lets a human/new owner reclaim the target", async () => {
    const fixture = dispatcherFixture();
    const runtime = createBrowserWorkflowRuntime({ dispatcher: fixture, reviewDefinition: async () => true });
    const first = await runtime.start({ ownerId: "owner-a", request: { source: ACTION, target: { windowId: "w", tabId: "t" } } });
    await waitForState(runtime, first.runId, "owner-a", "awaiting_confirmation");
    await expect(runtime.start({ ownerId: "owner-b", request: { source: ACTION, target: { windowId: "w", tabId: "t" } } })).rejects.toMatchObject({ code: "TARGET_BUSY" });
    expect(runtime.disconnect("owner-a")).toBe(1);
    const reclaimed = await runtime.start({ ownerId: "owner-b", request: { source: ACTION, target: { windowId: "w", tabId: "t" } } });
    await waitForState(runtime, reclaimed.runId, "owner-b", "awaiting_confirmation");
    expect(runtime.cancel(reclaimed.runId, "owner-b").status).toBe("cancelled");
  });

  it("rejects hostile workflow authority and requires review plus fresh authorization for self-heal", async () => {
    const hostile = readFileSync(resolve("tests/fixtures/workflows/browser-hostile.md"), "utf8");
    expect(() => compileBrowserWorkflowFromSource(hostile)).toThrow();

    const heal = createWorkflowSelfHeal({ maxCandidates: 1, maxAttempts: 1 });
    const proposal = heal.propose({
      stepIndex: 2,
      oldTarget: { selector: "#old", secret: "hidden" },
      candidates: [
        { target: { kind: "selector", selector: "#new" }, confidence: 0.9, evidence: { token: "hidden" } },
        { target: { kind: "ref", ref: "ignored" }, confidence: 0.8 },
      ],
    });
    expect(proposal.candidates).toHaveLength(1);
    expect(JSON.stringify(proposal)).not.toContain("hidden");
    const authorizeFresh = vi.fn(async () => true);
    const recompile = vi.fn(async (target) => ({ target, authority: false }));
    await heal.accept({ proposalId: proposal.proposalId, candidateIndex: 0, authorizeFresh, recompile });
    expect(recompile).toHaveBeenCalledBefore(authorizeFresh);
    expect(authorizeFresh).toHaveBeenCalledTimes(1);
    await expect(heal.accept({ proposalId: proposal.proposalId, candidateIndex: 0, authorizeFresh, recompile })).rejects.toThrow(/stale/u);
  });
});
