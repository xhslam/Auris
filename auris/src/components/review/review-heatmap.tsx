"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  CalendarDaysIcon,
  ChevronRightIcon,
  HistoryIcon,
  InfoIcon,
} from "@/components/auris-ui/auris-icons";
import {
  STAGE_LABELS,
  buildReviewHeatmapModel,
  formatChineseDateOnly,
  reviewActivityLevel,
  type OutputReviewState,
  type ReviewHeatmapMode,
} from "@/features/output-review/output-review-model";
import "./review-heatmap.css";

export const HEATMAP_BLOCK_PARAMS = {
  marginPx: 5,
  radiusPx: 4,
  sizeMinPx: 10,
};

export function computeHeatmapCalendarLayout(
  containerWidthPx: number,
  weekCount: number,
) {
  const tokenMargin = HEATMAP_BLOCK_PARAMS.marginPx;
  const minSize = HEATMAP_BLOCK_PARAMS.sizeMinPx;
  if (weekCount <= 0 || containerWidthPx <= 0) {
    return {
      blockSize: minSize,
      blockMargin: tokenMargin,
    };
  }
  const gaps = weekCount - 1;
  const sizeFloor = Math.floor((containerWidthPx - gaps * tokenMargin) / weekCount);
  if (sizeFloor < minSize) {
    return {
      blockSize: minSize,
      blockMargin: tokenMargin,
    };
  }
  return {
    blockSize: sizeFloor,
    blockMargin: gaps > 0 ? (containerWidthPx - weekCount * sizeFloor) / gaps : 0,
  };
}

const HEATMAP_MODES: Array<{ id: ReviewHeatmapMode; label: string; unit: string }> = [
  { id: "day", label: "每日", unit: "单日" },
  { id: "week", label: "每周", unit: "单周" },
  { id: "cumulative", label: "累计", unit: "累计" },
];

