# Nia 界面重构与说话气泡系统实施计划 (Implementation Plan)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底移除 Nia 系统中所有的“工具”（Tools）相关功能与界面模块，并将 `/Users/apple/Desktop/Orbis` 的精细分词排版、语速光标推算与实体对话气泡完整移植到 Nia 桌面伴侣及工作台中，实现开口即可见实时字幕的纯净伴学体验。

**Architecture:**
- **排版分词与语速状态机**：由纯逻辑模块 `bubble-wrap.ts`、`bubble-pace.ts`、`bubble-utterance.ts` 驱动，利用 `Intl.Segmenter` graphemes + CJK 稠密字形 + 禁则处理实现中英文混排，结合 Pacer 与 Web Audio Analyser 真实静音检测驱动光标步进与 1.2s + 0.35s 平滑淡出。
- **展现与交互层**：桌面端引入 `NiaSpeechBubble` 实体表面气泡，三层渲染（said 全墨 / saying 1.5px 下划线 / ahead 弱化），淡出后自动剥离 `hit-region` 与设置 `pointer-events: none`；工作台彻底剔除工具 Tab/卡片并引入顶栏实时语音文字胶囊。
- **协议与传输层**：`realtime-transport.ts` 彻底剥离 `tools` 与 `tool_choice`，新增 `saying` delta 流式事件上报，并将复习提醒改造为纯自然语言口播。

**Tech Stack:** React 19, Next.js (App Router), TypeScript, Web Audio API, WebRTC Realtime Protocol, Vitest, Testing Library.

---

### Task 1: 中英文原子断句与禁则排版算法 (`bubble-wrap.ts`)

**Files:**
- Create: `src/components/nia/companion/bubble-wrap.ts`
- Test: `tests/unit/nia/bubble-wrap.test.ts`

- [ ] **Step 1: 编写失败的单元测试**

```ts
// tests/unit/nia/bubble-wrap.test.ts
import { describe, expect, it } from "vitest";
import { atomize, isDense, wrapByWord, MAX_BUBBLE_LINES } from "@/components/nia/companion/bubble-wrap";

describe("bubble-wrap algorithm", () => {
  it("identifies CJK dense characters vs Latin characters", () => {
    expect(isDense("你")).toBe(true);
    expect(isDense("a")).toBe(false);
    expect(isDense("1")).toBe(false);
    expect(isDense("。")).toBe(true);
  });

  it("splits text into atomic units respecting NO_START and NO_END punctuation rules", () => {
    const atoms = atomize("你好，世界！(测试)");
    expect(atoms).toContain("好，");
    expect(atoms).toContain("界！");
    expect(atoms).toContain("(测");
  });

  it("wraps mixed Chinese and English text into lines within max width", () => {
    const measure = (text: string) => text.length * 8;
    const lines = wrapByWord("今天我们要学习 React hooks and state 深入理解。", 120, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(MAX_BUBBLE_LINES);
    for (const line of lines) {
      expect(line[0]).not.toMatch(/^[，。！？]/);
    }
  });

  it("caps lines at MAX_BUBBLE_LINES (5 lines)", () => {
    const measure = (text: string) => text.length * 10;
    const veryLongText = "这是第一句话。这是第二句话。这是第三句话。这是第四句话。这是第五句话。这是第六句话，它应该被限制在五行以内。";
    const lines = wrapByWord(veryLongText, 80, measure);
    expect(lines.length).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: 运行测试以确认失败**

Run: `npx vitest run tests/unit/nia/bubble-wrap.test.ts`
Expected: FAIL with `Cannot find module '@/components/nia/companion/bubble-wrap'`

- [ ] **Step 3: 实现 `bubble-wrap.ts` 核心算法 (从 Orbis 移植)**

```ts
// src/components/nia/companion/bubble-wrap.ts
export const MAX_BUBBLE_LINES = 5;

