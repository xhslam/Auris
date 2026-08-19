"use client";

import {
  CaretDown,
  CaretUp,
  Gear,
  Microphone,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Stop,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import {
  evaluatePronunciationAttempt,
} from "@/features/assessment/pronunciation-assessment-client";
import { startWavRecording, type ActiveWavRecorder } from "@/features/assessment/wav-recorder";
import {
  getBrowserPronunciationAssessmentStorage,
} from "@/features/assessment/local-pronunciation-assessment-store";
import type { PronunciationAssessmentRecord } from "@/features/assessment/pronunciation-assessment.types";
import {
  deleteLocalRecording,
  listLocalRecordings,
  saveLocalRecording,
  type LocalRecordingRecord,
  type PronunciationAttemptStatus,
} from "@/features/recordings/local-recording-store";
import {
  READING_WORD_CHAINS,
  type ReadingParagraph,
} from "@/features/reading/reading-fixtures";
import { tokenizeParagraph } from "@/features/reading/reading-text";
import { createDesktopPronunciationAssessmentStorage } from "@/platform/desktop/assessment-adapter";
import { getDesktopBridge } from "@/platform/desktop/desktop-runtime";
import "@/components/player/enjoy-shadowing-studio.css";

type ShadowSegment = {
  end: number;
  id: string;
  order: number;
  paragraph: ReadingParagraph;
  start: number;
  words: string[];
};

type RecordingState = "idle" | "recording" | "assessing" | "ready" | "error";

const MIN_RECORDING_DURATION_MS = 300;

type EnjoyShadowingStudioProps = {
  currentTime: number;
  duration: number;
  fontScale: number;
  isPlaying: boolean;
  mediaRef: RefObject<HTMLVideoElement | null>;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onWordContextMenu?: (
    event: ReactMouseEvent<HTMLButtonElement>,
    paragraph: ReadingParagraph,
    word: string,
  ) => void;
  paragraphs: ReadingParagraph[];
  showTranslation: boolean;
  sourceId: string;
  sourceLabel: string;
};

const DISPLAY_IPA_KEY = "auris.shadowing.display-ipa";
const DISPLAY_TRANSLATION_KEY = "auris.shadowing.display-translation";
const PLAYBACK_RATE_KEY = "auris.shadowing.playback-rate";

function formatClock(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const total = Math.floor(safe);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function readBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === "true";
}

function readRate() {
  if (typeof window === "undefined") return 1;
  const value = Number(window.localStorage.getItem(PLAYBACK_RATE_KEY));
  return Number.isFinite(value) && value >= 0.5 && value <= 2 ? value : 1;
}

function buildSegments(paragraphs: ReadingParagraph[], duration: number): ShadowSegment[] {
  const weights = paragraphs.map((paragraph) =>
    Math.max(
      1,
      tokenizeParagraph(paragraph.english).filter((token) => /[A-Za-z]/.test(token)).length,
    ),
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const usableDuration = duration > 0 ? duration : Math.max(12, paragraphs.length * 8);
  let cursor = 0;

  return paragraphs.map((paragraph, index) => {
    const start = cursor;
    const slice = index === paragraphs.length - 1
      ? usableDuration - cursor
      : usableDuration * ((weights[index] ?? 1) / totalWeight);
    cursor += slice;
    return {
      end: cursor,
      id: paragraph.id,
      order: index,
      paragraph,
      start,
      words: tokenizeParagraph(paragraph.english).filter((token) => token.trim().length > 0),
    };
  });
}

function getRecorderMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("NotAllowedError") || message.includes("Permission denied")) {
    return "麦克风权限被拒绝，请在系统设置中允许 Auris 录音。";
  }
  if (message === "MICROPHONE_NOT_SUPPORTED") return "当前环境不支持麦克风录音。";
  if (message === "AUDIO_CONTEXT_NOT_SUPPORTED") return "当前环境不支持音频录制。";
  return "录音启动失败，请稍后重试。";
}

