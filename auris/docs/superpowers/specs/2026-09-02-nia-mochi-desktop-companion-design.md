# Nia Mochi 式桌面陪伴与复习提醒设计

日期：2026-09-02  
状态：待实施规划  
适用项目：Auris Desktop（macOS 优先）

## 1. 目标

将现有 Nia 重构为 Mochi 式实时语音桌面陪伴，并把 `/nia` 变成该陪伴系统的完整控制中心。

目标不是仅制作一个外观类似 Mochi 的网页，而是复刻其关键运行方式：

- Nia 以独立透明 Electron 窗口悬浮在整个 macOS 桌面上；
- 切换到其他 Auris 页面或其他应用后仍持续显示；
- 关闭 Auris 主窗口不终止 Nia，只有真正退出 Auris 才消失；
- Electron 主进程拥有 Realtime 的权威生命周期、人物状态协调和会话保存，持续存在的人物 renderer 独占 WebRTC/media transport；
- 使用 Codex CLI 已登录账户的本地 OAuth 缓存建立 Realtime 会话，不使用 API Key；
- 语音、文字、工具调用、打断和会话档案按 Mochi 的生命周期处理；
- Nia 可以按既有 Review 数据定时语音提醒用户复习；
- 保留现有 Nia 的上下文、确认记忆、任务、模型路由、浏览器工具和操作审计能力；
- `/nia` 只提供黑色主题，并使用已经确认的 Apple 风格沉浸式布局。

本设计的 Mochi 行为基准固定为本机源码提交
`faa334001541fc74093288821df5cfbff96f6797`。后续若上游 Mochi 继续变化，不自动扩大本次范围；只有经过明确审查的上游变化才进入实施计划。直接迁移的 MIT 代码必须保留适当的来源和许可证说明。

## 2. 已确认的产品决定

### 2.1 桌面存在方式

- 使用独立的透明、无边框 Electron `BrowserWindow`，不是 React 页面内浮层。
- 窗口始终置顶、跨 macOS Spaces 显示，并允许在全屏空间显示。
- 窗口不作为普通文档窗口出现在任务切换列表中，不主动抢占其他应用焦点。
- 只有人物实际轮廓、气泡和控件接收指针事件，其他透明区域鼠标穿透。
- 人物可以拖动，位置持久化；显示器拓扑变化后必须被限制回可见工作区。
- 关闭 Auris 主窗口仅隐藏主窗口，桌面人物和后台服务继续运行。
- 只有 `Command+Q`、菜单“退出 Auris”或系统真正终止进程时，人物才消失并结束会话。

### 2.2 Realtime 认证

- 唯一认证来源是 Codex CLI 登录缓存。
- 默认从 `$CODEX_HOME/auth.json` 读取；未设置 `CODEX_HOME` 时读取 `~/.codex/auth.json`。
- 长期 OAuth access token 仅可在 Electron 主进程读取。
- 主进程负责检查登录文件、解析 token、检查 JWT 过期时间、交换短期 Realtime 凭据并代理 SDP。
- preload、桌面人物 renderer、Next renderer 均不得获得长期 token 或临时 Realtime secret。
- 不保留、不新增 API Key 回退路径。现有 `/api/nia/realtime-session` 的 `OPENAI_API_KEY` 路径必须退出 Nia Live 运行链路。
- 登录缺失、token 过期或上游拒绝时保持安静：不语音播报、不弹通知、不改走其他认证；仅记录可由用户主动打开的本地诊断。

这一认证方式来自 Mochi 当前可运行实现，但不是稳定公开契约。系统必须将上游变化视为可诊断的“不可用”，不能伪装成成功或自行更换认证方式。

### 2.3 复习提醒

- 支持用户配置多个每日提醒时间。
- 支持用户配置免打扰时间段。
- Auris 运行或隐藏在后台时正常提醒；Auris 未运行时不注册系统计划唤醒。
- 下次启动时，对错过且仍有到期内容的情况最多补一次汇总提醒。
- 提醒内容先简述待复习数量和主题，再询问是否开始，例如：“今天有 3 个知识点待复习，要现在开始吗？”
- 每次提醒使用 GPT Realtime 语音，不使用系统本地 TTS。
- “稍后提醒”提供 15 分钟、30 分钟、1 小时和下一个计划时间；也接受自然语言延期。
- 免打扰结束后不连续补播多条，只进行一次汇总。
- Nia 正在说话或用户正在发言时，提醒进入队列，不打断当前轮次。
- 复习数据继续由现有 Output Review 存储拥有，不建立第二份知识点或复习周期数据。

