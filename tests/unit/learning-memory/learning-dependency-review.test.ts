import { describe, expect, it } from "vitest";
import {
  buildLearningDependencySnapshot,
  evaluateLearningDependencySnapshot,
  rebaseLearningDependencySnapshot,
  resolveLearningDependencyReview,
} from "@/features/learning-memory/learning-dependency-review";

describe("learning dependency review", () => {
  const snapshot = buildLearningDependencySnapshot({
    capturedAt: "2026-08-20T12:00:00.000Z",
    materialText: "A learner repeats a short passage.",
    sourceNote: {
      content: "# Connected source\n\nA learner repeats a short passage.",
      path: "Sources/connected-source.md",
    },
  });

  it("pins normalized source content and starts in the current state", () => {
    expect(snapshot.status).toBe("current");
    expect(snapshot.dependencies).toHaveLength(2);
    expect(snapshot.dependencies[0]).toMatchObject({
      kind: "material",
      path: null,
    });
    expect(snapshot.dependencies[1]).toMatchObject({
      kind: "source-note",
      path: "Sources/connected-source.md",
    });
    expect(snapshot.dependencies[1]?.fingerprint).toMatch(/^[a-z0-9]+$/u);
  });

  it("marks a product for review when a pinned source changed or disappeared", () => {
    const changed = evaluateLearningDependencySnapshot(snapshot, {
      materialText: "A learner repeats a different passage.",
      notesByPath: new Map([
        ["Sources/connected-source.md", "# Connected source\n\nChanged explanation."],
      ]),
    });
    const missing = evaluateLearningDependencySnapshot(snapshot, {
      materialText: "A learner repeats a short passage.",
      notesByPath: new Map(),
    });

    expect(changed.status).toBe("needs-review");
    expect(changed.diagnostics.map((entry) => entry.reason)).toEqual([
      "changed",
      "changed",
    ]);
    expect(missing.status).toBe("needs-review");
    expect(missing.diagnostics).toContainEqual({
      kind: "source-note",
      path: "Sources/connected-source.md",
      reason: "missing",
    });
  });

  it("refreshes the pinned source baseline when a human completes a review", () => {
    const rebased = rebaseLearningDependencySnapshot(snapshot, {
      notesByPath: new Map([
        ["Sources/connected-source.md", "# Connected source\n\nReviewed explanation."],
      ]),
    }, {
      at: "2026-08-21T08:00:00.000Z",
      decision: "reviewed",
    });

    expect(rebased.status).toBe("reviewed");
    expect(evaluateLearningDependencySnapshot(rebased, {
      notesByPath: new Map([
        ["Sources/connected-source.md", "# Connected source\n\nReviewed explanation."],
      ]),
    }).status).toBe("current");
  });

  it("requires a reason for waiving a stale review and records a human resolution", () => {
    expect(() => resolveLearningDependencyReview(snapshot, {
      at: "2026-08-21T08:00:00.000Z",
      decision: "waived",
      reason: "  ",
    })).toThrow(/reason/u);

    expect(resolveLearningDependencyReview(snapshot, {
      at: "2026-08-21T08:00:00.000Z",
      decision: "reviewed",
    })).toMatchObject({
      status: "reviewed",
      resolution: {
        at: "2026-08-21T08:00:00.000Z",
        decision: "reviewed",
        reason: null,
      },
    });
  });
});
