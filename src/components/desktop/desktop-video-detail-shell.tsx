"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import { getDesktopVideoLibraryBridge } from "@/platform/desktop/video-library-adapter";
import {
  READING_SOURCES,
  type ReadingParagraph,
  type ReadingSource,
} from "@/features/reading/reading-fixtures";
import type { DictionaryEntry } from "@/features/dictionary/dictionary.types";
import { dictionaryEntryToWordCardEntry } from "@/features/dictionary/word-card-entry";
import {
  getLookupKey,
} from "@/features/reading/reading-text";
import { FloatingWordCard } from "@/components/workspace/floating-word-card";
import { VIDEO_WORD_CARD_THEME_VARS } from "@/components/workspace/floating-word-card-theme";
import { SegmentedWordCard } from "@/components/workspace/segmented-word-card";
import {
  READING_WORD_ACCEPT,
  createReadingSourceFromWordFile,
} from "@/features/reading/reading-word-import";
import { getBrowserWordbookStorage } from "@/features/wordbook/local-wordbook-store";
import type { DesktopVideoDetails } from "@/features/video-library/video-library.types";
import {
  getVideoResumeStartTime,
  readVideoResume,
  rememberVideoResume,
  touchVideoResume,
} from "@/features/video/video-resume-store";
import { EnglishPracticePanel } from "@/components/video/english-practice/english-practice-panel";
import "@/components/desktop/desktop-video-detail-shell.css";

type DesktopVideoDetailShellProps = {
  videoId: string;
};

type WordCardState = {
  anchorX: number;
  anchorY: number;
  contextText: string;
  term: string;
} | null;
type ThemeMode = "dark" | "light";
type VideoWorkspaceMode = "watch" | "english-practice";
type PracticePanelResizeState = { startPanelWidth: number; startX: number } | null;

// 字号调节范围（与 reading 区一致）。
const MIN_FONT_SCALE = 0.8;
const MAX_FONT_SCALE = 1.8;
const FONT_SCALE_STEP = 0.05;

// 右栏剧本默认复用 reading 区的双语素材；导入 docx 后替换为导入内容。
const DEFAULT_SCRIPT_SOURCE = READING_SOURCES[0] ?? null;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "视频详情加载失败。";
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function clampPracticePanelWidth(requestedWidth: number, workspaceWidth: number) {
  const minWidth = 360;
  const maxWidth = Math.max(
    minWidth,
    Math.min(Math.round(workspaceWidth * 0.5), workspaceWidth - 520),
  );
  return Math.min(Math.max(Math.round(requestedWidth), minWidth), maxWidth);
}