### 2.4 视觉与主题

- `/nia` 本阶段只实现黑色主题。
- 保持 Auris 现有桌面框架和左侧导航风格。
- 页面采用中央人物舞台、底部统一对话坞、顶部轻量状态栏和右侧功能抽屉。
- 桌面人物有明确眼睛和身体轮廓，并具有空闲、聆听、思考、说话、休眠动作。
- 不调用摄像头。眼睛跟随只使用指针位置和会话状态。
- 遵从系统“减少动态效果”；启用时连续动画退化为淡入淡出和静态状态变化。
- 不制作浅色主题，不制作第二套视觉语言。

## 3. 现状与需要替换的路径

现有 `/nia` 由 `src/components/nia/nia-standalone-surface.tsx` 组织，已经包含：

- `NiaLiveSurface`；
- `NiaOperationsPanel`；
- `NiaModelRoutingPanel`；
- `NiaPanel`；
- 当前上下文、记忆、任务、浏览器工具和工作流入口。

现有 Live 路径为：

1. `src/features/nia/use-nia-live-session.ts` 请求 `/api/nia/realtime-session`；
2. `src/app/api/nia/realtime-session/route.ts` 使用 `OPENAI_API_KEY` 获取 client secret；
3. renderer 直接向 OpenAI 发送 SDP；
4. `nia-live-session-config.ts` 配置 Realtime 会话，但工具选择目前关闭。

这条链路不满足目标。它必须被主进程会话服务替换，并且不应与新的桌面人物分别建立连接。

Auris 已有 `electron/main.cjs`、`electron/preload.cjs`、`electron/nia/*` 和独立 Nia 窗口基础。实施应沿用现有 Electron 主入口和 preload 安全边界，将可测试逻辑拆到 `electron/nia/` 下的小模块中，避免继续把全部逻辑堆入 `main.cjs`。

## 4. 总体架构

```text
Electron 主进程
├── NiaCompanionWindowService
│   ├── 创建、显示、隐藏透明人物窗口
│   ├── 指针穿透与拖动
│   ├── 显示器位置恢复
│   └── 主窗口打开/聚焦 /nia
├── NiaRealtimeCoordinator
│   ├── 唯一活动会话的 generation 与期望状态
│   ├── Codex OAuth credential broker
│   ├── SDP 代理
│   ├── 重连、休眠、唤醒和退出协调
│   └── 工具调用与 renderer 报告分发
├── NiaConversationStore
│   ├── SQLite 会话、轮次与工具事件
│   ├── 搜索、导出与删除
│   └── 异常退出修复
├── NiaReminderScheduler
│   ├── 多提醒时间
│   ├── 免打扰与延期
│   ├── 去重与启动补提醒
│   └── Review 快照消费
└── NiaStateBroadcaster
    ├── 桌面人物 renderer
    └── Auris /nia renderer

持续存在的桌面人物 renderer
└── NiaRealtimeTransport
    ├── RTCPeerConnection 与 data channel
    ├── 麦克风 MediaStreamTrack
    ├── 远端 Audio 与播放进度
    ├── Realtime frame 解析
    └── 向主进程报告转写、输出、打断和状态
```

此处采用与 Mochi 一致的所有权边界：Electron 主进程不能直接持有浏览器的 `RTCPeerConnection`、`MediaStreamTrack`、data channel 或 `Audio` 对象。持续存在的桌面人物 renderer 是唯一 transport owner；主进程拥有长期凭据、SDP 代理、会话 generation、持久化和期望生命周期，并通过受限 IPC 命令 transport 打开、更新或关闭。

桌面人物 renderer 即使窗口被隐藏也不卸载，因此 transport 可以继续存在。`/nia` 页面只是第二个显示与控制端，绝不创建 peer。主进程根据 transport 报告形成规范化会话状态，并广播给两个表面：

