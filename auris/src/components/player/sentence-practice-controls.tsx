"use client";

import { useEffect, useRef, useState } from "react";
import { startWavRecording, type ActiveWavRecorder } from "@/features/assessment/wav-recorder";
import type { PronunciationAssessmentRecord } from "@/features/assessment/pronunciation-assessment.types";
import type { SentenceRecord } from "@/features/sessions/session.types";

type PracticeStatus = "idle" | "recording" | "submitting" | "complete" | "error";

type SentencePracticeControlsProps = {
  locale?: string;
  onAssessmentSaved?: (assessment: PronunciationAssessmentRecord) => void;
  sentence: SentenceRecord;
  sourceId: string;
  sourceLabel: string;
};

function getRecorderErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "MICROPHONE_NOT_SUPPORTED") {
    return "当前环境不支持麦克风录音。";
  }

  if (message === "AUDIO_CONTEXT_NOT_SUPPORTED") {
    return "当前环境不支持音频录制。";
  }

  if (message.includes("Permission denied") || message.includes("NotAllowedError")) {
    return "麦克风权限被拒绝，请允许录音后再试。";
  }

  return "录音启动失败，请稍后再试。";
}

function getAssessmentErrorMessage(payload: { message?: string } | null) {
  return payload?.message ?? "发音评估失败，请稍后重试。";
}

function getScoreTone(score: number) {
  if (score >= 85) {
    return "稳";
  }

  if (score >= 70) {
    return "可";
  }

  return "练";
}

export function SentencePracticeControls({
  locale = "en-US",
  onAssessmentSaved,
  sentence,
  sourceId,
  sourceLabel,
}: SentencePracticeControlsProps) {
  const recorderRef = useRef<ActiveWavRecorder | null>(null);
  const [status, setStatus] = useState<PracticeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [latestAssessment, setLatestAssessment] =
    useState<PronunciationAssessmentRecord | null>(null);

  useEffect(() => {
    return () => {
      void recorderRef.current?.cleanup().catch(() => undefined);
      recorderRef.current = null;
    };
  }, []);

  async function startRecording() {
    setError(null);

    try {
      recorderRef.current = await startWavRecording();
      setStatus("recording");
    } catch (recordingError) {
      recorderRef.current = null;
      setStatus("error");
      setError(getRecorderErrorMessage(recordingError));
    }
  }

  async function stopAndAssess() {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }

    recorderRef.current = null;
    setStatus("submitting");
    setError(null);

    try {
      const recording = await recorder.stop();
      const formData = new FormData();
      formData.set("referenceText", sentence.text);
      formData.set("locale", locale);
      formData.set("sourceLabel", sourceLabel);
      formData.set("audio", recording.blob, `sentence-${sentence.id}.wav`);

      const response = await fetch("/api/assessment/pronunciation", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json()) as {
        assessment?: PronunciationAssessmentRecord;
        message?: string;
      };

      if (!response.ok || !payload.assessment) {
        setStatus("error");
        setError(getAssessmentErrorMessage(payload));
        return;
      }

      const assessment: PronunciationAssessmentRecord = {
        ...payload.assessment,
        endMs: sentence.endMs,
        referenceText: sentence.text,
        sentenceId: sentence.id,
        sourceId,
        sourceLabel,
        startMs: sentence.startMs,
      };

      setLatestAssessment(assessment);
      setStatus("complete");
      onAssessmentSaved?.(assessment);
    } catch {
      setStatus("error");
      setError("发音评估失败，请稍后重试。");
    }
  }

  return (
    <div className="sentence-practice" data-status={status}>
      <div className="sentence-practice__actions">
        {status === "recording" ? (
          <button
            className="sentence-practice__button sentence-practice__button--primary"
            onClick={() => void stopAndAssess()}
            type="button"
          >
            结束并评分
          </button>
        ) : (
          <button
            className="sentence-practice__button sentence-practice__button--primary"
            disabled={status === "submitting"}
            onClick={() => void startRecording()}
            type="button"
          >
            录这句
          </button>
        )}
        <span className="sentence-practice__status">
          {status === "recording"
            ? "正在录音"
            : status === "submitting"
              ? "正在评分"
              : latestAssessment
                ? "最近一次"
                : "逐句跟读"}
        </span>
      </div>

      {latestAssessment ? (
        <div className="sentence-practice__result" aria-label={`句子评分 ${sentence.id}`}>
          <span className="sentence-practice__score">
            {Math.round(latestAssessment.overallScore)}
          </span>
          <span>{getScoreTone(latestAssessment.overallScore)}</span>
          <small>{`准 ${Math.round(latestAssessment.accuracyScore)} · 流 ${Math.round(latestAssessment.fluencyScore)}`}</small>
        </div>
      ) : null}

      {error ? <p className="sentence-practice__error">{error}</p> : null}
    </div>
  );
}
