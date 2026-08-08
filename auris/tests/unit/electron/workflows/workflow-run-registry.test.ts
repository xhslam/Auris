import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createWorkflowRunRegistry,
} = require("../../../../electron/workflows/workflow-run-registry.cjs");

describe("workflow run registry", () => {
  it("binds stable run identity to one owner and locks a target until terminal", () => {
    const registry = createWorkflowRunRegistry({
      randomBytes: () => Buffer.alloc(12, 1),
    });
    const target = { windowId: "w1", tabId: "t1" };
    const run = registry.create({
      family: "browser_markdown",
      ownerId: "notes:1",
      target,
    });
    expect(run.runId).toBe("workflow-run-010101010101010101010101");
    expect(() => registry.get(run.runId, "notes:2")).toThrow(/another owner/u);
    expect(() =>
      registry.create({
        family: "browser_markdown",
        ownerId: "notes:2",
        target,
      }),
    ).toThrow(/controls this tab/u);
    registry.update(run, { status: "completed" });
    expect(() =>
      registry.create({
        family: "browser_markdown",
        ownerId: "notes:2",
        target,
      }),
    ).not.toThrow();
  });

  it("cancels all owned runs and stops delivering after disconnect", () => {
    const registry = createWorkflowRunRegistry();
    const listener = vi.fn();
    registry.subscribe("browser:1", listener);
    const one = registry.create({
      family: "browser_markdown",
      ownerId: "browser:1",
    });
    registry.create({ family: "browser_markdown", ownerId: "browser:1" });
    expect(registry.cancelOwner("browser:1")).toBe(2);
    registry.emit(one, { type: "late" });
    expect(listener).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "late" }),
    );
  });

  it("enforces global and per-owner release budgets and frees capacity at terminal state", () => {
    const perOwner = createWorkflowRunRegistry({
      maxActiveRuns: 3,
      maxActiveRunsPerOwner: 2,
    });
    const first = perOwner.create({ family: "nia_yaml", ownerId: "owner:one" });
    perOwner.create({ family: "nia_yaml", ownerId: "owner:one" });
    expect(() =>
      perOwner.create({ family: "nia_yaml", ownerId: "owner:one" }),
    ).toThrowError(expect.objectContaining({ code: "RUN_LIMIT" }));
    perOwner.update(first, { status: "completed" });
    expect(() =>
      perOwner.create({ family: "nia_yaml", ownerId: "owner:one" }),
    ).not.toThrow();

    const global = createWorkflowRunRegistry({
      maxActiveRuns: 2,
      maxActiveRunsPerOwner: 2,
    });
    global.create({ family: "nia_yaml", ownerId: "owner:one" });
    global.create({ family: "nia_yaml", ownerId: "owner:two" });
    expect(() =>
      global.create({ family: "nia_yaml", ownerId: "owner:three" }),
    ).toThrowError(expect.objectContaining({ code: "RUN_LIMIT" }));
  });
});