- 它们可以订阅同一状态快照和增量事件；
- 它们可以发送经过校验的用户意图；
- 只有桌面人物 renderer 可以创建 Realtime peer；
- 任意一个显示端卸载都不会隐式结束会话；
- 页面导航不会影响主进程会话；
- 事件必须包含稳定的 session、conversation、turn 和 response 标识，避免跨表面乱序。

## 5. 桌面人物窗口

### 5.1 Electron 窗口属性

参考 Mochi，人物窗口应满足：

- `frame: false`；
- `transparent: true`；
- `resizable: false`；
- `hasShadow: false`；
- `skipTaskbar: true`；
- `contextIsolation: true`；
- `nodeIntegration: false`；
- 始终置顶层级与跨 Spaces 行为在 macOS 上显式配置；
- 初始隐藏，待 renderer 首次提交实际人物边界后再以正确尺寸和位置显示，避免 macOS 首次显示时把超出屏幕的透明窗口强制移动。

人物窗口使用独立、最小权限 preload。它只能访问 Nia 陪伴所需 IPC，不继承完整 Auris 页面桥。窗口角色必须由主进程创建参数决定，不能由可导航 URL 自行声明。

### 5.2 指针与拖动

- 默认启用 `setIgnoreMouseEvents(true, { forward: true })`。
- renderer 每帧依据实际人物像素轮廓、气泡范围和控件命中范围判断当前是否需要接收鼠标。
- 命中状态发生变化时才通知主进程切换鼠标穿透，禁止每帧发送 IPC。
- 拖动必须在人物轮廓内按下后开始；拖动期间窗口保持接收指针，松开后保存位置。
- 单击与拖动通过移动阈值和按下/松开状态区分，拖动结束不得误触发打开 `/nia`。
- 气泡可滚动时，气泡区域必须接收滚轮事件；人物之外的透明区域仍穿透。

### 5.3 点击行为

- 醒着时单击人物：显示或聚焦 Auris 主窗口并导航到 `/nia`，当前会话继续。
- 休眠时单击人物：只唤醒，不同时打开主窗口。
- 悬停时显示肩部会话按钮；按钮可显示未读回复或待复习数量，并打开 `/nia` 档案区域。
- 右键人物：打开原生菜单，包含唤醒/休眠、静音、显示/隐藏人物、打开 Nia、设置和退出 Auris。
- 气泡支持关闭、复制和进入完整会话。关闭气泡不删除消息，也不结束会话。
- 隐藏人物只改变可见性；休眠才关闭麦克风和 Realtime 连接。

### 5.4 位置恢复

- 保存人物的屏幕标识和归一化/绝对位置。
- 启动时优先恢复到原显示器；显示器不存在时落到主屏幕右下方安全区域。
- 恢复和拖动结束后都必须按人物真实绘制边界而不是透明窗口完整矩形做可见性约束。
- 多显示器缩放、菜单栏和 Dock 工作区变化必须纳入限制。

## 6. 人物状态与动作

状态机至少包含：

- `hidden`：人物不可见，会话是否继续由休眠状态决定；
- `resting`：眼睛闭合或低亮，麦克风关闭，无活动 Realtime；
- `opening`：正在建立 Realtime；
- `listening`：麦克风开放，眼神聚焦，光晕响应输入；
- `attending`：检测到用户正在说话，人物减少环境动作；
- `thinking`：用户轮次结束、回答尚未播放；
- `speaking`：依据真实远端音频能量驱动嘴部/身体光带；
- `working`：工具调用执行中，显示不同于普通思考的等待动作；
- `failed`：人物保持可用但不说话，详细原因只在诊断中展示。

动作原则：

- 空闲时缓慢呼吸、自然眨眼和低频视线变化；
- 用户、Nia、工具或提醒活动期间，环境动作不得覆盖有意义的状态动作；
- 说话动作由实际播放音频而不是生成文本驱动；
- 用户打断时立即停止播放状态并进入聆听；
- 休眠清除暂态表情和未完成气泡；
- 减少动态效果开启后关闭持续漂移和弹性位移。

第一阶段可复用 Mochi 的状态划分与运动调度思想，但人物视觉必须使用已确认的 Nia 紫蓝光体、眼睛和身体轮廓，不直接复制 Mochi 角色资产。

## 7. Realtime 会话

### 7.1 单例会话