export function DesktopVideoDetailShell({ videoId }: DesktopVideoDetailShellProps) {
  const router = useRouter();
  // 与 SSR 保持同一份首屏：桌面桥接只能在水合后的 effect 中读取。
  const [videoLibrary, setVideoLibrary] = useState<ReturnType<typeof getDesktopVideoLibraryBridge>>(null);
  const [isBridgeHydrated, setIsBridgeHydrated] = useState(false);
  const [detail, setDetail] = useState<DesktopVideoDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 工具栏状态
  const [showTranslation, setShowTranslation] = useState(true);
  // 默认跟随「设置 → 外观」的全局主题（light 态由 [data-app-theme] 覆盖上色）；
  // 右上角日/夜按钮仍可临时切到夜读深色。
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [fontScale, setFontScale] = useState(1);
  const [isFontPanelOpen, setIsFontPanelOpen] = useState(false);

  // 右栏剧本来源（默认 reading 素材，可被导入的 docx 替换）
  const [scriptSource, setScriptSource] = useState<ReadingSource | null>(
    DEFAULT_SCRIPT_SOURCE,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 播放器状态
  const playerFrameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const practicePanelResizeRef = useRef<PracticePanelResizeState>(null);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResumePersistedAtRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  // 这是应用内容区的沉浸播放，不使用浏览器或 Electron 的原生全屏。
  const [isImmersive, setIsImmersive] = useState(false);
  // 视频详情默认是通用观看空间；陪练仅在用户主动开启时成为可见增强层。
  const [workspaceMode, setWorkspaceMode] = useState<VideoWorkspaceMode>("watch");
  const [hasOpenedPractice, setHasOpenedPractice] = useState(false);
  const [practicePanelWidth, setPracticePanelWidth] = useState<number | null>(null);
  const [isPracticePanelResizing, setIsPracticePanelResizing] = useState(false);

  // 查词（复用 reading 逻辑）
  const [wordCard, setWordCard] = useState<WordCardState>(null);
  const [wordEntry, setWordEntry] = useState<DictionaryEntry | null>(null);
  const [wordLookupError, setWordLookupError] = useState<string | null>(null);
  const [isWordLookupLoading, setIsWordLookupLoading] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(() => new Set());
  const [pendingWords, setPendingWords] = useState<string[]>([]);
  const [wordToast, setWordToast] = useState<string | null>(null);

  const selectedVariant = useMemo(() => detail?.variants[0] ?? null, [detail]);
  const playbackUrl = selectedVariant?.playbackUrl ?? null;

  const selectedTerm = wordCard?.term ?? "";
  const selectedLookupKey = getLookupKey(selectedTerm);
  const selectedWord = useMemo(
    () => dictionaryEntryToWordCardEntry(wordEntry),
    [wordEntry],
  );
  const isPending = pendingWords.includes(selectedLookupKey);
  const isSaved = selectedWord ? savedKeys.has(selectedLookupKey) : isPending;

  const persistVideoResume = useCallback((
    currentTimeSeconds: number,
    durationSeconds: number,
    force = false,
  ) => {
    const now = Date.now();
    if (!force && now - lastResumePersistedAtRef.current < 12_000) return;
    if (rememberVideoResume({ videoId, currentTimeSeconds, durationSeconds })) {
      lastResumePersistedAtRef.current = now;
    }
  }, [videoId]);

  const clearControlsHideTimer = useCallback(() => {
    if (controlsHideTimerRef.current) {
      clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
  }, []);

  const scheduleControlsHide = useCallback(() => {
    clearControlsHideTimer();
    if (!isPlaying) {
      return;
    }
    controlsHideTimerRef.current = setTimeout(() => {
      setAreControlsVisible(false);
    }, 2600);
  }, [clearControlsHideTimer, isPlaying]);

  const revealPlayerControls = useCallback(() => {
    setAreControlsVisible(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  useEffect(() => {
    setVideoLibrary(getDesktopVideoLibraryBridge());
    setIsBridgeHydrated(true);
  }, []);

  useEffect(() => {
    if (!isBridgeHydrated) {
      return;
    }

    let isActive = true;

    async function loadDetail() {
      if (!videoLibrary) {
        setIsLoading(false);
        return;
      }

      try {
        const nextDetail = await videoLibrary.getVideoDetails(videoId);
        if (isActive) {
          setDetail(nextDetail);
        }
      } catch (error) {
        if (isActive) {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      isActive = false;
    };
  }, [isBridgeHydrated, videoId, videoLibrary]);

  useEffect(() => {
    // 通过详情页进入任意视频时，始终从干净的观看模式开始。
    setWorkspaceMode("watch");
    setHasOpenedPractice(false);
  }, [videoId]);

  useEffect(() => {
    const fallbackDuration = selectedVariant?.durationMs
      ? selectedVariant.durationMs / 1000
      : 0;
    setCurrentTime(0);
    setDuration(fallbackDuration);
    setIsPlaying(false);
    setAreControlsVisible(true);
    lastResumePersistedAtRef.current = 0;
  }, [playbackUrl, selectedVariant?.durationMs]);

  // 详情成功加载即记录最近视频；已有完成标记和播放位置必须原样保留。
  useEffect(() => {
    if (!detail) return;
    touchVideoResume(videoId);
  }, [detail, videoId]);

  useEffect(() => {
    const videoAtEffectStart = videoRef.current;
    const flushOnHidden = () => {
      if (document.visibilityState !== "hidden") return;
      const video = videoRef.current;
      if (video) persistVideoResume(video.currentTime, video.duration || duration, true);
    };
    document.addEventListener("visibilitychange", flushOnHidden);
    return () => {
      document.removeEventListener("visibilitychange", flushOnHidden);
      if (videoAtEffectStart) {
        persistVideoResume(videoAtEffectStart.currentTime, videoAtEffectStart.duration || duration, true);
      }
    };
  }, [duration, persistVideoResume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.volume = volume;
    video.muted = isMuted;
  }, [isMuted, volume, playbackUrl]);

  useEffect(() => {
    // 路由参数变化时不继承上一条视频的沉浸布局；离开页面时组件卸载也会自然清理状态。
    setIsImmersive(false);
  }, [videoId]);

  useEffect(() => {
    if (!isImmersive) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsImmersive(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isImmersive]);

  useEffect(() => {
    if (isPlaying) {
      setAreControlsVisible(true);
      scheduleControlsHide();
      return clearControlsHideTimer;
    }

    setAreControlsVisible(true);
    clearControlsHideTimer();
    return undefined;
  }, [clearControlsHideTimer, isPlaying, scheduleControlsHide]);

  useEffect(() => clearControlsHideTimer, [clearControlsHideTimer]);

  useEffect(() => {
    if (!isPracticePanelResizing) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const activeResize = practicePanelResizeRef.current;
      const workspace = workspaceRef.current;
      if (!activeResize || !workspace) {
        return;
      }
      const nextWidth = activeResize.startPanelWidth + activeResize.startX - event.clientX;
      setPracticePanelWidth(
        clampPracticePanelWidth(nextWidth, workspace.getBoundingClientRect().width),
      );
    }

    function stopResizing() {
      practicePanelResizeRef.current = null;
      setIsPracticePanelResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
  }, [isPracticePanelResizing]);

  // 字号面板：点击其他地方关闭
  useEffect(() => {
    if (!isFontPanelOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".video-study__font-control")) {
        return;
      }
      setIsFontPanelOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isFontPanelOpen]);

  // 收藏过的词，初始化点亮书签
  useEffect(() => {
    const wordbook = getBrowserWordbookStorage();
    if (!wordbook) {
      return;
    }
    let cancelled = false;
    void wordbook.listWords().then((words) => {
      if (!cancelled) {
        setSavedKeys(new Set(words.map((item) => item.word.trim().toLowerCase())));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!wordCard || !selectedLookupKey) {
      setWordEntry(null);
      setWordLookupError(null);
      setIsWordLookupLoading(false);
      return;
    }

    const controller = new AbortController();

    async function lookupWord() {
      setWordEntry(null);
      setWordLookupError(null);
      setIsWordLookupLoading(true);

      try {
        const response = await fetch(
          `/api/dictionary/lookup?word=${encodeURIComponent(selectedLookupKey)}`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as {
          entry?: DictionaryEntry;
          message?: string;
        };

        if (!response.ok || !payload.entry) {
          setWordLookupError(payload.message ?? "资料库里没有这个词。");
          return;
        }

        setWordEntry(payload.entry);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setWordLookupError("单词释义加载失败，请稍后再试。");
      } finally {
        if (!controller.signal.aborted) {
          setIsWordLookupLoading(false);
        }
      }
    }

    void lookupWord();

    return () => {
      controller.abort();
    };
  }, [selectedLookupKey, wordCard]);

  function openDocxPicker() {
    setErrorMessage(null);
    fileInputRef.current?.click();
  }

  async function handleDocxChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // 复位，使再次选同一文件也能触发 onChange。
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const nextSource = await createReadingSourceFromWordFile(file);
      setScriptSource(nextSource);
      setWordCard(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "导入 Word 文档失败，请稍后再试。",
      );
    }
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video || !playbackUrl) {
      return;
    }
    if (video.paused) {
      void video.play().catch(() => {
        setErrorMessage("视频播放失败，请确认文件仍可访问。");
      });
    } else {
      video.pause();
    }
  }

  function seekToTime(nextTime: number) {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const seekableDuration =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration;
    if (!Number.isFinite(seekableDuration) || seekableDuration <= 0) {
      return;
    }
    const boundedTime = Math.min(Math.max(nextTime, 0), seekableDuration);
    video.currentTime = boundedTime;
    setCurrentTime(video.currentTime);
    persistVideoResume(boundedTime, seekableDuration, true);
  }

  function toggleMute() {
    const video = videoRef.current;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (video) {
      video.muted = nextMuted;
    }
  }

  function changeVolume(nextVolume: number) {
    const boundedVolume = Math.min(Math.max(nextVolume, 0), 1);
    const video = videoRef.current;
    setVolume(boundedVolume);
    setIsMuted(boundedVolume === 0);
    if (video) {
      video.volume = boundedVolume;
      video.muted = boundedVolume === 0;
    }
  }

  function toggleImmersive() {
    setIsImmersive((current) => !current);
    revealPlayerControls();
  }

  function handlePlayerKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "INPUT") {
      return;
    }

    if (event.key === " " || event.key === "k" || event.key === "K") {
      event.preventDefault();
      togglePlay();
      revealPlayerControls();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekToTime(currentTime - 5);
      revealPlayerControls();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      seekToTime(currentTime + 5);
      revealPlayerControls();
      return;
    }

    if (event.key === "m" || event.key === "M") {
      event.preventDefault();
      toggleMute();
      revealPlayerControls();
      return;
    }

    if (event.key === "f" || event.key === "F") {
      event.preventDefault();
      toggleImmersive();
    }
  }

  function speak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  }

  function closeWordCard() {
    setWordCard(null);
    setWordToast(null);
  }

  function openWordCard(
    event: React.MouseEvent<HTMLButtonElement>,
    paragraph: ReadingParagraph,
    fallbackTerm: string,
  ) {
    event.preventDefault();
    const selectedText = window.getSelection()?.toString().trim() ?? "";
    const term = selectedText && /[A-Za-z]/.test(selectedText) ? selectedText : fallbackTerm;

    setWordToast(null);
    setWordEntry(null);
    setWordLookupError(null);
    setIsWordLookupLoading(true);
    setWordCard({
      anchorX: event.clientX,
      anchorY: event.clientY,
      contextText: paragraph.english,
      term,
    });
  }

  async function toggleSaveWord() {
    const key = selectedLookupKey;
    if (!key) {
      return;
    }

    if (selectedWord) {
      const storage = getBrowserWordbookStorage();
      if (!storage) {
        return;
      }
      if (savedKeys.has(key)) {
        await storage.deleteWord(selectedWord.word);
        setSavedKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
        setWordToast(`已从生词本移除：${selectedWord.word}`);
      } else {
        await storage.saveWord({
          createdAt: new Date().toISOString(),
          definitions: [selectedWord.definition],
          lexicalCategory: selectedWord.partOfSpeech ?? "",
          sourceId: detail?.video.id ?? videoId,
          sourceLabel: detail?.video.title ?? "本地视频",
          sourceType: "reading",
          synonyms: selectedWord.relatedWords,
          word: selectedWord.word,
        });
        setSavedKeys((current) => new Set(current).add(key));
        setWordToast(`已收藏到生词本：${selectedWord.word}`);
      }
      return;
    }

    if (pendingWords.includes(key)) {
      setPendingWords((current) => current.filter((item) => item !== key));
      setWordToast(`已移出待整理：${selectedTerm}`);
    } else {
      setPendingWords((current) => [...current, key]);
      setWordToast(`已加入待整理：${selectedTerm}`);
    }
  }

  function renderToolbar(title: string) {
    return (
      <div className="video-study__toolbar">
        <div className="video-study__crumb">
          <button
            aria-label="返回视频库"
            className="video-study__back"
            onClick={() => router.push("/video")}
            type="button"
          >
            <ChevronLeftIcon />
          </button>
          <div className="video-study__crumb-text">
            <span className="video-study__crumb-root">本地视频库</span>
            <span className="video-study__crumb-sep">/</span>
            <span className="video-study__crumb-title">{title}</span>
          </div>
        </div>

        <button
          aria-label="打开英语陪练"
          aria-pressed={workspaceMode === "english-practice"}
          className="video-study__practice-toggle"
          onClick={() => {
            setHasOpenedPractice(true);
            setWorkspaceMode("english-practice");
          }}
          type="button"
        >
          <MicrophoneIcon />
          <span>英语陪练</span>
        </button>
      </div>
    );
  }

  function renderPracticeUtilities() {
    return (
      <div className="video-study__tools video-study__tools--practice">
        <button
          aria-label="字幕字号缩放（预留）"
          className="video-study__tool-text"
          type="button"
        >
          100%
        </button>
        <span className="video-study__tool-divider" />
        <button
          aria-label="切换双语翻译"
          className="video-study__tool-trans"
          data-active={showTranslation ? "true" : "false"}
          onClick={() => setShowTranslation((current) => !current)}
          type="button"
        >
          <LanguagesIcon />
          中译
        </button>
        <button
          aria-label="导入 Word 文档"
          className="video-study__tool-icon"
          onClick={openDocxPicker}
          type="button"
        >
          <BookOpenIcon />
        </button>
        <div className="video-study__font-control">
          <button
            aria-expanded={isFontPanelOpen}
            aria-label="调节字号"
            className="video-study__tool-icon"
            data-active={isFontPanelOpen ? "true" : "false"}
            onClick={() => setIsFontPanelOpen((open) => !open)}
            type="button"
          >
            Aa
          </button>
          {isFontPanelOpen ? (
            <div className="video-study__font-panel" role="group">
              <span
                aria-hidden="true"
                className="video-study__font-hint video-study__font-hint--small"
              >
                A
              </span>
              <input
                aria-label="调节字号"
                className="video-study__font-slider"
                max={MAX_FONT_SCALE}
                min={MIN_FONT_SCALE}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) setFontScale(next);
                }}
                step={FONT_SCALE_STEP}
                type="range"
                value={fontScale}
              />
              <span
                aria-hidden="true"
                className="video-study__font-hint video-study__font-hint--large"
              >
                A
              </span>
            </div>
          ) : null}
        </div>
        <button
          aria-label={theme === "dark" ? "切换到白天模式" : "切换到黑夜模式"}
          className="video-study__tool-icon"
          data-accent="true"
          onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          type="button"
        >
          {theme === "dark" ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>
    );
  }

  function beginPracticePanelResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const workspace = workspaceRef.current;
    const panel = workspace?.querySelector<HTMLElement>(".video-study__practice-panel");
    if (!workspace || !panel) {
      return;
    }
    event.preventDefault();
    practicePanelResizeRef.current = {
      startPanelWidth: panel.getBoundingClientRect().width,
      startX: event.clientX,
    };
    setIsPracticePanelResizing(true);
  }

  function adjustPracticePanelWidth(direction: "expand" | "shrink") {
    const workspace = workspaceRef.current;
    const panel = workspace?.querySelector<HTMLElement>(".video-study__practice-panel");
    if (!workspace || !panel) {
      return;
    }
    const offset = direction === "expand" ? 24 : -24;
    setPracticePanelWidth(
      clampPracticePanelWidth(
        panel.getBoundingClientRect().width + offset,
        workspace.getBoundingClientRect().width,
      ),
    );
  }

  function renderLeft() {
    const progressPercent =
      duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
    const displayedVolume = isMuted ? 0 : volume;

    return (
      <div className="video-study__left">
        <div
          className="video-study__player-frame"
          data-controls-visible={areControlsVisible ? "true" : "false"}
          data-immersive={isImmersive ? "true" : "false"}
          data-playing={isPlaying ? "true" : "false"}
          onDoubleClick={toggleImmersive}
          onFocus={revealPlayerControls}
          onKeyDown={handlePlayerKeyDown}
          onMouseMove={revealPlayerControls}
          onPointerDown={revealPlayerControls}
          ref={playerFrameRef}
          tabIndex={0}
        >
          {playbackUrl ? (
            <video
              className="video-study__video"
              onClick={togglePlay}
              onEnded={(event) => {
                setIsPlaying(false);
                persistVideoResume(event.currentTarget.currentTime, event.currentTarget.duration || duration, true);
              }}
              onLoadedMetadata={(event) => {
                const nextDuration = event.currentTarget.duration;
                if (Number.isFinite(nextDuration) && nextDuration > 0) {
                  setDuration(nextDuration);
                  const saved = readVideoResume();
                  const startTime = saved?.videoId === videoId
                    ? getVideoResumeStartTime(saved, nextDuration)
                    : 0;
                  event.currentTarget.currentTime = startTime;
                  setCurrentTime(startTime);
                }
              }}
              onPause={(event) => {
                setIsPlaying(false);
                persistVideoResume(event.currentTarget.currentTime, event.currentTarget.duration || duration, true);
              }}
              onPlay={() => setIsPlaying(true)}
              onTimeUpdate={(event) => {
                const nextTime = event.currentTarget.currentTime;
                setCurrentTime(nextTime);
                persistVideoResume(nextTime, event.currentTarget.duration || duration);
              }}
              onVolumeChange={(event) => {
                setVolume(event.currentTarget.volume);
                setIsMuted(event.currentTarget.muted || event.currentTarget.volume === 0);
              }}
              playsInline
              preload="metadata"
              ref={videoRef}
              src={playbackUrl}
            />
          ) : (
            <div className="video-study__player-empty">未找到可播放的视频文件</div>
          )}

          {!isPlaying ? (
            <button
              aria-label="播放视频"
              className="video-study__play"
              onClick={togglePlay}
              type="button"
            >
              <PlayIcon />
            </button>
          ) : null}

          <div className="video-study__controls" aria-label="视频播放控制">
            <div className="video-study__progress">
              <input
                aria-label="播放进度"
                className="video-study__seek"
                disabled={duration <= 0}
                max={Math.max(duration, 0)}
                min={0}
                onChange={(event) => seekToTime(Number(event.target.value))}
                step={0.1}
                style={{ "--vs-progress": `${progressPercent}%` } as React.CSSProperties}
                type="range"
                value={Math.min(currentTime, duration || currentTime)}
              />
            </div>

            <div className="video-study__control-bar">
              <button
                aria-label={isPlaying ? "暂停视频" : "播放视频"}
                className="video-study__control-button"
                onClick={togglePlay}
                type="button"
              >
                {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
              </button>

              <div className="video-study__volume">
                <button
                  aria-label={isMuted ? "取消静音" : "静音"}
                  className="video-study__control-button"
                  onClick={toggleMute}
                  type="button"
                >
                  {displayedVolume === 0 ? <VolumeMutedIcon /> : <VolumeIcon />}
                </button>
                <input
                  aria-label="音量"
                  className="video-study__volume-range"
                  max={1}
                  min={0}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                  step={0.05}
                  style={
                    { "--vs-volume": `${displayedVolume * 100}%` } as React.CSSProperties
                  }
                  type="range"
                  value={displayedVolume}
                />
              </div>

              <span className="video-study__time">
                {formatClock(currentTime)}
                <span aria-hidden="true">/</span>
                {formatClock(duration)}
              </span>

              <span className="video-study__control-spacer" />

              <button
                aria-label={isImmersive ? "退出沉浸播放" : "沉浸播放"}
                className="video-study__control-button"
                onClick={toggleImmersive}
                title={isImmersive ? "退出沉浸播放" : "沉浸播放"}
                type="button"
              >
                {isImmersive ? <MinimizeIcon /> : <MaximizeIcon />}
              </button>
            </div>
          </div>
        </div>

        <section className="video-study__video-info" aria-label="视频信息">
          <div>
            <h1>{detail?.video.title ?? "本地视频"}</h1>
            <p>{`本地视频 · ${formatClock(duration)}`}</p>
          </div>
          <span>观看模式</span>
        </section>
        <div className="video-study__spacer" />
      </div>
    );
  }

  function renderRight() {
    if (!hasOpenedPractice) {
      return null;
    }

    return (
      <EnglishPracticePanel
        currentTime={currentTime}
        duration={duration}
        fontScale={fontScale}
        isOpen={workspaceMode === "english-practice"}
        isPlaying={isPlaying}
        mediaRef={videoRef}
        onClose={() => setWorkspaceMode("watch")}
        onSeek={seekToTime}
        onTogglePlay={togglePlay}
        onWordContextMenu={openWordCard}
        paragraphs={scriptSource?.paragraphs ?? null}
        showTranslation={showTranslation}
        resizeHandle={
          <button
            aria-label="调整英语陪练宽度"
            className="video-study__practice-resize-handle"
            data-resizing={isPracticePanelResizing ? "true" : "false"}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                adjustPracticePanelWidth("expand");
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                adjustPracticePanelWidth("shrink");
              }
            }}
            onPointerDown={beginPracticePanelResize}
            tabIndex={workspaceMode === "english-practice" ? 0 : -1}
            type="button"
          />
        }
        sourceId={detail?.video.id ?? videoId}
        sourceLabel={detail?.video.title ?? "本地视频"}
        toolbar={renderPracticeUtilities()}
      />
    );
  }

  function renderWordPopover() {
    if (!wordCard) {
      return null;
    }

    return (
      <FloatingWordCard
        anchor={{ x: wordCard.anchorX, y: wordCard.anchorY }}
        aria-label="词条释义"
        className="video-study__popover"
        initialPlacement="viewport-center"
        keepOpenOnContextMenuSelector=".enjoy-shadow__word"
        onClose={closeWordCard}
        placementKey={`${wordCard.term}:${wordCard.anchorX}:${wordCard.anchorY}`}
        style={{ maxHeight: "min(560px, calc(100vh - 32px))" }}
        themeScopeSelector=".video-study"
        themeVarNames={VIDEO_WORD_CARD_THEME_VARS}
      >
        <SegmentedWordCard
          closeIcon={<CloseIcon />}
          contextText={wordCard.contextText}
          entry={selectedWord}
          error={wordLookupError}
          isLoading={isWordLookupLoading}
          isSaved={isSaved}
          onClose={closeWordCard}
          onSaveToggle={() => void toggleSaveWord()}
          onSpeak={() => speak(selectedWord?.word ?? selectedTerm)}
          saveIcon={<BookmarkIcon filled={isSaved} />}
          speakIcon={<SpeakerIcon />}
          term={selectedTerm}
          toast={wordToast}
        />
      </FloatingWordCard>
    );
  }

  const title = detail?.video.title ?? "本地视频";

  return (
    <DesktopAppFrame
      activeNavId="video"
      activeWorkspace="workspace"
      subtitle="视频"
      title="本地视频库"
    >
      <main
        className="video-study"
        data-immersive={isImmersive ? "true" : "false"}
        data-theme={theme}
      >
        {renderToolbar(title)}

        <input
          accept={READING_WORD_ACCEPT}
          className="video-study__file-input"
          onChange={(event) => void handleDocxChange(event)}
          ref={fileInputRef}
          type="file"
        />

        {errorMessage ? (
          <div className="video-study__alert" role="status">
            {errorMessage}
          </div>
        ) : null}

        {!isBridgeHydrated || isLoading ? (
          <div className="video-study__state">
            <strong>正在加载播放器…</strong>
          </div>
        ) : !videoLibrary ? (
          <div className="video-study__state">
            <strong>当前网页环境不提供本地视频播放器</strong>
            <p>这块功能会在 Electron 桌面端通过本地桥接启用。</p>
          </div>
        ) : !detail ? (
          <div className="video-study__state">
            <strong>没有找到这个视频</strong>
            <p>它可能已经从视频库中移除，或者原始文件位置发生了变化。</p>
            <Link className="video-study__state-link" href="/video">
              返回视频库
            </Link>
          </div>
        ) : (
          <div
            className="video-study__body"
            data-immersive={isImmersive ? "true" : "false"}
            data-workspace-mode={workspaceMode}
            ref={workspaceRef}
            style={
              practicePanelWidth
                ? ({ "--vs-practice-panel-width": `${practicePanelWidth}px` } as React.CSSProperties)
                : undefined
            }
          >
            {renderLeft()}
            {renderRight()}
          </div>
        )}

        {renderWordPopover()}
      </main>
    </DesktopAppFrame>
  );
}

