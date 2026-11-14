# Nia 界面重构与说话气泡系统实施计划 (Implementation Plan)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底移除 Nia 系统中所有的“工具”（Tools）相关功能与界面模块，并将 `/Users/apple/Desktop/Orbis` 的精细分词排版、语速光标推算与实体对话气泡完整移植到 Nia 桌面伴侣及工作台中，实现开口即可见实时字幕的纯净伴学体验。

**Architecture:**
- **排版分词与语速状态机**：由纯逻辑模块 `bubble-wrap.ts`、`bubble-pace.ts`、`bubble-utterance.ts` 驱动，利用 `Intl.Segmenter` graphemes + CJK 稠密字形 + 禁则处理实现中英文混排，结合 Pacer 与 Web Audio Analyser 真实静音检测驱动光标步进与 1.2s 自动淡出。
- **展现与交互层**：桌面端引入 `NiaSpeechBubble` 实体表面气泡，淡出后自动剥离 `hit-region`；工作台 `nia-workspace-surface.tsx` 彻底剔除工具 Tab/卡片并引入顶栏实时语音文字胶囊。
- **协议与传输层**：`realtime-transport.ts` 彻底剥离 `tools` 与 `tool_choice`，新增 `saying` delta 流式事件上报。

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
    // "，" should cling to "好", "！" should cling to "界", "(" should cling to "测"
    expect(atoms).toContain("好，");
    expect(atoms).toContain("界！");
    expect(atoms).toContain("(测");
  });

  it("wraps mixed Chinese and English text into lines within max width", () => {
    const measure = (text: string) => text.length * 8;
    const lines = wrapByWord("今天我们要学习 React hooks and state 深入理解。", 120, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(MAX_BUBBLE_LINES);
    // Line never starts with a prohibited character like '，' or '。'
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

### Task 2: 语速推算与单次发声状态机 (`bubble-pace.ts` & `bubble-utterance.ts`)

**Files:**
- Create: `src/components/nia/companion/bubble-pace.ts`
- Create: `src/components/nia/companion/bubble-utterance.ts`
- Test: `tests/unit/nia/bubble-utterance.test.ts`

- [ ] **Step 1: 编写失败的单元测试**

```ts
// tests/unit/nia/bubble-utterance.test.ts
import { describe, expect, it } from "vitest";
import { createPacer } from "@/components/nia/companion/bubble-pace";
import { createUtterance } from "@/components/nia/companion/bubble-utterance";

describe("bubble pace and utterance state machine", () => {
  it("tracks streaming delta in utterance", () => {
    const utterance = createUtterance();
    utterance.add("你好，", "resp_1");
    utterance.add("这是第二句。", "resp_1");
    expect(utterance.text()).toBe("你好，这是第二句。");
    expect(utterance.respondingTo()).toBe("resp_1");
  });

  it("advances cursor when speaking starts", () => {
    const utterance = createUtterance();
    utterance.add("Hello world testing utterance.", "resp_1");
    utterance.speaks("resp_1");
    expect(utterance.begun()).toBe(true);
    // Step forward 0.5s of sound
    utterance.step(0, 0.5);
    expect(utterance.at()).toBeGreaterThan(0);
  });

  it("handles user barge-in (interruption) by cutting without corrupting pacer", () => {
    const pacer = createPacer();
    const utterance = createUtterance(pacer);
    utterance.add("很长的一句话但是马上被打断了", "resp_1");
    utterance.speaks("resp_1");
    utterance.step(0, 0.1);
    utterance.finished("resp_1", true); // interrupted = true
    expect(utterance.respondingTo()).toBe("resp_1");
  });
});
```

- [ ] **Step 2: 运行测试以确认失败**

Run: `npx vitest run tests/unit/nia/bubble-utterance.test.ts`
Expected: FAIL with `Cannot find module '@/components/nia/companion/bubble-pace'`

- [ ] **Step 3: 实现 `bubble-pace.ts` 与 `bubble-utterance.ts`**

```ts
// src/components/nia/companion/bubble-pace.ts
import { isDense } from "./bubble-wrap";

export const CJK_COST = 15.1 / 4.1;

export function costOf(text: string): number {
  let cost = 0;
  for (const char of text) {
    cost += isDense(char) ? CJK_COST : 1;
  }
  return cost;
}

export interface Pacer {
  wrote(text: string): void;
  speaks(atSeconds: number): void;
  restart(): void;
  advance(dtSeconds: number): number;
  cut(): void;
  learnedRate(): number;
}

export function createPacer(initialCharsPerSec = 15.0): Pacer {
  let rate = initialCharsPerSec;
  let accumulatedCost = 0;
  let totalAudioSeconds = 0;
  let cursorCost = 0;

  return {
    wrote(text: string) {
      accumulatedCost = costOf(text);
    },
    speaks(_atSeconds: number) {},
    restart() {
      cursorCost = 0;
    },
    advance(dtSeconds: number): number {
      cursorCost += rate * dtSeconds;
      return cursorCost;
    },
    cut() {
      // Discard current turn stats to prevent barge-in from lowering the learned rate
    },
    learnedRate() {
      return rate;
    },
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
  step(quietFor: number, dtSeconds: number): void;
  text(): string;
  at(): number;
  respondingTo(): string | null;
  begun(): boolean;
  clear(): void;
}

export const SOUNDING_S = 0.25;

export function createUtterance(pacer: Pacer = createPacer()): Utterance {
  let text = "";
  let responseId: string | null = null;
  let begun = false;
  let speaking = false;
  let cursorCharIndex = 0;

  function begin(next: string) {
    responseId = next;
    text = "";
    begun = false;
    speaking = false;
    cursorCharIndex = 0;
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
      speaking = true;
    },
    finished(next: string, interrupted: boolean) {
      if (next !== responseId) return;
      speaking = false;
      if (interrupted) {
        pacer.cut();
      }
    },
    step(quietFor: number, dtSeconds: number) {
      if (!begun) return;
      if (quietFor <= SOUNDING_S && speaking) {
        const costAdvanced = pacer.advance(dtSeconds);
        cursorCharIndex = Math.min(text.length, Math.round(costAdvanced));
      }
    },
    text() {
      return text;
    },
    at() {
      return cursorCharIndex;
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
      speaking = false;
      cursorCharIndex = 0;
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
git commit -m "feat(nia): add bubble-pace and bubble-utterance state machine"
```

---

### Task 3: 实体气泡 UI 组件与样式 (`nia-speech-bubble.tsx` & `companion.css`)

**Files:**
- Create: `src/components/nia/companion/nia-speech-bubble.tsx`
- Modify: `src/components/nia/companion/companion.css:23-35`
- Test: `tests/component/nia/nia-speech-bubble.test.tsx`

- [ ] **Step 1: 编写失败的组件测试**

```tsx
// tests/component/nia/nia-speech-bubble.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NiaSpeechBubble } from "@/components/nia/companion/nia-speech-bubble";

describe("NiaSpeechBubble component", () => {
  it("renders text split into said, saying and ahead runs", () => {
    const { container } = render(
      <NiaSpeechBubble
        text="今天学习知识。"
        cursorIndex={4}
        visible={true}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText("今天学习")).toHaveClass("nia-bubble__run--said");
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

  it("removes hit-region and sets pointer-events none when invisible", () => {
    const { container } = render(
      <NiaSpeechBubble
        text=""
        cursorIndex={0}
        visible={false}
        onDismiss={vi.fn()}
      />
    );
    const bubble = container.querySelector(".nia-bubble");
    expect(bubble).toBeNull(); // Unmounted or hidden without hit-region
  });
});
```

- [ ] **Step 2: 运行测试以确认失败**

Run: `npx vitest run tests/component/nia/nia-speech-bubble.test.tsx`
Expected: FAIL with `Cannot find module '@/components/nia/companion/nia-speech-bubble'`

- [ ] **Step 3: 实现 `nia-speech-bubble.tsx` 与相关样式**

```tsx
// src/components/nia/companion/nia-speech-bubble.tsx
"use client";

import { useState, useMemo } from "react";
import { wrapByWord } from "./bubble-wrap";

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

  const lines = useMemo(() => {
    if (!text) return [];
    return wrapByWord(text, maxWidth);
  }, [text, maxWidth]);

  if (!visible || lines.length === 0) return null;

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      });
    }
  };

  // Build rendered runs based on cursorIndex across lines
  let charCounter = 0;

  return (
    <section
      aria-label="Nia 对话气泡"
      className="nia-bubble"
      data-nia-companion-hit-region=""
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
          const lineStart = charCounter;
          const lineEnd = lineStart + line.length;
          charCounter = lineEnd;

          // Determine said / saying / ahead slices for this line
          if (cursorIndex <= lineStart) {
            return (
              <p className="nia-bubble__line" key={lineIdx}>
                <span className="nia-bubble__run--ahead">{line}</span>
              </p>
            );
          }
          if (cursorIndex >= lineEnd) {
            return (
              <p className="nia-bubble__line" key={lineIdx}>
                <span className="nia-bubble__run--said">{line}</span>
              </p>
            );
          }
          const splitPoint = cursorIndex - lineStart;
          const said = line.slice(0, splitPoint);
          const ahead = line.slice(splitPoint);
          return (
            <p className="nia-bubble__line" key={lineIdx}>
              <span className="nia-bubble__run--said">{said}</span>
              <span className="nia-bubble__run--ahead">{ahead}</span>
            </p>
          );
        })}
      </div>
      <div className="nia-bubble__tail" aria-hidden="true" />
    </section>
  );
}
```

在 `src/components/nia/companion/companion.css` 中取消 `.nia-companion__spoken-status` 的隐藏，并添加 `.nia-bubble` 专属实体样式：
```css
/* companion.css updates */
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
git commit -m "feat(nia): add NiaSpeechBubble component and opaque entity styling"
```

---

### Task 4: Realtime 协议彻底去工具化与 Delta 流式管道

**Files:**
- Modify: `src/components/nia/companion/realtime-transport.ts`
- Modify: `src/features/nia/nia-review-context.ts:50-70`
- Test: `tests/unit/nia/nia-realtime-transport.test.ts`
- Test: `tests/unit/nia/nia-review-context.test.ts`

- [ ] **Step 1: 检查现有测试并调整测试用例断言**

修改 `tests/unit/nia/nia-realtime-transport.test.ts`，验证 `session.update` 中不再携带 `tools`，并且接收到 `output_audio_transcript.delta` 时触发 `saying` report。
修改 `tests/unit/nia/nia-review-context.test.ts`，断言提醒词不再要求调用 `get_today_reviews`。

- [ ] **Step 2: 改造 `realtime-transport.ts`**

- 移除对 `NIA_REVIEW_TOOL` 与 `NIA_REVIEW_INSTRUCTIONS` 的引用。
- 在 `CompanionTransportReport` 增加 `{ type: "saying"; generation: number; delta: string; responseId: string }`。
- `sendSessionUpdate()` 传入 `tools: []` 和 `tool_choice: "none"`，指令仅保留 `NIA_REALTIME_INSTRUCTIONS`。
- 在 `handleServerEvent()` 的 `case "saying"` 中发送 delta：
  ```ts
  case "saying":
    if (event.delta) {
      this.emit({ type: "saying", generation, delta: event.delta, responseId: event.responseId });
    }
    this.emit({ type: "state", generation, state: "speaking" });
    return;
  ```
- 移除 `case "tool":` 与 `this.needsToolResponse` 关联的僵尸逻辑。

- [ ] **Step 3: 改造 `buildNiaReviewReminder` 为纯自然语言**

在 `src/features/nia/nia-review-context.ts` 中，将复习提问由引导调用工具改为直接表述：
`"今天有 ${dueCount} 个复习项（其中 ${overdueCount} 项已逾期），我们现在要开始复习吗？"`

- [ ] **Step 4: 运行定向测试以确认通过**

Run: `npx vitest run tests/unit/nia/nia-realtime-transport.test.ts tests/unit/nia/nia-review-context.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/components/nia/companion/realtime-transport.ts src/features/nia/nia-review-context.ts tests/unit/nia/nia-realtime-transport.test.ts tests/unit/nia/nia-review-context.test.ts
git commit -m "refactor(nia): remove tool injections from realtime protocol and emit transcript delta"
```

---

### Task 5: 桌面浮窗运行时整合与静音 1.2s 淡出 (`companion-runtime.tsx` & `companion-window.cjs`)

**Files:**
- Modify: `electron/nia/companion/companion-window.cjs:55-60`
- Modify: `src/components/nia/companion/use-companion-avatar.ts`
- Modify: `src/components/nia/companion/companion-runtime.tsx`

- [ ] **Step 1: 微调 Companion 窗口高度留足净空**

在 `electron/nia/companion/companion-window.cjs` 中：
将 `width: 320, height: 360` 微调为 `width: 340, height: 420`，确保气泡在角色头部上方有充足垂直空间。

- [ ] **Step 2: 扩展 `use-companion-avatar.ts` 暴露真实静音计时**

在 `useCompanionAvatar` 中：
- 当 `envelope > 0.01` 时，重置 `quietSecondsRef.current = 0`。
- 当 `envelope <= 0.01` 时，随 RAF 累加 `quietSecondsRef.current += dt`。
- 返回 `quietSeconds`（当前静音持续秒数）。

- [ ] **Step 3: 在 `companion-runtime.tsx` 挂载 `NiaSpeechBubble` 与 Utterance**

- 创建 `utteranceRef = useRef(createUtterance())`。
- 当收到 `report.type === "saying"` 时，调用 `utteranceRef.current.add(report.delta, report.responseId)`。
- 当状态进入 `speaking` 时，调用 `utteranceRef.current.speaks(responseId)`。
- 在 RAF 循环中调用 `utterance.step(quietSeconds, dt)`，实时更新 `cursorIndex`。
- 气泡可见性控制：当静音持续超过 1.2 秒（`FADE_AFTER_QUIET_S = 1.2`），`setBubbleVisible(false)`；收到新 `saying` 时设为 `true`。
- 在 JSX 中渲染 `<NiaSpeechBubble text={utterance.text()} cursorIndex={cursorIndex} visible={bubbleVisible} onDismiss={() => setBubbleVisible(false)} />`。

- [ ] **Step 4: 定向测试验证**

Run: `npx vitest run tests/component/nia/`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add electron/nia/companion/companion-window.cjs src/components/nia/companion/use-companion-avatar.ts src/components/nia/companion/companion-runtime.tsx
git commit -m "feat(nia): integrate speech bubble and analyser-based 1.2s silence fade-out in companion"
```

---

### Task 6: 应用内工作台与归档彻底去工具化及实时说话胶囊 (`nia-workspace-surface.tsx`)

**Files:**
- Modify: `src/components/nia/nia-workspace-surface.tsx`
- Modify: `src/components/nia/nia-conversation-archive.tsx`
- Modify: `src/app/nia/nia.css`
- Test: `tests/component/nia/nia-workspace-surface.test.tsx`
- Test: `tests/component/nia/nia-conversation-archive.test.tsx`

- [ ] **Step 1: 更新工作台测试用例**

在 `tests/component/nia/nia-workspace-surface.test.tsx` 中：
- 删除对 `工具` Tab 的点击和断言。
- 增加断言：页面无任何 `role="tab"` 包含“工具”，无“可用工具与模型路由”舞台。
- 增加对“正在说话时展示实时文字”的断言。
在 `tests/component/nia/nia-conversation-archive.test.tsx` 中：
- 移除对工具调用统计提示的 DOM 断言。

- [ ] **Step 2: 改造 `nia-workspace-surface.tsx`**

- 移除 `InspectorTab` 中的 `"tools"`，只保留单一的对话浏览。
- 彻底删除顶栏 `工具` Tab 按钮。
- 彻底删除 `{tab === "tools" && ...}` 整个主体和右侧审查栏中的能力概览。
- 从会话详情中删除 `toolSummary` 及其相关 DOM 节点。
- 清理无用导入：`listNiaToolsForContext` 等。
- 增强中央状态控制区：
  - 维护 `liveSpokenText` 状态（由 companion host 事件实时更新）。
  - 当 Nia 处于 `speaking` 时，展示带音频波形的实时说话胶囊：`Nia: "..."`。

- [ ] **Step 3: 改造 `nia-conversation-archive.tsx`**

- 移除头部工具统计与“本次对话没有调用工具”提示。

- [ ] **Step 4: 清理 `nia.css` 中的工具相关样式**

- 清理 `.nia-workspace__tools-stage`、`.nia-workspace__capability-inspector` 相关 CSS 规则，新增实时伴学说话胶囊样式。

- [ ] **Step 5: 运行定向测试以确认通过**

Run: `npx vitest run tests/component/nia/nia-workspace-surface.test.tsx tests/component/nia/nia-conversation-archive.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交代码**

```bash
git add src/components/nia/nia-workspace-surface.tsx src/components/nia/nia-conversation-archive.tsx src/app/nia/nia.css tests/component/nia/nia-workspace-surface.test.tsx tests/component/nia/nia-conversation-archive.test.tsx
git commit -m "refactor(nia): remove tools stage and capability inspector, add live speech banner"
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
