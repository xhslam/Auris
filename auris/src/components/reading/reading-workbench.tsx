"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  READING_SOURCES,
  type ReadingParagraph,
  type ReadingSource,
} from "@/features/reading/reading-fixtures";
import type { DictionaryEntry } from "@/features/dictionary/dictionary.types";
import { dictionaryEntryToWordCardEntry } from "@/features/dictionary/word-card-entry";
import {
  cleanDisplayToken,
  getLookupKey,
  getParagraphProgress,
  getWordCount,
  tokenizeParagraph,
} from "@/features/reading/reading-text";
import { getBrowserWordbookStorage } from "@/features/wordbook/local-wordbook-store";
import { saveReadingProgressFor } from "@/features/reading/reading-library-store";
import { loadReadingSourceNotes } from "@/features/reading/reading-source-note";
import { loadReadingPdfBytes } from "@/features/reading/reading-pdf-store";
import {
  EDITOR_WIDTH_SLIDER_FULL,
  editorMaxWidthToSlider,
  loadNotesTypography,
  NOTES_TYPOGRAPHY_EVENT,
  resolveNotesEditorContentWidth,
  saveNotesTypography,
  sliderToEditorMaxWidth,
  type NotesTypographySettings,
} from "@/features/notes/formatting/notes-typography";
import { FloatingWordCard } from "@/components/workspace/floating-word-card";
import { READING_WORD_CARD_THEME_VARS } from "@/components/workspace/floating-word-card-theme";
import { SegmentedWordCard } from "@/components/workspace/segmented-word-card";
import {
  ReadingPdfViewer,
  type PdfLookupRequest,
} from "@/components/reading/reading-pdf-viewer";
import { ReadingExamView } from "@/components/reading/reading-exam-view";
import "@/components/reading/reading-workbench.css";
import type { NotesStorage } from "@/features/notes/note-types";
import { getNotesStorage } from "@/platform/notes/get-notes-storage";

type DisplayMode = "bilingual" | "chinese" | "english";
type ThemeMode = "light" | "dark";
type WordCardState = {
  anchorX: number;
  anchorY: number;
  contextText: string;
  term: string;
} | null;

const MIN_FONT_SCALE = 0.8;
const MAX_FONT_SCALE = 1.8;
const FONT_SCALE_STEP = 0.05;

function formatLineWidthLabel(editorMaxWidth: string) {
  if (!editorMaxWidth || editorMaxWidth === "none") {
    return "铺满";
  }
  return editorMaxWidth;
}

function getEstimatedMinutes(source: ReadingSource) {
  return `${source.estimatedMinutes} min read`;
}

function getTotalWords(source: ReadingSource) {
  return source.paragraphs.reduce(
    (total, paragraph) => total + getWordCount(paragraph.english),
    0,
  );
}

type ReadingWorkbenchProps = {
  /**
   * Optional storage override. Defaults to the platform notes vault.
   * Pass `null` to force an in-memory-only workbench (used in tests).
   */
  notesStorage?: NotesStorage | null;
  /** 从内容库打开时指定要阅读的源。 */
  initialSourceId?: string;
  /** Reading 首页本轮导入、尚不一定已从 vault 重新加载的源。 */
  sessionSources?: ReadingSource[];
  /** 提供时在顶部显示「返回内容库」。 */
  onExit?: () => void;
};

