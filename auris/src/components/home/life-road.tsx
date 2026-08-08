"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NotebookPenIcon, OrbitIcon } from "@/components/auris-ui/auris-icons";
import type { LifeNodeRecord } from "@/features/home/home-store";

type LifeRoadProps = {
  birthYear: number;
  records: LifeNodeRecord[];
  onUpdateRecord: (year: number, text: string) => void;
  onUpdateBirthYear: (birthYear: number) => void;
};

type RoadNode = {
  age: number;
  cx: number;
  cy: number;
  hw: number;
  opacity: number;
  scale: number;
  year: number;
};

type Star = {
  id: number;
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
};

/** 确定性星空：每次渲染位置一致，不闪跳。 */
function makeStars(count: number): Star[] {
  let seed = 20260626;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  return Array.from({ length: count }, (_, id) => ({
    id,
    left: rand() * 100,
    top: rand() * 100,
    size: 1 + rand() * 1.8,
    delay: rand() * 5,
    duration: 2.6 + rand() * 3.4,
  }));
}

const TRACK_WIDTH = 520;
const NODE_SPACING = 108;
const TOP_PAD = 150;
const BOTTOM_PAD = 150;
const START_AGE = 18;
const MAX_AGE = 85;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundRoadValue(value: number) {
  return Number(value.toFixed(2));
}

/** 取记录的首行非空文字，截断后显示在节点上。 */
function nodeSnippet(text: string) {
  const line = text
    .split("\n")
    .map((value) => value.trim())
    .find((value) => value.length > 0);

  if (!line) {
    return "";
  }

  return line.length > 16 ? `${line.slice(0, 16)}…` : line;
}

function pathFor(nodes: RoadNode[]) {
  return nodes
    .map((node, index) => `${index === 0 ? "M" : "L"} ${node.cx.toFixed(2)} ${node.cy.toFixed(2)}`)
    .join(" ");
}

/** 把路画成近宽远窄的填充带，制造纵深立体感。 */
function ribbonFor(nodes: RoadNode[]) {
  if (nodes.length === 0) {
    return "";
  }

  const leftEdge = nodes.map(
    (node) => `${(node.cx - node.hw).toFixed(2)} ${node.cy.toFixed(2)}`,
  );
  const rightEdge = [...nodes]
    .reverse()
    .map((node) => `${(node.cx + node.hw).toFixed(2)} ${node.cy.toFixed(2)}`);

  return `M ${leftEdge.join(" L ")} L ${rightEdge.join(" L ")} Z`;
}

