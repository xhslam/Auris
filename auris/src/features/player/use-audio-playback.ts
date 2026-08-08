"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

type SpeechFallbackToken = {
  endMs: number;
  startMs: number;
  text: string;
};

type UseAudioPlaybackInput = {
  audioUrl: string | null;
  initialRate?: number;
  onComplete?: () => void;
  repeatCount?: number;
  repeatIntervalMs?: number;
  speechFallback?: {
    durationMs: number;
    tokens: SpeechFallbackToken[];
  } | null;
};

function formatFiniteDuration(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function findTokenIndexForTime(tokens: SpeechFallbackToken[], timeMs: number) {
  const exactIndex = tokens.findIndex(
    (token) => timeMs >= token.startMs && timeMs < token.endMs,
  );

  if (exactIndex >= 0) {
    return exactIndex;
  }

  return tokens.findIndex((token) => token.startMs >= timeMs);
}

export function useAudioPlayback(input: UseAudioPlaybackInput) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const restartTimeoutRef = useRef<number | null>(null);
  const resetSignatureRef = useRef<string | null>(null);
  const speechStartAtRef = useRef(0);
  const speechOffsetRef = useRef(0);
  const repeatBudgetRef = useRef(input.repeatCount ?? 0);
  const fallbackDurationMs = input.speechFallback?.durationMs ?? 0;
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(fallbackDurationMs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRateState] = useState(input.initialRate ?? 1);

  const clearRestartTimeout = useEffectEvent(() => {
    if (restartTimeoutRef.current !== null) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  });

  const cancelFrame = useEffectEvent(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  });

  const syncFromAudio = useEffectEvent(() => {
    const element = audioRef.current;

    if (!element) {
      return;
    }

    setCurrentTimeMs(Math.round(element.currentTime * 1000));
    setDurationMs(Math.round(formatFiniteDuration(element.duration) * 1000));
    setPlaybackError(null);
  });

  const stopSpeech = useEffectEvent(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    cancelFrame();
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  });

  const resetRepeatBudget = useEffectEvent(() => {
    repeatBudgetRef.current = input.repeatCount ?? 0;
    clearRestartTimeout();
  });

  const notifyComplete = useEffectEvent(() => {
    input.onComplete?.();
  });

  const tickSpeech = useEffectEvent((speechDurationMs: number) => {
    const elapsedMs = (performance.now() - speechStartAtRef.current) * playbackRate;
    const nextTimeMs = Math.min(
      speechDurationMs,
      Math.round(speechOffsetRef.current + elapsedMs),
    );

    setCurrentTimeMs(nextTimeMs);
    setDurationMs(speechDurationMs);

    if (nextTimeMs >= speechDurationMs) {
      cancelFrame();
      setIsPlaying(false);
      return;
    }

    frameRef.current = requestAnimationFrame(() => tickSpeech(speechDurationMs));
  });

  const tickAudio = useEffectEvent(() => {
    const element = audioRef.current;

    if (!element) {
      frameRef.current = null;
      return;
    }

    syncFromAudio();

    if (element.paused || element.ended) {
      frameRef.current = null;
      return;
    }

    frameRef.current = requestAnimationFrame(() => tickAudio());
  });

  const startSpeechFrom = useEffectEvent((timeMs: number, shouldResetRepeatBudget = true) => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      !input.speechFallback
    ) {
      return;
    }

    if (shouldResetRepeatBudget) {
      resetRepeatBudget();
    }

    const tokenIndex = findTokenIndexForTime(input.speechFallback.tokens, timeMs);
    const startIndex = tokenIndex >= 0 ? tokenIndex : 0;
    const fallbackText = input.speechFallback.tokens
      .slice(startIndex)
      .map((token) => token.text)
      .join(" ")
      .trim();

    if (!fallbackText) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(fallbackText);
    utterance.lang = "en-US";
    utterance.rate = playbackRate;
    utterance.onend = () => {
      cancelFrame();
      setCurrentTimeMs(fallbackDurationMs);
      setIsPlaying(false);

      if (repeatBudgetRef.current > 0) {
        repeatBudgetRef.current -= 1;
        restartTimeoutRef.current = window.setTimeout(() => {
          startSpeechFrom(0, false);
        }, input.repeatIntervalMs ?? 0);
        return;
      }

      notifyComplete();
    };
    utterance.onerror = () => {
      cancelFrame();
      setIsPlaying(false);
      clearRestartTimeout();
      setPlaybackError("浏览器朗读暂时不可用，请稍后重试。");
    };

    cancelFrame();
    window.speechSynthesis.cancel();
    speechOffsetRef.current = Math.max(0, timeMs);
    speechStartAtRef.current = performance.now();
    setCurrentTimeMs(Math.max(0, timeMs));
    setDurationMs(input.speechFallback.durationMs);
    setIsPlaying(true);
    setPlaybackError(null);
    frameRef.current = requestAnimationFrame(() => tickSpeech(fallbackDurationMs));
    window.speechSynthesis.speak(utterance);
  });

  useEffect(() => {
    setPlaybackRateState(input.initialRate ?? 1);
  }, [input.initialRate]);

  useEffect(() => {
    if (input.audioUrl && audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [input.audioUrl, playbackRate]);

  useEffect(() => {
    const element = audioRef.current;

    if (!element) {
      return;
    }

    const handleLoadedMetadata = () => syncFromAudio();
    const handleCanPlay = () => syncFromAudio();
    const handleTimeUpdate = () => syncFromAudio();
    const handlePause = () => {
      cancelFrame();
      setIsPlaying(false);
      syncFromAudio();
    };
    const handlePlay = () => {
      cancelFrame();
      setIsPlaying(true);
      syncFromAudio();
      frameRef.current = requestAnimationFrame(() => tickAudio());
    };
    const handleEnded = () => {
      cancelFrame();
      setIsPlaying(false);
      syncFromAudio();

      if (repeatBudgetRef.current > 0) {
        repeatBudgetRef.current -= 1;
        restartTimeoutRef.current = window.setTimeout(() => {
          const nextElement = audioRef.current;

          if (!nextElement) {
            return;
          }

          nextElement.currentTime = 0;
          setCurrentTimeMs(0);
          setPlaybackError(null);
          setIsPlaying(true);
          void nextElement.play();
        }, input.repeatIntervalMs ?? 0);
        return;
      }

      notifyComplete();
    };
    const handleError = () => {
      cancelFrame();
      clearRestartTimeout();
      setIsPlaying(false);
      setPlaybackError("音频加载失败，请重新生成一次训练音频。");
    };

    element.addEventListener("loadedmetadata", handleLoadedMetadata);
    element.addEventListener("canplay", handleCanPlay);
    element.addEventListener("timeupdate", handleTimeUpdate);
    element.addEventListener("pause", handlePause);
    element.addEventListener("play", handlePlay);
    element.addEventListener("ended", handleEnded);
    element.addEventListener("error", handleError);

    return () => {
      element.removeEventListener("loadedmetadata", handleLoadedMetadata);
      element.removeEventListener("canplay", handleCanPlay);
      element.removeEventListener("timeupdate", handleTimeUpdate);
      element.removeEventListener("pause", handlePause);
      element.removeEventListener("play", handlePlay);
      element.removeEventListener("ended", handleEnded);
      element.removeEventListener("error", handleError);
    };
  }, [input.repeatIntervalMs]);

  useEffect(() => {
    const element = audioRef.current;
    const resetSignature = JSON.stringify([
      input.audioUrl,
      fallbackDurationMs,
      input.repeatCount ?? 0,
    ]);

    if (resetSignatureRef.current === resetSignature) {
      return;
    }

    resetSignatureRef.current = resetSignature;

    stopSpeech();
    clearRestartTimeout();

    if (element) {
      element.pause();
      element.currentTime = 0;
      element.load();
    }

    repeatBudgetRef.current = input.repeatCount ?? 0;
    setCurrentTimeMs(0);
    setDurationMs(fallbackDurationMs);
    setIsPlaying(false);
    setPlaybackError(null);
  }, [fallbackDurationMs, input.audioUrl, input.repeatCount]);

  useEffect(() => {
    if (!input.audioUrl && isPlaying && input.speechFallback) {
      stopSpeech();
      startSpeechFrom(currentTimeMs, false);
    }
  }, [currentTimeMs, input.audioUrl, input.speechFallback, isPlaying, playbackRate]);

  useEffect(() => {
    return () => {
      clearRestartTimeout();
      stopSpeech();
    };
  }, []);

  async function togglePlayback() {
    const element = audioRef.current;

    if (input.audioUrl && element) {
      try {
        setPlaybackError(null);

        if (element.paused) {
          if (element.readyState === 0) {
            element.load();
          }

          resetRepeatBudget();
          setIsPlaying(true);
          await element.play();
          syncFromAudio();
          return;
        }

        clearRestartTimeout();
        setIsPlaying(false);
        element.pause();
      } catch {
        setIsPlaying(false);
        setPlaybackError("音频暂时无法播放，请重新生成一次训练音频。");
      }

      return;
    }

    if (input.speechFallback) {
      if (isPlaying) {
        clearRestartTimeout();
        stopSpeech();
        return;
      }

      startSpeechFrom(currentTimeMs, true);
    }
  }

  function seekTo(timeMs: number) {
    const nextTimeMs = Math.max(0, timeMs);
    const element = audioRef.current;

    clearRestartTimeout();

    if (input.audioUrl && element) {
      element.currentTime = nextTimeMs / 1000;
      syncFromAudio();
      return;
    }

    speechOffsetRef.current = nextTimeMs;
    setCurrentTimeMs(nextTimeMs);
  }

  function replayFrom(timeMs: number) {
    seekTo(timeMs);

    const element = audioRef.current;

    if (input.audioUrl && element) {
      void (async () => {
        try {
          resetRepeatBudget();
          setPlaybackError(null);
          setIsPlaying(true);
          await element.play();
          syncFromAudio();
        } catch {
          setIsPlaying(false);
          setPlaybackError("音频暂时无法播放，请重新生成一次训练音频。");
        }
      })();
      return;
    }

    if (input.speechFallback) {
      startSpeechFrom(Math.max(0, timeMs), true);
    }
  }

  function setPlaybackRate(rate: number) {
    setPlaybackRateState(rate);
  }

  return {
    audioRef,
    currentTimeMs,
    durationMs,
    isPlaying,
    playbackError,
    playbackRate,
    replayFrom,
    seekTo,
    setPlaybackRate,
    togglePlayback,
  };
}