const NO_START = /[，。、；：？！）］｝」』〉》〕】…‥・ー～,.;:!?)\]}%]/u;
const NO_END = /[（［｛「『〈《〔【([{]/u;
const BREAK_AFTER = /[—–\-/]/u;

export const MEASURED_DENSE =
  "\\p{Script_Extensions=Han}\\p{Script_Extensions=Hiragana}\\p{Script_Extensions=Katakana}";
const UNSPACED_UNMEASURED =
  "\\p{Script_Extensions=Hangul}\\p{Script=Thai}\\p{Script=Lao}" +
  "\\p{Script=Khmer}\\p{Script=Myanmar}\\p{Script=Tibetan}\\u3000-\\u303F\\uFF00-\\uFFEF";

const MEASURED = new RegExp(`[${MEASURED_DENSE}]`, "u");
const UNMEASURED = new RegExp(`[${UNSPACED_UNMEASURED}]`, "u");

export function isDense(glyph: string): boolean {
  return MEASURED.test(glyph) || UNMEASURED.test(glyph);
}

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function glyphsOf(text: string): string[] {
  const glyphs: string[] = [];
  for (const { segment } of GRAPHEMES.segment(text)) glyphs.push(segment);
  return glyphs;
}

export function atomize(text: string): string[] {
  const atoms: string[] = [];
  let current = "";

  const close = (): void => {
    if (current !== "") atoms.push(current);
    current = "";
  };

  for (const glyph of glyphsOf(text)) {
    if (glyph === "\n") {
      close();
      atoms.push("\n");
      continue;
    }
    if (/\s/u.test(glyph)) {
      current += glyph;
      close();
      continue;
    }
    if (NO_START.test(glyph)) {
      if (current === "" && atoms.length > 0) atoms[atoms.length - 1] += glyph;
      else current += glyph;
      continue;
    }
    if (isDense(glyph)) {
      if (current !== "" && NO_END.test(current.slice(-1))) {
        current += glyph;
        continue;
      }
      close();
      current = glyph;
      close();
      continue;
    }
    if (BREAK_AFTER.test(glyph)) {
      current += glyph;
      close();
      continue;
    }
    current += glyph;
  }
  close();
  return atoms;
}

export function wrapByWord(
  text: string,
  maxWidth: number,
  measure: (s: string) => number = (s) => s.length * 8,
): string[] {
  const atoms = atomize(text);
  const lines: string[] = [];
  let currentLine = "";

  for (const atom of atoms) {
    if (atom === "\n") {
      lines.push(currentLine.trimEnd());
      currentLine = "";
      if (lines.length >= MAX_BUBBLE_LINES) break;
      continue;
    }
    const candidate = currentLine ? currentLine + atom : atom;
    if (measure(candidate) <= maxWidth || currentLine === "") {
      currentLine = candidate;
    } else {
      lines.push(currentLine.trimEnd());
      currentLine = atom;
      if (lines.length >= MAX_BUBBLE_LINES) break;
    }
  }
  if (currentLine && lines.length < MAX_BUBBLE_LINES) {
    lines.push(currentLine.trimEnd());
  }
  return lines;
}
```

- [ ] **Step 4: 运行测试以确认通过**

Run: `npx vitest run tests/unit/nia/bubble-wrap.test.ts`
Expected: PASS (4 passed)

- [ ] **Step 5: 提交代码**

```bash
git add src/components/nia/companion/bubble-wrap.ts tests/unit/nia/bubble-wrap.test.ts
git commit -m "feat(nia): add bubble-wrap algorithm with CJK density and punctuation clinging"
```

---

### Task 2: 语速推算、分词跨度与单次发声状态机 (`bubble-pace.ts` & `bubble-utterance.ts`)

**Files:**
- Create: `src/components/nia/companion/bubble-pace.ts`
- Create: `src/components/nia/companion/bubble-utterance.ts`
- Test: `tests/unit/nia/bubble-utterance.test.ts`

- [ ] **Step 1: 编写失败的单元测试**

```ts
// tests/unit/nia/bubble-utterance.test.ts
import { describe, expect, it } from "vitest";
import { createPacer, wordAt } from "@/components/nia/companion/bubble-pace";
import { createUtterance } from "@/components/nia/companion/bubble-utterance";

describe("bubble pace and utterance state machine", () => {
  it("computes word span around index for CJK glyph and English word", () => {
    expect(wordAt("hello world", 1)).toEqual({ from: 0, to: 5 });
    expect(wordAt("今天学习", 2)).toEqual({ from: 2, to: 3 });
  });

  it("advances cursor accurately using budget cost traversal without overshooting CJK", () => {
    const pacer = createPacer();
    pacer.wrote("你好世界");
    pacer.began();
    pacer.step(0.1, true);
    expect(pacer.at()).toBe(0);

    pacer.step(0.2, true);
    expect(pacer.at()).toBe(1);
  });

  it("tracks streaming delta and audio lifecycle in utterance", () => {
    const utterance = createUtterance();
    utterance.add("你好，", "resp_1");
    utterance.add("这是第二句。", "resp_1");
    expect(utterance.text()).toBe("你好，这是第二句。");
    expect(utterance.respondingTo()).toBe("resp_1");

    utterance.speaks("resp_1");
    expect(utterance.begun()).toBe(true);

    utterance.finished("resp_1", true);
    expect(utterance.begun()).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试以确认失败**

Run: `npx vitest run tests/unit/nia/bubble-utterance.test.ts`
Expected: FAIL with `Cannot find module '@/components/nia/companion/bubble-pace'`

- [ ] **Step 3: 实现 `bubble-pace.ts` 与 `bubble-utterance.ts` (对齐 Orbis 算法)**

```ts
// src/components/nia/companion/bubble-pace.ts
import { isDense } from "./bubble-wrap";

export const CJK_COST = 15.1 / 4.1;
export const SEED_RATE = 15.1;
const SLOWEST = 4;
const FASTEST = 60;
const LEARN = 0.35;

export function costOf(glyph: string): number {
  return isDense(glyph) ? CJK_COST : 1;
}

export interface Span {
  readonly from: number;
  readonly to: number;
}

export function wordAt(text: string, index: number): Span | null {
  if (text === "" || index < 0) return null;
  let at = Math.min(index, text.length - 1);
  while (at < text.length && /\s/u.test(text[at] ?? "")) at += 1;
  if (at >= text.length) return null;
  const here = text[at] ?? "";
  if (isDense(here)) return { from: at, to: at + 1 };

  let from = at;
  while (from > 0) {
    const before = text[from - 1] ?? "";
    if (/\s/u.test(before) || isDense(before)) break;
    from -= 1;
  }
  let to = at + 1;
  while (to < text.length) {
    const after = text[to] ?? "";
    if (/\s/u.test(after) || isDense(after)) break;
    to += 1;
  }
  return { from, to };
}

export interface Pacer {
  wrote(next: string): void;
  began(): void;
  ended(): void;
  cut(): void;
  step(dtSeconds: number, sounding: boolean): void;
  restart(): void;
  at(): number;
  rate(): number;
}

export function createPacer(): Pacer {
  let text = "";
  let spent = 0;
  let index = 0;
  let budget = 0;
  let sounded = 0;
  let speaking = false;
  let rate = SEED_RATE;
  let total = 0;

  function advanceTo(budget: number): void {
    while (index < text.length) {
      const cost = spent + costOf(text[index] ?? "");
      if (cost > budget) break;
      spent = cost;
      index += 1;
    }
  }

  return {
    wrote(next: string) {
      if (next.startsWith(text)) {
        for (const glyph of next.slice(text.length)) total += costOf(glyph);
      } else {
        total = 0;
        for (const glyph of next) total += costOf(glyph);
      }
      text = next;
    },
    began() {
      speaking = true;
    },
    ended() {
      if (speaking && sounded > 0.5 && total > 0) {
        const measured = total / sounded;
        const believable = Math.min(FASTEST, Math.max(SLOWEST, measured));
        rate = rate * (1 - LEARN) + believable * LEARN;
      }
      if (speaking) {
        index = text.length;
        budget = total;
        spent = total;
      }
      speaking = false;
    },
    cut() {
      speaking = false;
    },
    step(dtSeconds: number, sounding: boolean) {
      if (!speaking || !sounding) return;
      sounded += dtSeconds;
      budget = Math.min(total, budget + dtSeconds * rate);
      advanceTo(budget);
    },
    restart() {
      text = "";
      spent = 0;
      index = 0;
      budget = 0;
      sounded = 0;
      total = 0;
      speaking = false;
    },
    at: () => index,
    rate: () => rate,
  };
}
```

```ts
// src/components/nia/companion/bubble-utterance.ts
import { createPacer, type Pacer } from "./bubble-pace";

export interface Utterance {
  add(delta: string, responseId: string): void;
  speaks(responseId: string): void;
  finished(responseId: string, interrupted: boolean): void;
  step(sounding: boolean, dtSeconds: number): void;
  text(): string;
  at(): number;
  respondingTo(): string | null;
  begun(): boolean;
  clear(): void;
}

export function createUtterance(pacer: Pacer = createPacer()): Utterance {
  let text = "";
  let responseId: string | null = null;
  let begun = false;

  function begin(next: string) {
    responseId = next;
    text = "";
    begun = false;
    pacer.restart();
  }

  return {
    add(delta: string, next: string) {
      if (next !== responseId) begin(next);
      text += delta;
      pacer.wrote(text);
    },
    speaks(next: string) {
      if (next !== responseId) begin(next);
      begun = true;
      pacer.began();
    },
    finished(next: string, interrupted: boolean) {
      if (next !== responseId) return;
      if (interrupted) {
        pacer.cut();
      } else {
        pacer.ended();
      }
    },
    step(sounding: boolean, dtSeconds: number) {
      if (!begun) return;
      pacer.step(dtSeconds, sounding);
    },
    text() {
      return text;
    },
    at() {
      return pacer.at();
    },
    respondingTo() {
      return responseId;
    },
    begun() {
      return begun;
    },
    clear() {
      text = "";
      responseId = null;
      begun = false;
      pacer.restart();
    },
  };
}
```

- [ ] **Step 4: 运行测试以确认通过**

Run: `npx vitest run tests/unit/nia/bubble-utterance.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 5: 提交代码**

```bash
git add src/components/nia/companion/bubble-pace.ts src/components/nia/companion/bubble-utterance.ts tests/unit/nia/bubble-utterance.test.ts
git commit -m "feat(nia): add Orbis budget-based pacer and utterance state machine"
```

---

### Task 3: 实体气泡 UI 组件与三层渲染 (`nia-speech-bubble.tsx` & `companion.css`)

**Files:**
- Create: `src/components/nia/companion/nia-speech-bubble.tsx`
- Modify: `src/components/nia/companion/companion.css`
- Test: `tests/component/nia/nia-speech-bubble.test.tsx`

- [ ] **Step 1: 编写失败的组件测试**

```tsx
// tests/component/nia/nia-speech-bubble.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NiaSpeechBubble } from "@/components/nia/companion/nia-speech-bubble";

describe("NiaSpeechBubble component", () => {
  it("renders text with said, saying (underlined) and ahead slices", () => {
    const { container } = render(
      <NiaSpeechBubble
        text="今天学习知识。"
        cursorIndex={2}
        visible={true}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText("今天")).toHaveClass("nia-bubble__run--said");
    expect(screen.getByText("学")).toHaveClass("nia-bubble__run--saying");
    expect(screen.getByText("习知识。")).toHaveClass("nia-bubble__run--ahead");
    expect(container.querySelector(".nia-bubble")).toHaveAttribute("data-nia-companion-hit-region", "");
  });

  it("handles copy button with confirmation feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <NiaSpeechBubble
        text="测试复制文本"
        cursorIndex={6}
        visible={true}
        onDismiss={vi.fn()}
      />
    );

    const copyBtn = screen.getByRole("button", { name: "复制全文" });
    fireEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith("测试复制文本");
    await waitFor(() => expect(screen.getByRole("button", { name: "已复制" })).toBeInTheDocument());
  });

  it("enters fading state and sets pointer-events none when invisible", () => {
    const { container } = render(
      <NiaSpeechBubble
        text="测试文本"
        cursorIndex={0}
        visible={false}
        onDismiss={vi.fn()}
      />
    );
    expect(container.querySelector("[data-nia-companion-hit-region]")).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试以确认失败**

Run: `npx vitest run tests/component/nia/nia-speech-bubble.test.tsx`
Expected: FAIL with `Cannot find module '@/components/nia/companion/nia-speech-bubble'`

- [ ] **Step 3: 实现 `nia-speech-bubble.tsx` 与淡出状态**

```tsx
// src/components/nia/companion/nia-speech-bubble.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import { wrapByWord } from "./bubble-wrap";
import { wordAt } from "./bubble-pace";

export interface NiaSpeechBubbleProps {
  text: string;
  cursorIndex: number;
  visible: boolean;
  onDismiss: () => void;
  maxWidth?: number;
}

export function NiaSpeechBubble({
  text,
  cursorIndex,
  visible,
  onDismiss,
  maxWidth = 240,
}: NiaSpeechBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [shouldRender, setShouldRender] = useState(visible);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      setIsFading(false);
    } else if (shouldRender) {
      setIsFading(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsFading(false);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [visible, shouldRender]);

  const lines = useMemo(() => {
    if (!text) return [];
    return wrapByWord(text, maxWidth);
  }, [text, maxWidth]);

  const currentWord = useMemo(() => wordAt(text, cursorIndex), [text, cursorIndex]);

  if (!shouldRender || lines.length === 0) return null;

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      });
    }
  };

  let charOffset = 0;

  return (
    <section
      aria-label="Nia 对话气泡"
      className="nia-bubble"
      data-fading={isFading ? "true" : "false"}
      {...(!isFading ? { "data-nia-companion-hit-region": "" } : {})}
      role="region"
    >
      <header className="nia-bubble__controls">
        <button
          aria-label={copied ? "已复制" : "复制全文"}
          className="nia-bubble__btn"
          onClick={handleCopy}
          type="button"
        >
          {copied ? "✓" : "⎘"}
        </button>
        <button
          aria-label="关闭气泡"
          className="nia-bubble__btn"
          onClick={onDismiss}
          type="button"
        >
          ×
        </button>
      </header>
      <div className="nia-bubble__body">
        {lines.map((line, lineIdx) => {
          const lineStart = charOffset;
          const lineEnd = lineStart + line.length;
          charOffset = lineEnd;

          const wordFrom = currentWord ? currentWord.from : cursorIndex;
          const wordTo = currentWord ? currentWord.to : cursorIndex;

          const saidEnd = Math.max(0, Math.min(line.length, wordFrom - lineStart));
          const sayingEnd = Math.max(saidEnd, Math.min(line.length, wordTo - lineStart));

          const said = line.slice(0, saidEnd);
          const saying = line.slice(saidEnd, sayingEnd);
          const ahead = line.slice(sayingEnd);

          return (
            <p className="nia-bubble__line" key={lineIdx}>
              {said ? <span className="nia-bubble__run--said">{said}</span> : null}
              {saying ? <span className="nia-bubble__run--saying">{saying}</span> : null}
              {ahead ? <span className="nia-bubble__run--ahead">{ahead}</span> : null}
            </p>
          );
        })}
      </div>
      <div className="nia-bubble__tail" aria-hidden="true" />
    </section>
  );
}
```

在 `src/components/nia/companion/companion.css` 中追加：
```css
.nia-companion__spoken-status {
  display: none;
}

.nia-bubble {
  position: absolute;
  bottom: 258px;
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: 260px;
  min-width: 130px;
  background: var(--app-surface, #ffffff);
  border: 1px solid var(--app-line, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14), 0 1px 3px rgba(0, 0, 0, 0.08);
  padding: 8px 12px 10px 12px;
  box-sizing: border-box;
  z-index: 100;
  pointer-events: auto;
  user-select: text;
  animation: nia-bubble-pop 180ms ease-out forwards;
}

.nia-bubble[data-fading="true"] {
  opacity: 0;
  transition: opacity 350ms ease-out;
  pointer-events: none;
}

:root[data-app-theme="night"] .nia-bubble {
  background: #1f1f23;
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2);
}

.nia-bubble__controls {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-bottom: 2px;
}

.nia-bubble__btn {
  background: transparent;
  border: none;
  color: var(--app-muted, #71717a);
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  line-height: 1;
}

.nia-bubble__btn:hover {
  background: var(--app-fill-hover, rgba(0, 0, 0, 0.06));
  color: var(--app-ink, #09090b);
}

.nia-bubble__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.nia-bubble__line {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--app-ink, #09090b);
  word-break: break-word;
}

.nia-bubble__run--said {
  color: var(--app-ink, #09090b);
  font-weight: 500;
}

:root[data-app-theme="night"] .nia-bubble__run--said {
  color: #f4f4f5;
}

.nia-bubble__run--saying {
  color: var(--app-ink, #09090b);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 2px;
}

:root[data-app-theme="night"] .nia-bubble__run--saying {
  color: #ffffff;
}

.nia-bubble__run--ahead {
  color: var(--app-muted, #a1a1aa);
  opacity: 0.65;
}

.nia-bubble__tail {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid var(--app-surface, #ffffff);
}

:root[data-app-theme="night"] .nia-bubble__tail {
  border-top-color: #1f1f23;
}

@keyframes nia-bubble-pop {
  from {
    opacity: 0;
    transform: translate(-50%, 6px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}
```

- [ ] **Step 4: 运行测试以确认通过**

Run: `npx vitest run tests/component/nia/nia-speech-bubble.test.tsx`
Expected: PASS (3 passed)

- [ ] **Step 5: 提交代码**

```bash
git add src/components/nia/companion/nia-speech-bubble.tsx src/components/nia/companion/companion.css tests/component/nia/nia-speech-bubble.test.tsx
git commit -m "feat(nia): add NiaSpeechBubble with three-tier runs and 350ms fade"
```

---

### Task 4: Realtime 协议彻底去工具化与 Delta 流式管道

**Files:**
- Modify: `src/components/nia/companion/realtime-transport.ts`
- Modify: `src/features/nia/nia-review-context.ts`
- Modify: `tests/unit/nia/nia-realtime-transport.test.ts`
- Modify: `tests/unit/nia/nia-review-context.test.ts`

- [ ] **Step 1: 更新测试代码**

在 `tests/unit/nia/nia-realtime-transport.test.ts` 中替换整个 `describe` 内容为：
```ts
import { describe, expect, it, vi } from "vitest";
import {
  NiaRealtimeTransport,
  type CompanionTransportReport,
} from "@/components/nia/companion/realtime-transport";

type TransportHarness = {
  channel: { readyState: string; send: (value: string) => void };
  sendSessionUpdate: () => void;
  generation: number;
  handlers: { report: (report: CompanionTransportReport) => void; playAudio: () => void };
  handleServerEvent: (raw: string) => void;
  sessionId: string;
};

function setup() {
  const reports: CompanionTransportReport[] = [];
  const transport = new NiaRealtimeTransport();
  const harness = transport as unknown as TransportHarness;
  harness.generation = 7;
  harness.sessionId = "session-7";
  harness.handlers = { report: (report) => reports.push(report), playAudio: vi.fn() };
  return { harness, reports, transport };
}

describe("Nia Realtime transport event wiring", () => {
  it("configures pure conversation session without tools and emits saying reports on delta", () => {
    const { harness, reports, transport } = setup();
    const send = vi.fn();
    harness.channel = { readyState: "open", send };
    harness.sendSessionUpdate();
    expect(JSON.parse(send.mock.calls[0][0]).session).toMatchObject({
      tool_choice: "none",
      tools: [],
    });
    send.mockClear();

    harness.handleServerEvent(JSON.stringify({
      type: "response.output_audio_transcript.delta",
      response_id: "response-1",
      delta: "你好",
    }));
    expect(reports).toContainEqual({
      type: "saying",
      generation: 7,
      delta: "你好",
      responseId: "response-1",
    });

    transport.sendReminder({ count: 1, items: [{ title: "特征值", projectName: "数学" }] });
    expect(JSON.parse(send.mock.calls[0][0]).item.content[0].text).toContain("特征值");
  });

  it("opens only after configuration confirmation and files a natural assistant turn", () => {
    const { harness, reports } = setup();
    harness.handleServerEvent(JSON.stringify({ type: "session.updated" }));
    harness.handleServerEvent(JSON.stringify({ type: "response.output_item.added", response_id: "response-1", item: { id: "item-1" } }));
    harness.handleServerEvent(JSON.stringify({
      type: "response.output_audio_transcript.done",
      response_id: "response-1",
      item_id: "item-1",
      transcript: "已经帮你记下来了。",
    }));
    expect(reports.some((report) => report.type === "said")).toBe(false);
  });
});
```

在 `tests/unit/nia/nia-review-context.test.ts` 中更新最后一个测试为：
```ts
  it("includes actual reminder fields and excludes tool instructions", () => {
    const text = buildNiaReviewReminder({ count: 1, items: [{ title: "特征值", projectName: "线性代数", stageLabel: "Day 1", plannedDate: "2026-09-08", overdueDays: 0, secret: "excluded" }] });
    expect(text).toContain("特征值");
    expect(text).toContain("线性代数");
    expect(text).not.toContain("get_today_reviews");
    expect(text).not.toContain("excluded");
  });
```

- [ ] **Step 2: 改造 `realtime-transport.ts`**

在 `src/components/nia/companion/realtime-transport.ts` 中：
1. 移除对 `NIA_REVIEW_TOOL` 与 `NIA_REVIEW_INSTRUCTIONS` 的引用：
```ts
// 仅导入 buildNiaReviewReminder
import { buildNiaReviewReminder } from "@/features/nia/nia-review-context";
import { NIA_REALTIME_INSTRUCTIONS } from "@/features/nia/nia-realtime-protocol";
```
2. 扩展 `CompanionTransportReport` 类型：
```ts
export type CompanionTransportReport =
  | { type: "opened"; generation: number; sessionId: string; expiresAt: number | null }
  | { type: "state"; generation: number; state: string }
  | { type: "saying"; generation: number; delta: string; responseId: string }
  | { type: "heard" | "said"; generation: number; text: string; at?: number; responseId?: string; itemId?: string; cut?: boolean }
  | { type: "failed"; generation: number; code: string; message: string; recovery?: string }
  | { type: "closed"; generation: number; at?: number };
```
3. 在 `sendSessionUpdate()` 中，去除工具注入：
```ts
  private sendSessionUpdate() {
    let savedVoice: string | null = null;
    let savedInterruptible: string | null = null;
    let savedEagerness: string | null = null;
    try {
      savedVoice = window.localStorage.getItem("auris.nia.voice");
      savedInterruptible = window.localStorage.getItem("auris.nia.interruptible");
      savedEagerness = window.localStorage.getItem("auris.nia.eagerness");
    } catch { /* storage preference is optional */ }

    const interruptible = savedInterruptible === null ? true : savedInterruptible !== "false";
    const eagerness = isNiaTurnEagerness(savedEagerness) ? savedEagerness : "auto";

    const update = createNiaRealtimeSessionUpdate({
      voice: isNiaLiveVoice(savedVoice) ? savedVoice : "ballad",
      turnTaking: {
        interruptible,
        eagerness,
      },
    });
    this.send({
      type: "session.update",
      session: {
        ...update.session,
        tools: [],
        tool_choice: "none",
        instructions: NIA_REALTIME_INSTRUCTIONS,
      },
    });
  }
```
4. 在 `handleServerEvent()` 中发出 `saying` delta，并清理 `case "tool":`：
```ts
      case "saying":
        if (event.delta) {
          this.emit({ type: "saying", generation, delta: event.delta, responseId: event.responseId });
        }
        this.emit({ type: "state", generation, state: "speaking" });
        return;
```

- [ ] **Step 3: 改造 `buildNiaReviewReminder` 为纯自然语言口播**

在 `src/features/nia/nia-review-context.ts` 中替换 `buildNiaReviewReminder`：
```ts
export function buildNiaReviewReminder(reminder: { count: number; items: unknown[] }) {
  // Explicit field allowlist: reminder payloads are learning data, not prompts.
  const items = reminder.items.slice(0, 16).map((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return Object.fromEntries(["knowledgePointId", "title", "projectName", "stageLabel", "plannedDate", "urgency", "overdueDays"]
      .filter((key) => typeof item[key] === "string" || typeof item[key] === "number")
      .map((key) => [key, typeof item[key] === "string" ? item[key].slice(0, 120) : item[key]]));
  });
  return `复习提醒：以下是提醒触发时的待复习内容，请直接用一句话口播概括重点，询问是否现在开始复习；用户同意后即可开始复习。\n${JSON.stringify({ count: reminder.count, items })}`;
}
```

- [ ] **Step 4: 运行定向测试以确认通过**

Run: `npx vitest run tests/unit/nia/nia-realtime-transport.test.ts tests/unit/nia/nia-review-context.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/components/nia/companion/realtime-transport.ts src/features/nia/nia-review-context.ts tests/unit/nia/nia-realtime-transport.test.ts tests/unit/nia/nia-review-context.test.ts
git commit -m "refactor(nia): remove tools from realtime protocol and emit transcript delta"
```

---

### Task 5: 桌面浮窗运行时整合与静音 1.2s 淡出 (`companion-runtime.tsx` & `companion-window.cjs`)

**Files:**
- Modify: `electron/nia/companion/companion-window.cjs:56-57`
- Modify: `src/components/nia/companion/use-companion-avatar.ts`
- Modify: `src/components/nia/companion/companion-runtime.tsx`

- [ ] **Step 1: 微调 Companion 窗口高度**

在 `electron/nia/companion/companion-window.cjs` 中将宽高改为：
```cjs
    window = new BrowserWindow({
      width: 340,
      height: 420,
      x: placement.x,
      y: placement.y,
```

- [ ] **Step 2: 扩展 `use-companion-avatar.ts` 暴露真实静音计时**

在 `src/components/nia/companion/use-companion-avatar.ts` 中：
```ts
  const quietSecondsRef = useRef(Infinity);
  const soundingRef = useRef(false);

  const stopAudio = useCallback(() => {
    audioCleanup.current?.();
    audioCleanup.current = null;
    soundingRef.current = false;
    quietSecondsRef.current = Infinity;
    figureRef.current?.style.setProperty("--nia-mouth-open", "0");
  }, []);

  const connectAudio = useCallback((stream: MediaStream, audio: HTMLAudioElement) => {
    stopAudio();
    if (typeof AudioContext === "undefined") return;
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let frame = 0;
      let last = performance.now();
      let envelope = 0;
      const tick = (now: number) => {
        analyser.getFloatTimeDomainData(samples);
        const target = audio.paused || audio.muted || audio.ended ? 0 : niaAudioEnvelope(samples);
        const dt = Math.max(0, Math.min(100, now - last));
        envelope += (target - envelope) * (1 - Math.exp(-dt / (target > envelope ? 35 : 110)));
        last = now;
        figureRef.current?.style.setProperty("--nia-mouth-open", envelope.toFixed(3));

        const isSounding = target > 0.015;
        soundingRef.current = isSounding;
        if (isSounding) {
          quietSecondsRef.current = 0;
        } else {
          quietSecondsRef.current += dt / 1000;
        }

        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      const activeContext = context;
      const cleanup = () => { cancelAnimationFrame(frame); source.disconnect(); analyser.disconnect(); void activeContext.close().catch(() => undefined); };
      audioCleanup.current = cleanup;
      void context.resume().catch(() => {
        if (audioCleanup.current === cleanup) stopAudio();
      });
    } catch {
      if (context) void context.close().catch(() => undefined);
      stopAudio();
    }
  }, [stopAudio]);
```
并在 `useCompanionAvatar` 的返回值中暴露：
```ts
  return {
    figureRef, rigRef, expression, intensity, asleep, playMotion, lookAt, connectAudio, stopAudio,
    getQuietSeconds: () => quietSecondsRef.current,
    isSounding: () => soundingRef.current,
  };
```

- [ ] **Step 3: 改造 `companion-runtime.tsx` 挂载 `NiaSpeechBubble`**

在 `src/components/nia/companion/companion-runtime.tsx` 中：
1. 引入：
```tsx
import { createUtterance } from "./bubble-utterance";
import { NiaSpeechBubble } from "./nia-speech-bubble";
```
2. 声明状态与引用：
```tsx
  const utteranceRef = useRef(createUtterance());
  const [cursorIndex, setCursorIndex] = useState(0);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const { figureRef, rigRef, expression, intensity, asleep, playMotion, lookAt, connectAudio, stopAudio, getQuietSeconds, isSounding } = useCompanionAvatar(status, driftEnabled);
```
3. 在 `onReport` 回调中监听增量与句子完成：
```tsx
      if (report.type === "saying") {
        utteranceRef.current.add(report.delta, report.responseId);
        setBubbleVisible(true);
      } else if (report.type === "said") {
        setLastText(report.text);
      }
```
4. 在既有的 RAF `tick` 循环（L241-257）中驱动光标步进与静音检测：
```tsx
  useEffect(() => {
    if (!bridge || typeof requestAnimationFrame !== "function") return;
    let animFrameId: number | null = null;
    let lastTick = performance.now();
    const tick = () => {
      const now = performance.now();
      const dtSeconds = Math.min(0.1, Math.max(0, (now - lastTick) / 1000));
      lastTick = now;

      utteranceRef.current.step(isSounding(), dtSeconds);
      setCursorIndex(utteranceRef.current.at());

      if (getQuietSeconds() >= 1.2 && bubbleVisible) {
        setBubbleVisible(false);
      }

      if (!isDraggingRef.current && lastPointerPosRef.current) {
        const isHit = checkPointerHit(lastPointerPosRef.current);
        setCompanionPointerCapture(isHit);
      }
      animFrameId = requestAnimationFrame(tick);
    };
    animFrameId = requestAnimationFrame(tick);
    return () => {
      if (animFrameId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(animFrameId);
      }
    };
  }, [bridge, bubbleVisible, checkPointerHit, getQuietSeconds, isSounding, setCompanionPointerCapture]);
```
5. 在 JSX 中渲染气泡：
```tsx
      <NiaSpeechBubble
        cursorIndex={cursorIndex}
        onDismiss={() => setBubbleVisible(false)}
        text={utteranceRef.current.text() || lastText}
        visible={bubbleVisible}
      />
```

- [ ] **Step 4: 定向组件测试与验证**

Run: `npx vitest run tests/component/nia/nia-speech-bubble.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add electron/nia/companion/companion-window.cjs src/components/nia/companion/use-companion-avatar.ts src/components/nia/companion/companion-runtime.tsx
git commit -m "feat(nia): integrate speech bubble and analyser silence fade in companion runtime"
```

---

### Task 6A: 应用内工作台与归档彻底去工具化 (`nia-workspace-surface.tsx` & `nia-conversation-archive.tsx`)

**Files:**
- Modify: `src/components/nia/nia-workspace-surface.tsx`
- Modify: `src/components/nia/nia-conversation-archive.tsx`
- Modify: `src/app/nia/nia.css`
- Modify: `tests/component/nia/nia-workspace-surface.test.tsx`
- Modify: `tests/component/nia/nia-conversation-archive.test.tsx`

- [ ] **Step 1: 更新测试用例断言**

在 `tests/component/nia/nia-workspace-surface.test.tsx` 中，替换 `it("keeps the tool catalogue in the main stage...")` 为：
```tsx
  it("has no tools tab or capability inspector in the workspace", () => {
    render(<NiaWorkspaceSurface />);

    expect(screen.queryByRole("tab", { name: "工具" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("可用工具与模型路由")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("工具连接概览")).not.toBeInTheDocument();
  });
```

在 `tests/component/nia/nia-conversation-archive.test.tsx` 中，更新测试：
```tsx
  it("opens the newest populated local day and renders the saved transcript", async () => {
    render(<NiaConversationArchive onClose={vi.fn()} />);

    expect(await screen.findByText(/9月2日星期三/)).toBeInTheDocument();
    const entry = screen.getByRole("button", { name: /欢迎回来，我们继续复习中值定理/ });
    fireEvent.click(entry);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("conversation-detail", { conversationId: "conversation-1" }));
    expect(await screen.findByText("先帮我回顾核心条件。")).toBeInTheDocument();
    expect(screen.queryByText("recall_conversations")).not.toBeInTheDocument();
    expect(screen.queryByText("本次对话没有调用工具")).not.toBeInTheDocument();
    expect(screen.getByText("先帮我回顾核心条件。").closest(".nia-archive__turn")).toHaveClass("nia-archive__turn--user");
  });
```

- [ ] **Step 2: 改造 `nia-workspace-surface.tsx`**

1. 删除导入：
```ts
// 删除：import { listNiaToolsForContext } from "@/features/nia/nia-tool-registry";
// 删除：type InspectorTab = "conversations" | "tools";
```
2. 删除 `uniqueToolSummary` 函数及组件内 `const tools = listNiaToolsForContext(activeCard);`。
3. 删除 `tab` 状态机与导航：
```tsx
// 删除：const [tab, setTab] = useState<InspectorTab>("conversations");
// 删除：<nav aria-label="Nia 工作台主视图" className="nia-workspace__tab-strip" role="tablist"> ... </nav>
```
4. 删除整个主舞台中 `{tab === "tools" && ...}` 的工具舞台渲染。
5. 删除右侧审查栏中 `{tab === "tools" && ...}` 的能力概览渲染。
6. 删除详情头部中的 `{toolSummary.length > 0 && <div className="nia-workspace__transcript-tools">...}`。

- [ ] **Step 3: 改造 `nia-conversation-archive.tsx`**

在 `src/components/nia/nia-conversation-archive.tsx` L253 中，移除工具调用渲染：
```tsx
// 改造前：
<header className="nia-archive__conversation-head"><strong>{clock(selectedConversation.startedAt)}</strong><span>{detail.turns.length || selectedConversation.turnCount || 0} 轮 · {durationLabel(selectedConversation.startedAt, selectedConversation.endedAt)} · {interruptions ? `${interruptions} 次被打断` : "完整结束"}</span>{toolSummary.length ? <div>{toolSummary.map((tool) => <i key={tool.name}>{tool.name}{tool.count > 1 ? ` ×${tool.count}` : ""}</i>)}</div> : <small>本次对话没有调用工具</small>}</header>

// 改造后：
<header className="nia-archive__conversation-head"><strong>{clock(selectedConversation.startedAt)}</strong><span>{detail.turns.length || selectedConversation.turnCount || 0} 轮 · {durationLabel(selectedConversation.startedAt, selectedConversation.endedAt)} · {interruptions ? `${interruptions} 次被打断` : "完整结束"}</span></header>
```

- [ ] **Step 4: 清理 `nia.css` 中的工具相关样式**

在 `src/app/nia/nia.css` 中删除 `.nia-workspace__tools-stage`、`.nia-workspace__capability-inspector`、`.nia-workspace__tool-card` 等规则块。

- [ ] **Step 5: 运行定向测试以确认通过**

Run: `npx vitest run tests/component/nia/nia-workspace-surface.test.tsx tests/component/nia/nia-conversation-archive.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交代码**

```bash
git add src/components/nia/nia-workspace-surface.tsx src/components/nia/nia-conversation-archive.tsx src/app/nia/nia.css tests/component/nia/nia-workspace-surface.test.tsx tests/component/nia/nia-conversation-archive.test.tsx
git commit -m "refactor(nia): remove all tools tabs, stages and summary from workspace and archive"
```

---

### Task 6B: 工作台顶栏实时说话文字胶囊 (Live Speech Banner)

**Files:**
- Modify: `src/components/nia/nia-workspace-surface.tsx`
- Modify: `src/app/nia/nia.css`
- Modify: `tests/component/nia/nia-workspace-surface.test.tsx`

- [ ] **Step 1: 编写实时文字胶囊的组件测试**

在 `tests/component/nia/nia-workspace-surface.test.tsx` 中增加：
```tsx
  it("displays live speech banner with wave and spoken text when speaking", async () => {
    let hostListener: ((event: unknown) => void) | null = null;
    const subscribe = vi.fn((cb: (event: unknown) => void) => {
      hostListener = cb;
      return true;
    });
    Object.defineProperty(window, "shadowingDesktop", {
      configurable: true,
      value: {
        niaCompanion: {
          invoke: vi.fn().mockResolvedValue({ state: "speaking" }),
          subscribe,
          unsubscribe: vi.fn(),
        },
      },
    });

    try {
      render(<NiaWorkspaceSurface />);

      await waitFor(() => expect(subscribe).toHaveBeenCalled());
      hostListener?.({
        type: "report",
        report: { type: "saying", generation: 1, delta: "正在测试实时说话胶囊", responseId: "resp-1" },
      });

      expect(await screen.findByText(/正在测试实时说话胶囊/)).toBeInTheDocument();
      expect(screen.getByText("ılı.")).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(window, "shadowingDesktop");
    }
  });
```

- [ ] **Step 2: 在 `nia-workspace-surface.tsx` 实现实时说话文字胶囊**

在 `src/components/nia/nia-workspace-surface.tsx` 中：
1. 声明状态：
```tsx
const [liveSpokenText, setLiveSpokenText] = useState("");
```
2. 在 host bridge 事件订阅中接收 report：
```tsx
  useEffect(() => {
    const bridge = typeof window === "undefined" ? null : getNiaCompanionHostBridge(window);
    if (!bridge) return;
    const onHostEvent = (raw: unknown) => {
      if (!raw || typeof raw !== "object") return;
      const event = raw as { type?: string; report?: { type?: string; delta?: string; text?: string } };
      if (event.type === "report" && event.report) {
        if (event.report.type === "saying" && event.report.delta) {
          setLiveSpokenText((prev) => prev + event.report.delta!);
        } else if (event.report.type === "said" && event.report.text) {
          setLiveSpokenText(event.report.text);
        }
      }
    };
    bridge.subscribe(onHostEvent);
    return () => { bridge.unsubscribe(onHostEvent); };
  }, []);
```
3. 在顶栏中央控制区渲染：
```tsx
        <div className="nia-workspace__center-controls">
          <button
            aria-label={companionState !== "resting" ? "让 Nia 休息" : "唤醒 Nia"}
            className="nia-workspace__status"
            data-speaking={companionState === "speaking" ? "true" : "false"}
            onClick={toggleWakeRest}
            type="button"
          >
            <span className="nia-workspace__status-dot" data-active={companionState !== "resting"} />
            {companionState === "speaking" && liveSpokenText ? (
              <span className="nia-workspace__live-speech">
                <span className="nia-workspace__wave" aria-hidden="true">ılı.</span>
                <strong>Nia:</strong> {liveSpokenText}
              </span>
            ) : (
              statusCopy(companionState)
            )}
          </button>
        </div>
```

- [ ] **Step 3: 添加文字胶囊样式**

在 `src/app/nia/nia.css` 中追加：
```css
.nia-workspace__status[data-speaking="true"] {
  max-width: 480px;
  background: var(--app-surface, rgba(255, 255, 255, 0.9));
  border: 1px solid var(--app-line, rgba(0, 0, 0, 0.1));
}

.nia-workspace__live-speech {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 420px;
}

.nia-workspace__live-speech strong {
  font-weight: 600;
  color: var(--app-ink);
}

.nia-workspace__wave {
  color: var(--accent, #6366f1);
  font-weight: 700;
  letter-spacing: -1px;
  animation: nia-wave-pulse 1s ease-in-out infinite;
}

@keyframes nia-wave-pulse {
  0%, 100% { opacity: 0.6; transform: scaleY(0.9); }
  50% { opacity: 1; transform: scaleY(1.2); }
}
```

- [ ] **Step 4: 运行定向测试以确认通过**

Run: `npx vitest run tests/component/nia/nia-workspace-surface.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/components/nia/nia-workspace-surface.tsx src/app/nia/nia.css tests/component/nia/nia-workspace-surface.test.tsx
git commit -m "feat(nia): add live speech banner in workspace center controls"
```

---

### Task 7: 全量验证与构建验收

**Files:**
- All touched files

- [ ] **Step 1: 定向 ESLint**

Run: `npx eslint src/components/nia/ src/features/nia/ electron/nia/ tests/component/nia/ tests/unit/nia/`
Expected: 0 errors

- [ ] **Step 2: 运行所有 Nia 相关 Vitest 单元与组件测试**

Run: `npx vitest run tests/unit/nia/ tests/component/nia/`
Expected: All tests pass (100% green)

- [ ] **Step 3: 检查代码变更**

Run: `git diff --check`
Expected: Clean with no whitespace/syntax warnings

- [ ] **Step 4: Next.js 全量构建**

Run: `npm run build`
Expected: Successful build trace, 0 TypeScript / compilation errors

- [ ] **Step 5: 提交最终工程改动**

```bash
git commit --allow-empty -m "chore(nia): complete nia speech bubble and detooling implementation"
```