function getSegmentPhonetics(segment: ShadowSegment) {
  const phonetics = segment.words.flatMap((word) => {
    const key = word.toLowerCase().replace(/[^a-z'-]/g, "");
    const phonetic = READING_WORD_CHAINS[key]?.phonetic;
    return phonetic ? [phonetic] : [];
  });
  return phonetics.length > 0 ? phonetics.join(" · ") : "音标数据将在字幕解析后显示";
}

function getPracticeKey(sourceId: string, segmentId: string) {
  return `${sourceId}:${segmentId}`;
}

function createRecordingId(sourceId: string, segmentId: string) {
  const uniquePart = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `shadowing:${sourceId}:${segmentId}:${uniquePart}`;
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(
    element?.isContentEditable
      || element?.closest("input, textarea, select, [contenteditable='true']"),
  );
}

function scoreTone(score: number) {
  if (score >= 85) return "strong";
  if (score >= 70) return "medium";
  return "weak";
}

function getAttemptLabel(recording: LocalRecordingRecord, index: number, total: number) {
  return `练习 ${recording.attemptIndex ?? total - index}`;
}

function setAudioCurrentTime(audio: HTMLAudioElement, time: number) {
  audio.currentTime = time;
}

export function EnjoyShadowingStudio({
  currentTime,
  duration,
  fontScale,
  isPlaying,
  mediaRef,
  onSeek,
  onTogglePlay,
  onWordContextMenu,
  paragraphs,
  showTranslation,
  sourceId,
  sourceLabel,
}: EnjoyShadowingStudioProps) {
  const recorderRef = useRef<ActiveWavRecorder | null>(null);
  const recordingAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  const autoplayRecordingRef = useRef(false);
  const assessmentAbortControllersRef = useRef(new Map<string, AbortController>());
  const recordingsRef = useRef<LocalRecordingRecord[]>([]);
  const selectedSegmentRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(readRate);
  const [isRateOpen, setIsRateOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [displayIPA, setDisplayIPA] = useState(() => readBoolean(DISPLAY_IPA_KEY, false));
  const [displayTranslation, setDisplayTranslation] = useState(() =>
    readBoolean(DISPLAY_TRANSLATION_KEY, showTranslation),
  );
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordings, setRecordings] = useState<LocalRecordingRecord[]>([]);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingPlaybackTime, setRecordingPlaybackTime] = useState(0);
  const [isRecordingPlaying, setIsRecordingPlaying] = useState(false);
  const [assessments, setAssessments] = useState<PronunciationAssessmentRecord[]>([]);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingNotice, setRecordingNotice] = useState<string | null>(null);
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(true);
  const [isAssessmentOpen, setIsAssessmentOpen] = useState(false);
  const [selectedWordAssessment, setSelectedWordAssessment] = useState<{
    accuracyScore: number;
    errorType: string;
    word: string;
  } | null>(null);

  const segments = useMemo(() => buildSegments(paragraphs, duration), [duration, paragraphs]);
  const activeIndex = useMemo(() => {
    const found = segments.findIndex(
      (segment, index) =>
        currentTime >= segment.start
        && (currentTime < segment.end || index === segments.length - 1),
    );
    return found >= 0 ? found : 0;
  }, [currentTime, segments]);
  const selectedSegment = segments[selectedIndex] ?? segments[0] ?? null;
  const selectedRecording = recordings.find((item) => item.id === selectedRecordingId) ?? null;
  const selectedRecordingIndex = selectedRecording
    ? recordings.findIndex((item) => item.id === selectedRecording.id)
    : -1;
  const selectedAssessment = selectedRecording?.assessment
    ?? (selectedRecording
      ? assessments.find((item) => item.id === selectedRecording.id)
        ?? (selectedRecordingIndex === 0 ? assessments[0] : null)
      : null);
  const selectedAssessmentStatus: PronunciationAttemptStatus = selectedRecording?.assessmentStatus
    ?? (selectedAssessment ? "success" : "idle");
  const bestAttemptId = useMemo(() => recordings.reduce<string | null>((bestId, attempt) => {
    if (!attempt.assessment || !bestId) return attempt.assessment ? attempt.id : bestId;
    const best = recordings.find((item) => item.id === bestId);
    return (best?.assessment?.overallScore ?? -1) >= attempt.assessment.overallScore
      ? bestId
      : attempt.id;
  }, null), [recordings]);

  const replaceRecordingUrl = useCallback((nextUrl: string | null) => {
    const previousUrl = recordingUrlRef.current;
    if (previousUrl && previousUrl !== nextUrl) URL.revokeObjectURL(previousUrl);
    recordingUrlRef.current = nextUrl;
    setRecordingUrl(nextUrl);
  }, []);

  const createRecordingAudio = useCallback((url: string) => {
    const audio = new Audio(url);
    audio.onended = () => {
      setIsRecordingPlaying(false);
      setRecordingPlaybackTime(0);
    };
    audio.onpause = () => setIsRecordingPlaying(false);
    audio.onplay = () => setIsRecordingPlaying(true);
    audio.ontimeupdate = () => setRecordingPlaybackTime(audio.currentTime);
    recordingAudioRef.current = audio;
    return audio;
  }, []);

  useEffect(() => {
    recordingsRef.current = recordings;
  }, [recordings]);

  useEffect(() => {
    if (!isLooping) setSelectedIndex(activeIndex);
  }, [activeIndex, isLooping]);

  useEffect(() => {
    selectedSegmentRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [selectedIndex]);

  useEffect(() => {
    const media = mediaRef.current;
    if (media) media.playbackRate = playbackRate;
    window.localStorage.setItem(PLAYBACK_RATE_KEY, String(playbackRate));
  }, [mediaRef, playbackRate]);

  useEffect(() => {
    window.localStorage.setItem(DISPLAY_IPA_KEY, String(displayIPA));
  }, [displayIPA]);

  useEffect(() => {
    window.localStorage.setItem(DISPLAY_TRANSLATION_KEY, String(displayTranslation));
  }, [displayTranslation]);

  useEffect(() => {
    setDisplayTranslation(showTranslation);
  }, [showTranslation]);

  useEffect(() => {
    if (!isLooping || !selectedSegment || !isPlaying) return;
    if (currentTime >= selectedSegment.end || currentTime < selectedSegment.start) {
      onSeek(selectedSegment.start);
      void mediaRef.current?.play();
    }
  }, [currentTime, isLooping, isPlaying, mediaRef, onSeek, selectedSegment]);

  useEffect(() => {
    if (recordingState !== "recording") return;
    const startedAt = recorderRef.current?.startedAt ?? Date.now();
    const timer = window.setInterval(() => {
      setRecordingSeconds(Math.max(0, (Date.now() - startedAt) / 1000));
    }, 100);
    return () => window.clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    let cancelled = false;
    const practiceKey = selectedSegment
      ? getPracticeKey(sourceId, selectedSegment.id)
      : null;

    setRecordings([]);
    setAssessments([]);
    setSelectedRecordingId(null);
    setRecordingError(null);
    setRecordingNotice(null);
    setRecordingState("idle");

    async function loadPracticeHistory() {
      if (!practiceKey || !selectedSegment) return;

      try {
        const nextRecordings = (await listLocalRecordings())
          .filter((item) => item.title === practiceKey)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        if (!cancelled) {
          setRecordings(nextRecordings);
          setSelectedRecordingId(nextRecordings[0]?.id ?? null);
          setRecordingState(nextRecordings.length > 0 ? "ready" : "idle");
        }
      } catch {
        if (!cancelled) {
          setRecordingNotice("本地录音历史暂时不可用，本次录音仍可在当前页面回放。");
        }
      }

      try {
        const desktopStorage = createDesktopPronunciationAssessmentStorage(getDesktopBridge());
        const storage = desktopStorage ?? getBrowserPronunciationAssessmentStorage();
        const nextAssessments = storage ? await storage.listAssessments() : [];
        if (!cancelled) {
          setAssessments(
            nextAssessments
              .filter(
                (item) => item.sourceId === sourceId && item.sentenceId === selectedSegment.id,
              )
              .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
          );
        }
      } catch {
        if (!cancelled) setAssessments([]);
      }
    }

    void loadPracticeHistory();
    return () => {
      cancelled = true;
    };
  }, [selectedSegment, sourceId]);

  useEffect(() => {
    setSelectedWordAssessment(null);
  }, [selectedRecordingId]);

  useEffect(() => {
    recordingAudioRef.current?.pause();
    recordingAudioRef.current = null;
    setIsRecordingPlaying(false);
    setRecordingPlaybackTime(0);

    if (!selectedRecording) {
      replaceRecordingUrl(null);
      setRecordingSeconds(0);
      return;
    }

    const nextUrl = URL.createObjectURL(selectedRecording.blob);
    replaceRecordingUrl(nextUrl);
    setRecordingSeconds(selectedRecording.durationMs / 1000);

    if (autoplayRecordingRef.current) {
      autoplayRecordingRef.current = false;
      const audio = createRecordingAudio(nextUrl);
      void audio.play().catch(() => undefined);
    }
  }, [createRecordingAudio, replaceRecordingUrl, selectedRecording]);

  useEffect(() => {
    if (!isAssessmentOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsAssessmentOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isAssessmentOpen]);

  useEffect(() => {
    const assessmentControllers = assessmentAbortControllersRef.current;
    return () => {
      void recorderRef.current?.cleanup().catch(() => undefined);
      assessmentControllers.forEach((controller) => controller.abort());
      assessmentControllers.clear();
      recordingAudioRef.current?.pause();
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    };
  }, []);

  function selectSegment(index: number, autoplay = true) {
    const segment = segments[index];
    if (!segment) return;
    setSelectedIndex(index);
    onSeek(segment.start + 0.01);
    if (autoplay && mediaRef.current?.paused) onTogglePlay();
  }

  function seekWord(segment: ShadowSegment, wordIndex: number) {
    const fraction = wordIndex / Math.max(1, segment.words.length);
    const time = segment.start + (segment.end - segment.start) * fraction;
    setSelectedIndex(segment.order);
    onSeek(time);
    if (mediaRef.current?.paused) onTogglePlay();
  }

  async function startRecording() {
    setRecordingError(null);
    setRecordingNotice(null);
    recordingAudioRef.current?.pause();
    setIsRecordingPlaying(false);
    try {
      mediaRef.current?.pause();
      recorderRef.current = await startWavRecording();
      setRecordingSeconds(0);
      setRecordingState("recording");
    } catch (error) {
      setRecordingState("error");
      setRecordingError(getRecorderMessage(error));
    }
  }

  async function cancelRecording() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) await recorder.cleanup().catch(() => undefined);
    setRecordingState(recordings.length > 0 ? "ready" : "idle");
    setRecordingSeconds(selectedRecording ? selectedRecording.durationMs / 1000 : 0);
  }

  function getAssessmentStorage() {
    const desktopStorage = createDesktopPronunciationAssessmentStorage(getDesktopBridge());
    return desktopStorage ?? getBrowserPronunciationAssessmentStorage();
  }

  async function persistAttempt(nextAttempt: LocalRecordingRecord) {
    try {
      await saveLocalRecording(nextAttempt);
      return true;
    } catch {
      return false;
    }
  }

  async function evaluateAttempt(recordingRecord: LocalRecordingRecord, segment: ShadowSegment) {
    const controller = new AbortController();
    assessmentAbortControllersRef.current.set(recordingRecord.id, controller);
    const updateAttempt = (patch: Partial<LocalRecordingRecord>) => {
      const next = recordingsRef.current.map((item) =>
        item.id === recordingRecord.id ? { ...item, ...patch } : item,
      );
      recordingsRef.current = next;
      setRecordings(next);
    };

    try {
      const { payload, success } = await evaluatePronunciationAttempt({
        audio: recordingRecord.blob,
        locale: "en-US",
        referenceText: segment.paragraph.english,
        signal: controller.signal,
        sourceLabel,
      });

      if (!success || !payload.assessment) {
        const error = payload.code === "AZURE_PRONUNCIATION_ASSESSMENT_NOT_CONFIGURED"
          ? "发音评估服务尚未配置。录音已保留，可在配置后重新评估。"
          : payload.message ?? "录音已保留，但本次发音评估失败。";
        throw new Error(error);
      }

      if (!recordingsRef.current.some((item) => item.id === recordingRecord.id)) {
        return;
      }

      const assessment: PronunciationAssessmentRecord = {
        ...payload.assessment,
        endMs: Math.round(segment.end * 1000),
        id: recordingRecord.id,
        referenceText: segment.paragraph.english,
        sentenceId: segment.id,
        sourceId,
        sourceLabel,
        startMs: Math.round(segment.start * 1000),
      };
      const completedAttempt: LocalRecordingRecord = {
        ...recordingRecord,
        assessment,
        assessmentError: undefined,
        assessmentStatus: "success",
      };

      updateAttempt(completedAttempt);
      setAssessments((current) => [
        assessment,
        ...current.filter((item) => item.id !== assessment.id),
      ]);
      await persistAttempt(completedAttempt);
      try {
        await getAssessmentStorage()?.saveAssessment(assessment);
      } catch {
        setRecordingNotice("评分已生成，但旧版评分历史暂时无法同步。");
      }
      setRecordingNotice("发音评估已完成，点击分数查看逐词详情。");
    } catch (error) {
      if (controller.signal.aborted || !recordingsRef.current.some((item) => item.id === recordingRecord.id)) {
        return;
      }
      const failedAttempt: LocalRecordingRecord = {
        ...recordingRecord,
        assessmentError: error instanceof Error ? error.message : "录音已保留，但本次发音评估失败。",
        assessmentStatus: "failed",
      };
      updateAttempt(failedAttempt);
      await persistAttempt(failedAttempt);
    } finally {
      assessmentAbortControllersRef.current.delete(recordingRecord.id);
    }
  }

  async function stopAndAssess() {
    const recorder = recorderRef.current;
    const segment = selectedSegment;
    if (!recorder || !segment) return;
    recorderRef.current = null;
    setRecordingError(null);

    try {
      const recording = await recorder.stop();
      if (recording.blob.size === 0 || recording.durationMs < MIN_RECORDING_DURATION_MS) {
        setRecordingState(recordingsRef.current.length > 0 ? "ready" : "idle");
        setRecordingError("录音时间太短，请重新跟读。");
        return;
      }

      const sameSentenceAttempts = recordingsRef.current.filter(
        (item) => item.title === getPracticeKey(sourceId, segment.id),
      );
      const nextAttemptIndex = sameSentenceAttempts.reduce(
        (largest, item, index) => Math.max(largest, item.attemptIndex ?? sameSentenceAttempts.length - index),
        0,
      ) + 1;
      const recordingRecord: LocalRecordingRecord = {
        assessmentStatus: "pending",
        attemptIndex: nextAttemptIndex,
        blob: recording.blob,
        createdAt: new Date().toISOString(),
        durationMs: recording.durationMs,
        id: createRecordingId(sourceId, segment.id),
        mimeType: recording.mimeType,
        sentenceId: segment.id,
        sourceId,
        title: getPracticeKey(sourceId, segment.id),
      };
      const recordingWasSaved = await persistAttempt(recordingRecord);

      autoplayRecordingRef.current = true;
      recordingsRef.current = [recordingRecord, ...recordingsRef.current];
      setRecordings(recordingsRef.current);
      setSelectedRecordingId(recordingRecord.id);
      setRecordingSeconds(recording.durationMs / 1000);
      setRecordingState("ready");
      setRecordingNotice(
        recordingWasSaved
          ? "录音已保存在本机，正在分析发音…"
          : "录音仅保留在当前页面，正在分析发音。",
      );
      void evaluateAttempt(recordingRecord, segment);
    } catch {
      setRecordingState(recordingsRef.current.length > 0 ? "ready" : "error");
      setRecordingError("录音处理失败，请重新录制。");
    }
  }

  async function deleteAttempt(recordingId: string) {
    const target = recordingsRef.current.find((item) => item.id === recordingId);
    if (!target) return;
    if (!window.confirm("删除这次练习？删除后该录音和对应发音评分将被移除。")) return;

    assessmentAbortControllersRef.current.get(recordingId)?.abort();
    assessmentAbortControllersRef.current.delete(recordingId);
    try {
      await deleteLocalRecording(recordingId);
      await getAssessmentStorage()?.deleteAssessment(recordingId);
    } catch {
      setRecordingError("删除录音失败，请稍后重试。");
      return;
    }

    setAssessments((current) => current.filter((item) => item.id !== recordingId));
    const next = recordingsRef.current.filter((item) => item.id !== recordingId);
    recordingsRef.current = next;
    setRecordings(next);
    if (selectedRecordingId === recordingId) {
      setSelectedRecordingId(next[0]?.id ?? null);
    }
    setRecordingNotice("录音和对应发音评分已删除。");
  }

  async function deleteAllAttempts() {
    if (!recordingsRef.current.length) return;
    if (!window.confirm(`将删除 ${recordingsRef.current.length} 条录音以及对应的发音评估结果。此操作无法恢复。`)) return;
    const ids = recordingsRef.current.map((item) => item.id);
    await Promise.all(ids.map((id) => {
      assessmentAbortControllersRef.current.get(id)?.abort();
      return Promise.allSettled([
        deleteLocalRecording(id),
        getAssessmentStorage()?.deleteAssessment(id) ?? Promise.resolve(),
      ]);
    }));
    setAssessments([]);
    recordingsRef.current = [];
    setRecordings([]);
    setSelectedRecordingId(null);
    setRecordingNotice("本句的练习记录已全部删除。");
  }

  async function retryAssessment() {
    if (!selectedRecording || !selectedSegment || selectedAssessmentStatus === "pending") return;
    const pendingAttempt: LocalRecordingRecord = {
      ...selectedRecording,
      assessmentError: undefined,
      assessmentStatus: "pending",
    };
    recordingsRef.current = recordingsRef.current.map((item) =>
      item.id === pendingAttempt.id ? pendingAttempt : item,
    );
    setRecordings(recordingsRef.current);
    await persistAttempt(pendingAttempt);
    setRecordingNotice("正在分析发音…");
    void evaluateAttempt(pendingAttempt, selectedSegment);
  }

  function toggleRecordingPlayback() {
    if (!recordingUrl) return;
    const audio = recordingAudioRef.current ?? createRecordingAudio(recordingUrl);
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }

  function seekRecording(time: number) {
    if (!recordingUrl) return;
    const audio = recordingAudioRef.current ?? createRecordingAudio(recordingUrl);
    setAudioCurrentTime(audio, time);
    setRecordingPlaybackTime(time);
  }

  useEffect(() => {
    function handleRecordingShortcut(event: KeyboardEvent) {
      if (event.code !== "KeyR" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target) || isAssessmentOpen) return;
      event.preventDefault();
      if (recordingState === "recording") void stopAndAssess();
      else if (recordingState !== "assessing") void startRecording();
    }

    window.addEventListener("keydown", handleRecordingShortcut);
    return () => window.removeEventListener("keydown", handleRecordingShortcut);
  });

  if (!selectedSegment) {
    return <div className="enjoy-shadow enjoy-shadow--empty">导入台词后即可开始跟读。</div>;
  }

  const progress = duration > 0
    ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
    : 0;
  const recordingDuration = selectedRecording
    ? selectedRecording.durationMs / 1000
    : recordingSeconds;
  const attemptLabel = selectedRecording && selectedRecordingIndex >= 0
    ? getAttemptLabel(selectedRecording, selectedRecordingIndex, recordings.length)
    : `练习 ${recordings.length}`;

  return (
    <section className="enjoy-shadow" aria-label="完整跟读练习台">
      <div
        className="enjoy-shadow__transcript"
        style={{ "--shadow-font-scale": fontScale } as React.CSSProperties}
      >
        {segments.map((segment) => {
          const isActive = segment.order === activeIndex;
          const isSelected = segment.order === selectedIndex;
          const activeWord = isActive
            ? Math.min(
              segment.words.length - 1,
              Math.max(
                0,
                Math.floor(
                  ((currentTime - segment.start)
                    / Math.max(0.01, segment.end - segment.start))
                    * segment.words.length,
                ),
              ),
            )
            : -1;

          return (
            <div
              className="enjoy-shadow__segment"
              data-active={isActive ? "true" : "false"}
              data-selected={isSelected ? "true" : "false"}
              key={segment.id}
              onClick={() => selectSegment(segment.order)}
              ref={isSelected ? selectedSegmentRef : undefined}
            >
              <div className="enjoy-shadow__segment-meta">
                <span>{formatClock(segment.start)}</span>
                <span>{formatClock(segment.end - segment.start)}</span>
              </div>
              <p className="enjoy-shadow__sentence" aria-label={segment.paragraph.english}>
                {segment.words.map((word, wordIndex) => (
                  <button
                    className="enjoy-shadow__word"
                    data-active={wordIndex === activeWord ? "true" : "false"}
                    key={`${segment.id}-${wordIndex}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      seekWord(segment, wordIndex);
                    }}
                    onContextMenu={(event) => {
                      event.stopPropagation();
                      onWordContextMenu?.(event, segment.paragraph, word);
                    }}
                    type="button"
                  >
                    {word}
                  </button>
                ))}
              </p>
              {displayIPA ? (
                <p className="enjoy-shadow__ipa">{getSegmentPhonetics(segment)}</p>
              ) : null}
              {displayTranslation ? (
                <p className="enjoy-shadow__translation">{segment.paragraph.translation}</p>
              ) : null}

              {isSelected ? (
                <section
                  aria-label={`跟读练习 ${segment.id}`}
                  className="enjoy-shadow__practice"
                  onClick={(event) => event.stopPropagation()}
                >
                  <header className="enjoy-shadow__practice-header">
                    <div>
                      <Microphone aria-hidden="true" size={16} weight="bold" />
                      <strong>跟读练习</strong>
                    </div>
                    <span>{recordingState === "recording" ? formatClock(recordingSeconds) : formatClock(segment.end - segment.start)}</span>
                  </header>
                  <p className="enjoy-shadow__practice-hint">
                    朗读结束后自动回放本次录音。按 <kbd>R</kbd> 开始或停止。
                  </p>

                  {selectedRecording ? (
                    <div className="enjoy-shadow__analysis" data-status={selectedAssessmentStatus}>
                      <button
                        aria-expanded={isAnalysisExpanded}
                        className="enjoy-shadow__analysis-toggle"
                        onClick={() => setIsAnalysisExpanded((value) => !value)}
                        type="button"
                      >
                        <span>发音评估</span>
                        {isAnalysisExpanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
                      </button>
                      {isAnalysisExpanded ? (
                        <div className="enjoy-shadow__analysis-content">
                          {selectedAssessmentStatus === "pending" ? (
                            <div className="enjoy-shadow__assessment-status" role="status">正在分析发音…</div>
                          ) : selectedAssessment ? (
                            <>
                              <div className="enjoy-shadow__assessment-summary">
                                <div><strong>{Math.round(selectedAssessment.overallScore)}</strong><span>综合</span></div>
                                <dl>
                                  <div><dt>准确度</dt><dd>{Math.round(selectedAssessment.accuracyScore)}</dd></div>
                                  <div><dt>流利度</dt><dd>{Math.round(selectedAssessment.fluencyScore)}</dd></div>
                                  <div><dt>完整度</dt><dd>{Math.round(selectedAssessment.completenessScore)}</dd></div>
                                </dl>
                              </div>
                              {selectedAssessment.wordAssessments.length ? (
                                <div className="enjoy-shadow__assessment-words" aria-label="问题词">
                                  {selectedAssessment.wordAssessments
                                    .filter((word) => word.accuracyScore < 75 || word.errorType.toLowerCase() !== "none")
                                    .slice(0, 4)
                                    .map((word, index) => (
                                      <button
                                        data-tone={scoreTone(word.accuracyScore)}
                                        key={`${word.word}-${index}`}
                                        onClick={() => setSelectedWordAssessment(word)}
                                        type="button"
                                      >
                                        {word.word} <span>{Math.round(word.accuracyScore)}</span>
                                      </button>
                                    ))}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <div className="enjoy-shadow__assessment-status" data-tone={selectedAssessmentStatus} role="status">
                              <p>{selectedRecording.assessmentError ?? "发音评估暂不可用。配置语音服务后可以分析发音。"}</p>
                              <button onClick={() => void retryAssessment()} type="button">重新评估</button>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="enjoy-shadow__recording-list">
                    <span>已有录音</span>
                    {recordings.length > 0 ? (
                      <div className="enjoy-shadow__recording-list-actions">
                        <select
                          aria-label="选择练习录音"
                          onChange={(event) => setSelectedRecordingId(event.target.value)}
                          value={selectedRecordingId ?? ""}
                        >
                          {recordings.map((recording, index) => {
                            const assessment = recording.assessment ?? assessments.find((item) => item.id === recording.id);
                            const suffix = assessment ? ` · ${Math.round(assessment.overallScore)}` : "";
                            const best = recording.id === bestAttemptId ? " · 最佳" : "";
                            return (
                              <option key={recording.id} value={recording.id}>
                                {`${getAttemptLabel(recording, index, recordings.length)}${suffix}${best}`}
                              </option>
                            );
                          })}
                        </select>
                        <button
                          aria-label="删除当前练习录音"
                          className="enjoy-shadow__attempt-delete"
                          onClick={() => selectedRecording && void deleteAttempt(selectedRecording.id)}
                          type="button"
                        >
                          <Trash size={13} />
                        </button>
                      </div>
                    ) : (
                      <small>跟读结束后自动回放并进行发音分析。</small>
                    )}
                  </div>

                  <div className="enjoy-shadow__recording-player">
                    {recordingUrl ? (
                      <button
                        aria-label={isRecordingPlaying ? "暂停我的录音" : "播放我的录音"}
                        onClick={toggleRecordingPlayback}
                        type="button"
                      >
                        {isRecordingPlaying ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
                      </button>
                    ) : (
                      <span className="enjoy-shadow__recording-placeholder" />
                    )}
                    {selectedAssessment ? (
                      <button
                        aria-label="查看发音评估详情"
                        className="enjoy-shadow__score-chip"
                        data-tone={scoreTone(selectedAssessment.overallScore)}
                        onClick={() => setIsAssessmentOpen(true)}
                        type="button"
                      >
                        {Math.round(selectedAssessment.overallScore)}
                      </button>
                    ) : null}
                    <span>{formatClock(recordingPlaybackTime)}</span>
                    <input
                      aria-label="我的录音进度"
                      disabled={!recordingUrl}
                      max={Math.max(recordingDuration, 0.01)}
                      min={0}
                      onChange={(event) => seekRecording(Number(event.target.value))}
                      step={0.01}
                      type="range"
                      value={Math.min(recordingPlaybackTime, recordingDuration)}
                    />
                    <span>{formatClock(recordingDuration)}</span>
                  </div>

                  {recordings.length > 1 ? (
                    <div className="enjoy-shadow__attempt-bulk-action">
                      <button onClick={() => void deleteAllAttempts()} type="button">删除本句全部练习记录</button>
                    </div>
                  ) : null}

                  <div className="enjoy-shadow__recording-action">
                    {recordingState === "recording" ? (
                      <>
                        <button
                          aria-label="取消录音"
                          className="enjoy-shadow__record-cancel"
                          onClick={() => void cancelRecording()}
                          type="button"
                        >
                          <X size={14} />
                        </button>
                        <button
                          aria-label="停止录音并评分"
                          className="enjoy-shadow__record enjoy-shadow__record--live"
                          onClick={() => void stopAndAssess()}
                          type="button"
                        >
                          <Stop size={15} weight="fill" />
                        </button>
                        <strong>{formatClock(recordingSeconds)}</strong>
                      </>
                    ) : (
                      <button
                        aria-label="开始跟读录音"
                        className="enjoy-shadow__record"
                        disabled={recordingState === "assessing"}
                        onClick={() => void startRecording()}
                        type="button"
                      >
                        <Microphone size={17} weight="fill" />
                        <span>{recordingState === "assessing" ? "正在分析…" : selectedRecording ? "再练一次" : "开始跟读"}</span>
                      </button>
                    )}
                  </div>

                  {recordingError ? (
                    <p className="enjoy-shadow__error" role="status">{recordingError}</p>
                  ) : null}
                  {recordingNotice ? (
                    <p className="enjoy-shadow__notice" role="status">{recordingNotice}</p>
                  ) : null}
                </section>
              ) : null}
            </div>
          );
        })}
      </div>

      <footer className="enjoy-shadow__dock">
        <div className="enjoy-shadow__timeline-row">
          <span>{formatClock(currentTime)}</span>
          <input
            aria-label="跟读播放进度"
            max={Math.max(duration, 0)}
            min={0}
            onChange={(event) => onSeek(Number(event.target.value))}
            style={{ "--shadow-progress": `${progress}%` } as React.CSSProperties}
            type="range"
            value={Math.min(currentTime, duration || currentTime)}
          />
          <span>{formatClock(duration)}</span>
        </div>

        <div className="enjoy-shadow__transport">
          <button
            aria-label="上一句"
            disabled={selectedIndex <= 0}
            onClick={() => selectSegment(selectedIndex - 1)}
            type="button"
          >
            <SkipBack size={16} weight="fill" />
          </button>
          <button aria-label="播放或暂停" onClick={onTogglePlay} type="button">
            {isPlaying ? <Pause size={17} weight="fill" /> : <Play size={17} weight="fill" />}
          </button>
          <button
            aria-label="下一句"
            disabled={selectedIndex >= segments.length - 1}
            onClick={() => selectSegment(selectedIndex + 1)}
            type="button"
          >
            <SkipForward size={16} weight="fill" />
          </button>
          <button
            aria-label="单句循环"
            className={isLooping ? "is-active" : ""}
            onClick={() => {
              setIsLooping((value) => !value);
              setSelectedIndex(activeIndex);
            }}
            type="button"
          >
            <Repeat size={17} />
          </button>
          <div className="enjoy-shadow__popover-anchor">
            <button
              aria-label="调整播放倍速"
              className={playbackRate !== 1 ? "is-active" : ""}
              onClick={() => setIsRateOpen((value) => !value)}
              type="button"
            >
              {playbackRate.toFixed(1)}x
            </button>
            {isRateOpen ? (
              <div className="enjoy-shadow__rate-popover">
                <input
                  aria-label="播放倍速"
                  max={2}
                  min={0.5}
                  onChange={(event) => setPlaybackRate(Number(event.target.value))}
                  step={0.1}
                  type="range"
                  value={playbackRate}
                />
                <span>{playbackRate.toFixed(1)}x</span>
              </div>
            ) : null}
          </div>
          <div className="enjoy-shadow__popover-anchor">
            <button
              aria-label="跟读显示设置"
              onClick={() => setIsSettingsOpen((value) => !value)}
              type="button"
            >
              <Gear size={17} />
            </button>
            {isSettingsOpen ? (
              <div className="enjoy-shadow__settings-popover">
                <label>
                  <input
                    checked={displayIPA}
                    onChange={(event) => setDisplayIPA(event.target.checked)}
                    type="checkbox"
                  />
                  显示音标
                </label>
                <label>
                  <input
                    checked={displayTranslation}
                    onChange={(event) => setDisplayTranslation(event.target.checked)}
                    type="checkbox"
                  />
                  显示翻译
                </label>
              </div>
            ) : null}
          </div>
          <span className="enjoy-shadow__counter">
            {activeIndex + 1}/{segments.length}
          </span>
        </div>
      </footer>

      {isAssessmentOpen && selectedAssessment ? (
        <div
          className="enjoy-shadow__modal-backdrop"
          onMouseDown={() => setIsAssessmentOpen(false)}
        >
          <section
            aria-label="发音评估详情"
            aria-modal="true"
            className="enjoy-shadow__modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div>
                <h3>发音评估</h3>
                <p>{`${attemptLabel} · 详细发音评估结果`}</p>
              </div>
              <button
                aria-label="关闭发音评估"
                onClick={() => setIsAssessmentOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </header>

            <div className="enjoy-shadow__score-summary">
              <div
                className="enjoy-shadow__score-ring"
                style={{ "--score": selectedAssessment.overallScore } as React.CSSProperties}
              >
                <span>总分</span>
                <strong>{Math.round(selectedAssessment.overallScore)}</strong>
              </div>
              <div className="enjoy-shadow__score-bars">
                {[
                  ["准确度", selectedAssessment.accuracyScore],
                  ["完整度", selectedAssessment.completenessScore],
                  ["流畅度", selectedAssessment.fluencyScore],
                ].map(([label, rawScore]) => {
                  const score = Number(rawScore);
                  return (
                    <div key={String(label)}>
                      <span>{label}</span>
                      <i><b style={{ width: `${score}%` }} /></i>
                      <strong>{Math.round(score)}</strong>
                    </div>
                  );
                })}
                <div>
                  <span>韵律</span>
                  <i><b className="is-unavailable" /></i>
                  <strong>—</strong>
                </div>
              </div>
            </div>

            <div className="enjoy-shadow__word-results">
              <span>发音分析</span>
              <div>
                {selectedAssessment.wordAssessments.map((word, index) => (
                  <button
                    data-tone={scoreTone(word.accuracyScore)}
                    key={`${word.word}-${index}`}
                    onClick={() => setSelectedWordAssessment(word)}
                    title={`准确度 ${Math.round(word.accuracyScore)}`}
                    type="button"
                  >
                    {word.word}
                  </button>
                ))}
              </div>
            </div>
            {selectedWordAssessment ? (
              <section className="enjoy-shadow__word-detail" role="status">
                <strong>{selectedWordAssessment.word}</strong>
                <span>准确度 {Math.round(selectedWordAssessment.accuracyScore)}</span>
                {selectedWordAssessment.errorType.toLowerCase() !== "none" ? (
                  <small>{selectedWordAssessment.errorType}</small>
                ) : null}
                <p>建议再次练习这个单词。</p>
              </section>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