/* ---------------- inline lucide icons (stroke-width 1.5) ---------------- */

type IconProps = { size?: number };

function baseProps(size: number) {
  return {
    "aria-hidden": true as const,
    fill: "none" as const,
    height: size,
    stroke: "currentColor" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.5,
    viewBox: "0 0 24 24",
    width: size,
  };
}

function ChevronLeftIcon({ size = 16 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function LanguagesIcon({ size = 14 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}

function MicrophoneIcon({ size = 15 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
      <path d="M8.5 21h7" />
    </svg>
  );
}

function BookOpenIcon({ size = 15 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

function MoonIcon({ size = 15 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function SunIcon({ size = 15 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function PlayIcon({ size = 25 }: IconProps) {
  return (
    <svg {...baseProps(size)} style={{ marginLeft: 3 }}>
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

function PauseIcon({ size = 24 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <rect x="14" y="4" width="4" height="16" rx="1" />
      <rect x="6" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function VolumeIcon({ size = 17 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
      <path d="M19 6a8 8 0 0 1 0 12" />
    </svg>
  );
}

function VolumeMutedIcon({ size = 17 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="m17 9 4 4" />
      <path d="m21 9-4 4" />
    </svg>
  );
}

function MaximizeIcon({ size = 17 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
    </svg>
  );
}

function MinimizeIcon({ size = 17 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M16 3v3a2 2 0 0 0 2 2h3" />
      <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
    </svg>
  );
}

function BookmarkIcon({ filled = false, size = 15 }: IconProps & { filled?: boolean }) {
  return (
    <svg {...baseProps(size)} fill={filled ? "currentColor" : "none"}>
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}

function SpeakerIcon({ size = 15 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M11 4.7 6.5 9H3v6h3.5l4.5 4.3z" />
      <path d="M16 9a3 3 0 0 1 0 6" />
      <path d="M18.5 6.5a6.5 6.5 0 0 1 0 11" />
    </svg>
  );
}

function CloseIcon({ size = 15 }: IconProps) {
  return (
    <svg {...baseProps(size)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
