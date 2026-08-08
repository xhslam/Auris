import { getOptionalAzureSpeechEnv } from "@/lib/server-env";
import {
  createAssessmentRecord,
} from "@/features/assessment/local-pronunciation-assessment-store";
import type {
  PronunciationAssessmentRecord,
  PronunciationWordAssessment,
} from "@/features/assessment/pronunciation-assessment.types";

type EvaluatePronunciationInput = {
  audioBuffer: ArrayBuffer;
  contentType: string;
  createdAt?: string;
  locale: string;
  referenceText: string;
  sourceLabel?: string;
};

type AzureWordResult = {
  PronunciationAssessment?: {
    AccuracyScore?: number;
    ErrorType?: string;
  };
  Word?: string;
};

type AzurePronunciationResponse = {
  DisplayText?: string;
  NBest?: Array<{
    PronunciationAssessment?: {
      AccuracyScore?: number;
      CompletenessScore?: number;
      FluencyScore?: number;
      PronScore?: number;
    };
    Words?: AzureWordResult[];
  }>;
  RecognitionStatus?: string;
};

function normalizeScore(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.round(value * 10) / 10;
}

function encodePronunciationAssessmentHeader(referenceText: string) {
  return Buffer.from(
    JSON.stringify({
      Dimension: "Comprehensive",
      EnableMiscue: true,
      GradingSystem: "HundredMark",
      Granularity: "Phoneme",
      ReferenceText: referenceText,
    }),
    "utf-8",
  ).toString("base64");
}

function toWordAssessments(words: AzureWordResult[] | undefined): PronunciationWordAssessment[] {
  return (words ?? [])
    .filter((item) => item.Word)
    .map((item) => ({
      accuracyScore: normalizeScore(item.PronunciationAssessment?.AccuracyScore),
      errorType: item.PronunciationAssessment?.ErrorType ?? "None",
      word: item.Word ?? "",
    }));
}

function parseAzureAssessmentResponse(
  payload: AzurePronunciationResponse,
  input: EvaluatePronunciationInput,
): PronunciationAssessmentRecord {
  const bestResult = payload.NBest?.[0];
  const pronunciation = bestResult?.PronunciationAssessment;

  return createAssessmentRecord({
    accuracyScore: normalizeScore(pronunciation?.AccuracyScore),
    completenessScore: normalizeScore(pronunciation?.CompletenessScore),
    createdAt: input.createdAt ?? new Date().toISOString(),
    fluencyScore: normalizeScore(pronunciation?.FluencyScore),
    locale: input.locale,
    overallScore: normalizeScore(pronunciation?.PronScore),
    referenceText: input.referenceText,
    sourceLabel: input.sourceLabel ?? "上传音频",
    wordAssessments: toWordAssessments(bestResult?.Words),
  });
}

export async function evaluatePronunciationAssessment(
  input: EvaluatePronunciationInput,
) {
  const env = getOptionalAzureSpeechEnv();

  if (!env) {
    throw new Error("AZURE_PRONUNCIATION_ASSESSMENT_NOT_CONFIGURED");
  }

  const endpoint = new URL(
    `https://${env.AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`,
  );
  endpoint.searchParams.set("format", "detailed");
  endpoint.searchParams.set("language", input.locale);

  const response = await fetch(endpoint.toString(), {
    body: Buffer.from(input.audioBuffer),
    headers: {
      "Content-Type": input.contentType,
      "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY,
      "Pronunciation-Assessment": encodePronunciationAssessmentHeader(input.referenceText),
    },
    method: "POST",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "AZURE_PRONUNCIATION_ASSESSMENT_FAILED");
  }

  const payload = (await response.json()) as AzurePronunciationResponse;

  if (payload.RecognitionStatus && payload.RecognitionStatus !== "Success") {
    throw new Error(`AZURE_PRONUNCIATION_ASSESSMENT_${payload.RecognitionStatus}`);
  }

  return parseAzureAssessmentResponse(payload, input);
}