export function LifeRoad({
  birthYear,
  onUpdateBirthYear,
  onUpdateRecord,
  records,
}: LifeRoadProps) {
  const currentYear = new Date().getFullYear();
  const currentAge = currentYear - birthYear;
  const totalNodes = MAX_AGE - START_AGE + 1;
  const currentIndex = clamp(currentAge - START_AGE, 0, totalNodes - 1);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const recordByYear = useMemo(
    () => new Map(records.map((record) => [record.year, record])),
    [records],
  );

  const stars = useMemo(() => makeStars(64), []);

  const trackHeight = TOP_PAD + (totalNodes - 1) * NODE_SPACING + BOTTOM_PAD;

  // 18 岁在最下方（最近、最大），岁数越大越往上、越小越淡 —— 向纵深延伸。
  const nodes = useMemo<RoadNode[]>(() => {
    return Array.from({ length: totalNodes }, (_, index) => {
      const age = START_AGE + index;
      const depth = totalNodes > 1 ? index / (totalNodes - 1) : 0;
      const scale = roundRoadValue(1 - depth * 0.46);
      const opacity = roundRoadValue(1 - depth * 0.66);
      const amp = 150 * scale;

      return {
        age,
        cx: roundRoadValue(TRACK_WIDTH / 2 + Math.sin(index * 0.7) * amp),
        cy: roundRoadValue(trackHeight - BOTTOM_PAD - index * NODE_SPACING),
        // 近端（18 岁）路面最宽，远端最窄 —— 透视收束。
        hw: roundRoadValue(5 + (1 - depth) * 23),
        opacity,
        scale,
        year: birthYear + age,
      };
    });
  }, [birthYear, totalNodes, trackHeight]);

  const roadPath = pathFor(nodes);
  const ribbonPath = ribbonFor(nodes);
  const selectedRecord = selectedYear === null ? null : recordByYear.get(selectedYear);
  const selectedAge = selectedYear === null ? null : selectedYear - birthYear;
  const selectedNode =
    selectedYear === null
      ? null
      : (nodes.find((node) => node.year === selectedYear) ?? null);
  // 对话框弹在节点较空的那一侧：节点偏右 → 弹左边，反之弹右边。
  const popoverSide =
    selectedNode && selectedNode.cx >= TRACK_WIDTH / 2 ? "left" : "right";

  // 进入页面时把「现在」滚到视野中间。
  useEffect(() => {
    const el = scrollRef.current;

    if (!el) {
      return;
    }

    const currentCy = trackHeight - BOTTOM_PAD - currentIndex * NODE_SPACING;
    el.scrollTop = currentCy - el.clientHeight / 2;
  }, [currentIndex, trackHeight]);

  function handleAgeChange(nextAge: number) {
    if (!Number.isFinite(nextAge)) {
      return;
    }

    onUpdateBirthYear(currentYear - clamp(Math.round(nextAge), 1, 120));
  }

  function handleSelectNode(node: RoadNode) {
    setSelectedYear(node.year);

    // 把选中的节点滚到视野中间，对话框就稳定弹在它旁边。
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: node.cy - el.clientHeight / 2, behavior: "smooth" });
    }
  }

  return (
    <section className="home-v3-life" aria-label="人生阶段时间之路">
      <header className="home-v3-life__head">
        <h2>
          <OrbitIcon size={17} />
          人生阶段
        </h2>
        <label className="home-v3-life__age" title="设置你现在的岁数">
          <span>我</span>
          <input
            aria-label="设置我现在的岁数"
            max={120}
            min={1}
            onChange={(event) => handleAgeChange(event.currentTarget.valueAsNumber)}
            type="number"
            value={currentAge}
          />
          <span>岁</span>
        </label>
      </header>

      <div className="home-v3-life__viewport">
        <div className="home-v3-life__stars" aria-hidden="true">
          {stars.map((star) => (
            <i
              key={star.id}
              style={{
                left: `${star.left}%`,
                top: `${star.top}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                animationDelay: `${star.delay}s`,
                animationDuration: `${star.duration}s`,
              }}
            />
          ))}
        </div>
        <div className="home-v3-life__scroll" data-testid="life-road" ref={scrollRef}>
          <div
            className="home-v3-life__track"
            style={{ height: `${trackHeight}px`, width: `${TRACK_WIDTH}px` }}
          >
            <svg
              aria-hidden="true"
              className="home-v3-life__line"
              height={trackHeight}
              viewBox={`0 0 ${TRACK_WIDTH} ${trackHeight}`}
              width={TRACK_WIDTH}
            >
              <defs>
                <linearGradient
                  gradientUnits="userSpaceOnUse"
                  id="life-road-ribbon"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2={trackHeight}
                >
                  <stop offset="0" stopColor="rgba(199, 168, 106, 0.04)" />
                  <stop offset="0.5" stopColor="rgba(199, 168, 106, 0.16)" />
                  <stop offset="1" stopColor="rgba(216, 187, 114, 0.42)" />
                </linearGradient>
              </defs>
              <path className="home-v3-life__ribbon" d={ribbonPath} />
              <path className="home-v3-life__seam" d={roadPath} />
            </svg>

            {[0, 1, 2].map((index) => (
              <span
                aria-hidden="true"
                className="home-v3-life__spark"
                key={`spark-${index}`}
                style={{
                  offsetPath: `path("${roadPath}")`,
                  animationDelay: `${-2.6 * index}s`,
                }}
              />
            ))}

            {nodes.map((node) => {
              const record = recordByYear.get(node.year);
              const isCurrent = node.age === currentAge;
              const isSelected = node.year === selectedYear;

              return (
                <button
                  aria-label={`记录 ${node.age} 岁`}
                  className="home-v3-life__node"
                  data-current={isCurrent}
                  data-filled={record?.text ? "true" : "false"}
                  data-selected={isSelected}
                  key={node.age}
                  onClick={() => handleSelectNode(node)}
                  style={{
                    left: `${node.cx}px`,
                    top: `${node.cy}px`,
                    opacity: node.opacity,
                    transform: `translate(-50%, -50%) scale(${node.scale})`,
                  }}
                  type="button"
                >
                  <span className="home-v3-life__dot" />
                  <span className="home-v3-life__label">
                    <strong>
                      {node.age} 岁{isCurrent ? <em>· 现在</em> : null}
                    </strong>
                    {record?.text ? (
                      <span className="home-v3-life__note">{nodeSnippet(record.text)}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="home-v3-life__mist home-v3-life__mist--top" />
        <div className="home-v3-life__mist home-v3-life__mist--bottom" />

        {selectedNode === null ? null : (
          <div className="home-v3-life__popover" data-side={popoverSide}>
            <div className="home-v3-life__popover-head">
              <span>
                <NotebookPenIcon size={14} />
                {selectedAge} 岁 · {selectedYear} 年
              </span>
              <button
                aria-label="关闭"
                className="home-v3-life__popover-close"
                onClick={() => setSelectedYear(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <textarea
              aria-label={`编辑 ${selectedAge} 岁人生阶段记录`}
              autoFocus
              onChange={(event) =>
                selectedYear !== null && onUpdateRecord(selectedYear, event.currentTarget.value)
              }
              onKeyDown={(event) => {
                // Enter 保存退出；Shift+Enter 换行；Esc 退出。
                if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
                  event.preventDefault();
                  setSelectedYear(null);
                }
              }}
              placeholder="记录这一岁的人生阶段、目标、事件或感悟。"
              value={selectedRecord?.text ?? ""}
            />
            <small className="home-v3-life__popover-hint">
              {selectedRecord ? "已保存记录" : "这一岁还没有记录"} · Enter 退出
            </small>
          </div>
        )}
      </div>
    </section>
  );
}
