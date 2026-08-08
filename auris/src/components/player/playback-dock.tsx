import { useState } from "react";

type PlaybackDockProps = {
  activeSentenceLabel: string | null;
  currentTimeMs: number;
  durationMs: number;
  hasPlayback: boolean;
  hasReferenceVoice?: boolean;
  isLoading: boolean;
  isPlaying: boolean;
  isReferencePlaying?: boolean;
  onReplaySentence: () => void;
  onSetPlaybackRate: (rate: number) => void;
  onTogglePlayback: () => void | Promise<void>;
  onToggleReferencePlayback?: () => void | Promise<void>;
  ownVoiceLabel?: string | null;
  playbackError?: string | null;
  playbackRate: number;
  privacyMode?: boolean;
  repeatCount?: number;
  repeatIntervalSec?: number;
  smartNotifications?: boolean;
};

const SPEED_OPTIONS = [0.8, 0.9, 1, 1.1, 1.25] as const;

function formatTime(timeMs: number) {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function PlaybackDock({
  activeSentenceLabel,
  currentTimeMs,
  durationMs,
  hasPlayback,
  hasReferenceVoice = false,
  isLoading,
  isPlaying,
  isReferencePlaying = false,
  onReplaySentence,
  onSetPlaybackRate,
  onTogglePlayback,
  onToggleReferencePlayback,
  ownVoiceLabel,
  playbackError,
  playbackRate,
  privacyMode = false,
  repeatCount = 0,
  repeatIntervalSec = 5,
  smartNotifications = false,
}: PlaybackDockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const playButtonLabel = isPlaying ? "暂停训练音频" : "播放训练音频";
  const statusText = activeSentenceLabel ?? "等待开始训练";
  const progressPercent =
    durationMs > 0 ? Math.min(100, Math.max(0, (currentTimeMs / durationMs) * 100)) : 0;
  const playbackStateLabel = isLoading
    ? "准备中"
    : isPlaying
      ? "练习中"
      : hasPlayback
        ? "待继续"
        : "未启动";

  return (
    <section
      className="playback-dock"
      data-expanded={isExpanded ? "true" : "false"}
    >
      <div className="playback-dock__island">
        <div className="playback-dock__compact-row">
          <div className="playback-dock__compact-actions">
            <button
              aria-label={playButtonLabel}
              className="playback-dock__button playback-dock__button--primary"
              disabled={!hasPlayback || isLoading}
              onClick={() => void onTogglePlayback()}
              type="button"
            >
              {isPlaying ? "暂停" : "播放"}
            </button>

            <button
              className="playback-dock__button"
              disabled={!hasPlayback || isLoading}
              onClick={onReplaySentence}
              type="button"
            >
              重播本句
            </button>
          </div>

          <div className="playback-dock__compact-status">
            <span className="playback-dock__state-pill">{playbackStateLabel}</span>
            <strong>{statusText}</strong>
            <span>
              {formatTime(currentTimeMs)} / {formatTime(durationMs)}
            </span>
            <div
              aria-hidden="true"
              className="playback-dock__progress"
            >
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <button
            aria-expanded={isExpanded ? "true" : "false"}
            className="playback-dock__toggle"
            onClick={() => setIsExpanded((current) => !current)}
            type="button"
          >
            {isExpanded ? "收起" : "展开"}
          </button>
        </div>

        {isExpanded ? (
          <div className="playback-dock__expanded">
            <div className="playback-dock__summary">
              <span>{`状态 ${playbackStateLabel}`}</span>
              <span>{`重复 ${repeatCount + 1} 遍`}</span>
              <span>{`间隔 ${repeatIntervalSec} 秒`}</span>
              <span>{`速率 ${playbackRate}x`}</span>
              {privacyMode ? <span>隐私模式</span> : null}
              {smartNotifications ? <span>智能提醒已开</span> : null}
              {ownVoiceLabel ? <span>{`我的参考音：${ownVoiceLabel}`}</span> : null}
            </div>

            <p className="playback-dock__coach-copy">
              {isPlaying
                ? "保持跟读，不要追求每个词都发力，先贴住整句节奏。"
                : hasPlayback
                  ? "从这里继续，先听一句，再马上跟一句。"
                  : "先在左侧生成训练音频，右侧就会进入可练习状态。"}
            </p>

            {playbackError ? (
              <p className="playback-dock__error">{playbackError}</p>
            ) : null}

            {hasReferenceVoice && onToggleReferencePlayback ? (
              <div className="playback-dock__reference-row">
                <button
                  className="playback-dock__button"
                  onClick={() => void onToggleReferencePlayback()}
                  type="button"
                >
                  {isReferencePlaying ? "停止我的录音" : "播放我的录音"}
                </button>
              </div>
            ) : null}

            <div className="playback-dock__speed">
              {SPEED_OPTIONS.map((speed) => (
                <button
                  className="playback-dock__speed-chip"
                  data-active={playbackRate === speed ? "true" : "false"}
                  key={speed}
                  onClick={() => onSetPlaybackRate(speed)}
                  type="button"
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