主进程维护一个 `NiaRealtimeCoordinator`，持续存在的桌面人物 renderer 维护一个 `NiaRealtimeTransport`。Coordinator 通过 generation 和握手确认保证任何时刻最多承认一个活动会话；transport 负责唯一的 WebRTC 和媒体对象。`/nia` 只通过 IPC 订阅 coordinator 的规范化状态。

服务状态至少包含：

- generation/id，用于淘汰已经过期的异步打开结果；
- 当前 session id 与预计过期时间；
- 当前 conversation id；
- microphone/listening/resting 状态；
- 当前 response、item 和 tool-call 关联；
- 当前 persona、确认记忆、页面上下文和能力授权版本；
- 提醒请求队列。

重复唤醒、重连与页面订阅不得创建孤立 peer。每次打开命令携带 generation；transport 必须关闭或拒绝旧 generation 的异步结果。新一代会话建立成功后才被 coordinator 承认为活动连接；失败不得覆盖仍可用的连接。人物 renderer 崩溃或重新加载时，主进程使旧 generation 失效、结束对应 conversation，并在 renderer 恢复后按持久化休眠偏好决定是否重新建立会话。

### 7.2 生命周期

- Auris 启动后可预检 Codex 登录状态，但不必自动打开麦克风，是否唤醒由持久化休眠偏好决定。
- 唤醒建立会话并应用人物提示词、确认记忆、当前上下文、能力清单、voice 和 turn detection。
- `session.updated` 等服务端确认必须被观察，不能把发送配置等同于配置已经生效。
- 会话临近平台时限时，主进程预备下一会话并安全切换。
- 休眠、退出或不可恢复失败时，主进程向 transport 发送关闭命令；transport 负责关闭 peer、麦克风 track、数据通道、音频对象和事件订阅，并回报完成。renderer 被系统直接销毁时由平台释放媒体资源，主进程仍必须结束 conversation 并清除权威活动状态。
- 页面关闭、路由跳转、桌面人物隐藏不关闭会话。

### 7.3 上下文更新

现有 Nia 页面上下文、确认记忆和工具授权发生变化时，主进程向活动会话发送受版本控制的 `session.update`。在会话协商过程中到达的更新必须暂存，并在会话建立后应用最新版本。

复习开始时只注入当前知识点的必要内容、阶段和目标。知识点完整存储仍留在 Review 模块，Realtime 上下文不是第二份持久化数据。

### 7.4 工具调用

Realtime 可使用统一工具注册表，第一阶段至少接入：

- 查询当前 Auris 页面上下文；
- 读取到期 Review 项；
- 开始、推进或完成当前复习；
- 写入候选记忆并等待现有确认流程；
- 查询 Nia 历史会话；
- 在既有授权范围内调用 Nia 浏览器/工作流工具。

工具调用只在主进程或现有受控服务中执行。renderer 只转发调用意图和展示结果。所有工具参数必须按现有 schema 校验；破坏性或外部副作用操作继续遵守既有审批机制。

### 7.5 文字输入与 REST/CLI 的边界

底部统一对话坞属于“陪伴会话”：

- Realtime 已连接时，文字经主进程校验后转交唯一 transport，以 Realtime conversation item 进入当前语音会话，并请求同一人物用当前 voice/会话上下文回答；
- Nia 正在休眠时，用户主动按下发送等同于一次明确唤醒。Coordinator 只保留这一条待发送文本，待 session 配置得到服务端确认后再交给 transport；
- Codex 登录、Realtime 或麦克风链路失败时，编辑内容保留并显示不可用状态，不自动改走 API Key、REST 或 CLI，也不把未发送文本写成已发生的 companion turn；
- 页面离开不丢失已提交的陪伴轮次，未提交草稿只属于页面 UI。

现有 REST/CLI 文本能力作为“高级代理运行”保留：

- 继续使用现有 provider router、`useNiaSession`、浏览器工具循环和既有 Nia history；
- 在右侧高级区域单独呈现，不伪装成当前 Realtime 陪伴会话；
- REST/CLI 响应不写入 companion conversation SQLite，也不自动进入 Realtime 上下文；
- Realtime 失败时不会自动触发高级代理运行；用户必须在高级区域明确发起；
- 高级代理运行需要把结果带入陪伴会话时，使用显式“发送给 Nia/加入上下文”动作并经过长度限制，而不是隐式合并两份历史。

