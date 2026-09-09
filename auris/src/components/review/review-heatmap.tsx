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
  ChevronDownIcon,
  ChevronRightIcon,
  HistoryIcon,
  InfoIcon,
} from "@/components/auris-ui/auris-icons";
import {
  STAGE_LABELS,
  buildReviewHeatmapModel,
  formatChineseDateOnly,
  reviewActivityLevel,
  type HeatmapMetricDimension,
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

const DIMENSION_TABS: Array<{ id: HeatmapMetricDimension; label: string }> = [
  { id: "count", label: "学习量" },
  { id: "duration", label: "学习时长" },
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
  const [metricDimension, setMetricDimension] = useState<HeatmapMetricDimension>("count");
  const [mode, setMode] = useState<ReviewHeatmapMode>("day");
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [activeHoverDate, setActiveHoverDate] = useState<string | null>(null);

  // Insights Accordions & Tooltip
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isDurationTrendOpen, setIsDurationTrendOpen] = useState(false);
  const [isTimeDistributionOpen, setIsTimeDistributionOpen] = useState(false);

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

  const peakDisplayValue = useMemo(() => {
    if (metricDimension === "count") {
      switch (mode) {
        case "day":
          return model.peakDailyReviews;
        case "week":
          return model.peakWeeklyReviews;
        case "cumulative":
          return model.totalReviews;
      }
    } else {
      switch (mode) {
        case "day":
          return model.peakDailyMinutes;
        case "week":
          return model.peakWeeklyMinutes;
        case "cumulative":
          return model.totalDurationMinutes;
      }
    }
  }, [metricDimension, mode, model]);

  const activeModeItem = HEATMAP_MODES.find((m) => m.id === mode) ?? HEATMAP_MODES[0];
  const unitLabel = metricDimension === "count" ? "词" : "分钟";

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
    return model.eventsByDate.get(selectedDate) ?? [];
  }, [mode, model.eventsByDate, model.eventsByWeek, selectedDate, selectedWeekIndex]);

  const tooltipInfo = useMemo(() => {
    if (!activeCell) return null;
    const week = weekByIndex.get(activeCell.weekIndex);

    let text = "";
    if (metricDimension === "count") {
      if (mode === "day") {
        text = `${formatChineseDateOnly(activeCell.date)}：${activeCell.count} 个词 (${activeCell.durationMinutes} 分钟)`;
      } else if (mode === "week") {
        text = week
          ? `${formatChineseDateOnly(week.rangeStart)}—${formatChineseDateOnly(week.rangeEnd)}：${week.totalCount} 个词 (${week.totalDurationMinutes} 分钟)`
          : `${formatChineseDateOnly(activeCell.date)}：${activeCell.count} 个词`;
      } else {
        text = `近 365 天累计至 ${formatChineseDateOnly(activeCell.date)}：${activeCell.cumulativeCount} 个词 (${activeCell.cumulativeDurationMinutes} 分钟)`;
      }
    } else {
      if (mode === "day") {
        text = `${formatChineseDateOnly(activeCell.date)}：${activeCell.durationMinutes} 分钟 (${activeCell.count} 个词)`;
      } else if (mode === "week") {
        text = week
          ? `${formatChineseDateOnly(week.rangeStart)}—${formatChineseDateOnly(week.rangeEnd)}：${week.totalDurationMinutes} 分钟 (${week.totalCount} 个词)`
          : `${formatChineseDateOnly(activeCell.date)}：${activeCell.durationMinutes} 分钟`;
      } else {
        text = `近 365 天累计至 ${formatChineseDateOnly(activeCell.date)}：${activeCell.cumulativeDurationMinutes} 分钟 (${activeCell.cumulativeCount} 个词)`;
      }
    }

    const x = activeCell.weekIndex * (blockSize + blockMargin) + blockSize / 2;
    const y = activeCell.weekday * (blockSize + blockMargin);

    return { text, x, y };
  }, [activeCell, blockMargin, blockSize, metricDimension, mode, weekByIndex]);

  const isEmpty = model.totalReviews === 0;

  return (
    <section aria-label="复盘热力图" className="output-review-view review-heatmap-view">
      {/* 1. Page Header aligned with other Auris views, with Dimension Switcher */}
      <div className="output-review-view__heading review-heatmap-view__heading">
        <div className="review-heatmap-view__title-group">
          <h2>复盘热力图</h2>
          <p>记录过去 365 天的复盘轨迹与输出频次。</p>
        </div>

        {/* Top-Right Dimension Switcher: [ 学习量 | 学习时长 ] */}
        <div aria-label="数据指标维度" className="review-heatmap-dimension-tabs" role="tablist">
          {DIMENSION_TABS.map((tab) => (
            <button
              aria-selected={metricDimension === tab.id}
              data-active={metricDimension === tab.id}
              key={tab.id}
              onClick={() => setMetricDimension(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Scrollable Body */}
      <div className="review-heatmap-scroll">
        {/* 5-Column Metric Bar */}
        <div aria-label="核心复盘指标" className="review-heatmap-5col" role="region">
          <div className="review-heatmap-5col__item">
            <strong className="review-heatmap-5col__val">
              {metricDimension === "count"
                ? `${model.totalReviews} 个词`
                : `${model.totalDurationMinutes} 分钟`}
            </strong>
            <span className="review-heatmap-5col__label">累计已学</span>
            <span className="sr-only">累计复盘 {model.totalReviews} 近 365 天完成</span>
          </div>

          <div className="review-heatmap-5col__item">
            <strong className="review-heatmap-5col__val">
              {metricDimension === "count"
                ? `${model.averageDailyReviews} 个词`
                : `${model.averageDailyMinutes} 分钟`}
            </strong>
            <span className="review-heatmap-5col__label">平均每日</span>
            <span className="sr-only">日均复盘</span>
          </div>

          <div className="review-heatmap-5col__item">
            <strong className="review-heatmap-5col__val">
              {metricDimension === "count"
                ? `${model.peakDailyReviews} 个词`
                : `${model.peakDailyMinutes} 分钟`}
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
            <h3 className="review-heatmap-section__title">学习热力图</h3>
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
              过去 365 天，共 {model.studiedDayCount} 天有复盘记录，累计完成 {model.totalReviews} 次复盘，单日最高 {model.peakDailyReviews} 次
            </p>
            {tooltipInfo && (
              <div
                aria-hidden="true"
                className="review-heatmap-tooltip"
                style={{
                  left: `${tooltipInfo.x}px`,
                  top: `${tooltipInfo.y}px`,
                }}
              >
                {tooltipInfo.text}
              </div>
            )}
            <svg
              aria-describedby={summaryId}
              aria-label="复盘热力图网格，过去 365 天"
              className="review-heatmap-svg"
              height={7 * blockSize + 6 * blockMargin}
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
                        if (metricDimension === "count") {
                          if (mode === "day") level = cell.level;
                          else if (mode === "week") level = week.level;
                          else level = reviewActivityLevel(cell.cumulativeCount, model.totalReviews);
                        } else {
                          if (mode === "day") level = cell.durationLevel;
                          else if (mode === "week") level = week.durationLevel;
                          else level = reviewActivityLevel(cell.cumulativeDurationMinutes, model.totalDurationMinutes);
                        }

                        const fill = `var(--heatmap-level-${level})`;
                        const isCellActive = activeHoverDate === cell.date || selectedDate === cell.date;
                        const isWeekActive = mode === "week" && isHoveredWeek;

                        return (
                          <rect
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
                    <li><strong>累计已学</strong>：过去 365 天内完成复盘的词汇总数（或专注学习总时长）。</li>
                    <li><strong>平均每日</strong>：有学习打卡记录的活跃天数内的日均复盘量。</li>
                    <li><strong>单日最多</strong>：过去 365 天内单日完成复盘的最高峰值。</li>
                    <li><strong>当前连续 / 最长连续</strong>：当前无间断连击天数与历史最高打卡连击天数。</li>
                    <li><strong>词根杠杆</strong>：已掌握 3 个以上词汇的核心产出词根或项目。</li>
                    <li><strong>顽固词</strong>：发生过 2 次以上延期复习或重新循环的重点突破词汇。</li>
                    <li><strong>时长变化</strong>：对比最近两次复盘的用时差值与学习节奏走势。</li>
                    <li><strong>学习时段</strong>：根据实际完成时间统计的高效黄金复盘时间段。</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="review-insights-grid">
            {/* Left Column: 词根杠杆 & 顽固词 */}
            <div className="review-insights-col">
              <div className="review-insights-card">
                <span className="review-insights-card__label">词根杠杆</span>
                <span className="review-insights-card__value">
                  {model.insights.leverage.summary}
                </span>
              </div>
              <div className="review-insights-card">
                <span className="review-insights-card__label">顽固词</span>
                <span className="review-insights-card__value">
                  {model.insights.stubborn.summary}
                </span>
              </div>
            </div>

            {/* Right Column: 时长变化 & 学习时段 */}
            <div className="review-insights-col">
              <div className="review-insights-card review-insights-card--interactive">
                <button
                  aria-expanded={isDurationTrendOpen}
                  className="review-insights-card__trigger"
                  onClick={() => setIsDurationTrendOpen((prev) => !prev)}
                  type="button"
                >
                  <ChevronDownIcon
                    className={`review-insights-card__chevron ${isDurationTrendOpen ? "is-expanded" : ""}`}
                    size={14}
                  />
                  <span className="review-insights-card__label">时长变化</span>
                  <span className="review-insights-card__value">
                    {model.insights.durationTrend.summary}
                  </span>
                </button>
                {isDurationTrendOpen && (
                  <div className="review-insights-card__drawer">
                    <div className="review-insights-drawer-row">
                      <span>最近复盘</span>
                      <strong>
                        {model.insights.durationTrend.latestReviews} 词 · {model.insights.durationTrend.latestMinutes} 分钟
                      </strong>
                    </div>
                    <div className="review-insights-drawer-row">
                      <span>上次复盘</span>
                      <strong>
                        {model.insights.durationTrend.previousReviews} 词 · {model.insights.durationTrend.previousMinutes} 分钟
                      </strong>
                    </div>
                    <div className="review-insights-drawer-row">
                      <span>本周 vs 上周</span>
                      <strong>
                        本周 {model.insights.durationTrend.thisWeekMinutes} 分钟 / 上周 {model.insights.durationTrend.lastWeekMinutes} 分钟
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="review-insights-card review-insights-card--interactive">
                <button
                  aria-expanded={isTimeDistributionOpen}
                  className="review-insights-card__trigger"
                  onClick={() => setIsTimeDistributionOpen((prev) => !prev)}
                  type="button"
                >
                  <ChevronDownIcon
                    className={`review-insights-card__chevron ${isTimeDistributionOpen ? "is-expanded" : ""}`}
                    size={14}
                  />
                  <span className="review-insights-card__label">学习时段</span>
                  <span className="review-insights-card__value">
                    {model.insights.timeDistribution.summary}
                  </span>
                </button>
                {isTimeDistributionOpen && (
                  <div className="review-insights-card__drawer">
                    <div className="review-insights-slots">
                      {model.insights.timeDistribution.slots.map((slot) => (
                        <div className="review-insights-slot-item" key={slot.label}>
                          <div className="review-insights-slot-item__header">
                            <span>{slot.label}</span>
                            <strong>{slot.count} 次 ({slot.percentage}%)</strong>
                          </div>
                          <div className="review-insights-slot-bar">
                            <div
                              className="review-insights-slot-bar__fill"
                              style={{ width: `${slot.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
        ) : (
          <div className="review-heatmap-detail">
            <div className="review-heatmap-detail__header">
              <h3>
                {mode === "week" && selectedWeek
                  ? `${formatChineseDateOnly(selectedWeek.rangeStart)} — ${formatChineseDateOnly(selectedWeek.rangeEnd)} 本周复盘明细`
                  : `${formatChineseDateOnly(selectedDate)} 复盘明细`}
              </h3>
              <span className="review-heatmap-detail__badge">
                {selectedEvents.length} 个词
              </span>
            </div>

            {selectedEvents.length > 0 ? (
              <div className="review-heatmap-detail__list">
                {selectedEvents.map((item) => (
                  <button
                    className="review-heatmap-detail-item"
                    key={item.event.id}
                    onClick={() => onOpen(item.point.id)}
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
          </div>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        已切换为{metricDimension === "count" ? "学习量" : "学习时长"}统计，{activeModeItem.label}视图
      </p>
    </section>
  );
}
