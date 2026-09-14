export type LearningDependencyKind = "material" | "source-note";
export type LearningDependencyStatus = "current" | "needs-review" | "reviewed" | "waived";
export type LearningDependencyResolutionDecision = "reviewed" | "waived";

export type LearningDependency = Readonly<{
  fingerprint: string;
  kind: LearningDependencyKind;
  path: string | null;
}>;

export type LearningDependencySnapshot = Readonly<{
  capturedAt: string;
  dependencies: readonly LearningDependency[];
  resolution: Readonly<{
    at: string;
    decision: LearningDependencyResolutionDecision;
    reason: string | null;
  }> | null;
  status: LearningDependencyStatus;
}>;

export type LearningDependencyDiagnostic = Readonly<{
  kind: LearningDependencyKind;
  path: string | null;
  reason: "changed" | "missing";
}>;

export type LearningDependencyReview = Readonly<{
  diagnostics: readonly LearningDependencyDiagnostic[];
  snapshot: LearningDependencySnapshot;
  status: "current" | "needs-review";
}>;

type BuildLearningDependencySnapshotInput = Readonly<{
  capturedAt: string;
  materialText: string;
  sourceNote?: Readonly<{
    content: string;
    path: string;
  }> | null;
}>;

type EvaluateLearningDependencySnapshotInput = Readonly<{
  materialText?: string;
  notesByPath: ReadonlyMap<string, string>;
}>;

type ResolveLearningDependencyReviewInput = Readonly<{
  at: string;
  decision: LearningDependencyResolutionDecision;
  reason?: string | null;
}>;

function normalizeContent(value: string) {
  return value.replace(/\r\n?/gu, "\n").trim().replace(/\s+/gu, " ");
}

function fingerprint(value: string) {
  let hash = 0x811c9dc5;
  for (const character of normalizeContent(value)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function currentContentFor(
  dependency: LearningDependency,
  input: EvaluateLearningDependencySnapshotInput,
) {
  if (dependency.kind === "material") {
    return input.materialText;
  }
  return dependency.path ? input.notesByPath.get(dependency.path) : undefined;
}

export function buildLearningDependencySnapshot(
  input: BuildLearningDependencySnapshotInput,
): LearningDependencySnapshot {
  const dependencies: LearningDependency[] = [
    {
      fingerprint: fingerprint(input.materialText),
      kind: "material",
      path: null,
    },
  ];

  if (input.sourceNote?.path.trim()) {
    dependencies.push({
      fingerprint: fingerprint(input.sourceNote.content),
      kind: "source-note",
      path: input.sourceNote.path,
    });
  }

  return Object.freeze({
    capturedAt: input.capturedAt,
    dependencies: Object.freeze(dependencies),
    resolution: null,
    status: "current",
  });
}

export function evaluateLearningDependencySnapshot(
  snapshot: LearningDependencySnapshot,
  input: EvaluateLearningDependencySnapshotInput,
): LearningDependencyReview {
  const diagnostics: LearningDependencyDiagnostic[] = [];
  for (const dependency of snapshot.dependencies) {
    const content = currentContentFor(dependency, input);
    if (typeof content !== "string") {
      if (dependency.kind === "source-note") {
        diagnostics.push({ kind: dependency.kind, path: dependency.path, reason: "missing" });
      }
      continue;
    }
    if (fingerprint(content) !== dependency.fingerprint) {
      diagnostics.push({ kind: dependency.kind, path: dependency.path, reason: "changed" });
    }
  }

  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    snapshot,
    status: diagnostics.length > 0 ? "needs-review" : "current",
  });
}

export function rebaseLearningDependencySnapshot(
  snapshot: LearningDependencySnapshot,
  input: EvaluateLearningDependencySnapshotInput,
  resolution: ResolveLearningDependencyReviewInput,
): LearningDependencySnapshot {
  const dependencies = snapshot.dependencies.map((dependency) => {
    const content = currentContentFor(dependency, input);
    return typeof content === "string"
      ? { ...dependency, fingerprint: fingerprint(content) }
      : dependency;
  });

  return resolveLearningDependencyReview({
    ...snapshot,
    dependencies: Object.freeze(dependencies),
  }, resolution);
}

export function resolveLearningDependencyReview(
  snapshot: LearningDependencySnapshot,
  input: ResolveLearningDependencyReviewInput,
): LearningDependencySnapshot {
  const reason = input.reason?.trim() || null;
  if (input.decision === "waived" && !reason) {
    throw new Error("A reason is required when waiving a learning dependency review.");
  }

  return Object.freeze({
    ...snapshot,
    resolution: Object.freeze({
      at: input.at,
      decision: input.decision,
      reason,
    }),
    status: input.decision,
  });
}