这样保留原 Nia 的文本代理能力，同时避免同一输入因运行环境不同而悄悄进入两套 provider 和两份互相矛盾的会话记录。

## 8. 会话档案与记忆

### 8.1 SQLite 档案

新增由主进程独占的 Nia conversation SQLite 存储，建议位于 Auris `userData` 下。不得从 renderer 直接打开数据库。

核心实体：

- `conversations`：id、persona、开始/结束时间、主题、来源、状态；
- `turns`：id、conversation、speaker、文本、发生时间、是否被打断、关联 response/item；
- `tool_uses`：conversation、call id、工具名、开始/结束时间、结果状态；
- `conversation_context_refs`：可选的 Review knowledge point id 等稳定引用，不复制正文；
- FTS 搜索索引。

中文搜索必须使用与写入一致的分词策略；如果第一阶段无法提供可靠中文 FTS，应明确降级为受限的本地扫描，而不是建立无法命中的假索引。

### 8.2 创建、写入与结束

- 唤醒或打开 peer 不创建 conversation。
- 第一条非空用户转写或可保存的 Nia 回复到达时，惰性创建 conversation。
- 空白转写不保存；被打断但尚未形成文本的 Nia 输出允许写入空的 cut marker，用于说明发生过被截断轮次。
- 用户转写以服务端确认的完整输入转写为准。
- Nia 回复在自然结束后保存完整实际回复；被打断时根据真实播放进度保存已播出的部分并标记 cut。
- 工具使用在调用到达时记录，即使工具最终失败。
- 休眠、正常退出、persona 切换和 Realtime 周期切换时结束当前 conversation。
- 启动打开数据库时，将上次异常退出留下的开放 conversation 修复为已结束。

### 8.3 档案与长期记忆分离

- 会话档案是原始记录，不自动整体注入新 Realtime 会话。
- 现有 `nia-memory-service.ts` 的候选、确认、撤销边界保留。
- 只有确认记忆进入新会话提示词。
- 可新增 `recall_conversations` 类能力，在用户明确引用过去对话时搜索档案并返回有限片段。
- 搜索结果必须标注来源和时间，不能冒充当前模型自身记忆。
- 用户可以查看、搜索、导出和删除会话；删除后搜索索引和关联引用同步清理。

## 9. Review 提醒与陪练流程

### 9.1 数据来源

提醒队列以 `src/features/output-review/output-review-model.ts` 和 `output-review-storage.ts` 为唯一知识点事实来源。现有 `desktop-island-projection.ts` 已能投影到期项，实施可以复用或提取其纯函数逻辑，但不得让 Electron 直接猜测浏览器 localStorage。

需要建立明确的 renderer → main 快照同步：

- 快照包含稳定 knowledge point id、标题、项目、阶段、到期状态和预计时长；
- 在 Review 存储变化、应用重新获得焦点、跨日和应用启动时同步；
- 主进程缓存最后一份有效快照用于后台提醒；
- 快照过期或结构不合法时不播报，并记录诊断。

### 9.2 调度状态

调度状态至少包含：

- 每日提醒时间列表；
- 免打扰起止时间；
- 每个自然日、时间槽的已提醒标记；
- 当前延期截止时间；
- 本次启动是否已执行补提醒；
- 已排队但尚未播报的提醒。

时区使用用户本机时区。跨日、休眠唤醒、系统时间改变和夏令时变化后重新计算下一触发点，不依赖长期固定毫秒间隔。

### 9.3 播报流程

1. 触发时读取主进程缓存的最新 Review 快照。
2. 应用免打扰、去重、延期和空队列判断。
3. 若用户或 Nia 正在发言，将提醒排队。
4. 若 Nia 已有活动 Realtime，会话内发送受约束的提醒请求；否则静默尝试建立会话。
5. Realtime 可用后让 Nia 简短汇总并询问是否开始。
6. 用户通过语音或按钮选择开始、延期或忽略。
7. 开始时显示 Auris 主窗口并打开 `/review` 对应 knowledge point；人物和会话保持。
8. 完成操作调用现有 Review 写回路径，并等待新的快照同步。

