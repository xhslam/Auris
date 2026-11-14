# Nia 界面重构与说话气泡系统设计方案 (对齐 Orbis 架构)

## 1. 目标与背景 (Goal & Context)

### 目标
改造 Auris 现有的 **Nia** 系统界面，达成两大核心目标：
1. **彻底去工具化**：移除主工作台、归档视图与底层 Realtime 协议中所有关于“工具”（Tools）的功能模块、标签页、卡片、提示词引导与配置，使 Nia 专注于纯粹的伴学、伴读与对话。
2. **说话实时文字气泡 (对齐 Orbis)**：复用参考工程 `/Users/apple/Desktop/Orbis` 的成熟排版与阅读光标推进算法，使 Nia 无论在桌面悬浮伴侣（Desktop Companion）还是应用内工作台（/nia）开口说话时，用户都能实时、优雅地看到其朗读的内容。

### 现状诊断与痛点
1. **桌面伴侣说话不可见**：
   - 当前 [companion-runtime.tsx](file:///Users/apple/Desktop/%E5%A4%A7%E5%AD%A6markdown/src/components/nia/companion/companion-runtime.tsx#L284-L285) 虽然在语音播报时记录了 `lastText` 并渲染了 `<p className="nia-companion__spoken-status">`，但在 [companion.css](file:///Users/apple/Desktop/%E5%A4%A7%E5%AD%A6markdown/src/components/nia/companion/companion.css#L23-L30) 中被 `clip-path: inset(50%); height: 1px; width: 1px; overflow: hidden;` 完全裁切隐藏（仅作为读屏器辅助文字存在），导致视觉上完全缺失对话气泡。
   - [realtime-transport.ts](file:///Users/apple/Desktop/%E5%A4%A7%E5%AD%A6markdown/src/components/nia/companion/realtime-transport.ts#L286-L290) 在接收到 OpenAI Realtime 的 `response.output_audio_transcript.delta` 流式事件时直接抛弃了增量文本，直到句子完全播完的 `said` 事件才发出，缺少实时打字机体验。
2. **工作台受冗余“工具”干扰**：
   - [nia-workspace-surface.tsx](file:///Users/apple/Desktop/%E5%A4%A7%E5%AD%A6markdown/src/components/nia/nia-workspace-surface.tsx) 存在专用的 `工具` Tab、庞大的工具卡片展台 (`nia-workspace__tools-stage`)、右侧工具连接概览 (`nia-workspace__capability-inspector`) 以及历史会话头部的工具调用统计，打乱了沉浸阅读与伴学的心流。
   - [nia-conversation-archive.tsx](file:///Users/apple/Desktop/%E5%A4%A7%E5%AD%A6markdown/src/components/nia/nia-conversation-archive.tsx#L253) 在归档头部仍在渲染 `{toolSummary.length ? ... : <small>本次对话没有调用工具</small>}`。
   - 底层 Realtime 会话在初始化时自动注入了 `tools: [NIA_REVIEW_TOOL]` 与 `tool_choice: "auto"`，导致模型可能出现工具调用停顿或误判。`buildNiaReviewReminder` 仍要求模型“先调用 get_today_reviews”，在无工具环境会导致死锁或幻觉报错。

---

## 2. 详细技术方案 (Architecture & Specifications)

### 2.1 桌面伴侣气泡算法与渲染系统 (Desktop Companion)

严格对齐 `/Users/apple/Desktop/Orbis/src/renderer/companion/` 的算法实现与设计法则：

#### 1. 中英文原子断句与禁则分行 (`bubble-wrap.ts`)
- 移植自 Orbis `wrap.ts` 与 `script.ts`。
- **Grapheme 切分**：使用 `Intl.Segmenter(undefined, { granularity: "grapheme" })` 处理视觉字形，完整保留 emoji 与组合字符。
- **CJK 稠密字形判定 (`isDense`)**：基于 Unicode 属性 `\p{Script_Extensions=Han}`、`\p{Script_Extensions=Hiragana}`、`\p{Script_Extensions=Katakana}` 等判定汉字与假名。
- **原子切分 (`atomize`) 与禁则处理 (禁則処理)**：
  - 英文词为单个 atom（含尾部空格）。
  - 每个 CJK 字形为独立 atom。
  - **行首禁则 (`NO_START`)**：`，。、；：？！）］｝」』〉》〕】…‥・ー～,.;:!?)\]}%` 强制依附于前一个字，行首绝不出现逗号/句号等。
  - **行尾禁则 (`NO_END`)**：`（［｛「『〈《〔【([{` 强制依附于后一个字，行尾绝不留悬空前括号。
  - **允许折行连词符 (`BREAK_AFTER`)**：`—–-/` 之后允许折行。
- **行数与宽度限制**：最大行数定为 **5 行**，自适应最小宽度（如 140px）与最大宽度（如 240px）。

#### 2. 自适应语速推算与光标推进 (`bubble-pace.ts` & `bubble-utterance.ts`)
- 移植自 Orbis `audio/pace.ts` 与 `utterance.ts`。
- **Pacer**：
  - 采用 CJK 相对成本权重 `CJK_COST = 15.1 / 4.1` 计算字符当量，解决中英文字符信息密度差异导致的语速推算失真。
  - 学习每次语音回答的平均速度，当用户插话打断（barge-in）时调用 `cut()` 丢弃异常短耗时，防止污染速度基线。
- **Utterance 状态机**：
  - `add(delta, responseId)`：随着 Realtime WebSocket 增量推送即时累加文本。
  - `speaks(responseId)`：音频播放启动时激活光标计时。
  - `finished(responseId, interrupted)`：音频播放结束或被打断时收敛。
  - `step(quietSeconds, dt)`：计算停顿时间并驱动光标前进。
- **三层字词视觉渲染**：
  - **已念出 (`said`)**：高对比正文全墨（`var(--app-ink)`）。
  - **正在念 (`saying`)**：微下划线（1.5px solid underline）标亮，作为视线焦点。
  - **待念出 (`ahead`)**：低对比度柔化展示（实体低对比色，保障可读性的同时降低视觉抢占）。

#### 3. 气泡视觉组件与 React 状态机 (`useCompanionBubble` & `NiaSpeechBubble`)
- **表面材质与实体对比度（Orbis 准则 2）**：
  - **严禁使用半透明毛玻璃**（在透明 Electron 窗口下 Chromium 无法对透明窗底下的外部桌面/应用产生系统级模糊，会导致严重不可读）。
  - 采用**实体不透明表面**：
    - 浅色模式：`var(--paper, #f7f6f2)`，描边 `1px solid var(--app-line, rgba(0,0,0,0.08))`。
    - 深色模式：`var(--paper, #1e1e22)`，描边 `1px solid var(--app-line, rgba(255,255,255,0.12))`。
    - 双层微阴影（`box-shadow: 0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)`），确保在任何壁纸上都有明确边界。
- **静音淡出机制（Orbis 准则 1）**：
  - 静音检测**必须由 Web Audio Analyser 提供**，而不是依赖数据通道的 `response.done`（网线消息往往比音频结束早 1-2 秒）。
  - 复用 `use-companion-avatar.ts` 的 `envelope`（或其 AnalyserNode），当 `envelope <= 0.01` 持续 **1.2 秒** 后，气泡启动 **0.35 秒** 平滑渐隐。
- **交互微操作**：
  - 右上角配备低调悬停操作：**复制 (Copy)** 与 **关闭 (Dismiss)**。
- **桌面穿透与幽灵防误触（Orbis 准则 3）**：
  - 仅在气泡处于可见状态时赋予 `data-nia-companion-hit-region`。
  - 一旦气泡淡出完毕（opacity === 0），设置 `pointer-events: none`（或 unmount），严防看不见的气泡在桌面上阻挡用户点击下方的窗口。
- **窗口物理尺寸微调 (Headroom)**：
  - 伴侣支持缩放（80% - 140%），气泡本身保持 100% 字号不随刺猬同比放大（保证阅读体验）。
  - [companion-window.cjs](file:///Users/apple/Desktop/%E5%A4%A7%E5%AD%A6markdown/electron/nia/companion/companion-window.cjs#L56-L57) 的窗口尺寸从 `width: 320, height: 360` 适度微调为 `width: 340, height: 420`，为头顶 5 行文字气泡预留充裕头部净空，且不改变透明点击穿透特性。

---

### 2.2 Realtime 协议去工具化与数据管道改造

#### 1. 清理会话更新协议与僵尸逻辑 (`realtime-transport.ts`)
- 在 `sendSessionUpdate()` 中：
  - 将 `tools: [NIA_REVIEW_TOOL]` 与 `tool_choice: "auto"` 改为 `tools: []` 和 `tool_choice: "none"`。
  - 指令恢复为纯净的伴学设定 `NIA_REALTIME_INSTRUCTIONS`，移除 `NIA_REVIEW_INSTRUCTIONS`。
- 清理 `case "tool":` 与 `this.needsToolResponse`，移除所有工具调用的监听与响应代码。
- **改造复习提醒 (`sendReminder`)**：
  - 重构 `buildNiaReviewReminder`，不再包含“请先调用 get_today_reviews”，而是将待复习项的摘要直接格式化为自然语言提问（“今天有 N 个内容需要复习，我们从哪个开始？”），使模型无需工具即可直接口播。

#### 2. 流式文本上报与打断处理
- 扩展 `CompanionTransportReport` 类型，新增：
  `{ type: "saying"; generation: number; delta: string; responseId: string }`
- 当 `response.output_audio_transcript.delta` 到达时，实时触发该 report 并喂入 `utterance.add(delta, responseId)`。
- 监听 `conversation.item.truncated` 与 `output_audio_buffer.stopped`，触发 `utterance.finished(responseId, interrupted)`，打断时立即重置。

---

### 2.3 应用内 Nia 工作台 (/nia) 界面重构

#### 1. 彻底删除“工具”所有 UI 元件
- **工作台主视图 (`nia-workspace-surface.tsx`)**：
  - 移除 `nav.nia-workspace__tab-strip` 中的 `<button>工具</button>`，统一为专注伴学的单一会话视图。
  - 删除 `<article className="nia-workspace__tools-stage">` 整个工具卡片网格。
  - 删除右侧审查栏中的 `<section className="nia-workspace__capability-inspector">`（连接概览）。
  - 删除对话详情中的 `toolSummary` 及 `<div className="nia-workspace__transcript-tools">`。
  - 清理 `listNiaToolsForContext`、`uniqueToolSummary`、`availableToolCount` 等辅助函数及变量。
- **归档历史抽屉 (`nia-conversation-archive.tsx`)**：
  - 删除 L253 的 `{toolSummary.length ? ... : <small>本次对话没有调用工具</small>}`，彻底消除工具残留标签。

#### 2. 实时伴学说话栏 (Live Speech Banner)
- 在工作台顶部居中控制区（`nia-workspace__center-controls`）：
  - 当 Nia 处于 `speaking` 状态或刚刚说话时，展开动态声波微动效与文字流胶囊栏：
    `[ ılı. ] Nia: "正在说的内容……"`
  - 支持点击快速复制或将文字展开；语音停止后平滑收拢回常态。
  - 若正在发生实时会话，右侧舞台顶部自动流式显示本轮语音对应的文字，所见即所听。

---

## 3. 影响范围与共用层声明 (Impact Assessment)

根据 [AGENTS.md](file:///Users/apple/Desktop/%E5%A4%A7%E5%AD%A6markdown/AGENTS.md) 规则：
- **修改范围**：
  - `src/components/nia/companion/`：
    - 新增：`bubble-wrap.ts`、`bubble-pace.ts`、`bubble-utterance.ts`、`nia-speech-bubble.tsx`。
    - 修改：`companion-runtime.tsx`、`companion.css`、`realtime-transport.ts`、`use-companion-avatar.ts`。
  - `electron/nia/companion/companion-window.cjs`：微调窗口尺寸以保证气泡净空。
  - `src/components/nia/`：`nia-workspace-surface.tsx`、`nia-conversation-archive.tsx`、`nia.css`。
  - `src/features/nia/`：`nia-review-context.ts`（更新 reminder 纯文本生成）。
- **共用层声明**：
  - 不修改 `src/platform/`、`src/lib/supabase/`、`session-actor.ts` 或通用认证路由。
  - 仅影响 Nia 桌面端专属展现与伴侣交互，对 Notes/Video/Review 核心工作区零破坏。

---

## 4. 验证计划与测试迁移 (Verification Plan)

### 1. 新增单元与组件测试
- `tests/unit/nia/bubble-wrap.test.ts`：
  - 覆盖 CJK 稠密汉字切分、中英文混排。
  - 覆盖行首禁则（标点不落行首）、行尾禁则（括号不留行尾）、折行连词符。
  - 覆盖 5 行上限截断。
- `tests/unit/nia/bubble-utterance.test.ts`：
  - 覆盖 delta 流式累积与文本完整性。
  - 覆盖 Pacer CJK 语速折算与光标步进。
  - 覆盖静音 1.2s 淡出触发与用户插话打断（barge-in）丢弃速度基线。
- `tests/component/nia/nia-speech-bubble.test.tsx`：
  - 测试实体底色与边框样式。
  - 测试复制按钮触发及关闭按钮动作。
  - 测试淡出后 `pointer-events: none` 且无 `hit-region` 残留。

### 2. 现有测试重构与迁移 (Test Migration)
以下 4 个受去工具化影响的现有测试文件需同步更新断言：
1. `tests/unit/nia/nia-realtime-transport.test.ts`：更新 session.update 断言为 `tools: []` 与 `tool_choice: "none"`，清理 tool-call 相关用例。
2. `tests/component/nia/nia-workspace-surface.test.tsx`：移除 `screen.getByRole("tab", { name: "工具" })` 断言，添加“无工具 Tab 残留”与“Live Speech Banner”断言。
3. `tests/component/nia/nia-conversation-archive.test.tsx`：移除 `recall_conversations` 工具统计相关的 DOM 断言。
4. `tests/unit/nia/nia-review-context.test.ts`：更新 reminder 断言，验证其不再包含 `get_today_reviews` 字符串，而是纯自然语言。

### 3. 构建与端到端质量验证
- 定向 ESLint：`npx eslint src/components/nia/ src/features/nia/ tests/component/nia/ tests/unit/nia/` 保证 0 error。
- 定向 Vitest：运行全部 Nia 测试用例确保 100% 通过。
- 编译与全量构建：`npm run build` 确保 Next.js 与 TypeScript 0 new errors。
- `git diff --check` 通过。
