import {
  evaluateLearningDependencySnapshot,
  rebaseLearningDependencySnapshot,
  type LearningDependency,
  type LearningDependencySnapshot,
} from "@/features/learning-memory/learning-dependency-review";
import type { NotePage, NotePageSummary, NotesStorage } from "@/features/notes/note-types";

export const LEARNING_DEPENDENCY_SNAPSHOT_KEY = "aurisDependencySnapshot";
const REVIEW_START = "<!-- auris:dependency-review:start -->";
const REVIEW_END = "<!-- auris:dependency-review:end -->";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDependency(value: unknown): value is LearningDependency {
  return isRecord(value)
    && typeof value.fingerprint === "string"
    && (value.kind === "material" || value.kind === "source-note")
    && (typeof value.path === "string" || value.path === null);
}

export function readLearningDependencySnapshot(
  frontmatter: Record<string, unknown> | undefined,
): LearningDependencySnapshot | null {
  const value = frontmatter?.[LEARNING_DEPENDENCY_SNAPSHOT_KEY];
  if (!isRecord(value)
    || typeof value.capturedAt !== "string"
    || !Array.isArray(value.dependencies)
    || !value.dependencies.every(isDependency)
    || !["current", "needs-review", "reviewed", "waived"].includes(String(value.status))) {
    return null;
  }

  const resolution = isRecord(value.resolution)
    && typeof value.resolution.at === "string"
    && (value.resolution.decision === "reviewed" || value.resolution.decision === "waived")
    && (typeof value.resolution.reason === "string" || value.resolution.reason === null)
    ? {
      at: value.resolution.at,
      decision: value.resolution.decision as "reviewed" | "waived",
      reason: value.resolution.reason,
    }
    : null;

  return {
    capturedAt: value.capturedAt,
    dependencies: value.dependencies,
    resolution,
    status: value.status as LearningDependencySnapshot["status"],
  };
}

function formatDiagnostic(
  dependency: LearningDependency,
  reason: "changed" | "missing" | null,
) {
  const target = dependency.kind === "source-note" && dependency.path
    ? `source-note: [[${dependency.path}]]`
    : "material: current learning material";
  return `- ${target}${reason ? ` (${reason})` : ""}`;
}

function renderReviewBlock(
  snapshot: LearningDependencySnapshot,
  diagnostics: readonly { kind: string; path: string | null; reason: "changed" | "missing" }[],
) {
  return [
    "## Dependency Review",
    "",
    REVIEW_START,
    `- Status: ${snapshot.status}`,
    `- Captured: ${snapshot.capturedAt}`,
    ...snapshot.dependencies.map((dependency) => {
      const diagnostic = diagnostics.find((entry) => (
        entry.kind === dependency.kind && entry.path === dependency.path
      ));
      return formatDiagnostic(dependency, diagnostic?.reason ?? null);
    }),
    ...(snapshot.resolution
      ? [
        `- Resolution: ${snapshot.resolution.decision}`,
        ...(snapshot.resolution.reason ? [`- Reason: ${snapshot.resolution.reason}`] : []),
      ]
      : []),
    REVIEW_END,
  ].join("\n");
}

function replaceReviewBlock(markdownBody: string, block: string) {
  const start = markdownBody.indexOf(REVIEW_START);
  const end = markdownBody.indexOf(REVIEW_END);
  if (start >= 0 && end >= start) {
    const afterEnd = end + REVIEW_END.length;
    const sectionStart = markdownBody.lastIndexOf("## Dependency Review", start);
    const replaceStart = sectionStart >= 0 ? sectionStart : start;
    return `${markdownBody.slice(0, replaceStart).trimEnd()}\n\n${block}${markdownBody.slice(afterEnd).trimStart() ? `\n\n${markdownBody.slice(afterEnd).trimStart()}` : ""}`;
  }
  return `${markdownBody.trimEnd()}\n\n${block}\n`;
}

export function resolveLearningDependencyReviewForPage(
  page: NotePage,
  pages: readonly NotePage[],
  resolution: Parameters<typeof rebaseLearningDependencySnapshot>[2],
): NotePage | null {
  const snapshot = readLearningDependencySnapshot(page.frontmatter);
  if (!snapshot) {
    return null;
  }

  const notesByPath = new Map(pages.map((entry) => [entry.relativePath, entry.markdownBody]));
  const nextSnapshot = rebaseLearningDependencySnapshot(snapshot, { notesByPath }, resolution);
  return {
    ...page,
    frontmatter: {
      ...(page.frontmatter ?? {}),
      [LEARNING_DEPENDENCY_SNAPSHOT_KEY]: nextSnapshot,
    },
    markdownBody: replaceReviewBlock(
      page.markdownBody,
      renderReviewBlock(nextSnapshot, []),
    ),
  };
}

export function syncLearningDependencyReviews(pages: readonly NotePage[]): NotePage[] {
  const notesByPath = new Map(pages.map((page) => [page.relativePath, page.markdownBody]));

  return pages.flatMap((page) => {
    const snapshot = readLearningDependencySnapshot(page.frontmatter);
    if (!snapshot) {
      return [];
    }

    const review = evaluateLearningDependencySnapshot(snapshot, { notesByPath });
    if (review.status === "current" && snapshot.status === "current") {
      return [];
    }

    const nextSnapshot: LearningDependencySnapshot = {
      ...snapshot,
      resolution: review.status === "needs-review" ? null : snapshot.resolution,
      status: review.status,
    };
    const nextMarkdownBody = replaceReviewBlock(
      page.markdownBody,
      renderReviewBlock(nextSnapshot, review.diagnostics),
    );
    if (nextMarkdownBody === page.markdownBody && nextSnapshot.status === snapshot.status) {
      return [];
    }

    return [{
      ...page,
      frontmatter: {
        ...(page.frontmatter ?? {}),
        [LEARNING_DEPENDENCY_SNAPSHOT_KEY]: nextSnapshot,
      },
      markdownBody: nextMarkdownBody,
    }];
  });
}

export async function synchronizeLearningDependencyReviews(notesStorage: NotesStorage) {
  const summaries = await notesStorage.listPages();
  const pages = await Promise.all(
    summaries.map((summary: NotePageSummary) => notesStorage.getPage(summary.id)),
  );
  const updates = syncLearningDependencyReviews(
    pages.filter((page): page is NotePage => page !== null),
  );

  for (const update of updates) {
    await notesStorage.savePage(update);
  }

  return updates.length;
}