认证失败或网络失败时，本次提醒不改用通知或 TTS。它可以按调度器的下一正常时机再次尝试，但不得形成高频重试。

## 10. `/nia` 黑色控制中心

### 10.1 页面结构

- 左侧继续使用 Auris 现有侧边导航，并新增/启用 `assistant` 导航项指向 `/nia`。
- 顶部轻量状态栏显示：Nia 状态、今日待复习数量、静音/休眠和设置。
- 中央人物舞台占主要空间，使用纯黑背景、极弱星尘和紫蓝光体。
- 到期提醒以舞台下方升起的 Review Sheet 呈现，不长期占据大卡片。
- 底部统一对话坞显示实时字幕、文字输入、麦克风与会话控制。
- 右侧功能抽屉按上下文、记忆、任务、工具和活动组织原 Nia 能力。
- 设置抽屉包含人物、声音、快捷键、提醒时间、免打扰、能力授权和诊断。
- 历史会话提供列表、搜索、详情、导出和删除。

### 10.2 跨表面连续性

- 从桌面人物点击进入 `/nia` 时，页面订阅主进程当前快照和事件游标。
- 页面不得重新请求 Realtime credential 或创建 WebRTC。
- 页面进入前已经发生的当前会话轮次从主进程活动缓冲和 SQLite 读取。
- 页面卸载后当前会话继续；未确认的 UI 草稿与真正对话轮次分开处理。
- 桌面气泡、页面字幕和档案都使用同一规范化 turn 数据，避免显示与保存内容不一致。

### 10.3 原有功能映射

| 原能力 | 新位置/处理 |
| --- | --- |
| 陪伴文字对话 | 底部统一对话坞，进入唯一 Realtime transport 的同一会话 |
| REST/CLI 文字代理 | 右侧“高级代理运行”，保留原 provider/history，绝不作为 Realtime 回退 |
| Realtime 语音 | 主进程 coordinator + 桌面人物 renderer 的唯一 transport |
| 当前上下文 | 右侧“上下文”抽屉 |
| 候选/确认/撤销记忆 | 右侧“记忆”抽屉，保留原审核语义 |
| Nia 任务 | 右侧“任务”抽屉 |
| REST/CLI 模型路由 | 高级设置；不参与 Realtime 认证 |
| 浏览器工具循环 | “工具”抽屉和统一工具注册表 |
| 工作流与操作审核 | “活动”区域，保留既有审批 |
| 用量与诊断 | 设置中的本地诊断 |

## 11. 应用生命周期

- macOS 上关闭最后一个 Auris 普通窗口时，应用保持运行，人物继续显示。
- Dock 点击、菜单“打开 Nia”或人物单击可恢复主窗口。
- 人物隐藏不改变 session；休眠才结束 session。
- 系统睡眠前安全暂停/关闭麦克风和 peer；系统恢复后依据休眠偏好和 token 状态恢复，不无条件打开麦克风。
- `before-quit` 设置真实退出标志，防止普通窗口 `close` 被误判为退出。
- 真正退出时按顺序停止提醒、命令人物 transport 关闭 Realtime、结束 conversation、销毁人物窗口、关闭 SQLite；关闭命令有短超时，不能让损坏的 renderer 阻止退出。
- 未能完整执行的退出由下次启动的数据库修复兜底。

## 12. 安全与隐私边界

- Codex token、Realtime secret 和数据库连接只存在于主进程。
- IPC 参数均进行类型、长度、来源窗口和角色校验。
- 桌面人物 preload 使用最小 API，不暴露文件系统、shell 或通用 IPC。
- `/nia` 页面不能通过已有通用桥获取认证信息。
- 原始会话默认只在本机保存；保留用户关闭会话保存的能力时，开关必须对下一条消息立即生效。
- 删除必须作用于数据库正文、FTS 索引和相关引用；若 SQLite WAL 尚未清理，诊断中不得谎称字节已经完全擦除。
- 从历史会话或 Codex 档案返回给模型的内容属于不可信数据，必须有清晰边界和来源标注。
- Review 提醒只发送完成当前语音交互所需的最少内容。

## 13. 故障与诊断

诊断页面至少区分：

