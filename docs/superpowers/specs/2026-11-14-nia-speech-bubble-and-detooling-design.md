# Nia 界面重构与说话气泡系统设计方案 (对齐 Orbis 架构)

## 1. 目标与背景 (Goal & Context)

### 目标
改造 Auris 现有的 **Nia** 系统界面，达成两大核心目标：
1. **彻底去工具化**：移除主工作台与底层 Realtime 协议中所有关于“工具”（Tools）的功能模块、标签页、卡片与配置，使 Nia 专注于纯粹的伴学、伴读与对话。
2. **说话实时文字气泡 (对齐 Orbis)**：复用参考工程 `/Users/apple/Desktop/Orbis` 的成熟排版与阅读光标推进算法，使 Nia 无论在桌面悬浮伴侣（Desktop Companion）还是应用内工作台（/nia）开口说话时，用户都能实时、优雅地看到其朗读的内容。

### 现状诊断与痛点
1. **桌面伴侣说话不可见**：
   - 当前 [companion-runtime.tsx](file:///Users/apple/Desktop/%E5%A4%A7%E5%AD%A6markdown/src/components/nia/companion/companion-runtime.tsx#L284-L285) 虽然在语音播报时记录了 `lastText` 并渲染了 `<p className="nia-companion__spoken-status">`，但在 [companion.css](file:///Users/apple/Desktop/%E5%A4%A7%E5%AD%A6markdown/src/components/nia/companion/companion.css#L23-L30) 中被 `clip-path: inset(50%); height: 1px; width: 1px; overflow: hidden;` 完全裁切隐藏（仅作为读屏器辅助文字存在），导致视觉上完全缺失对话气泡。
   - [realtime-transport.ts](file:///Users/apple/Desktop/%E5%A4%A7%E5%AD%A6markdown/src/components/nia/companion/realtime-transport.ts#L286-L290) 在接收到 OpenAI Realtime 的 `response.output_audio_transcript.delta` 流式事件时直接抛弃了增量文本，直到句子完全播完的 `said` 事件才发出，缺少实时打字机体验。
2. **工作台受冗余“工具”干扰**：
   - [nia-workspace-surface.tsx](file:///Users/apple/Desktop/%E5%A4%A7%E5%AD%A6markdown/src/components/nia/nia-workspace-surface.tsx) 存在专用的 `工具` Tab、庞大的工具卡片展台 (`nia-workspace__tools-stage`)、右侧工具连接概览 (`nia-workspace__capability-inspector`) 以及历史会话头部的工具调用统计，打乱了沉浸阅读与伴学的心流。
   - 底层 Realtime 会话在初始化时自动注入了 `tools: [NIA_REVIEW_TOOL]` 与 `tool_choice: "auto"`，导致模型可能出现工具调用停顿或误判。

---

## 2. 详细技术方案 (Architecture & Specifications)

### 2.1 桌面伴侣气泡算法与渲染系统 (Desktop Companion)

直接引入并适配 `/Users/apple/Desktop/Orbis/src/renderer/companion/` 的精细算法逻辑：

#### 1. 中英文自然断句与分行 (`src/components/nia/companion/bubble-wrap.ts`)
- 移植自 Orbis `wrap.ts`。
- 依托原生的 `Intl.Segmenter(undefined, { granularity: "word" })` 进行分词。
- 针对中文无空格文本与英文单词分别计算宽度，避免传统按空格 split 导致整段中文被判为一个超长单词而断行失败的问题。
- 限制最大渲染行数为 **5 行**（参考 Orbis 设计判断：既能覆盖绝大多数日常对话，又不会遮挡过多桌面背景）。

#### 2. 自适应语速推算与光标推进 (`src/components/nia/companion/bubble-pace.ts` & `bubble-utterance.ts`)
- 移植自 Orbis `audio/pace.ts` 与 `utterance.ts`。
- **Pacer**：动态统计字符输出速度（字符数 / 音频秒数），随每次回答平滑自适应，推算当前音频播放时刻落在哪一个字词上。
- **Utterance 状态机**：
  - `add(delta, responseId)`：随着 Realtime WebSocket 增量推送即时累加文本。
  - `speaks(responseId)`：音频缓冲启动播放，开启光标计时。
  - `finished(responseId, interrupted)`：音频播放完成或被打断时收敛。
  - `step(quietSeconds, dt)`：计算停顿时间。
- **三层字词视觉渲染**：
  - **已念出 (`said`)**：高对比正文全墨（`var(--app-ink)`）。
  - **正在念 (`saying`)**：微下划线（1.5px solid underline）标亮，作为视线锚点。
  - **待念出 (`ahead`)**：低对比度柔化展示（约为 40% 透明度或 `--app-muted`），让用户对后文有预期，但不会喧宾夺主。

#### 3. 气泡视觉组件与操作 (`src/components/nia/companion/nia-speech-bubble.tsx`)
- **毛玻璃与层次感**：
  - 背景：`background: color-mix(in srgb, var(--app-surface) 88%, transparent)`，配合 `backdrop-filter: blur(16px)`。
  - 边界与阴影：1px 细腻内描边（`var(--app-line)`），外附双层柔和微阴影（避免亮色壁纸下失真）。
  - 布局：定位在像素刺猬头部上方，带微弱的三角形发声小尾巴朝向刺猬。
- **交互微操作**：
  - 右上角配备低调的悬停操作图标：
    - **复制 (Copy)**：一键复制当前气泡文字到剪贴板，并呈现 1.5s 绿色对勾反馈。
    - **关闭 (Dismiss)**：立即手动淡出本条气泡。
- **智能生命周期**：
  - 在检测到音频停止且静音持续 **1.2 秒** 后，触发 **0.35 秒** 的 CSS 渐隐动画自动消失。
  - 新增回答到达时瞬间唤醒并重置可见度。
- **桌面穿透与命中保障**：
  - 气泡根节点添加 `data-nia-companion-hit-region` 属性。
  - 当鼠标进入气泡（例如悬停阅读或点击复制）时，触发 `bridge.pointerCapture(true)`；移出气泡且不在刺猬本体上时，立即释放指针捕获（`pointerCapture(false)`），确保浮窗其余大面积空白透明区域 100% 穿透至底层桌面窗口。

---

### 2.2 Realtime 协议去工具化与数据管道改造

#### 1. 清理会话更新协议 (`src/components/nia/companion/realtime-transport.ts`)
- 在 `sendSessionUpdate()` 方法中：
  ```ts
  // 改造前：
  this.send({
    type: "session.update",
    session: {
      ...config,
      tools: [NIA_REVIEW_TOOL],
      tool_choice: "auto",
      instructions: NIA_REALTIME_INSTRUCTIONS + NIA_REVIEW_INSTRUCTIONS,
    },
  });

  // 改造后：
  this.send({
    type: "session.update",
    session: {
      ...config,
      tools: [],
      tool_choice: "none",
      instructions: NIA_REALTIME_INSTRUCTIONS,
    },
  });
  ```
- 移除 `buildNiaReviewReminder`、`readNiaTodayReviews`、`NIA_REVIEW_TOOL`、`NIA_REVIEW_INSTRUCTIONS` 等工具依赖模块导入。

#### 2. 流式文本上报 (`CompanionTransportReport`)
- 扩展 `CompanionTransportReport` 联合类型：
  ```ts
  export type CompanionTransportReport =
    | { type: "opened"; generation: number; sessionId: string; expiresAt: number | null }
    | { type: "state"; generation: number; state: string }
    | { type: "saying"; generation: number; delta: string; responseId: string }
    | { type: "heard" | "said"; generation: number; text: string; at?: number; responseId?: string; itemId?: string; cut?: boolean }
    | { type: "failed"; generation: number; code: string; message: string; recovery?: string }
    | { type: "closed"; generation: number; at?: number };
  ```
- 在 `handleServerEvent()` 的 `case "saying"` 中，将解析得到的 `event.delta` 实时发出，驱动气泡与外部订阅者。
- 监听 `conversation.item.truncated` 与 `output_audio_buffer.stopped`，向 Utterance 发送完成/截断信号。

---

### 2.3 应用内 Nia 工作台 (/nia) 界面重构

#### 1. 彻底删除“工具”所有 UI 元件 (`src/components/nia/nia-workspace-surface.tsx`)
- **移除 Tab**：删除 `nav.nia-workspace__tab-strip` 中的 `<button>工具</button>`，统一为单一的对话归档与伴学视口，去除 `tab === "tools"` 条件分支。
- **移除工具舞台**：彻底删除 `<article className="nia-workspace__tools-stage">` 及其子元素（工具卡片网格）。
- **移除右侧工具概览**：彻底删除 `<section className="nia-workspace__capability-inspector">`（连接概览、状态指标）。
- **移除详情工具标签**：删除 `toolSummary` 及 `<div className="nia-workspace__transcript-tools">` 渲染。
- **清理无用逻辑**：移除 `listNiaToolsForContext`、`uniqueToolSummary`、`availableToolCount` 等辅助函数及相关测试遗留。

#### 2. 实时伴学说话栏 (Live Speech Banner)
- 在工作台顶部居中控制区（`nia-workspace__center-controls`）进行增强：
  - 当 Nia 处于 `speaking` 状态或刚刚说完时，将单一的“正在回应”状态点展开为带声波跳动微动效与文字流的胶囊栏：
    `[ 声波动画 ] Nia: "正在说的内容文字……"`
  - 允许点击快速复制或将文字展开为微小浮层。
  - 在右侧主舞台中，如果当前正在进行伴学对话，将当前轮次实时流式渲染在对话卡片顶部，使得用户在应用内工作台时同样能所见即所听。

---

## 3. 影响范围与共用层声明 (Impact Assessment)

根据 [AGENTS.md](file:///Users/apple/Desktop/%E5%A4%A7%E5%AD%A6markdown/AGENTS.md) 规则：
- **修改范围**：
  - `src/components/nia/companion/`：新增 `bubble-wrap.ts`、`bubble-pace.ts`、`bubble-utterance.ts`、`nia-speech-bubble.tsx`，改造 `companion-runtime.tsx`、`companion.css`、`realtime-transport.ts`。
  - `src/components/nia/nia-workspace-surface.tsx` 与 `src/app/nia/nia.css`：移除工具模块，增强实时说话展示。
  - `tests/component/nia/` 与 `tests/unit/nia/`：更新相关测试用例。
- **共用层声明**：
  - 本次改造属于前端展现层与伴侣协议层改造，不修改 `src/platform/`、`src/lib/supabase/` 或通用授权路由，不破坏其他模块。
  - 对主进程 `electron/nia/companion/` 保持完全兼容，甚至减轻了其工具分发的负担。

---

## 4. 验证计划 (Verification Plan)

1. **单元与组件测试**：
   - 为新引入的分词排版 `bubble-wrap.ts` 编写单元测试（覆盖中文断句、英文分词、5 行溢出截断）。
   - 为语速与光标推进 `bubble-utterance.ts` 编写单元测试（覆盖 delta 累积、音频播放推进、静音 1.2s 淡出触发）。
   - 为 `NiaSpeechBubble` 编写渲染与微操作交互测试（复制文字、关闭按钮、`hit-region` 属性）。
   - 更新 `tests/component/nia/nia-workspace-surface.test.tsx`，移除工具 Tab 断言，增加“无工具残留”及“实时说话状态展示”的断言。
2. **构建与代码质量**：
   - 运行定向 ESLint：`npx eslint src/components/nia/ tests/component/nia/ tests/unit/nia/` 保证 0 error。
   - 运行定向 Vitest：覆盖全部 Nia 测试用例确保 100% 通过。
   - 运行 Next.js 生产构建：`npm run build` 确保无类型与编译错误。
   - 检查 `git diff --check`。
3. **运行时桌面端功能验证**：
   - 验证桌面常驻浮窗：Nia 说话时头顶正常浮现半透明气泡，文字打字机流式呈现，已读词亮、未读词淡，1.2 秒后自然渐隐；透明区域鼠标正常点击穿透到桌面软件。
   - 验证应用内工作台 `/nia`：页面不再出现任何“工具”标签页、卡片或连接信息，顶部实时展示正在说的语音文本。
