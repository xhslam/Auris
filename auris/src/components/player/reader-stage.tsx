"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { SentencePracticeControls } from "@/components/player/sentence-practice-controls";
import { WordToken } from "@/components/player/word-token";
import { WordDefinitionPopover } from "@/components/workspace/word-definition-popover";
import type { PronunciationAssessmentRecord } from "@/features/assessment/pronunciation-assessment.types";
import type { DictionaryEntry } from "@/features/dictionary/dictionary.types";
import type { SavedSentenceRecord } from "@/features/sentencebook/local-sentencebook-store";
import type {
  SentenceRecord,
  SessionPlayback,
  WordTokenRecord,
} from "@/features/sessions/session.types";
import type { SavedWordRecord } from "@/features/wordbook/local-wordbook-store";

type ReaderStageProps = {
  activeWordTokenId: string | null;
  onSaveAssessment?: (record: PronunciationAssessmentRecord) => void;
  onReplaySentence?: (timeMs: number) => void;
  onSaveSentence?: (record: SavedSentenceRecord) => void;
  onSaveWord?: (record: SavedWordRecord) => void;
  onSeekToWord?: (timeMs: number) => void;
  playback: SessionPlayback | null;
  savedSentenceIds?: string[];
  savedWords?: string[];
};

type SelectedWord = {
  lookupWord: string;
  position: {
    left: number;
    top: number;
  };
  sentence: SentenceRecord;
  wordToken: WordTokenRecord;
};

function normalizeLookupWord(text: string) {
  return text.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "").trim();
}

function getPopoverPosition(anchor: DOMRect) {
  const margin = 16;
  const popoverWidth = Math.min(560, window.innerWidth - margin * 2);
  const estimatedPopoverHeight = Math.min(420, window.innerHeight - margin * 2);
  const preferredLeft = anchor.left + anchor.width / 2 - popoverWidth / 2;
  const left = Math.min(
    Math.max(preferredLeft, margin),
    window.innerWidth - popoverWidth - margin,
  );
  const preferredTop = anchor.bottom + 12;
  const top =
    preferredTop + estimatedPopoverHeight > window.innerHeight - margin
      ? Math.max(margin, anchor.top - estimatedPopoverHeight - 12)
      : preferredTop;

  return { left, top };
}

