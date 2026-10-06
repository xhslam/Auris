"use client";

import {
  ArrowSquareOut,
  CalendarBlank,
  CaretDown,
  ClockCounterClockwise,
  DotsThree,
  Hash,
  ListBullets,
  ListChecks,
  MagnifyingGlass,
  Notebook,
  PaperPlaneRight,
  Quotes,
  Sparkle,
  SquaresFour,
  Star,
  Trash,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DesktopAppFrame } from "@/components/desktop/desktop-app-frame";
import {
  buildFlashActivity,
  readFlashItems,
  writeFlashItems,
  type FlashFilter,
  type FlashItem,
} from "@/features/flash/flash-store";
import { getNotesStorage } from "@/platform/notes/get-notes-storage";
import "./flash-page.css";

const FILTER_LABELS: Record<FlashFilter, string> = {
  all: "全部闪念",
  favorites: "收藏闪念",
  today: "今日闪念",
};

function isSameDay(first: Date, second: Date): boolean {
  return first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate();
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value)).replaceAll("/", "-");
}

function getActiveDayCount(items: FlashItem[]): number {
  return new Set(
    items.map((item) => new Date(item.createdAt).toLocaleDateString("zh-CN")),
  ).size;
}

function getMonthLabels(activity: ReturnType<typeof buildFlashActivity>): string[] {
  return Array.from(
    new Map(
      activity.map((day) => {
        const date = new Date(`${day.dateKey}T00:00:00`);
        return [`${date.getFullYear()}-${date.getMonth()}`, `${date.getMonth() + 1}月`];
      }),
    ).values(),
  );
}

function getVisibleItems(
  items: FlashItem[],
  filter: FlashFilter,
  searchQuery: string,
): FlashItem[] {
  const today = new Date();
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("zh-CN");

  return items.filter((item) => {
    const matchesFilter = filter === "all" ||
      (filter === "favorites" && item.isFavorite) ||
      (filter === "today" && isSameDay(new Date(item.createdAt), today));
    const matchesSearch = !normalizedQuery ||
      item.text.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
    return matchesFilter && matchesSearch;
  });
}

