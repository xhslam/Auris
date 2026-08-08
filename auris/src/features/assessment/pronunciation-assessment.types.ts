export type PronunciationWordAssessment = {
  accuracyScore: number;
  errorType: string;
  word: string;
};

export type PronunciationAssessmentRecord = {
  accuracyScore: number;
  completenessScore: number;
  createdAt: string;
  endMs?: number;
  fluencyScore: number;
  id: string;
  locale: string;
  overallScore: number;
  referenceText: string;
  sentenceId?: string;
  sourceId?: string;
  sourceLabel: string;
  startMs?: number;
  wordAssessments: PronunciationWordAssessment[];
};

export type PronunciationAssessmentStorage = {
  listAssessments: () => Promise<PronunciationAssessmentRecord[]>;
  saveAssessment: (
    assessment: PronunciationAssessmentRecord,
  ) => Promise<PronunciationAssessmentRecord[]>;
};
