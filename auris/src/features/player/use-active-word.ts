"use client";

import { useMemo } from "react";
import type { SessionPlayback } from "@/features/sessions/session.types";

export function getActiveWordTokenId(
  wordTokens: SessionPlayback["wordTokens"],
  currentTimeMs: number,
) {
  const exactMatch = wordTokens.find(
    (wordToken) =>
      currentTimeMs >= wordToken.startMs && currentTimeMs < wordToken.endMs,
  );

  if (exactMatch) {
    return exactMatch.id;
  }

  for (let index = wordTokens.length - 1; index >= 0; index -= 1) {
    const wordToken = wordTokens[index];

    if (currentTimeMs >= wordToken.startMs) {
      return wordToken.id;
    }
  }

  return null;
}

export function useActiveWord(
  playback: SessionPlayback | null,
  currentTimeMs: number,
) {
  return useMemo(() => {
    if (!playback) {
      return null;
    }

    return getActiveWordTokenId(playback.wordTokens, currentTimeMs);
  }, [currentTimeMs, playback]);
}
