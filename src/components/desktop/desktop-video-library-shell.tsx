"use client";

import { useEffect, useMemo, useState } from "react";
import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import { DesktopVideoCard } from "@/components/desktop/desktop-video-card";
import { getDesktopVideoLibraryBridge } from "@/platform/desktop/video-library-adapter";
import type { DesktopVideoLibrarySnapshot } from "@/features/video-library/video-library.types";

const EMPTY_SNAPSHOT: DesktopVideoLibrarySnapshot = {
  directory: {
    analysisDirectory: null,
    directoryName: null,
    hasLibrary: false,
    libraryPath: null,
    storageMode: "reference",
    thumbnailsDirectory: null,
    transcodesDirectory: null,
  },
  items: [],
};

// Lucide icon paths (stroke-width 1.5), inlined to avoid a runtime icon dependency.
const ICON_PATHS: Record<string, string[]> = {
  "folder-search": [
    "M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1",
    "m21 21-1.9-1.9",
  ],
  "refresh-cw": [
    "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
    "M21 3v5h-5",
    "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
    "M8 16H3v5",
  ],
  "folder-open": [
    "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
  ],
  "folder-plus": [
    "M12 10v6",
    "M9 13h6",
    "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  ],
};

function Icon({ name, size = 16 }: { name: keyof typeof ICON_PATHS; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "folder-search" ? <circle cx="17" cy="17" r="3" /> : null}
      {ICON_PATHS[name].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "视频库操作失败。";
}

export function DesktopVideoLibraryShell() {
  const [videoLibrary] = useState(() => getDesktopVideoLibraryBridge());
  const [snapshot, setSnapshot] = useState<DesktopVideoLibrarySnapshot>(EMPTY_SNAPSHOT);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSnapshot() {
      if (!videoLibrary) {
        setIsLoading(false);
        return;
      }

      try {
        const nextSnapshot = await videoLibrary.getSnapshot();

        if (isActive) {
          setSnapshot(nextSnapshot);
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

    void loadSnapshot();

    return () => {
      isActive = false;
    };
  }, [videoLibrary]);

  const summary = useMemo(() => {
    const readyCount = snapshot.items.filter((item) => item.importState === "ready").length;
    const activeAnalysis = snapshot.items.filter((item) => item.analysisStatus !== "idle").length;

    return [
      {
        detail: `当前 ${readyCount} 个可直接播放，${activeAnalysis} 个任务位已经留好。`,
        label: "视频总数",
        value: String(snapshot.items.length).padStart(2, "0"),
      },
    ];
  }, [snapshot.items]);

  async function runSnapshotAction(
    actionKey: string,
    action: () => Promise<DesktopVideoLibrarySnapshot>,
  ) {
    setBusyAction(actionKey);
    setErrorMessage(null);

    try {
      const nextSnapshot = await action();
      setSnapshot(nextSnapshot);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <DesktopAppFrame
      activeNavId="video"
      activeWorkspace="workspace"
      subtitle="视频"
      title="本地视频库"
    >
      <main className="desktop-video-library-shell">
        <section className="desktop-video-library-shell__panel">
          <header className="desktop-video-library-shell__header">
            <div className="desktop-video-library-shell__heading">
              <span className="desktop-video-library-shell__eyebrow">Local library</span>
              <h2>本地视频库</h2>
            </div>
            <div className="desktop-video-library-shell__actions">
              <button
                className="desktop-video-library-shell__btn desktop-video-library-shell__btn--primary"
                disabled={Boolean(busyAction) || !videoLibrary}
                onClick={() =>
                  videoLibrary
                    ? runSnapshotAction("pick", () => videoLibrary.pickDirectory())
                    : undefined
                }
                type="button"
              >
                <Icon name="folder-search" size={17} />
                选择视频文件夹
              </button>
              <button
                className="desktop-video-library-shell__btn desktop-video-library-shell__btn--ghost"
                disabled={Boolean(busyAction) || !videoLibrary || !snapshot.directory.hasLibrary}
                onClick={() =>
                  videoLibrary
                    ? runSnapshotAction("refresh", () => videoLibrary.refresh())
                    : undefined
                }
                type="button"
              >
                <Icon name="refresh-cw" size={15} />
                重新扫描
              </button>
            </div>
          </header>

          {!videoLibrary ? (
            <section className="desktop-video-library-shell__empty">
              <div className="desktop-video-library-shell__state-icon" aria-hidden="true">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <strong>当前网页环境不提供本地视频库</strong>
              <p>这块功能会在 Electron 桌面端通过本地桥接启用。</p>
            </section>
          ) : null}

          {errorMessage ? (
            <div className="desktop-video-library-shell__alert" role="status">
              {errorMessage}
            </div>
          ) : null}

          {isLoading ? (
            <section className="desktop-video-library-shell__empty">
              <div className="desktop-video-library-shell__state-icon" aria-hidden="true">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M12 2a10 10 0 0 1 10 10" />
                  <path d="M12 6a6 6 0 0 1 6 6" strokeDasharray="4 3" />
                </svg>
              </div>
              <strong>正在加载桌面视频库...</strong>
            </section>
          ) : null}

          {!isLoading && videoLibrary && !snapshot.directory.hasLibrary ? (
            <section className="desktop-video-library-shell__setup">
              <div className="desktop-video-library-shell__state-icon" aria-hidden="true">
                <Icon name="folder-plus" size={36} />
              </div>
              <div className="desktop-video-library-shell__setup-copy">
                <strong>先选择一个视频文件夹</strong>
                <p>
                  Auris 只会扫描并引用其中的视频，不会在这个文件夹里创建数据库或缓存目录。
                </p>
              </div>
            </section>
          ) : null}

          {!isLoading && snapshot.directory.hasLibrary ? (
            <>
              <section aria-label="视频文件夹概览" className="desktop-video-library-shell__summary">
                <header className="desktop-video-library-shell__summary-header">
                  <strong>视频文件夹概览</strong>
                  <span>{snapshot.directory.libraryPath}</span>
                </header>
                <div className="desktop-video-library-shell__summary-grid">
                  {summary.map((item) => (
                    <article className="desktop-video-library-shell__summary-card" key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </div>
              </section>

              {snapshot.items.length > 0 ? (
                <div className="desktop-video-library-shell__grid">
                  {snapshot.items.map((item) => (
                    <DesktopVideoCard item={item} key={item.id} />
                  ))}
                </div>
              ) : (
                <section className="desktop-video-library-shell__empty">
                  <div className="desktop-video-library-shell__state-icon" aria-hidden="true">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                  </div>
                  <strong>文件夹中暂时没有视频</strong>
                  <p>
                    添加视频文件后点击「重新扫描」。
                  </p>
                </section>
              )}
            </>
          ) : null}
        </section>
      </main>
    </DesktopAppFrame>
  );
}
