"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import { ArrowRightIcon, HistoryIcon } from "@/components/auris-ui/auris-icons";
import { getNotesStorage } from "@/platform/notes/get-notes-storage";
import "@/components/auris-ui/auris-ui.css";

export function ReviewPageClient() {
  const router = useRouter();
  const notesStorage = useMemo(() => getNotesStorage(), []);
  const [cardCount, setCardCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!notesStorage) {
      return;
    }
    void notesStorage
      .listPages()
      .then((pages) => {
        if (!cancelled) setCardCount(pages.length);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [notesStorage]);

  return (
    <DesktopAppFrame activeNavId="review" activeWorkspace="home" subtitle="Review" title="每日回顾">
      <main className="auris-page auris-review">
        <div className="auris-review__container">
          <header className="auris-review__header">
            <div className="auris-review__intro">
              <div className="auris-review__eyebrow">Spaced Review</div>
              <h1 className="auris-page__title">每日回顾</h1>
              <p className="auris-page__subtitle">
                科学的间隔回顾，让笔记真正留在记忆里。
              </p>
            </div>
            <div className="auris-review__stats">
              <div className="auris-review__stat">
                <div className="auris-review__stat-num">0</div>
                <div className="auris-review__stat-label">今日待回顾</div>
              </div>
              <div className="auris-review__stat">
                <div className="auris-review__stat-num auris-review__stat-num--accent">
                  {cardCount ?? 0}
                </div>
                <div className="auris-review__stat-label">记忆卡片</div>
              </div>
            </div>
          </header>

          <div className="auris-review__divider" />

          <section className="auris-review__empty">
            <div className="auris-review__glow" aria-hidden="true" />
            <div className="auris-review__rings" aria-hidden="true">
              <span />
              <span />
              <span />
              <HistoryIcon size={30} />
            </div>
            <h2 className="auris-review__empty-title">从今天开始回顾</h2>
            <p className="auris-review__empty-desc">
              记录还在沉淀。等你积累了笔记与闪念，这里会按间隔规律排出今天该回顾的卡片。
            </p>
            <button
              className="auris-review__cta"
              onClick={() => router.push("/flash")}
              type="button"
            >
              去记录第一条想法
              <ArrowRightIcon size={16} />
            </button>
          </section>
        </div>
      </main>
    </DesktopAppFrame>
  );
}
