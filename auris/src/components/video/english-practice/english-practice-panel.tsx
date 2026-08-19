"use client";

import { Microphone, X } from "@phosphor-icons/react";
import type { MouseEvent as ReactMouseEvent, ReactNode, RefObject } from "react";
import { EnjoyShadowingStudio } from "@/components/player/enjoy-shadowing-studio";
import type { ReadingParagraph } from "@/features/reading/reading-fixtures";

type EnglishPracticePanelProps = {
  currentTime: number;
  duration: number;
  fontScale: number;
  isOpen: boolean;
  isPlaying: boolean;
  mediaRef: RefObject<HTMLVideoElement | null>;
  onClose: () => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onWordContextMenu?: (
    event: ReactMouseEvent<HTMLButtonElement>,
    paragraph: ReadingParagraph,
    word: string,
  ) => void;
  paragraphs: ReadingParagraph[] | null;
  showTranslation: boolean;
  resizeHandle?: ReactNode;
  sourceId: string;
  sourceLabel: string;
  toolbar?: ReactNode;
};

/**
 * 视频工作区中的可选增强面板。
 *
 * 面板在关闭时保持挂载：布局会收回其空间，但当前句、录音选择、评分和其他
 * English Practice session 状态不会因模式切换而被销毁。播放器实例始终位于面板外。
 */
export function EnglishPracticePanel({
  currentTime,
  duration,
  fontScale,
  isOpen,
  isPlaying,
  mediaRef,
  onClose,
  onSeek,
  onTogglePlay,
  onWordContextMenu,
  paragraphs,
  showTranslation,
  resizeHandle,
  sourceId,
  sourceLabel,
  toolbar,
}: EnglishPracticePanelProps) {
  const hasSubtitles = Boolean(paragraphs?.length);

  return (
    <aside
      aria-hidden={!isOpen}
      aria-label="英语陪练"
      className="video-study__practice-panel"
      data-open={isOpen ? "true" : "false"}
    >
      {resizeHandle}
      <header className="video-study__practice-panel-header">
        <div className="video-study__practice-panel-title">
          <Microphone aria-hidden="true" size={17} weight="fill" />
          <span>英语陪练</span>
        </div>
        <div className="video-study__practice-panel-actions">
          {toolbar}
          <button
            aria-label="关闭英语陪练"
            className="video-study__practice-panel-close"
            onClick={onClose}
            tabIndex={isOpen ? 0 : -1}
            type="button"
          >
            <X aria-hidden="true" size={17} />
          </button>
        </div>
      </header>

      <div className="video-study__practice-panel-content">
        {hasSubtitles ? (
          <EnjoyShadowingStudio
            currentTime={currentTime}
            duration={duration}
            fontScale={fontScale}
            isPlaying={isPlaying}
            mediaRef={mediaRef}
            onSeek={onSeek}
            onTogglePlay={onTogglePlay}
            onWordContextMenu={onWordContextMenu}
            paragraphs={paragraphs ?? []}
            showTranslation={showTranslation}
            sourceId={sourceId}
            sourceLabel={sourceLabel}
          />
        ) : (
          <div className="video-study__practice-empty" role="status">
            <Microphone aria-hidden="true" size={20} weight="duotone" />
            <strong>当前视频暂无可用字幕</strong>
            <p>字幕准备完成后，可以在这里使用逐句跟读、录音和发音评估。</p>
          </div>
        )}
      </div>
    </aside>
  );
}