- 未安装/无法定位 Codex 环境；
- auth 文件不存在或不可读；
- 没有登录；
- access token 已过期；
- 上游拒绝 credential exchange；
- SDP 协商失败；
- 麦克风权限或设备失败；
- session 配置未被服务端确认；
- conversation 数据库不可用；
- Review 快照缺失或过期；
- 全局快捷键注册冲突。

用户要求静默意味着这些失败不主动打扰用户，不意味着吞掉错误。诊断必须有时间、组件和可操作的恢复提示，但不得记录 token、secret、完整 SDP 或不必要的私人正文。

## 14. 测试与验收

### 14.1 单元测试

- Codex auth 路径解析、token 提取、过期判断和错误分类；
- Realtime generation 淘汰、重复唤醒、重连和资源释放；
- conversation 惰性创建、空轮次过滤、自然结束、打断、异常修复；
- reminder 多时间、免打扰、跨日、延期、去重和启动补提醒；
- 人物命中区域、拖动阈值和屏幕位置限制；
- Review 快照验证和开始复习路由。

### 14.2 组件与集成测试

- `/nia` 两个显示端订阅同一 session id；
- 页面路由切换不触发 session close；
- 桌面人物点击打开 `/nia` 且会话保持；
- 气泡关闭、复制和进入档案行为；
- 历史列表、搜索、导出和删除；
- 陪伴文字输入进入活动 Realtime；休眠发送会明确唤醒；失败时不自动转向 REST/CLI；
- 高级 REST/CLI 运行仍可使用，但不污染 companion conversation；
- 原 Nia 上下文、记忆、任务、路由和工具入口仍可达；
- 减少动态效果和键盘操作。

### 14.3 Electron/macOS 实机验收

- 人物在 Auris、浏览器和其他应用上方持续存在；
- 跨 Spaces 和全屏窗口可见；
- 透明区域不阻挡底层应用点击和滚动；
- 拖动、重启、多显示器连接/断开后位置正确；
- 关闭主窗口后人物仍在，`Command+Q` 后人物和麦克风均消失；
- 全局快捷键在其他应用获得焦点时生效；
- 真实 Codex 登录可建立 Realtime，过期登录按静默策略失败；
- 用户打断 Nia 后，档案只包含实际说出的部分；
- 到点提醒、延期、免打扰、补提醒和开始复习形成闭环。

涉及真实账号的验收不得在自动测试中读取或输出真实 token。自动测试使用构造的 JWT、伪造 exchange 和本地 SDP 夹具。

## 15. 不在本阶段范围内

- 浅色主题；
- Windows/Linux 完整支持；
- Auris 未运行时由 macOS 定时启动；
- 系统通知或本地 TTS 回退；
- API Key 认证；
- 摄像头驱动的注视或人体追踪；
- 多个同时在线的 Nia persona；
- 云端会话同步；
- 重写现有 Review 调度算法或复制 Review 数据库；
- 将全部旧会话无界注入每次 Realtime prompt。

## 16. 实施分解原则

后续实施计划应按可验证的纵向阶段推进：

1. 主进程 Codex credential broker、Realtime coordinator 与人物 renderer 单例 transport；
2. SQLite conversation 生命周期和 turn／事件归档；
3. Mochi 式透明桌面人物窗口及状态动作；
4. `/nia` 订阅统一会话并完成黑色页面重构；
5. 原 Nia 功能迁入抽屉并接入统一工具；
6. Review 快照、提醒调度和语音复习闭环；
7. 会话档案、诊断、快捷键与 macOS 实机回归。

每个阶段必须保持现有 Notes、Review、Reading、Video 和 Browser 页面可用，并在开始下一阶段前通过定向测试。不得以删除原 Nia 能力来换取 Mochi 外观。

## 17. 成功标准

用户能够在 Auris 中唤醒 Nia，然后切换到任何 Auris 页面或其他 macOS 应用，仍看到并继续与同一个桌面人物交谈；点击人物可回到 `/nia` 查看同一会话。会话会以 Mochi 式生命周期可靠写入本地档案，确认记忆保持独立。到达用户设定的复习时间时，Nia 使用 Codex 登录建立或复用 GPT Realtime，用声音汇总到期内容并询问是否开始；开始后进入现有 Review 流程。关闭主窗口不影响人物，真正退出 Auris 才终止它。整个路径不使用 API Key，也不丢失现有 Nia 功能。