export function FlashPageClient() {
  const router = useRouter();
  const [items, setItems] = useState<FlashItem[]>([]);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<FlashFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const notesStorage = useMemo(() => getNotesStorage(), []);
  const activity = useMemo(() => buildFlashActivity(items), [items]);
  const visibleItems = useMemo(
    () => getVisibleItems(items, filter, searchQuery),
    [filter, items, searchQuery],
  );

  useEffect(() => {
    setItems(readFlashItems(window.localStorage));
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setIsFilterMenuOpen(false);
        setActiveMenuId(null);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const commitItems = useCallback((nextItems: FlashItem[]) => {
    setItems(nextItems);
    setNotice(
      writeFlashItems(window.localStorage, nextItems)
        ? null
        : "闪念已保留在当前页面，但无法写入本地存储。",
    );
  }, []);

  const save = useCallback(() => {
    const text = draft.trim();
    if (!text) {
      return;
    }

    commitItems([
      {
        createdAt: new Date().toISOString(),
        id: `${Date.now().toString(36)}-${items.length}`,
        isFavorite: false,
        text,
      },
      ...items,
    ]);
    setDraft("");
    inputRef.current?.focus();
  }, [commitItems, draft, items]);

  const insertAtCursor = useCallback((prefix: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    const nextDraft = `${draft.slice(0, start)}${prefix}${draft.slice(end)}`;
    setDraft(nextDraft);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }, [draft]);

  const remove = useCallback((id: string) => {
    commitItems(items.filter((item) => item.id !== id));
    setActiveMenuId(null);
  }, [commitItems, items]);

  const toggleFavorite = useCallback((id: string) => {
    commitItems(
      items.map((item) => item.id === id
        ? { ...item, isFavorite: !item.isFavorite }
        : item),
    );
  }, [commitItems, items]);

  const convertToNote = useCallback(async (item: FlashItem) => {
    if (!notesStorage) {
      setNotice("当前笔记库不可用，闪念仍保留在这里。");
      return;
    }

    const title = item.text.split("\n")[0].slice(0, 40) || "未命名笔记";
    try {
      const page = await notesStorage.createPage({ title });
      await notesStorage.savePage({ ...page, markdownBody: item.text, title });
      commitItems(items.filter((candidate) => candidate.id !== item.id));
      router.push(`/notes?resumeNoteId=${encodeURIComponent(page.id)}`);
    } catch {
      setNotice("整理成笔记失败，原闪念没有被删除。");
    }
  }, [commitItems, items, notesStorage, router]);

  const selectFilter = useCallback((nextFilter: FlashFilter) => {
    setFilter(nextFilter);
    setIsFilterMenuOpen(false);
  }, []);

  const activeDays = getActiveDayCount(items);
  const favoriteCount = items.filter((item) => item.isFavorite).length;
  const monthLabels = getMonthLabels(activity);

  return (
    <DesktopAppFrame activeNavId="flash" activeWorkspace="home" subtitle="Flash" title="闪念">
      <main className="flash-workspace">
        <aside className="flash-workspace__insights" aria-label="闪念概览">
          <div className="flash-workspace__brand">
            <span className="flash-workspace__brand-mark"><Sparkle size={18} weight="fill" /></span>
            <span>Auris 闪念</span>
          </div>

          <div className="flash-workspace__stats" aria-label="闪念统计">
            <div><strong>{items.length}</strong><span>闪念</span></div>
            <div><strong>{favoriteCount}</strong><span>收藏</span></div>
            <div><strong>{activeDays}</strong><span>活跃天</span></div>
          </div>

          <section className="flash-workspace__activity" aria-label="闪念活跃记录">
            <div className="flash-workspace__heatmap">
              {activity.map((day) => (
                <span
                  aria-label={`${day.dateKey}：${day.count} 条闪念`}
                  data-level={day.level}
                  key={day.dateKey}
                  title={`${day.dateKey} · ${day.count} 条`}
                />
              ))}
            </div>
            <div className="flash-workspace__months">
              {monthLabels.map((month, index) => <span key={`${month}-${index}`}>{month}</span>)}
            </div>
          </section>

          <nav className="flash-workspace__nav" aria-label="闪念筛选">
            <button data-active={filter === "all"} onClick={() => selectFilter("all")} type="button">
              <SquaresFour size={18} /><span>全部闪念</span><small>{items.length}</small>
            </button>
            <button data-active={filter === "today"} onClick={() => selectFilter("today")} type="button">
              <CalendarBlank size={18} /><span>今日闪念</span>
            </button>
            <button aria-label="收藏闪念" data-active={filter === "favorites"} onClick={() => selectFilter("favorites")} type="button">
              <Star size={18} /><span>收藏</span><small>{favoriteCount}</small>
            </button>
          </nav>

          <div className="flash-workspace__related">
            <p>继续整理</p>
            <button onClick={() => router.push("/")} type="button">
              <ClockCounterClockwise size={18} /><span>每日回顾</span>
            </button>
            <button onClick={() => router.push("/notes")} type="button">
              <Notebook size={18} /><span>本地笔记</span>
            </button>
          </div>
        </aside>

        <section className="flash-workspace__main">
          <header className="flash-workspace__topbar">
            <div className="flash-workspace__filter-control">
              <h1>
                <button
                  aria-expanded={isFilterMenuOpen}
                  className="flash-workspace__filter-trigger"
                  onClick={() => setIsFilterMenuOpen((open) => !open)}
                  type="button"
                >
                  <span>{FILTER_LABELS[filter]}</span><CaretDown size={15} />
                </button>
              </h1>
              {isFilterMenuOpen ? (
                <div className="flash-workspace__filter-menu" role="menu">
                  {(Object.keys(FILTER_LABELS) as FlashFilter[]).map((filterId) => (
                    <button key={filterId} onClick={() => selectFilter(filterId)} role="menuitem" type="button">
                      {FILTER_LABELS[filterId]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <label className="flash-workspace__search">
              <MagnifyingGlass size={18} />
              <input
                aria-label="搜索闪念"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索闪念"
                ref={searchRef}
                type="search"
                value={searchQuery}
              />
              <kbd>Ctrl K</kbd>
            </label>
          </header>

          <section className="flash-composer" aria-label="新建闪念">
            <textarea
              aria-label="记录一条闪念"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  save();
                }
              }}
              placeholder="现在的想法是…"
              ref={inputRef}
              rows={5}
              value={draft}
            />
            <div className="flash-composer__toolbar">
              <div>
                <button aria-label="插入标签" onClick={() => insertAtCursor("#")} title="插入标签" type="button"><Hash size={20} /></button>
                <button aria-label="插入列表" onClick={() => insertAtCursor("- ")} title="插入列表" type="button"><ListBullets size={20} /></button>
                <button aria-label="插入任务" onClick={() => insertAtCursor("- [ ] ")} title="插入任务" type="button"><ListChecks size={20} /></button>
                <button aria-label="插入引用" onClick={() => insertAtCursor("> ")} title="插入引用" type="button"><Quotes size={20} /></button>
              </div>
              <button aria-label="保存闪念" className="flash-composer__submit" disabled={!draft.trim()} onClick={save} title="保存闪念" type="button">
                <PaperPlaneRight size={20} weight="fill" />
              </button>
            </div>
          </section>

          {notice ? <div className="flash-workspace__notice" role="status">{notice}</div> : null}

          <div className="flash-timeline" aria-live="polite">
            {visibleItems.length > 0 ? visibleItems.map((item) => (
              <article className="flash-card" key={item.id}>
                <header>
                  <time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
                  <div className="flash-card__actions">
                    <button
                      aria-label={`${item.isFavorite ? "取消收藏" : "收藏"} ${item.text}`}
                      data-active={item.isFavorite}
                      onClick={() => toggleFavorite(item.id)}
                      title={item.isFavorite ? "取消收藏" : "收藏"}
                      type="button"
                    >
                      <Star size={17} weight={item.isFavorite ? "fill" : "regular"} />
                    </button>
                    <button aria-expanded={activeMenuId === item.id} aria-label={`更多操作 ${item.text}`} onClick={() => setActiveMenuId((current) => current === item.id ? null : item.id)} title="更多操作" type="button">
                      <DotsThree size={21} weight="bold" />
                    </button>
                    {activeMenuId === item.id ? (
                      <div className="flash-card__menu" role="menu">
                        <button onClick={() => void convertToNote(item)} role="menuitem" type="button"><ArrowSquareOut size={16} />整理成笔记</button>
                        <button onClick={() => remove(item.id)} role="menuitem" type="button"><Trash size={16} />删除闪念</button>
                      </div>
                    ) : null}
                  </div>
                </header>
                <div className="flash-card__body">{item.text}</div>
              </article>
            )) : (
              <section className="flash-timeline__empty">
                <Sparkle size={25} />
                <h2>{searchQuery ? "没有找到匹配的闪念" : "这里还没有闪念"}</h2>
                <p>{searchQuery ? "换一个关键词试试。" : "先写下来，整理可以稍后再做。"}</p>
              </section>
            )}
          </div>
        </section>
      </main>
    </DesktopAppFrame>
  );
}