export function ReaderStage({
  activeWordTokenId,
  onSaveAssessment,
  onReplaySentence,
  onSaveSentence,
  onSaveWord,
  onSeekToWord,
  playback,
  savedSentenceIds = [],
  savedWords = [],
}: ReaderStageProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [selectedWord, setSelectedWord] = useState<SelectedWord | null>(null);
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const savedWordSet = useMemo(
    () => new Set(savedWords.map((word) => word.trim().toLowerCase())),
    [savedWords],
  );

  useEffect(() => {
    if (!selectedWord) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (popoverRef.current?.contains(event.target as Node)) {
        return;
      }

      setSelectedWord(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedWord(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedWord]);

  useEffect(() => {
    if (!selectedWord) {
      setEntry(null);
      setLookupError(null);
      setIsLookupLoading(false);
      return;
    }

    const controller = new AbortController();
    const lookupWordText = selectedWord.lookupWord;

    async function lookupWord() {
      setEntry(null);
      setLookupError(null);
      setIsLookupLoading(true);

      try {
        const response = await fetch(
          `/api/dictionary/lookup?word=${encodeURIComponent(lookupWordText)}`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as {
          entry?: DictionaryEntry;
          message?: string;
        };

        if (!response.ok || !payload.entry) {
          setLookupError(payload.message ?? "单词释义加载失败，请稍后再试。");
          return;
        }

        setEntry(payload.entry);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setLookupError("单词释义加载失败，请稍后再试。");
      } finally {
        if (!controller.signal.aborted) {
          setIsLookupLoading(false);
        }
      }
    }

    void lookupWord();

    return () => {
      controller.abort();
    };
  }, [selectedWord]);

  useEffect(() => {
    setSelectedWord(null);
  }, [playback?.session.id]);

  function handleWordTokenClick(
    event: MouseEvent<HTMLButtonElement>,
    wordToken: WordTokenRecord,
    sentence: SentenceRecord,
  ) {
    onSeekToWord?.(wordToken.startMs);

    const lookupWord = normalizeLookupWord(wordToken.text);
    if (!lookupWord) {
      setSelectedWord(null);
      return;
    }

    setSelectedWord({
      lookupWord,
      position: getPopoverPosition(event.currentTarget.getBoundingClientRect()),
      sentence,
      wordToken,
    });
  }

  function handleSaveSelectedWord() {
    if (!entry || !playback || !selectedWord) {
      return;
    }

    const firstMeaning = entry.meanings[0];

    onSaveWord?.({
      createdAt: new Date().toISOString(),
      definitions: entry.meanings.flatMap((meaning) => meaning.definitions),
      endMs: selectedWord.wordToken.endMs,
      lexicalCategory: firstMeaning?.lexicalCategory ?? "unknown",
      sentenceId: selectedWord.sentence.id,
      sourceId: playback.session.id,
      sourceLabel: playback.session.title,
      sourceSentence: selectedWord.sentence.text,
      sourceType: "session",
      startMs: selectedWord.wordToken.startMs,
      synonyms: entry.synonyms,
      word: entry.word,
    });
  }

  return (
    <section aria-label="跟读舞台" className="workspace-shell__reader">
      <div className="workspace-shell__reader-header">
        <span>口头演练</span>
        <span>{playback ? "句子回放已就绪" : "等待开始训练"}</span>
      </div>

      <div className="reader-stage">
        {playback ? (
          <>
            <div className="reader-stage__meta">
              <strong>{playback.session.title}</strong>
              <span>
                {playback.sentences.length} 句 · {playback.wordTokens.length} 个词
              </span>
            </div>

            <div className="reader-stage__sentences">
              {playback.sentences.map((sentence) => {
                const sentenceTokens = playback.wordTokens.filter(
                  (wordToken) => wordToken.sentenceId === sentence.id,
                );
                const isSentenceActive = sentenceTokens.some(
                  (wordToken) => wordToken.id === activeWordTokenId,
                );
                const isSentenceSaved = savedSentenceIds.includes(sentence.id);

                return (
                  <div
                    className="reader-stage__sentence-row"
                    data-active-sentence={isSentenceActive ? "true" : "false"}
                    key={sentence.id}
                  >
                    <div className="reader-stage__sentence-toolbar">
                      <span className="reader-stage__sentence-index">
                        句子 {sentence.orderIndex + 1}
                      </span>
                      <div className="reader-stage__sentence-actions">
                        <button
                          aria-label={`重播句子 ${sentence.id}`}
                          className="reader-stage__sentence-chip"
                          onClick={() =>
                            (onReplaySentence ?? onSeekToWord)?.(sentence.startMs)
                          }
                          type="button"
                        >
                          重播这句
                        </button>
                        <button
                          aria-label={`收藏句子 ${sentence.id}`}
                          className="reader-stage__save-sentence"
                          data-saved={isSentenceSaved ? "true" : "false"}
                          onClick={() =>
                            onSaveSentence?.({
                              createdAt: new Date().toISOString(),
                              id: sentence.id,
                              sourceLabel: playback.session.title,
                              text: sentence.text,
                              translation: "",
                            })
                          }
                          type="button"
                        >
                          {isSentenceSaved ? "已收藏" : "收藏句子"}
                        </button>
                      </div>
                    </div>

                    <p
                      aria-label={sentence.text}
                      className="reader-stage__sentence"
                      data-active-sentence={isSentenceActive ? "true" : "false"}
                    >
                      {sentenceTokens.map((wordToken, tokenIndex) => (
                        <WordToken
                          isActive={wordToken.id === activeWordTokenId}
                          key={wordToken.id}
                          onClick={(event) =>
                            handleWordTokenClick(event, wordToken, sentence)
                          }
                          text={
                            tokenIndex === sentenceTokens.length - 1
                              ? wordToken.text
                              : `${wordToken.text} `
                          }
                        />
                      ))}
                    </p>

                    <SentencePracticeControls
                      onAssessmentSaved={onSaveAssessment}
                      sentence={sentence}
                      sourceId={playback.session.id}
                      sourceLabel={playback.session.title}
                    />
                  </div>
                );
              })}
            </div>

            {selectedWord ? (
              <WordDefinitionPopover
                contextText={selectedWord.sentence.text}
                entry={entry}
                error={lookupError}
                isLoading={isLookupLoading}
                isSaved={savedWordSet.has(selectedWord.lookupWord.toLowerCase())}
                onClose={() => setSelectedWord(null)}
                onSaveWord={handleSaveSelectedWord}
                popoverRef={popoverRef}
                position={selectedWord.position}
                word={selectedWord.lookupWord}
              />
            ) : null}
          </>
        ) : (
          <div className="reader-stage reader-stage--empty">
            <p className="reader-stage__placeholder-copy">
              生成训练音频后，这里会进入逐词跟读舞台。
            </p>
            <p className="reader-stage__placeholder-subtle">
              系统会自动准备音频、句子切分和单词级时间轴。
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
