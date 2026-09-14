import type { PronunciationAssessmentRecord } from "@/features/assessment/pronunciation-assessment.types";

export type PronunciationAssessmentResponse = {
  assessment?: PronunciationAssessmentRecord;
  code?: string;
  message?: string;
};

type EvaluatePronunciationAttemptInput = {
  audio: Blob;
  locale: string;
  referenceText: string;
  signal?: AbortSignal;
  sourceLabel: string;
};

/**
 * English Practice 的浏览器侧评估边界。
 *
 * 仅向应用自己的 server route 上传录音；Azure Key、区域和 Provider 请求始终留在
 * 服务端的 `evaluatePronunciationAssessment` 中。
 */
export async function evaluatePronunciationAttempt({
  audio,
  locale,
  referenceText,
  signal,
  sourceLabel,
}: EvaluatePronunciationAttemptInput) {
  const form = new FormData();
  form.set("referenceText", referenceText);
  form.set("locale", locale);
  form.set("sourceLabel", sourceLabel);
  form.set("audio", audio, "shadowing-attempt.wav");

  const response = await fetch("/api/assessment/pronunciation", {
    body: form,
    method: "POST",
    signal,
  });
  const payload = (await response.json()) as PronunciationAssessmentResponse;

  return { payload, success: response.ok && Boolean(payload.assessment) };
}