export function ReadingWorkbench({
  notesStorage,
  initialSourceId,
  sessionSources = [],
  onExit,
}: ReadingWorkbenchProps = {}) {
  const storage = useMemo(
    () => (notesStorage === undefined ? getNotesStorage() : notesStorage),
    [notesStorage],
  );
  const initialSources = useMemo(
    () => [...sessionSources, ...READING_SOURCES],
    [sessionSources],
  );
  const initialSource = initialSourceId
    ? (initialSources.find((source) => source.id === initialSourceId) ?? null)
    : null;
  const [userSources, setUserSources] = useState<ReadingSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState(
    initialSourceId ?? READING_SOURCES[0]?.id ?? "",
  );
  const [displayMode, setDisplayMode] = useState<DisplayMode>("bilingual");
  const [activeParagraphId, setActiveParagraphId] = useState(
    (initialSource ?? READING_SOURCES[0])?.paragraphs[0]?.id ?? "",
  );
  const paragraphEls = useRef<Map<string, HTMLElement>>(new Map());
  const [wordCard, setWordCard] = useState<WordCardState>(null);
  const [wordEntry, setWordEntry] = useState<DictionaryEntry | null>(null);
  const [wordLookupError, setWordLookupError] = useState<string | null>(null);
  const [isWordLookupLoading, setIsWordLookupLoading] = useState(false);
  const [pendingWords, setPendingWords] = useState<string[]>([]);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(() => new Set());
  const [wordToast, setWordToast] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [fontScale, setFontScale] = useState(1);
  const [isFontPanelOpen, setIsFontPanelOpen] = useState(false);
  const [lineWidthValue, setLineWidthValue] = useState(
    () => loadNotesTypography().editorMaxWidth,
  );
  const [isLineWidthPanelOpen, setIsLineWidthPanelOpen] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);

  const allSources = useMemo(() => {
    const seen = new Set<string>();
    const merged: ReadingSource[] = [];

    for (const source of [...userSources, ...sessionSources, ...READING_SOURCES]) {
      if (seen.has(source.id)) {
        continue;
      }
      seen.add(source.id);
      merged.push(source);
    }

    return merged;
  }, [userSources, sessionSources]);
  const selectedSource =
    allSources.find((source) => source.id === selectedSourceId) ?? allSources[0]!;
  const isPdfSource = selectedSource.format === "pdf";
  const isExamSource = Boolean(
    selectedSource.examSections && selectedSource.examSections.length > 0,
  );
  const activeParagraph =
    selectedSource.paragraphs.find((paragraph) => paragraph.id === activeParagraphId) ??
    selectedSource.paragraphs[0] ??
    null;
  const selectedTerm = wordCard?.term ?? "";
  const selectedLookupKey = getLookupKey(selectedTerm);
  const selectedWord = useMemo(
    () => dictionaryEntryToWordCardEntry(wordEntry),
    [wordEntry],
  );
  const savedActionKey = wordEntry ? getLookupKey(wordEntry.word) : "";
  const isPending = pendingWords.includes(selectedLookupKey);
  const isSaved = selectedWord ? savedKeys.has(savedActionKey) : isPending;
  const activeProgress = isPdfSource
    ? pdfProgress || selectedSource.progress || 0
    : getParagraphProgress(
        activeParagraph?.order ?? 0,
        selectedSource.paragraphs.length,
      );
  const totalWords = getTotalWords(selectedSource);

  useEffect(() => {
    let cancelled = false;
    const reloadSources = () => {
      void loadReadingSourceNotes(storage).then((persistedSources) => {
        if (cancelled) {
          return;
        }

        setUserSources(persistedSources);

        // 从内容库带着 initialSourceId 进来时，不要把选中源切走。
        if (initialSourceId) {
          return;
        }

        setSelectedSourceId((currentSourceId) =>
          currentSourceId === (READING_SOURCES[0]?.id ?? "")
            ? (persistedSources[0]?.id ?? currentSourceId)
            : currentSourceId,
        );
        setActiveParagraphId((currentParagraphId) =>
          currentParagraphId === (READING_SOURCES[0]?.paragraphs[0]?.id ?? "")
            ? (persistedSources[0]?.paragraphs[0]?.id ?? currentParagraphId)
            : currentParagraphId,
        );
      });
    };

    reloadSources();
    const unsubscribe = storage?.subscribeToChanges?.(reloadSources);

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [storage, initialSourceId]);

  // Hydrate PDF bytes from IndexedDB when opening a persisted PDF source.
  useEffect(() => {
    if (!isPdfSource || selectedSource.pdfBytes) {
      return;
    }

    let cancelled = false;
    void loadReadingPdfBytes(selectedSource.id).then((pdfBytes) => {
      if (cancelled || !pdfBytes) {
        return;
      }
      setUserSources((current) => {
        const existing = current.find((source) => source.id === selectedSource.id);
        if (existing?.pdfBytes) {
          return current;
        }
        if (existing) {
          return current.map((source) =>
            source.id === selectedSource.id ? { ...source, pdfBytes } : source,
          );
        }
        return [...current, { ...selectedSource, pdfBytes }];
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isPdfSource, selectedSource]);

  useEffect(() => {
    setPdfProgress(selectedSource.progress || 0);
  }, [selectedSource.id, selectedSource.progress]);

  useEffect(() => {
    const syncFromStore = () => {
      setLineWidthValue(loadNotesTypography().editorMaxWidth);
    };
    const onTypographyEvent = (event: Event) => {
      const detail = (event as CustomEvent<NotesTypographySettings>).detail;
      if (detail?.editorMaxWidth) {
        setLineWidthValue(detail.editorMaxWidth);
        return;
      }
      syncFromStore();
    };

    window.addEventListener(NOTES_TYPOGRAPHY_EVENT, onTypographyEvent);
    window.addEventListener("storage", syncFromStore);
    return () => {
      window.removeEventListener(NOTES_TYPOGRAPHY_EVENT, onTypographyEvent);
      window.removeEventListener("storage", syncFromStore);
    };
  }, []);

  // 真实阅读进度：用 IntersectionObserver 记录读到的最深段落并持久化（只增不减）。
  useEffect(() => {
    if (isPdfSource || typeof IntersectionObserver === "undefined") {
      return;
    }
    const total = selectedSource.paragraphs.length;
    if (total === 0) {
      return;
    }
    const orderById = new Map(
      selectedSource.paragraphs.map((paragraph) => [paragraph.id, paragraph.order]),
    );
    let maxOrder = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          const id = (entry.target as HTMLElement).dataset.paragraphId;
          const order = id ? (orderById.get(id) ?? 0) : 0;
          if (order > maxOrder) {
            maxOrder = order;
          }
        }
        if (maxOrder > 0) {
          saveReadingProgressFor(
            selectedSourceId,
            getParagraphProgress(maxOrder, total),
          );
        }
      },
      { threshold: 0.5 },
    );

    paragraphEls.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [isPdfSource, selectedSource, selectedSourceId]);

  useEffect(() => {
    const wordbook = getBrowserWordbookStorage();
    if (!wordbook) {
      return;
    }
    let cancelled = false;
    void wordbook.listWords().then((words) => {
      if (cancelled) {
        return;
      }
      setSavedKeys(new Set(words.map((item) => item.word.trim().toLowerCase())));
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

  function toggleDisplayMode() {
    setDisplayMode((currentMode) =>
      currentMode === "bilingual"
        ? "chinese"
        : currentMode === "chinese"
          ? "english"
          : "bilingual",
    );
  }

  function toggleThemeMode() {
    setThemeMode((currentMode) => (currentMode === "light" ? "dark" : "light"));
  }

  function toggleFontPanel() {
    setIsLineWidthPanelOpen(false);
    setIsFontPanelOpen((open) => !open);
  }

  function toggleLineWidthPanel() {
    setIsFontPanelOpen(false);
    setLineWidthValue(loadNotesTypography().editorMaxWidth);
    setIsLineWidthPanelOpen((open) => !open);
  }

  function handleFontScaleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextScale = Number(event.target.value);
    if (Number.isFinite(nextScale)) {
      setFontScale(nextScale);
    }
  }

  function handleLineWidthChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextWidth = sliderToEditorMaxWidth(Number(event.target.value));
    setLineWidthValue(nextWidth);
    saveNotesTypography({
      ...loadNotesTypography(),
      editorMaxWidth: nextWidth,
    });
  }

  function closeWordCard() {
    setWordCard(null);
    setWordToast(null);
  }

  function openWordCard(
    event: React.MouseEvent<HTMLElement>,
    paragraphId: string,
    fallbackTerm: string,
  ) {
    event.preventDefault();

    const selection = typeof window !== "undefined" ? window.getSelection() : null;
    const selectedText =
      selection && !selection.isCollapsed ? selection.toString().trim() : "";
    const term =
      selectedText && /\s/.test(selectedText) && /[A-Za-z]/.test(selectedText)
        ? selectedText
        : fallbackTerm;

    if (!term) {
      return;
    }

    const examMatch = /^exam-(\d+)-(\d+)$/.exec(paragraphId);
    const examContext =
      examMatch && selectedSource.examSections
        ? selectedSource.examSections[Number(examMatch[1])]?.blocks[
            Number(examMatch[2])
          ]?.english ?? ""
        : "";
    openWordCardAt({
      clientX: event.clientX,
      clientY: event.clientY,
      contextText:
        selectedSource.paragraphs.find((paragraph) => paragraph.id === paragraphId)
          ?.english ?? examContext,
      term,
    });
    setActiveParagraphId(paragraphId);
  }

  function openWordCardAt(request: PdfLookupRequest) {
    setWordToast(null);
    setWordEntry(null);
    setWordLookupError(null);
    setIsWordLookupLoading(true);
    setWordCard({
      anchorX: request.clientX,
      anchorY: request.clientY,
      contextText: request.contextText,
      term: request.term,
    });
  }

  function handlePdfProgressChange(progress: number) {
    setPdfProgress((current) => {
      const next = Math.max(current, progress);
      if (next > current) {
        saveReadingProgressFor(selectedSourceId, next);
      }
      return next;
    });
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

  async function toggleSaveWord() {
    const key = selectedWord ? savedActionKey : selectedLookupKey;
    if (!key) {
      return;
    }

    // 已收录的词 → 切换生词本；未收录的词 → 切换"待整理"。
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
          sourceId: selectedSource.id,
          sourceLabel: selectedSource.title,
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

  function renderEnglishText(paragraph: ReadingParagraph) {
    return tokenizeParagraph(paragraph.english).map((token, index) => {
      const cleaned = cleanDisplayToken(token);

      if (!cleaned) {
        return <span key={`${paragraph.id}-${token}-${index}`}>{token}</span>;
      }

      const lookup = cleaned.toLowerCase();

      return (
        <span
          className="reading-minimal-word"
          data-active={wordCard && selectedLookupKey === lookup ? "true" : "false"}
          key={`${paragraph.id}-${token}-${index}`}
          onContextMenu={(event) => openWordCard(event, paragraph.id, cleaned)}
        >
          {token}
        </span>
      );
    });
  }

  const lineWidthSlider = editorMaxWidthToSlider(lineWidthValue);
  const lineWidthLabel = formatLineWidthLabel(lineWidthValue);
  const contentWidth = resolveNotesEditorContentWidth(lineWidthValue);

  return (
    <main
      className="reading-minimal"
      data-theme={themeMode}
      style={
        {
          "--reading-font-scale": fontScale,
          "--reading-content-width": contentWidth,
        } as React.CSSProperties
      }
    >
        <header className="reading-minimal__topbar">
          <nav aria-label="Reader actions" className="reading-minimal__toolbar">
            {onExit ? (
              <>
                <button
                  aria-label="返回内容库"
                  className="reading-minimal__icon-button"
                  onClick={onExit}
                  type="button"
                >
                  <BackIcon />
                </button>
                <span aria-hidden="true" className="reading-minimal__separator" />
              </>
            ) : null}
            <button
              aria-label={`Reading progress ${activeProgress}%`}
              className="reading-minimal__progress-button"
              type="button"
            >
              {activeProgress}%
            </button>
            {!isPdfSource ? (
              <button
                aria-label="Toggle language view"
                className="reading-minimal__icon-button"
                data-active={displayMode !== "bilingual" ? "true" : "false"}
                onClick={toggleDisplayMode}
                type="button"
              >
                <TranslateIcon />
              </button>
            ) : null}
            <div className="reading-minimal__font-control">
              <button
                aria-expanded={isFontPanelOpen}
                aria-label={isPdfSource ? "PDF zoom" : "Text size"}
                className="reading-minimal__text-size-button"
                data-active={isFontPanelOpen ? "true" : "false"}
                onClick={toggleFontPanel}
                type="button"
              >
                Aa
              </button>
              {isFontPanelOpen ? (
                <div className="reading-minimal__font-panel" role="group">
                  <span
                    aria-hidden="true"
                    className="reading-minimal__font-hint reading-minimal__font-hint--small"
                  >
                    A
                  </span>
                  <input
                    aria-label="Adjust text size"
                    className="reading-minimal__font-slider"
                    max={MAX_FONT_SCALE}
                    min={MIN_FONT_SCALE}
                    onChange={handleFontScaleChange}
                    step={FONT_SCALE_STEP}
                    type="range"
                    value={fontScale}
                  />
                  <span
                    aria-hidden="true"
                    className="reading-minimal__font-hint reading-minimal__font-hint--large"
                  >
                    A
                  </span>
                </div>
              ) : null}
            </div>
            <div className="reading-minimal__font-control">
              <button
                aria-expanded={isLineWidthPanelOpen}
                aria-label="调整正文行宽"
                className="reading-minimal__text-size-button"
                data-active={isLineWidthPanelOpen ? "true" : "false"}
                onClick={toggleLineWidthPanel}
                title="调整正文行宽"
                type="button"
              >
                ⇔
              </button>
              {isLineWidthPanelOpen ? (
                <div className="reading-minimal__font-panel" role="group">
                  <span
                    aria-hidden="true"
                    className="reading-minimal__font-hint reading-minimal__font-hint--small"
                  >
                    窄
                  </span>
                  <input
                    aria-label="调整正文行宽"
                    aria-valuetext={lineWidthLabel}
                    className="reading-minimal__font-slider"
                    max={EDITOR_WIDTH_SLIDER_FULL}
                    min={0}
                    onChange={handleLineWidthChange}
                    step={1}
                    type="range"
                    value={lineWidthSlider}
                  />
                  <span
                    aria-hidden="true"
                    className="reading-minimal__font-hint reading-minimal__font-hint--large"
                  >
                    宽
                  </span>
                </div>
              ) : null}
            </div>
            <span aria-hidden="true" className="reading-minimal__separator" />
            <button
              aria-label="Toggle color mode"
              className="reading-minimal__icon-button"
              onClick={toggleThemeMode}
              type="button"
            >
              <SunIcon />
            </button>
          </nav>
        </header>

        <section className="reading-minimal__shell">
          <article className="reading-minimal__page">
            <header className="reading-minimal__heading">
              <h1>{selectedSource.title}</h1>
              <div className="reading-minimal__meta">
                <span>{selectedSource.kicker}</span>
                <span>
                  {isPdfSource
                    ? `${getEstimatedMinutes(selectedSource)} · ${selectedSource.pageCount ?? "?"} pages`
                    : `${getEstimatedMinutes(selectedSource)} · ${totalWords} words total`}
                </span>
              </div>
            </header>

            {isPdfSource ? (
              <section aria-label="PDF reader" className="reading-minimal__content">
                {selectedSource.pdfBytes ? (
                  <ReadingPdfViewer
                    onLookupWord={openWordCardAt}
                    onProgressChange={handlePdfProgressChange}
                    pdfBytes={selectedSource.pdfBytes}
                    scale={1.05 * fontScale}
                  />
                ) : (
                  <p className="reading-pdf-viewer__loading">
                    正在加载 PDF…若长时间无响应，请重新导入该文件。
                  </p>
                )}
              </section>
            ) : isExamSource ? (
              <section aria-label="Exam reader" className="reading-minimal__content">
                <ReadingExamView
                  onLookupWord={openWordCard}
                  sections={selectedSource.examSections!}
                  showTranslation={displayMode !== "english"}
                  wordActiveKey={wordCard ? selectedLookupKey : null}
                />
              </section>
            ) : (
            <section aria-label="Bilingual reader" className="reading-minimal__content">
              {selectedSource.paragraphs.map((paragraph, index) => {
                const isActive = paragraph.id === activeParagraph?.id;

                return (
                  <article
                    className="reading-minimal__paragraph"
                    data-active={isActive ? "true" : "false"}
                    data-mode={displayMode}
                    data-paragraph-id={paragraph.id}
                    key={paragraph.id}
                    onMouseEnter={() => setActiveParagraphId(paragraph.id)}
                    ref={(element) => {
                      if (element) {
                        paragraphEls.current.set(paragraph.id, element);
                      } else {
                        paragraphEls.current.delete(paragraph.id);
                      }
                    }}
                  >
                    {index === 0 ? (
                      <span aria-hidden="true" className="reading-minimal__spark">
                        ✦
                      </span>
                    ) : null}
                    {displayMode !== "chinese" ? (
                      <p className="reading-minimal__english">{renderEnglishText(paragraph)}</p>
                    ) : null}
                    {displayMode !== "english" ? (
                      <p className="reading-minimal__translation">
                        {paragraph.translation}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </section>
            )}
          </article>

          {wordCard ? (
            <FloatingWordCard
              anchor={{ x: wordCard.anchorX, y: wordCard.anchorY }}
              aria-label="Word definition"
              className="reading-minimal__word-popover"
              onClose={closeWordCard}
              placementKey={`${wordCard.term}:${wordCard.anchorX}:${wordCard.anchorY}`}
              themeScopeSelector=".reading-minimal"
              themeVarNames={READING_WORD_CARD_THEME_VARS}
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
          ) : null}
        </section>

    </main>
  );
}

function TranslateIcon() {
  return (
    <svg aria-hidden="true" className="reading-minimal__icon" viewBox="0 0 24 24">
      <path d="M4 5h9M9 3v2m3 0c-.8 4.2-3.5 7.2-7.5 9" />
      <path d="M6.5 9.5c1.2 2 3 3.6 5.5 4.8" />
      <path d="m14 20 3.2-8h1.1l3.2 8M15.3 17h4.9" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" className="reading-minimal__icon" viewBox="0 0 24 24">
      <path d="M14 6l-6 6 6 6" />
    </svg>
  );
}

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`reading-minimal__icon${filled ? " reading-minimal__icon--filled" : ""}`}
      viewBox="0 0 24 24"
    >
      <path d="M6.5 4.5h11a1 1 0 0 1 1 1V20l-6.5-3.6L5.5 20V5.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg aria-hidden="true" className="reading-minimal__icon" viewBox="0 0 24 24">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 9c1.2 1 1.8 2 1.8 3s-.6 2-1.8 3" />
      <path d="M18.5 6.5c2 1.6 3 3.4 3 5.5s-1 3.9-3 5.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className="reading-minimal__icon" viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" className="reading-minimal__icon" viewBox="0 0 24 24">
      <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m14.4-6.4 1.4-1.4M4.2 19.8l1.4-1.4m12.8 0 1.4 1.4M4.2 4.2l1.4 1.4" />
      <circle cx="12" cy="12" r="4.2" />
    </svg>
  );
}
