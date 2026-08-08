import type {
  PronunciationAssessmentRecord,
  PronunciationAssessmentStorage,
} from "@/features/assessment/pronunciation-assessment.types";

const STORAGE_KEY = "shadowing-pronunciation-assessments";

let backendOverride: PronunciationAssessmentStorage | null = null;

function normalizeAssessments(assessments: PronunciationAssessmentRecord[]) {
  return [...assessments].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function getStorage() {
  if (typeof window === "undefined") {
    throw new Error("PRONUNCIATION_ASSESSMENT_STORAGE_UNAVAILABLE");
  }

  return window.localStorage;
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `assessment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createAssessmentRecord(
  input: Omit<PronunciationAssessmentRecord, "id"> & { id?: string },
): PronunciationAssessmentRecord {
  return {
    ...input,
    id: input.id ?? createId(),
    wordAssessments: [...(input.wordAssessments ?? [])],
  };
}

const localStorageBackend: PronunciationAssessmentStorage = {
  async listAssessments() {
    const rawValue = getStorage().getItem(STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawValue) as PronunciationAssessmentRecord[];
      return normalizeAssessments(parsed);
    } catch {
      return [];
    }
  },

  async saveAssessment(assessment) {
    const current = await localStorageBackend.listAssessments();
    const next = normalizeAssessments([
      assessment,
      ...current.filter((item) => item.id !== assessment.id),
    ]);
    getStorage().setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  },
};

function getActiveBackend() {
  return backendOverride ?? localStorageBackend;
}

export function __setPronunciationAssessmentStorageBackendForTests(
  backend: PronunciationAssessmentStorage | null,
) {
  backendOverride = backend;
}

export function createMemoryPronunciationAssessmentStorage(
  initialAssessments: PronunciationAssessmentRecord[] = [],
): PronunciationAssessmentStorage {
  let assessments = normalizeAssessments(initialAssessments);

  return {
    async listAssessments() {
      return assessments;
    },
    async saveAssessment(assessment) {
      assessments = normalizeAssessments([
        assessment,
        ...assessments.filter((item) => item.id !== assessment.id),
      ]);
      return assessments;
    },
  };
}

export function getBrowserPronunciationAssessmentStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return getActiveBackend();
}
