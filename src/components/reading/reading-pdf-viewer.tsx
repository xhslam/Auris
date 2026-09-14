"use client";

import { useEffect, useRef, useState } from "react";
import { ensurePdfWorker } from "@/features/reading/reading-pdf-import";
import "@/components/reading/reading-pdf-viewer.css";

export type PdfLookupRequest = {
  clientX: number;
  clientY: number;
  contextText: string;
  term: string;
};

type ReadingPdfViewerProps = {
  pdfBytes: ArrayBuffer;
  initialPage?: number | null;
  onLookupWord: (request: PdfLookupRequest) => void;
  onPageChange?: (page: number) => void;
  onProgressChange?: (progress: number) => void;
  scale?: number;
};

type PageRenderState = {
  height: number;
  pageNumber: number;
  width: number;
};

function extractLookupTerm(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || !/[A-Za-z]/.test(trimmed)) {
    return "";
  }

  if (/\s/.test(trimmed)) {
    return trimmed;
  }

  return trimmed.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
}

export function ReadingPdfViewer({
  pdfBytes,
  initialPage = null,
  onLookupWord,
  onPageChange,
  onProgressChange,
  scale = 1.15,
}: ReadingPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageStates, setPageStates] = useState<PageRenderState[]>([]);
  const pageEls = useRef<Map<number, HTMLElement>>(new Map());
  const restoredPageRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const pageCleanups: Array<() => void> = [];

    async function renderPdf() {
      setIsLoading(true);
      setErrorMessage(null);
      setPageStates([]);

      try {
        const pdfjs = await import("pdfjs-dist");
        ensurePdfWorker(pdfjs);
        const { TextLayer } = await import("pdfjs-dist");

        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(pdfBytes.slice(0)),
          useSystemFonts: true,
        });
        const pdf = await loadingTask.promise;

        if (cancelled) {
          await pdf.destroy();
          return;
        }

        const nextStates: PageRenderState[] = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale });
          nextStates.push({
            height: viewport.height,
            pageNumber,
            width: viewport.width,
          });
        }

        if (cancelled) {
          await pdf.destroy();
          return;
        }

        setPageStates(nextStates);
        setIsLoading(false);

        // Wait a frame so canvas/textLayer nodes exist.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });

        if (cancelled) {
          await pdf.destroy();
          return;
        }

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const host = pageEls.current.get(pageNumber);
          if (!host) {
            continue;
          }

          const canvas = host.querySelector("canvas");
          const textLayerDiv = host.querySelector<HTMLElement>(
            ".reading-pdf-viewer__text-layer",
          );
          if (!canvas || !textLayerDiv) {
            continue;
          }

          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale });
          const context = canvas.getContext("2d");
          if (!context) {
            continue;
          }

          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;

          await page.render({
            canvas,
            canvasContext: context,
            viewport,
          }).promise;

          textLayerDiv.replaceChildren();
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;

          const textContent = await page.getTextContent();
          const textLayer = new TextLayer({
            container: textLayerDiv,
            textContentSource: textContent,
            viewport,
          });
          await textLayer.render();
          pageCleanups.push(() => textLayer.cancel());
        }

        pageCleanups.push(() => {
          void pdf.destroy();
        });
      } catch {
        if (!cancelled) {
          setErrorMessage("无法打开这个 PDF，请重新导入。");
          setIsLoading(false);
        }
      }
    }

    void renderPdf();

    return () => {
      cancelled = true;
      for (const cleanup of pageCleanups) {
        cleanup();
      }
    };
  }, [pdfBytes, scale]);

  useEffect(() => {
    if (!initialPage || pageStates.length === 0 || restoredPageRef.current === initialPage) {
      return;
    }
    const page = pageEls.current.get(Math.min(Math.max(1, initialPage), pageStates.length));
    page?.scrollIntoView({ block: "start" });
    restoredPageRef.current = initialPage;
  }, [initialPage, pageStates]);

  useEffect(() => {
    if ((!onProgressChange && !onPageChange) || pageStates.length === 0) {
      return;
    }

    const elements = [...pageEls.current.values()];
    if (elements.length === 0) {
      return;
    }

    const ratios = new Map<number, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number(
            (entry.target as HTMLElement).dataset.pageNumber ?? "0",
          );
          if (pageNumber > 0) {
            ratios.set(pageNumber, entry.intersectionRatio);
          }
        }

        let bestPage = 1;
        let bestRatio = -1;
        for (const [pageNumber, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPage = pageNumber;
          }
        }

        const progress = Math.round((bestPage / pageStates.length) * 100);
        onProgressChange?.(progress);
        onPageChange?.(bestPage);
      },
      {
        root: containerRef.current?.closest(".reading-minimal__shell") ?? null,
        threshold: [0.15, 0.35, 0.55, 0.75],
      },
    );

    for (const element of elements) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [onPageChange, onProgressChange, pageStates]);

  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    const selection = window.getSelection();
    const selectedText =
      selection && !selection.isCollapsed ? selection.toString() : "";
    const term = extractLookupTerm(selectedText);

    if (!term) {
      return;
    }

    event.preventDefault();
    onLookupWord({
      clientX: event.clientX,
      clientY: event.clientY,
      contextText: selectedText.trim().slice(0, 240),
      term,
    });
  }

  if (errorMessage) {
    return (
      <div className="reading-pdf-viewer reading-pdf-viewer--error" role="alert">
        {errorMessage}
      </div>
    );
  }

  return (
    <div
      className="reading-pdf-viewer"
      onContextMenu={handleContextMenu}
      ref={containerRef}
    >
      {isLoading ? (
        <p className="reading-pdf-viewer__loading">正在打开 PDF…</p>
      ) : null}
      {pageStates.map((page) => (
        <div
          className="reading-pdf-viewer__page"
          data-page-number={page.pageNumber}
          key={page.pageNumber}
          ref={(element) => {
            if (element) {
              pageEls.current.set(page.pageNumber, element);
            } else {
              pageEls.current.delete(page.pageNumber);
            }
          }}
          style={{ height: page.height, width: page.width }}
        >
          <canvas aria-label={`PDF 第 ${page.pageNumber} 页`} />
          <div className="reading-pdf-viewer__text-layer textLayer" />
        </div>
      ))}
    </div>
  );
}
