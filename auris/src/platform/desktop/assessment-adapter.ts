import type { PronunciationAssessmentRecord } from "@/features/assessment/pronunciation-assessment.types";
import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

const LEGACY_ASSESSMENT_STORAGE_KEY = "shadowing-pronunciation-assessments";

function readLegacyAssessments(storage: Storage | null | undefined) {
  if (!storage) {
    return [];
  }

  const rawValue = storage.getItem(LEGACY_ASSESSMENT_STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? (parsed as PronunciationAssessmentRecord[]) : [];
  } catch {
    return [];
  }
}

export function createDesktopPronunciationAssessmentStorage(bridge: DesktopBridge | null) {
  if (!bridge?.assessmentHistory) {
    return null;
  }

  return {
    listAssessments: () => bridge.assessmentHistory!.list(),
    saveAssessment: (assessment: PronunciationAssessmentRecord) =>
      bridge.assessmentHistory!.save(assessment),
  };
}

export async function hydrateDesktopPronunciationAssessments(
  bridge: DesktopBridge | null,
  storage: Storage | null | undefined,
) {
  if (!bridge?.assessmentHistory) {
    return [];
  }

  const legacyAssessments = readLegacyAssessments(storage);

  if (legacyAssessments.length > 0) {
    return bridge.assessmentHistory.importLegacy(legacyAssessments);
  }

  return bridge.assessmentHistory.list();
}
