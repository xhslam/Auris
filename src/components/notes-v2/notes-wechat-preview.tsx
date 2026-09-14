"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { NOTES_UI_COPY } from "@/components/notes-v2/notes-ui-copy";
import {
  copyWechatHtmlToClipboard,
  WechatClipboardRevisionChangedError,
} from "@/features/notes/wechat/wechat-clipboard";
import { renderWechatMarkdown } from "@/features/notes/wechat/wechat-markdown";

type NotesWechatPreviewProps = {
  markdown: string;
  notePath: string;
  resolveImageSource?: (source: string) => string | null;
};

type CopyState =
  | { kind: "idle"; message: string }
  | { kind: "copying"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function getIdleCopyState(): CopyState {
  return {
    kind: "idle",
    message: NOTES_UI_COPY.wechatPreview.idleStatus,
  };
}

export function NotesWechatPreview({
  markdown,
  notePath,
  resolveImageSource,
}: NotesWechatPreviewProps) {
  const contentHostRef = useRef<HTMLDivElement | null>(null);
  const renderedHtmlRef = useRef({
    html: "",
    revision: 0,
    sourceRevision: 0,
  });
  const sourceRevisionRef = useRef({ markdown: "", notePath: "", revision: 0 });
  const copyInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const [copyState, setCopyState] = useState<CopyState>(getIdleCopyState);
  const immediatePreviewSource = useMemo(
    () => ({ markdown, notePath }),
    [markdown, notePath],
  );
  const deferredPreviewSource = useDeferredValue(immediatePreviewSource);
  const previewMarkdown =
    markdown.length >= 64 * 1024 && deferredPreviewSource.notePath === notePath
      ? deferredPreviewSource.markdown
      : markdown;
  const isPreviewPending = previewMarkdown !== markdown;
  const html = useMemo(
    () => renderWechatMarkdown(previewMarkdown, { resolveImageSource }),
    [previewMarkdown, resolveImageSource],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (
      sourceRevisionRef.current.markdown !== markdown
      || sourceRevisionRef.current.notePath !== notePath
    ) {
      sourceRevisionRef.current = {
        markdown,
        notePath,
        revision: sourceRevisionRef.current.revision + 1,
      };
    }
  }, [markdown, notePath]);

  useLayoutEffect(() => {
    const htmlChanged = renderedHtmlRef.current.html !== html;
    renderedHtmlRef.current = {
      html,
      revision: htmlChanged
        ? renderedHtmlRef.current.revision + 1
        : renderedHtmlRef.current.revision,
      sourceRevision: isPreviewPending
        ? -1
        : sourceRevisionRef.current.revision,
    };
  }, [html, isPreviewPending, markdown, notePath]);

  useEffect(() => {
    if (!copyInFlightRef.current) {
      setCopyState(getIdleCopyState());
    }
  }, [html]);

  const handleCopy = useCallback(async () => {
    if (copyInFlightRef.current) return;
    copyInFlightRef.current = true;
    setCopyState({
      kind: "copying",
      message: NOTES_UI_COPY.wechatPreview.copyingStatus,
    });

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (!mountedRef.current) {
          throw new WechatClipboardRevisionChangedError();
        }
        const renderedRevision = renderedHtmlRef.current.revision;
        const sourceRevision = sourceRevisionRef.current.revision;
        if (renderedHtmlRef.current.sourceRevision !== sourceRevision) {
          throw new Error(NOTES_UI_COPY.wechatPreview.copyStillChanging);
        }
        const content = contentHostRef.current?.querySelector<HTMLElement>(
          '[data-auris-wechat-content="true"]',
        );

        if (!content) {
          setCopyState({
            kind: "error",
            message: NOTES_UI_COPY.wechatPreview.missing,
          });
          return;
        }

        try {
          await copyWechatHtmlToClipboard(content, {
            isCurrent: () =>
              mountedRef.current
              && renderedHtmlRef.current.revision === renderedRevision
              && sourceRevisionRef.current.revision === sourceRevision,
          });
          if (mountedRef.current) {
            setCopyState({
              kind: "success",
              message: NOTES_UI_COPY.wechatPreview.success,
            });
          }
          return;
        } catch (error) {
          if (error instanceof WechatClipboardRevisionChangedError) {
            continue;
          }
          throw error;
        }
      }

      throw new Error(NOTES_UI_COPY.wechatPreview.copyStillChanging);
    } catch (error) {
      if (mountedRef.current) {
        setCopyState({
          kind: "error",
          message:
            error instanceof Error
              ? `${NOTES_UI_COPY.wechatPreview.copyFailedPrefix}${error.message}`
              : NOTES_UI_COPY.wechatPreview.copyFailed,
        });
      }
    } finally {
      copyInFlightRef.current = false;
    }
  }, []);

  const preventPreviewNavigation = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if ((event.target as Element | null)?.closest("a")) {
        event.preventDefault();
      }
    },
    [],
  );

  return (
    <section
      aria-label={NOTES_UI_COPY.wechatPreview.label}
      className="notes-v2__wechat-preview"
      data-copy-state={copyState.kind}
      data-note-path={notePath}
      data-testid="notes-wechat-preview"
    >
      <header className="notes-v2__wechat-preview-toolbar">
        <div className="notes-v2__wechat-preview-heading">
          <strong>{NOTES_UI_COPY.wechatPreview.title}</strong>
          <span>{NOTES_UI_COPY.wechatPreview.subtitle}</span>
        </div>
        <button
          aria-busy={copyState.kind === "copying" || isPreviewPending}
          className="notes-v2__wechat-copy-button"
          disabled={copyState.kind === "copying" || isPreviewPending}
          onClick={() => void handleCopy()}
          type="button"
        >
          {copyState.kind === "copying"
            ? NOTES_UI_COPY.wechatPreview.copying
            : NOTES_UI_COPY.wechatPreview.copy}
        </button>
      </header>
      <p
        aria-live="polite"
        className="notes-v2__wechat-copy-status"
        role="status"
      >
        {isPreviewPending
          ? NOTES_UI_COPY.wechatPreview.syncingStatus
          : copyState.message}
      </p>
      <div className="notes-v2__wechat-preview-scroll">
        <div
          className="notes-v2__wechat-preview-canvas"
          dangerouslySetInnerHTML={{ __html: html }}
          onClickCapture={preventPreviewNavigation}
          ref={contentHostRef}
        />
      </div>
    </section>
  );
}
