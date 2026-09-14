/**
 * Auris Home — homepage-only daily entry.
 * Reads existing Home, Notes, and Review state; does not alter their business logic.
 */
"use client";

import {
  ActivityIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  ChevronRightIcon,
  FolderIcon,
  HistoryIcon,
  ListChecksIcon,
  NotebookPenIcon,
  OrbitIcon,
  ZapIcon,
} from "@/components/auris-ui/auris-icons";
import { useEffect, useMemo, useState } from "react";
import {
  createDefaultHomeData,
  getBrowserHomeStorage,
  readHomeData,
  toLocalDateKey,
  type HomeData,
} from "@/features/home/home-store";
import {
  getDashboardMetrics,
  getNiaReviewMessage,
  getReviewQueue,
} from "@/features/output-review/output-review-model";
import {
  OUTPUT_REVIEW_STORAGE_EVENT,
  readOutputReviewState,
} from "@/features/output-review/output-review-storage";
import type { NotePageSummary } from "@/features/notes/note-types";
import "./home-entry.css";

type HomePageProps = {
  onNavigate: (href: string) => void;
  recentNotes?: NotePageSummary[];
};

function formatToday(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    weekday: "long",
  }).format(date);
}

function formatRecentTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const delta = Date.now() - parsed.getTime();
  if (delta < 60 * 60 * 1000) return "just now";
  if (delta < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(delta / (60 * 60 * 1000)))}h ago`;
  if (delta < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(delta / (24 * 60 * 60 * 1000))}d ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(parsed);
}

function noteTitle(note: NotePageSummary) {
  return note.title.trim() || note.fileName.replace(/\.(md|markdown)$/i, "") || "Untitled";
}

export function HomePage({ onNavigate, recentNotes = [] }: HomePageProps) {
  const storage = useMemo(() => getBrowserHomeStorage(), []);
  const now = useMemo(() => new Date(), []);
  const todayKey = toLocalDateKey(now);
  const [homeData, setHomeData] = useState<HomeData>(() => createDefaultHomeData(now));
  const [reviewState, setReviewState] = useState(() => readOutputReviewState(null));

  useEffect(() => {
    setHomeData(readHomeData(storage, now));
    const syncReview = () => setReviewState(readOutputReviewState(window.localStorage));
    syncReview();
    window.addEventListener(OUTPUT_REVIEW_STORAGE_EVENT, syncReview);
    window.addEventListener("storage", syncReview);
    return () => {
      window.removeEventListener(OUTPUT_REVIEW_STORAGE_EVENT, syncReview);
      window.removeEventListener("storage", syncReview);
    };
  }, [now, storage]);

  const reviewQueue = useMemo(() => getReviewQueue(reviewState, todayKey), [reviewState, todayKey]);
  const reviewMetrics = useMemo(() => getDashboardMetrics(reviewState, todayKey), [reviewState, todayKey]);
  const reviewBrief = useMemo(() => getNiaReviewMessage(reviewState, todayKey, now.getHours()), [now, reviewState, todayKey]);
  const priorityReview = reviewQueue[0] ?? null;
  const focusPlans = homeData.plans.filter((item) => !item.done && item.title.trim()).slice(0, 3);
  const completedPlans = homeData.plans.filter((item) => item.done).length;
  const recent = recentNotes.slice(0, 5);
  const continueNote = recent[0] ?? null;
  const reviewCount = reviewMetrics.overdueCount + reviewMetrics.dueTodayCount;
  const mainActionIsReview = Boolean(priorityReview && reviewCount > 0);

  const openNote = (note: NotePageSummary) => onNavigate(`/notes?resumeNoteId=${encodeURIComponent(note.id)}`);

  return (
    <main className="auris-home-entry" aria-label="Auris home">
      <div className="auris-home-entry__frame">
        <header className="auris-home-entry__topline">
          <span>{formatToday(now)}</span>
          <span className="auris-home-entry__topline-dot" />
          <span>{reviewCount > 0 ? `${reviewCount} due` : "clear today"}</span>
        </header>

        <section className="auris-home-entry__hero" aria-labelledby="home-title">
          <div className="auris-home-entry__hero-copy">
            <p className="auris-home-entry__eyebrow">Today</p>
            <h1 id="home-title">{mainActionIsReview ? "Start with what is due." : "Continue with intention."}</h1>
            <p className="auris-home-entry__lede">
              {mainActionIsReview
                ? priorityReview?.knowledgePoint.title
                : continueNote
                  ? `Last opened · ${noteTitle(continueNote)}`
                  : "Your next focused session starts here."}
            </p>
            <button
              className="auris-home-entry__primary-action"
              onClick={() => mainActionIsReview ? onNavigate("/review") : continueNote ? openNote(continueNote) : onNavigate("/notes")}
              type="button"
            >
              <span>{mainActionIsReview ? "Review now" : continueNote ? "Continue" : "Open notes"}</span>
              <ArrowUpRightIcon size={16} />
            </button>
          </div>
          <div className="auris-home-entry__hero-mark" aria-hidden="true">
            <span className="auris-home-entry__hero-line" />
            <strong>{String(now.getDate()).padStart(2, "0")}</strong>
            <small>{now.toLocaleString("en-GB", { month: "short" }).toUpperCase()}</small>
          </div>
        </section>

        <div className="auris-home-entry__main-grid">
          <section className="auris-home-entry__review" aria-labelledby="review-title">
            <div className="auris-home-entry__section-kicker"><HistoryIcon size={14} /> Review</div>
            <div className="auris-home-entry__review-head">
              <div>
                <p id="review-title">{reviewCount > 0 ? "Today’s cycle" : "Nothing due"}</p>
                <strong>{reviewCount > 0 ? reviewCount : "—"}</strong>
              </div>
              {reviewCount > 0 ? <span>{reviewMetrics.completedToday} done</span> : null}
            </div>
            {reviewCount > 0 ? (
              <>
                <div className="auris-home-entry__progress" aria-label={`${reviewMetrics.completedToday} reviews complete`}>
                  <span style={{ width: `${Math.min(100, (reviewMetrics.completedToday / Math.max(1, reviewMetrics.totalActionableToday)) * 100)}%` }} />
                </div>
                <button className="auris-home-entry__text-link" onClick={() => onNavigate("/review")} type="button">
                  {priorityReview?.knowledgePoint.title || "Open review"} <ChevronRightIcon size={14} />
                </button>
              </>
            ) : (
              <p className="auris-home-entry__quiet-empty">Nothing enters the cycle today. Start something new when you are ready.</p>
            )}
          </section>

          <section className="auris-home-entry__focus" aria-labelledby="focus-title">
            <div className="auris-home-entry__section-kicker"><ListChecksIcon size={14} /> Focus</div>
            <div className="auris-home-entry__focus-head"><h2 id="focus-title">The few things that matter.</h2><span>{completedPlans}/{homeData.plans.length || 0}</span></div>
            {focusPlans.length ? (
              <ul className="auris-home-entry__focus-list">
                {focusPlans.map((plan, index) => <li key={plan.id}><span>0{index + 1}</span><p>{plan.title}</p></li>)}
              </ul>
            ) : (
              <p className="auris-home-entry__quiet-empty">No focus set for today.</p>
            )}
            <button className="auris-home-entry__text-link auris-home-entry__focus-link" onClick={() => onNavigate("/notes")} type="button">Open desk <ChevronRightIcon size={14} /></button>
          </section>
        </div>

        <section className="auris-home-entry__continue" aria-labelledby="continue-title">
          <div className="auris-home-entry__section-heading"><div><p className="auris-home-entry__section-kicker"><BookOpenIcon size={14} /> Continue</p><h2 id="continue-title">Recent context</h2></div><button className="auris-home-entry__section-link" onClick={() => onNavigate("/notes")} type="button">Notes <ArrowUpRightIcon size={14} /></button></div>
          {recent.length ? (
            <div className="auris-home-entry__recent-list">
              {recent.map((note, index) => <button key={note.id} onClick={() => openNote(note)} type="button"><span>{String(index + 1).padStart(2, "0")}</span><strong>{noteTitle(note)}</strong><small>{formatRecentTime(note.updatedAt)}</small><ChevronRightIcon size={15} /></button>)}
            </div>
          ) : (
            <p className="auris-home-entry__quiet-empty auris-home-entry__recent-empty">There is no recent note yet. Your first one will appear here.</p>
          )}
        </section>

        <div className="auris-home-entry__lower-grid">
          <section className="auris-home-entry__nia" aria-labelledby="nia-title">
            <div className="auris-home-entry__nia-symbol"><OrbitIcon size={17} /></div>
            <div><p className="auris-home-entry__section-kicker" id="nia-title">Nia</p><p>{reviewBrief}</p></div>
            <button onClick={() => onNavigate("/nia")} type="button" aria-label="Open Nia"><ArrowUpRightIcon size={16} /></button>
          </section>
          <nav className="auris-home-entry__quick" aria-label="Quick actions">
            <button onClick={() => onNavigate("/notes")} type="button"><NotebookPenIcon size={16} /><span>Note</span></button>
            <button onClick={() => onNavigate("/flash")} type="button"><ZapIcon size={16} /><span>Flash</span></button>
            <button onClick={() => onNavigate("/review")} type="button"><HistoryIcon size={16} /><span>Review</span></button>
            <button onClick={() => onNavigate("/reading")} type="button"><BookOpenIcon size={16} /><span>Reading</span></button>
            <button onClick={() => onNavigate("/notes")} type="button"><ActivityIcon size={16} /><span>Desk</span></button>
          </nav>
        </div>

        <footer className="auris-home-entry__footer"><FolderIcon size={13} /> Auris keeps the day in view.</footer>
      </div>
    </main>
  );
}
