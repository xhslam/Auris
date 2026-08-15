"use client";

import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { startWavRecording, type ActiveWavRecorder } from "@/features/assessment/wav-recorder";
import type { PronunciationAssessmentRecord } from "@/features/assessment/pronunciation-assessment.types";
import {
  listLocalRecordings,
  saveLocalRecording,
} from "@/features/recordings/local-recording-store";
import {
  READING_WORD_CHAINS,
  type ReadingParagraph,
} from "@/features/reading/reading-fixtures";
import { tokenizeParagraph } from "@/features/reading/reading-text";
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
type TutorMode = "analysis" | "simplify" | "similar" | "summary";

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
const FINAL_RECORDING_ID = "shadowing-studio-final-recording";
const TUTOR_LABELS: Record<TutorMode, string> = {
  analysis: "句子分析",
  simplify: "简化结构",
  similar: "相似表达",
  summary: "全文总结",
};

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
    Math.max(1, tokenizeParagraph(paragraph.english).filter((token) => /[A-Za-z]/.test(token)).length),
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

function createTutorAnswer(mode: TutorMode, segment: ShadowSegment, paragraphs: ReadingParagraph[]) {
  const sentence = segment.paragraph.english;
  if (mode === "analysis") {
    return {
      title: "结构拆解",
      lines: [
        `主干：${sentence.split(/[,;:]/)[0]?.trim() ?? sentence}`,
        `意群：${sentence.split(/(?<=[,;:])\s+/).join("  /  ")}`,
        `跟读建议：先贴住重音与停顿，再补齐弱读词；本句建议分 ${Math.max(2, Math.ceil(segment.words.length / 8))} 个气群。`,
      ],
    };
  }
  if (mode === "simplify") {
    const clauses = sentence.split(/[,;:]/).map((item) => item.trim()).filter(Boolean);
    return { title: "简化结构", lines: clauses.map((item, index) => `${index + 1}. ${item}`) };
  }
  if (mode === "similar") {
    return {
      title: "迁移表达",
      lines: [
        `保持语气：${sentence.replace(/\bthe\b/gi, "a").replace(/\byou\b/gi, "we")}`,
        "复述时优先保留句型骨架，再替换名词与动词。",
        "挑战：用同样节奏说一个与你学习经历有关的句子。",
      ],
    };
  }
  return {
    title: "全文总结",
    lines: [
      paragraphs.map((paragraph) => paragraph.english).join(" "),
      `共 ${paragraphs.length} 段。建议先完整听一遍，再开启单句循环逐段跟读，最后关闭文本做一次复述。`,
    ],
  };
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
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [isRecordingPlaying, setIsRecordingPlaying] = useState(false);
  const [assessment, setAssessment] = useState<PronunciationAssessmentRecord | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingNotice, setRecordingNotice] = useState<string | null>(null);
  const [tutorMode, setTutorMode] = useState<TutorMode | null>(null);
  const [tutorSubmitted, setTutorSubmitted] = useState(false);

  const segments = useMemo(() => buildSegments(paragraphs, duration), [duration, paragraphs]);
  const activeIndex = useMemo(() => {
    const found = segments.findIndex(
      (segment, index) => currentTime >= segment.start && (currentTime < segment.end || index === segments.length - 1),
    );
    return found >= 0 ? found : 0;
  }, [currentTime, segments]);
  const selectedSegment = segments[selectedIndex] ?? segments[0] ?? null;
  const tutorAnswer = tutorMode && selectedSegment
    ? createTutorAnswer(tutorMode, selectedSegment, paragraphs)
    : null;

  const replaceRecordingUrl = useCallback((nextUrl: string | null) => {
    const previousUrl = recordingUrlRef.current;
    if (previousUrl && previousUrl !== nextUrl) URL.revokeObjectURL(previousUrl);
    recordingUrlRef.current = nextUrl;
    setRecordingUrl(nextUrl);
  }, []);

  useEffect(() => {
    if (!isLooping) setSelectedIndex(activeIndex);
  }, [activeIndex, isLooping]);

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
    return () => {
      void recorderRef.current?.cleanup().catch(() => undefined);
      recordingAudioRef.current?.pause();
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const expectedTitle = `${sourceId}:${selectedSegment?.id ?? ""}`;

    async function loadFinalRecording() {
      try {
        const finalRecording = (await listLocalRecordings()).find(
          (item) => item.id === FINAL_RECORDING_ID && item.title === expectedTitle,
        );
        if (cancelled) return;
        recordingAudioRef.current?.pause();
        recordingAudioRef.current = null;
        replaceRecordingUrl(finalRecording ? URL.createObjectURL(finalRecording.blob) : null);
        setRecordingSeconds(finalRecording ? finalRecording.durationMs / 1000 : 0);
        setRecordingState(finalRecording ? "ready" : "idle");
        setAssessment(null);
        setRecordingError(null);
        setRecordingNotice(finalRecording ? "已载入最后一次完成的录音。" : null);
      } catch {
        if (!cancelled) setRecordingNotice("最终录音存储暂时不可用，本次仍可在当前页面回放。");
      }
    }

    void loadFinalRecording();
    return () => {
      cancelled = true;
    };
  }, [replaceRecordingUrl, selectedSegment?.id, sourceId]);

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
    setAssessment(null);
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
    setRecordingState(recordingUrl ? "ready" : "idle");
    setRecordingSeconds(0);
  }

  async function stopAndAssess() {
    const recorder = recorderRef.current;
    if (!recorder || !selectedSegment) return;
    recorderRef.current = null;
    setRecordingState("assessing");
    setRecordingError(null);
    try {
      const recording = await recorder.stop();
      const nextUrl = URL.createObjectURL(recording.blob);
      recordingAudioRef.current?.pause();
      recordingAudioRef.current = null;
      replaceRecordingUrl(nextUrl);
      setRecordingSeconds(recording.durationMs / 1000);
      setRecordingState("ready");

      try {
        await saveLocalRecording({
          blob: recording.blob,
          createdAt: new Date().toISOString(),
          durationMs: recording.durationMs,
          id: FINAL_RECORDING_ID,
          mimeType: recording.mimeType,
          title: `${sourceId}:${selectedSegment.id}`,
        });
        setRecordingNotice("已保存为唯一最终版；下一次完成录音会直接覆盖它。 ");
      } catch {
        setRecordingNotice("最终版只保留在当前页面，关闭页面后不会保留。 ");
      }

      const form = new FormData();
      form.set("referenceText", selectedSegment.paragraph.english);
      form.set("locale", "en-US");
      form.set("sourceLabel", sourceLabel);
      form.set("audio", recording.blob, `shadow-${selectedSegment.id}.wav`);
      const response = await fetch("/api/assessment/pronunciation", { body: form, method: "POST" });
      const payload = (await response.json()) as {
        assessment?: PronunciationAssessmentRecord;
        code?: string;
        message?: string;
      };
      if (!response.ok || !payload.assessment) {
        if (payload.code === "AZURE_PRONUNCIATION_ASSESSMENT_NOT_CONFIGURED") {
          setRecordingNotice("最终录音已保存；配置 Azure Speech 后可启用发音评分。 ");
        } else {
          setRecordingError(payload.message ?? "录音已保留，但本次评分不可用。");
        }
        return;
      }
      setAssessment({
        ...payload.assessment,
        endMs: Math.round(selectedSegment.end * 1000),
        referenceText: selectedSegment.paragraph.english,
        sentenceId: selectedSegment.id,
        sourceId,
        sourceLabel,
        startMs: Math.round(selectedSegment.start * 1000),
      });
    } catch {
      setRecordingState("error");
      setRecordingError("录音处理失败，请重新录制。 ");
    }
  }

  function toggleRecordingPlayback() {
    if (!recordingUrl) return;
    let audio = recordingAudioRef.current;
    if (!audio) {
      audio = new Audio(recordingUrl);
      audio.onended = () => setIsRecordingPlaying(false);
      audio.onpause = () => setIsRecordingPlaying(false);
      audio.onplay = () => setIsRecordingPlaying(true);
      recordingAudioRef.current = audio;
    }
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  if (!selectedSegment) {
    return <div className="enjoy-shadow enjoy-shadow--empty">导入台词后即可开始跟读。</div>;
  }

  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <section className="enjoy-shadow" aria-label="完整跟读练习台">
      <header className="enjoy-shadow__header">
        <div>
          <span className="enjoy-shadow__eyebrow">SHADOWING STUDIO</span>
          <h2>逐句跟读</h2>
        </div>
        <span className="enjoy-shadow__counter">{activeIndex + 1} / {segments.length}</span>
      </header>

      <div className="enjoy-shadow__transcript" style={{ "--shadow-font-scale": fontScale } as React.CSSProperties}>
        {segments.map((segment) => {
          const isActive = segment.order === activeIndex;
          const isSelected = segment.order === selectedIndex;
          const activeWord = isActive
            ? Math.min(segment.words.length - 1, Math.max(0, Math.floor(((currentTime - segment.start) / Math.max(0.01, segment.end - segment.start)) * segment.words.length)))
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
                <span>#{segment.order + 1}</span>
                <span>{formatClock(segment.start)}–{formatClock(segment.end)}</span>
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
              {displayIPA ? <p className="enjoy-shadow__ipa">{getSegmentPhonetics(segment)}</p> : null}
              {displayTranslation ? <p className="enjoy-shadow__translation">{segment.paragraph.translation}</p> : null}
            </div>
          );
        })}
      </div>

      <div className="enjoy-shadow__dock">
        <div className="enjoy-shadow__tutor-row">
          {(Object.keys(TUTOR_LABELS) as TutorMode[]).map((mode) => (
            <button key={mode} onClick={() => { setTutorMode(mode); setTutorSubmitted(false); }} type="button">
              {TUTOR_LABELS[mode]}
            </button>
          ))}
        </div>

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

        <div className="enjoy-shadow__recording-stage" data-state={recordingState}>
          {recordingState === "recording" ? (
            <>
              <button aria-label="取消录音" className="enjoy-shadow__record-cancel" onClick={() => void cancelRecording()} type="button">×</button>
              <button aria-label="停止录音并评分" className="enjoy-shadow__record enjoy-shadow__record--live" onClick={() => void stopAndAssess()} type="button"><span /></button>
              <strong>{formatClock(recordingSeconds)}</strong>
            </>
          ) : (
            <>
              {recordingUrl ? (
                <button aria-label={isRecordingPlaying ? "暂停我的录音" : "播放我的录音"} className="enjoy-shadow__record-play" onClick={toggleRecordingPlayback} type="button">
                  {isRecordingPlaying ? "Ⅱ" : "▶"}
                </button>
              ) : null}
              <button aria-label="开始跟读录音" className="enjoy-shadow__record" disabled={recordingState === "assessing"} onClick={() => void startRecording()} type="button">●</button>
              {recordingState === "assessing" ? <strong>处理中…</strong> : recordingUrl ? <strong>{formatClock(recordingSeconds)}</strong> : null}
            </>
          )}
        </div>

        {assessment ? (
          <div className="enjoy-shadow__score" role="status">
            <strong>{Math.round(assessment.overallScore)}</strong>
            <span>总分</span><span>准确 {Math.round(assessment.accuracyScore)}</span><span>流利 {Math.round(assessment.fluencyScore)}</span><span>完整 {Math.round(assessment.completenessScore)}</span>
          </div>
        ) : null}
        {recordingError ? <p className="enjoy-shadow__error" role="status">{recordingError}</p> : null}
        {recordingNotice ? <p className="enjoy-shadow__notice" role="status">{recordingNotice}</p> : null}

        <div className="enjoy-shadow__transport">
          <button aria-label="播放或暂停" onClick={onTogglePlay} type="button">{isPlaying ? "Ⅱ" : "▶"}<small>{isPlaying ? "暂停" : "播放"}</small></button>
          <button disabled={selectedIndex <= 0} onClick={() => selectSegment(selectedIndex - 1)} type="button">|◀<small>上一段</small></button>
          <button disabled={selectedIndex >= segments.length - 1} onClick={() => selectSegment(selectedIndex + 1)} type="button">▶|<small>下一段</small></button>
          <button className={isLooping ? "is-active" : ""} onClick={() => { setIsLooping((value) => !value); setSelectedIndex(activeIndex); }} type="button">↻<small>单句</small></button>
          <div className="enjoy-shadow__popover-anchor">
            <button className={playbackRate !== 1 ? "is-active" : ""} onClick={() => setIsRateOpen((value) => !value)} type="button">{playbackRate.toFixed(1)}x<small>倍速</small></button>
            {isRateOpen ? <div className="enjoy-shadow__rate-popover"><input aria-label="播放倍速" max={2} min={0.5} onChange={(event) => setPlaybackRate(Number(event.target.value))} step={0.1} type="range" value={playbackRate} /><span>{playbackRate.toFixed(1)}x</span></div> : null}
          </div>
          <div className="enjoy-shadow__popover-anchor">
            <button onClick={() => setIsSettingsOpen((value) => !value)} type="button">⚙<small>设置</small></button>
            {isSettingsOpen ? <div className="enjoy-shadow__settings-popover">
              <label><input checked={displayIPA} onChange={(event) => setDisplayIPA(event.target.checked)} type="checkbox" />显示音标</label>
              <label><input checked={displayTranslation} onChange={(event) => setDisplayTranslation(event.target.checked)} type="checkbox" />显示翻译</label>
            </div> : null}
          </div>
        </div>
      </div>

      {tutorMode && tutorAnswer ? (
        <div className="enjoy-shadow__modal-backdrop" onMouseDown={() => setTutorMode(null)}>
          <section aria-label="AI 导师" className="enjoy-shadow__modal" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span>AI TUTOR</span><h3>{TUTOR_LABELS[tutorMode]}</h3></div><button aria-label="关闭 AI 导师" onClick={() => setTutorMode(null)} type="button">×</button></header>
            <textarea aria-label="AI 导师提示词" defaultValue={`${TUTOR_LABELS[tutorMode]}：${tutorMode === "summary" ? paragraphs.map((item) => item.english).join(" ") : selectedSegment.paragraph.english}`} />
            {tutorSubmitted ? <div className="enjoy-shadow__tutor-answer"><strong>{tutorAnswer.title}</strong>{tutorAnswer.lines.map((line, index) => <p key={index}>{line}</p>)}</div> : null}
            <button className="enjoy-shadow__tutor-submit" onClick={() => setTutorSubmitted(true)} type="button">生成学习卡</button>
          </section>
        </div>
      ) : null}
    </section>
  );
}