export function ReviewHeatmap({
  state,
  today,
  onOpen,
  onGoToToday,
}: {
  state: OutputReviewState;
  today: string;
  onOpen: (id: string) => void;
  onGoToToday?: () => void;
}) {
  const [detailPage, setDetailPage] = useState(0);
  const detailRef = useRef<HTMLDialogElement>(null);
  const openDetails = () => { setDetailPage(0); detailRef.current?.showModal(); };
  const [mode, setMode] = useState<ReviewHeatmapMode>("day");
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [activeHoverDate, setActiveHoverDate] = useState<string | null>(null);

  // Insights Accordions & Tooltip
  const [isInfoOpen, setIsInfoOpen] = useState(false);


  const model = useMemo(() => buildReviewHeatmapModel(state, today), [state, today]);
  const containerRef = useRef<HTMLDivElement>(null);
  const summaryId = useId();

  const weekCount = model.weeks.length;
  const [layout, setLayout] = useState(() => computeHeatmapCalendarLayout(0, weekCount));
  const { blockSize, blockMargin } = layout;

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const syncSize = () => {
      setLayout(computeHeatmapCalendarLayout(node.clientWidth, weekCount));
    };
    syncSize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [weekCount]);

  const dates = useMemo(() => model.cells.map((cell) => cell.date), [model.cells]);
  const cellByDate = useMemo(() => new Map(model.cells.map((cell) => [cell.date, cell])), [model.cells]);
  const weekByIndex = useMemo(() => new Map(model.weeks.map((w) => [w.index, w])), [model.weeks]);

  const rovingDate = activeHoverDate ?? selectedDate ?? dates.at(-1) ?? null;
  const activeCell = activeHoverDate ? cellByDate.get(activeHoverDate) : null;
  const activeWeek = activeCell ? weekByIndex.get(activeCell.weekIndex) : null;

  const peakDisplayValue = mode === "day" ? model.peakDailyReviews : mode === "week" ? model.peakWeeklyReviews : model.totalReviews;

  const activeModeItem = HEATMAP_MODES.find((m) => m.id === mode) ?? HEATMAP_MODES[0];
  const unitLabel = "个知识点";

  const handleGridKeyDown = useCallback(
    (event: KeyboardEvent<SVGRectElement>, currentDate: string) => {
      const currentIndex = dates.indexOf(currentDate);
      if (currentIndex < 0) return;

      let nextIndex: number | null = null;
      if (event.key === "ArrowUp") nextIndex = currentIndex - 1;
      else if (event.key === "ArrowDown") nextIndex = currentIndex + 1;
      else if (event.key === "ArrowLeft") nextIndex = currentIndex - 7;
      else if (event.key === "ArrowRight") nextIndex = currentIndex + 7;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = dates.length - 1;
      else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSelectedDate(currentDate);
        openDetails();
        return;
      }

      if (nextIndex !== null && nextIndex >= 0 && nextIndex < dates.length) {
        event.preventDefault();
        const nextDate = dates[nextIndex];
        setActiveHoverDate(nextDate);
        setSelectedDate(nextDate);
        const nextElem = containerRef.current?.querySelector<SVGRectElement>(
          `rect[data-date="${nextDate}"]`,
        );
        nextElem?.focus();
      }
    },
    [dates],
  );

  const selectedWeekIndex = useMemo(() => {
    const c = cellByDate.get(selectedDate);
    return c?.weekIndex ?? null;
  }, [cellByDate, selectedDate]);

  const selectedWeek = selectedWeekIndex !== null ? weekByIndex.get(selectedWeekIndex) : null;

  const selectedEvents = useMemo(() => {
    if (mode === "week") {
      if (selectedWeekIndex === null) return [];
      return model.eventsByWeek.get(selectedWeekIndex) ?? [];
    }
    if (mode === "cumulative") {
      return model.cells.filter((cell) => cell.date <= selectedDate).flatMap((cell) => model.eventsByDate.get(cell.date) ?? []);
    }
    return model.eventsByDate.get(selectedDate) ?? [];
  }, [mode, model.cells, model.eventsByDate, model.eventsByWeek, selectedDate, selectedWeekIndex]);

  const selectedPoints = useMemo(() => {
    const seen = new Set<string>();
    return [...selectedEvents].sort((a, b) => (b.event.completedAt ?? b.completionDate).localeCompare(a.event.completedAt ?? a.completionDate)).filter((item) => {
      if (seen.has(item.point.id)) return false;
      seen.add(item.point.id);
      return true;
    });
  }, [selectedEvents]);
  const detailPageCount = Math.max(1, Math.ceil(selectedPoints.length / 4));

  const tooltipInfo = useMemo(() => {
    if (!activeCell) return null;
    const week = weekByIndex.get(activeCell.weekIndex);

    const text = mode === "week" && week
      ? `${formatChineseDateOnly(week.rangeStart)}—${formatChineseDateOnly(week.rangeEnd)}：${week.totalCount} 个知识点`
      : mode === "cumulative"
        ? `累计至 ${formatChineseDateOnly(activeCell.date)}：${activeCell.cumulativeCount} 个知识点`
        : `${formatChineseDateOnly(activeCell.date)}：${activeCell.count} 个知识点`;

    return { text };
  }, [activeCell, mode, weekByIndex]);

  const isEmpty = model.totalReviews === 0;

  return (
    <section aria-label="复盘热力图" className="output-review-view review-heatmap-view">
      {/* 1. Page Header aligned with other Auris views, with Dimension Switcher */}
      <div className="output-review-view__heading review-heatmap-view__heading">
        <div className="review-heatmap-view__title-group">
          <h2>复盘热力图</h2>
          <p>过去 365 天 · 按知识点统计你的复习足迹</p>
        </div>

        <span className="review-heatmap-unit">统计单位 · 知识点</span>
      </div>

      {/* 2. Single-screen Body */}
      <div className="review-heatmap-body">
        {/* 5-Column Metric Bar */}
        <div aria-label="核心复盘指标" className="review-heatmap-5col" role="region">
          <div className="review-heatmap-5col__item">
            <strong className="review-heatmap-5col__val">
              {`${model.totalReviews} 个知识点`}
            </strong>
            <span className="review-heatmap-5col__label">累计复习</span>
            <span className="sr-only">累计复盘 {model.totalReviews} 近 365 天完成</span>
          </div>

          <div className="review-heatmap-5col__item">
            <strong className="review-heatmap-5col__val">
              {`${model.averageDailyReviews} 个知识点`}
            </strong>
            <span className="review-heatmap-5col__label">平均每日</span>
            <span className="sr-only">日均复盘</span>
          </div>

          <div className="review-heatmap-5col__item">
            <strong className="review-heatmap-5col__val">
              {`${model.peakDailyReviews} 个知识点`}
            </strong>
            <span className="review-heatmap-5col__label">单日最多</span>
            <span className="sr-only">单日最高</span>
          </div>

          <div className="review-heatmap-5col__item">
            <strong className="review-heatmap-5col__val">
              {model.currentStreak} 天
            </strong>
            <span className="review-heatmap-5col__label">当前连续</span>
            <span className="sr-only">连续复盘</span>
          </div>

          <div className="review-heatmap-5col__item">
            <strong className="review-heatmap-5col__val">
              {model.longestStreak} 天
            </strong>
            <span className="review-heatmap-5col__label">最长连续</span>
            <span className="sr-only">历史最长打卡</span>
          </div>
        </div>

        {/* 3. Learning Heatmap Section */}
        <div className="review-heatmap-section">
          <div className="review-heatmap-section__header">
            <h3 className="review-heatmap-section__title">复习热力图</h3>
            <div className="review-heatmap-view__controls">
              {!isEmpty && (
                <div className="review-heatmap-legend">
                  {peakDisplayValue > 0 ? (
                    <span className="review-heatmap-legend__text">
                      最深≈{activeModeItem.unit} {peakDisplayValue} {unitLabel}
                    </span>
                  ) : null}
                  <span
                    aria-label={`颜色由浅到深代表${activeModeItem.unit}复盘量递增`}
                    className="review-heatmap-legend__swatches"
                    role="img"
                  >
                    {[1, 2, 3, 4].map((level) => (
                      <span
                        aria-hidden="true"
                        className="review-heatmap-legend__swatch"
                        key={level}
                        style={{ backgroundColor: `var(--heatmap-level-${level})` }}
                      />
                    ))}
                  </span>
                </div>
              )}
              <div aria-label="热力图统计周期" className="review-heatmap-tabs" role="tablist">
                {HEATMAP_MODES.map((tab) => (
                  <button
                    aria-selected={mode === tab.id}
                    data-active={mode === tab.id}
                    key={tab.id}
                    onClick={() => setMode(tab.id)}
                    role="tab"
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* SVG Heatmap Container */}
          <div className="review-heatmap-canvas-container" ref={containerRef}>
            <p className="sr-only" id={summaryId}>
              过去 365 天，共 {model.studiedDayCount} 天有复盘记录，累计复习 {model.totalReviews} 个知识点，单日最高 {model.peakDailyReviews} 个知识点
            </p>
            {tooltipInfo && (
              <div
                aria-hidden="true"
                className="review-heatmap-tooltip"
                style={{
                  left: "50%",
                  top: "0px",
                }}
              >
                {tooltipInfo.text}
              </div>
            )}
            <svg
              aria-describedby={summaryId}
              aria-label="复盘热力图网格，过去 365 天"
              className="review-heatmap-svg"
              viewBox={`-2 -2 ${weekCount * (blockSize + blockMargin) - blockMargin + 4} ${7 * blockSize + 6 * blockMargin + 4}`}
              height={7 * blockSize + 6 * blockMargin + 4}
              preserveAspectRatio="none"
              role="grid"
              width="100%"
            >
              {model.weeks.map((week) => {
                const x = week.index * (blockSize + blockMargin);
                const isHoveredWeek = activeWeek?.index === week.index;
                return (
                  <g key={week.index} role="row">
                    {model.cells
                      .filter((c) => c.weekIndex === week.index)
                      .map((cell) => {
                        const y = cell.weekday * (blockSize + blockMargin);
                        let level = 0;
                        if (mode === "day") level = cell.level;
                        else if (mode === "week") level = week.level;
                        else level = reviewActivityLevel(cell.cumulativeCount, model.totalReviews);

                        const fill = `var(--heatmap-level-${level})`;
                        const isCellActive = activeHoverDate === cell.date || selectedDate === cell.date;
                        const isWeekActive = mode === "week" && isHoveredWeek;

                        return (
                          <rect
                            aria-label={`${cell.date}，${cell.count} 个知识点`}
                            className="review-heatmap-cell"
                            data-active={isCellActive ? "true" : undefined}
                            data-date={cell.date}
                            data-level={level}
                            data-selected={selectedDate === cell.date ? "true" : undefined}
                            data-week-active={isWeekActive ? "true" : undefined}
                            fill={fill}
                            height={blockSize}
                            key={cell.date}
                            onBlur={() => setActiveHoverDate(null)}
                            onClick={() => {
                              setSelectedDate(cell.date);
                              openDetails();
                              setActiveHoverDate(cell.date);
                            }}
                            onFocus={() => setActiveHoverDate(cell.date)}
                            onKeyDown={(event) => handleGridKeyDown(event, cell.date)}
                            onPointerEnter={() => setActiveHoverDate(cell.date)}
                            onPointerLeave={() => setActiveHoverDate(null)}
                            role="gridcell"
                            rx={HEATMAP_BLOCK_PARAMS.radiusPx}
                            ry={HEATMAP_BLOCK_PARAMS.radiusPx}
                            tabIndex={rovingDate === cell.date ? 0 : -1}
                            width={blockSize}
                            x={x}
                            y={y}
                          />
                        );
                      })}
                  </g>
                );
              })}
            </svg>

            {/* Month Labels aligned to grid columns */}
            {weekCount > 0 && model.monthSegments.length > 0 && (
              <div aria-hidden="true" className="review-heatmap-months">
                {model.monthSegments.map((segment) => (
                  <span
                    key={segment.key}
                    style={{
                      flexGrow: segment.weeks,
                      flexBasis: 0,
                    }}
                  >
                    {segment.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 4. Learning Insights Section */}
        <div aria-label="学习洞察" className="review-insights-section">
          <div className="review-insights-header">
            <div className="review-insights-header__title">
              <h3>学习洞察</h3>
              <button
                aria-expanded={isInfoOpen}
                aria-label="查看统计口径说明"
                className="review-insights-info-btn"
                onClick={() => setIsInfoOpen((prev) => !prev)}
                type="button"
              >
                <InfoIcon size={14} />
              </button>
            </div>
            {isInfoOpen && (
              <div aria-label="统计口径说明" className="review-insights-popover" role="dialog">
                <div className="review-insights-popover__content">
                  <h4>📊 统计口径说明</h4>
                  <ul>
                    <li><strong>累计复习</strong>：过去 365 天完成复习的知识点去重个数。</li>
                    <li><strong>每日 / 每周 / 累计</strong>：按对应周期内的知识点 ID 去重；重复复习不会增加该周期的个数。</li>
                    <li><strong>平均每日</strong>：每日去重个数之和 ÷ 有复习记录的天数。</li>
                    <li><strong>当前连续 / 最长连续</strong>：当前连续复习天数与截至今天的历史最长连续天数。</li>
                    <li><strong>项目掌握</strong>：完成 Day 7 或标记掌握的知识点。</li>
                    <li><strong>待巩固</strong>：曾延期至少 2 天或开启过多轮复习的知识点。</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="review-insights-grid">
            <div className="review-insights-col">
              <div className="review-insights-card">
                <span className="review-insights-card__label">项目掌握</span>
                <span className="review-insights-card__value">{model.insights.leverage.summary}</span>
              </div>
              <div className="review-insights-card">
                <span className="review-insights-card__label">待巩固</span>
                <span className="review-insights-card__value">{model.insights.stubborn.summary}</span>
              </div>
            </div>
            <div className="review-insights-col">
              <div className="review-insights-card">
                <span className="review-insights-card__label">复习节奏</span>
                <span className="review-insights-card__value">过去一年有 {model.studiedDayCount} 天完成复习</span>
              </div>
              <button className="review-insights-card review-insights-card__trigger" onClick={openDetails} type="button">
                <span className="review-insights-card__label">复习明细</span>
                <span className="review-insights-card__value">选择日期，查看复习的知识点</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* 5. Drilldown Details / Empty State */}
        {isEmpty ? (
          <div className="review-heatmap-empty">
            <HistoryIcon size={36} />
            <h3>还没有复盘记录</h3>
            <p>学完知识点后在今天视图完成第一次输出复盘，这里将记录你的复盘轨迹。</p>
            {onGoToToday && (
              <button className="output-review-primary" onClick={onGoToToday} type="button">
                去今日复习
              </button>
            )}
          </div>
        ) : null}
      </div>
      <dialog ref={detailRef} aria-label="复习知识点明细" className="review-heatmap-dialog">
          <div className="review-heatmap-detail">
            <div className="review-heatmap-detail__header">
              <h3>
                {mode === "week" && selectedWeek
                  ? `${formatChineseDateOnly(selectedWeek.rangeStart)} — ${formatChineseDateOnly(selectedWeek.rangeEnd)} 本周复盘明细`
                  : mode === "cumulative" ? `近 365 天截至 ${formatChineseDateOnly(selectedDate)} 累计明细` : `${formatChineseDateOnly(selectedDate)} 复盘明细`}
              </h3>
              <span className="review-heatmap-detail__badge">
                {selectedPoints.length} 个知识点
              </span>
            </div>

            <button className="review-heatmap-dialog__close" onClick={() => detailRef.current?.close()} type="button">关闭明细</button>
            {selectedEvents.length > 0 ? (
              <div className="review-heatmap-detail__list">
                {selectedPoints.slice(detailPage * 4, detailPage * 4 + 4).map((item) => (
                  <button
                    className="review-heatmap-detail-item"
                    key={item.event.id}
                    onClick={() => { detailRef.current?.close(); onOpen(item.point.id); }}
                    type="button"
                  >
                    <div className="review-heatmap-detail-item__meta">
                      <span className="review-heatmap-detail-item__stage">
                        {STAGE_LABELS[item.event.stage]}
                      </span>
                      <strong className="review-heatmap-detail-item__title">
                        {item.point.title}
                      </strong>
                      {item.project && (
                        <span className="review-heatmap-detail-item__project">
                          · {item.project.name}
                        </span>
                      )}
                    </div>
                    <div className="review-heatmap-detail-item__end">
                      {item.event.completedAt ? (
                        <span className="review-heatmap-detail-item__time">
                          {new Date(item.event.completedAt).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      ) : null}
                      {(item.event.delayDays ?? 0) > 0 ? (
                        <span className="review-heatmap-detail-item__delay">
                          延迟 {item.event.delayDays} 天
                        </span>
                      ) : (
                        <span className="review-heatmap-detail-item__ontime">准时完成</span>
                      )}
                      <ChevronRightIcon size={14} />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="review-heatmap-detail__empty">
                <CalendarDaysIcon size={24} />
                <p>该日期没有复盘记录。点击上方热力图中有颜色的方块即可查看明细。</p>
              </div>
            )}
            <nav aria-label="复习明细分页" className="review-heatmap-pagination">
              <button disabled={detailPage === 0} onClick={() => setDetailPage((page) => page - 1)} type="button">上一页</button>
              <span>{detailPage + 1} / {detailPageCount}</span>
              <button disabled={(detailPage + 1) * 4 >= selectedPoints.length} onClick={() => setDetailPage((page) => page + 1)} type="button">下一页</button>
            </nav>
          </div>
      </dialog>

      <p aria-live="polite" className="sr-only">
        按知识点个数统计，{activeModeItem.label}视图
      </p>
    </section>
  );
}
