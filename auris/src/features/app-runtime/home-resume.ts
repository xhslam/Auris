import {
  buildWorkspaceResumeHref,
  getResumeLabel,
  getWorkspaceHref,
  hydrateDesktopRuntimeState,
} from "@/features/app-runtime/app-runtime-storage";
import type {
  DesktopResumeTargetType,
  DesktopRuntimeState,
} from "@/features/app-runtime/app-runtime.types";
import type { NotePageSummary, NotesStorage } from "@/features/notes/note-types";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

export type HomeResumeLinkItem = {
  href: string;
  id: string;
  subtitle: string;
  title: string;
  type: DesktopResumeTargetType;
};

export type DesktopHomeResumeSnapshot = {
  primaryAction: {
    href: string;
    label: string;
  };
  recentAssessments: HomeResumeLinkItem[];
  recentNotes: HomeResumeLinkItem[];
  recentTraining: HomeResumeLinkItem[];
  runtimeState: DesktopRuntimeState;
};

function takeTop<T>(items: T[], limit = 3) {
  return items.slice(0, limit);
}

function getPrimaryActionLabel(type: DesktopResumeTargetType | null) {
  if (type === "assessment") {
    return "Resume readiness review";
  }

  if (type === "note") {
    return "Resume notes";
  }

  return "Resume notes";
}

function resolvePrimaryAction(
  runtimeState: DesktopRuntimeState,
  recentTraining: HomeResumeLinkItem[],
  recentAssessments: HomeResumeLinkItem[],
  recentNotes: HomeResumeLinkItem[],
) {
  const collection =
    runtimeState.primaryResumeType === "training"
      ? recentTraining
      : runtimeState.primaryResumeType === "assessment"
        ? recentAssessments
        : runtimeState.primaryResumeType === "note"
          ? recentNotes
          : [];

  const matchedItem = collection.find((item) => item.id === runtimeState.primaryResumeId);

  if (matchedItem) {
    return {
      href: matchedItem.href,
      label: getPrimaryActionLabel(matchedItem.type),
    };
  }

  if (runtimeState.lastWorkspace === "notes" && recentNotes.length > 0) {
    return {
      href: recentNotes[0]!.href,
      label: "Resume notes",
    };
  }

  if (runtimeState.lastWorkspace === "assessment" && recentAssessments.length > 0) {
    return {
      href: recentAssessments[0]!.href,
      label: "Resume readiness review",
    };
  }

  const resumeWorkspace =
    runtimeState.lastWorkspace === "home" || runtimeState.lastWorkspace === "workspace"
      ? "notes"
      : runtimeState.lastWorkspace;

  return {
    href: getWorkspaceHref(resumeWorkspace),
    label: getResumeLabel(resumeWorkspace),
  };
}

function mapTrainingItems(recentTraining: Array<{ id: string; status: string; title: string }>) {
  void recentTraining;
  return [];
}

function mapAssessmentItems(
  recentAssessments: Array<{
    id: string;
    overallScore: number;
    referenceText: string;
  }>,
) {
  return takeTop(recentAssessments).map((item) => ({
    href: buildWorkspaceResumeHref("assessment", "assessment", item.id),
    id: item.id,
    subtitle: `得分：${item.overallScore}`,
    title: item.referenceText,
    type: "assessment" as const,
  }));
}

function mapNoteItems(recentNotes: NotePageSummary[]) {
  return takeTop(recentNotes).map((item) => ({
    href: buildWorkspaceResumeHref("notes", "note", item.id),
    id: item.id,
    subtitle: item.relativePath,
    title: item.title,
    type: "note" as const,
  }));
}

export async function loadDesktopHomeResumeSnapshot(input: {
  bridge: DesktopBridge | null;
  notesStorage: NotesStorage | null;
  storage: Storage | null | undefined;
}) {
  const runtimeState = await hydrateDesktopRuntimeState(input.bridge, input.storage);
  const [recentTrainingRaw, recentAssessmentsRaw, recentNotesRaw] = await Promise.all([
    input.bridge?.trainingHistory?.listRecent?.() ?? Promise.resolve([]),
    input.bridge?.assessmentHistory?.list?.() ?? Promise.resolve([]),
    input.notesStorage?.listPages?.() ?? Promise.resolve([]),
  ]);

  const recentTraining = mapTrainingItems(recentTrainingRaw);
  const recentAssessments = mapAssessmentItems(recentAssessmentsRaw);
  const recentNotes = mapNoteItems(recentNotesRaw);

  return {
    primaryAction: resolvePrimaryAction(
      runtimeState,
      recentTraining,
      recentAssessments,
      recentNotes,
    ),
    recentAssessments,
    recentNotes,
    recentTraining,
    runtimeState,
  } satisfies DesktopHomeResumeSnapshot;
}
