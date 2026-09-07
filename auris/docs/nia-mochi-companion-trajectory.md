# Nia Mochi-style desktop companion trajectory

## Interpretation

将需求拆为五条边界：Codex 登录凭据与 Realtime SDP 只在 Electron 主进程处理；独立透明悬浮窗在 macOS 所有工作区显示；渲染层持有唯一 WebRTC 音频会话；会话按 Mochi 方式惰性落盘；复习提醒由应用内调度器触发，不在应用退出后唤醒系统。

## Implementation path

- `electron/nia/companion/codex-credential.cjs` 读取 Codex CLI `auth.json`，用私有句柄交换短期 Realtime session，并代理 SDP；渲染层只接收随机会话句柄。
- `electron/nia/companion/realtime-coordinator.cjs` 统一 wake/rest/rotation、代际仲裁、文本/提醒队列和报告入库。
- `electron/nia/companion/conversation-db.cjs` 与 `conversation-lifecycle.cjs` 提供 SQLite 会话、turn、tool-use 记录和惰性会话生命周期。
- `companion-window.cjs`、`companion-position.cjs`、`companion-ipc.cjs`、`companion-preload.cjs` 提供透明、置顶、跨工作区、点击穿透/拖动与可信 IPC。
- `src/app/nia/companion/page.tsx` 与 `src/components/nia/companion/*` 提供黑色 Nia 人物、眼睛/身体动作、WebRTC 音频、拖动和进入完整会话入口。
- `reminder-scheduler.cjs` 接入复习快照，默认 09:00 / 14:00 / 20:00，23:00–07:30 DND，保存 operational dedupe state，并在应用重开时单次 catch-up。
- `/nia` 的 Live hook 改为调用主进程 companion coordinator；旧 API-key Realtime route 改为明确的 desktop-only 410，不再走 `OPENAI_API_KEY`。

## Checks

- Nia companion 定向：37 tests passed。
- 全量 Vitest：396 files / 2914 tests passed。
- `node --check`：Electron main/preload 与 companion CommonJS 文件通过。
- `npm run build`：Next 生产构建成功，包含 `/nia/companion`。
- Electron `desktop:dev` 启停：启动日志出现 `nia-companion:renderer-ready`，未出现启动错误。

## Risks and assumptions

- Realtime 上游、麦克风授权和 Codex 登录有效性仍依赖用户机器与网络；失败只进入静默诊断/重试路径，不会切换 API key 或 REST/CLI 代理。
- 提醒内容取自已同步到桌面岛的复习快照；若应用刚启动且快照尚未刷新，下一次调度会重试。
- 当前提醒时间与 DND 使用安全的本地配置默认值，设置 UI 仍可继续补齐；应用退出时不创建系统级唤醒任务。
- 本次未删除用户既有词汇、Markdown 或其他未提交文件。

## Nia 工作台与 Mochi 式角色页（2026-09-03）

### Interpretation

在保留原有 Nia provider、工作流、上下文、记忆、任务、Realtime 和复习提醒能力的前提下，把 `/nia` 提升为独立的中文学习工作台；截图只作为 Mochi 信息架构与 Auris 深色视觉参考，不迁移 Mochi 的私有运行时。

### Implementation path

- `src/components/nia/nia-workspace-surface.tsx` 新增 Nia 工作台：中央卡通角色与思考/回应动作、复习提醒卡、实时区、会话区，以及「上下文 / 记忆 / 任务 / 工具」四个信息页签。
- `src/app/nia/nia.css` 统一为 Auris 暗夜金调与紫色角色强调色，并提供紫/金/蓝三种可保存外观主题；设置弹层补齐角色称呼、语音、保存会话、提醒时间和勿扰说明。
- `desktop-shell-fixtures.ts` 和 `DesktopAppFrame` 将 Nia 纳入现有侧栏导航，未改变其它页面的导航契约。
- `electron/nia/companion/companion.css` 将桌面悬浮角色改为圆润 Mochi 式小生物；思考时抬眼轻摆、回应时做口型，保留拖动、置顶、跨工作区与点击唤醒。
- 历史搜索通过 `conversation-search` 查询既有 SQLite；新增 `conversation-saving` 由 UI 偏好驱动生命周期，仅停止新会话写入，不删除历史记录。

### Checks

- `node --check`：Electron main/preload、会话生命周期与 Realtime coordinator 通过。
- 定向 ESLint：Nia 工作台、悬浮角色、侧栏与 `/nia` 路由通过。
- 定向 Vitest：Nia 面板 7 项通过；companion 9 个文件、36 项通过。
- `npm run build`：Next 生产构建成功，包含 `/nia` 与 `/nia/companion`。
- 本地浏览器已检查 `/nia` 的侧栏、中文四页签、复习卡、角色动画状态和设置弹层；验证用开发服务器已停止。

### Risks and assumptions

- GPT Live 仍只使用 Electron 主进程中的 Codex 登录凭据交换与 WebRTC，不回退到 API key。
- 浏览器环境没有 Electron bridge 时，Realtime 和 SQLite 搜索会按既有能力显示不可用提示；桌面运行时才执行真实语音和会话归档。
- 角色外观按钮改变的是 Nia 工作台的强调色；悬浮角色保持 Nia 的紫色识别色，避免主题切换导致跨窗口识别不一致。

## Nia 侧栏边界与 Mochi 式会话归档（2026-09-03）

### Interpretation

本轮把用户提供的 Mochi 截图视为界面参考，并以 `/Users/apple/Desktop/xiaolai-source/mochi` 的实际源码验证行为。目标不是复制白色界面，而是把 Mochi 的本地会话信息架构迁移到 Auris 暗色 Nia 工作台，同时为现有固定侧栏留出真实空间，并隐藏滚动条而不禁用滚动。

### Implementation path

- `src/components/nia/nia-conversation-archive.tsx` 新增中文会话归档：本地月份/日期条、当日会话列表、完整逐轮记录、工具调用摘要与跨日期全文搜索。默认打开今天有内容的日期，否则打开最近一次有记录的日期；标题只取真实 subject 或开场语，不虚构摘要。
- `electron/nia/companion/conversation-db.cjs`、`electron/main.cjs`、`electron/preload.cjs` 与 `src/features/nia/nia-companion-bridge.ts` 补齐按 persona 隔离的会话详情命令，一次返回 turns 与 tool uses，继续复用已有 SQLite，不建立第二套存储。
- `src/components/nia/nia-workspace-surface.tsx` 在顶部、当前会话区和工具页提供归档入口；原有上下文、记忆、任务、工具、Realtime、复习提醒和设置均保留。
- `src/app/nia/nia.css` 为桌面固定侧栏预留 `14px + 74px + 14px` 边界；Nia 页面及内部滚动容器统一隐藏 WebKit/Firefox 滚动条，但保留鼠标、触控板和键盘滚动。归档沿用 Auris 黑色材质、紫色强调与角色小头像，没有复制 Mochi 的白色视觉。
- 未加入尚无安全撤销/导出链路的删除与导出假按钮；归档当前呈现的操作均由现有真实 bridge 支持。

### Checks

- Nia、桌面侧栏与 companion 定向 Vitest：15 个文件、59 项通过；包含归档详情、全文搜索、SQLite 工具记录与常驻侧栏契约。
- 定向 ESLint、Electron main/preload/SQLite 模块 `node --check` 与 `git diff --check` 通过。
- `npm run build` 成功，生产路由包含 `/nia` 与 `/nia/companion`。

### Risks and assumptions

- 归档和全文搜索只在 Electron 桌面 bridge 可用时读取真实 SQLite；普通网页预览会显示明确的桌面版提示。
- 当前列表命令有既有条数上限；搜索仍覆盖 SQLite 全文索引。后续数据量显著增加时可在同一存储上补游标分页，无需改变归档信息架构。
- 本次未启动或保留开发服务器，也未修改用户的词汇索引、Markdown 与报告文件。

## Nia 文字 Provider 设置收口（2026-09-03）

用户在开发预览中确认主会话区仍暴露旧的 Provider 配置。代码验证该模块只服务 REST/CLI 键盘文字通道，与 Codex 登录的 GPT Live 无关；其中本地历史开关也不是 Mochi 式 SQLite 归档。

实现将 `NiaPanel` 拆为默认自持 session 与可注入共享 session 的两种入口。Nia 工作台持有唯一文字 session：主会话区通过 `showProviderSettings={false}` 隐藏旧配置，同一 session 的 Provider、模型、密钥、CLI 与文字历史设置迁入齿轮弹层中的“高级文字模型”，默认折叠，并明确说明不会影响 GPT Live。其它嵌入 Nia 的页面继续保留原有默认行为。

定向 ESLint 通过；Provider 与 Nia Panel 两个测试文件共 8 项通过，新增主会话区隐藏 Provider 的回归断言。开发服务器 `/nia` 首屏包含“自由对话”且不再输出 Provider 设置；热更新无报错，开发版继续保持运行。

## Proma 式文字模型 SidePane（2026-09-03）

### Interpretation

用户进一步明确：API Key 连接与键盘文字对话不应继续藏在设置弹层，也不应占据 Nia 主舞台，而要参考 Proma 的右侧并排工作区。GPT Live 仍使用 Codex 登录链路；API Key 只服务独立文字通道。

### Implementation path

- 新增 `src/components/nia/nia-text-side-pane.tsx`，把文字通道组织为“对话 / 连接”两个中文页签。侧栏与主舞台并排、可收起、无遮罩；未配置时给出明确连接入口，配置后显示当前服务商和模型。
- `src/components/nia/nia-workspace-surface.tsx` 继续只创建一个 `useNiaSession`。文字侧栏开合、页签切换和从齿轮设置跳转都复用该 session，避免重复订阅 provider 事件或丢失会话状态；原“上下文 / 记忆 / 任务 / 工具”面板在侧栏关闭后恢复。
- Provider、模型、REST/CLI、连接测试、临时密钥、macOS 钥匙串记忆和文字历史开关全部复用现有 `NiaProviderSettings` 与 bridge，没有建立第二套密钥存储或聊天后端。
- `src/app/nia/nia.css` 新增 Auris 黑色材质的 SidePane、响应式宽度、中文连接空态与键盘焦点；主舞台移除重复文字聊天区，只保留卡通 Nia 与 GPT Live。滚动能力保留，滚动条继续隐藏。
- 同步将文字 Composer、Provider 配置、回复空态和 GPT Live 主要文案改为中文；Live 卡片补齐稳定的两列布局，避免窄窗口中默认块级内容挤成一行。

### Checks

- Nia Panel、Provider Settings 与新 SidePane：3 个测试文件、11 项通过。
- 定向 ESLint 与 `git diff --check` 通过。
- 开发版热更新后实测：顶部按钮展开/收起侧栏；未连接空态跳转连接页；设置弹层的“打开连接侧栏”会关闭弹层并直接落到连接页；主舞台不再重复显示文字聊天。

### Risks and assumptions

- 普通浏览器预览没有 Electron provider bridge，会明确显示桌面文字服务不可用；真实 API Key、钥匙串和模型调用须在 Auris 桌面开发版内验证。
- 当前 SidePane 使用与既有信息面板相同的右侧槽位，打开文字通道时暂时替换信息面板，收起后恢复；这是为了在现有窗口最小宽度内保持主舞台可读。
- 开发服务器仍在运行，因此本轮没有同时执行会占用同一 `.next` 目录的生产构建；类型与运行时编译已由开发版热更新、定向 ESLint 和组件回归覆盖。

## Mochi 式桌面右键菜单与纯图案主舞台（2026-09-03）

### Interpretation

本轮将 Mochi 截图中的“角色是桌面入口、菜单承载操作”迁移到 Auris：Nia 主页面左侧只保留可交互的卡通角色与 Auris 原有学习工作台，实时语音、静音、休息、隐藏和退出不再以大块控制卡占据主舞台；右键桌面形象才显示中文操作菜单。现有 GPT Live（Codex 登录）、文字 Provider、会话 SQLite、复习提醒与固定侧栏均保持不变。

### Implementation path

- 新增 `electron/nia/companion/companion-menu.cjs`，按角色是否处于实时状态生成中文菜单：打开 Nia、开始实时语音／静音、让 Nia 休息、隐藏桌面形象、退出 Auris；菜单内容由纯函数生成，便于在不启动 Electron 的情况下回归。
- `companion-ipc.cjs`、`companion-preload.cjs` 与 `realtime-transport.ts` 增加受信任的 `menu` 命令；渲染层仅在 `.nia-companion__figure` 上拦截右键并交给主进程，主进程通过原生 `Menu.popup` 承载实际动作，避免网页仿制菜单和权限绕过。
- `companion-window.cjs` 同时设置 `transparent`、`backgroundColor: "#00000000"` 与原生 `setBackgroundColor`，让悬浮人物只显示图案；拖动、跨工作区置顶与点击穿透策略继续沿用已有窗口服务。
- `nia-workspace-surface.tsx` 移除主舞台中的 Live 控制卡和重复聊天卡，保留 Nia 动作头像、复习/上下文/记忆/任务/工具与文字 SidePane；在设置中加入“显示桌面形象”开关，可从隐藏状态恢复。
- `companion.css` 保留圆润紫色角色、眼睛/身体/口型动作和隐藏滚动条；主页面 `nia.css` 令左侧成为纯图案舞台，并继续预留固定侧栏边界。

### Checks

- `node --check`：Electron main/preload、companion window/IPC/menu 通过。
- 定向 Vitest：6 个文件、17 项通过，覆盖菜单静止/活动文案、IPC 菜单路由、窗口可见性及 Nia 页面/Provider/SidePane 回归。
- 定向 ESLint 与 `git diff --check` 通过；ESLint 仅报告仓库既有的 CommonJS/CSS ignore 警告，无错误。
- Electron 开发版实测：桌面窗口保持透明，角色悬浮在其它窗口之上；从角色移出再移入后右键可打开原生中文菜单，截图中显示“打开 Nia / 开始实时语音 / 隐藏桌面形象 / 退出 Auris”。

### Risks and assumptions

- 右键菜单由 macOS 原生窗口菜单绘制；若系统辅助功能或鼠标事件权限被关闭，需先允许 Auris 接收指针事件。菜单本身不改变 Realtime 凭据链路。
- 菜单中的“退出 Auris”是明确的应用退出动作；“隐藏桌面形象”只隐藏 companion，主应用和会话仍继续运行，可从 Nia 设置恢复。
- 当前只验证了静止角色菜单的真实桌面截图；活动态的“取消静音／让 Nia 休息”文案由单元测试覆盖，需在有效 Codex Realtime 会话下再做一次人工验收。

## Nia 实时通话归档链路修复（2026-09-03）

### Diagnosis

本机 Nia SQLite 通过完整性检查，但会话、turn 和 tool 表均为 0；因此问题不在建表或 SQLite 写入。与 `/Users/apple/Desktop/xiaolai-source/mochi` 对照后确认两个前置断点：Auris 仍发送旧的顶层 `modalities` / `input_audio_transcription` / `turn_detection` 会话形状，并监听已更名的 `response.audio_transcript.done`；结束通话时主进程又会立即结算会话，没有等渲染层回传尾部转写。

### Implementation path

- 新增 `src/features/nia/nia-realtime-protocol.ts`，使用 Mochi 已验证的 GA `session.update` 结构：`output_modalities`、嵌套 `audio.input.transcription`、降噪、VAD、语音与 Nia instructions；仅收到 `session.updated` 后才宣告通话已打开。
- 实时事件改为 `response.output_audio_transcript.*`、`response.output_audio.delta`、`response.output_item.added`、`conversation.item.truncated` 与 `output_audio_buffer.*`；已知事件缺字段时会显式报错，不再静默丢弃。
- 新增 `nia-realtime-pending.ts`，以 item/response 关系处理 transcript、自然播放完成和打断事件的乱序到达；正常关闭与 session rotation 前都先 flush 可归档 turn。
- `realtime-coordinator.cjs` 将会话结算延后到 renderer `closed` 确认，保留 3 秒超时兜底；关闭窗口内仍接受 heard/said/tool 报告。同时修正 rotation 后又关闭新 transport 的代际问题。
- “保存新对话”开关现在会在每个 turn 入库前重新检查；通话中关闭后的新 turn 不再继续写入，已有历史不删除。

### Checks and remaining boundary

- Realtime 协议、乱序 turn、transport 关闭 flush、coordinator 延迟结算和 SQLite lifecycle 均有回归覆盖；Nia unit/companion/archive 共 33 个文件、174 项通过。
- 定向 ESLint、Electron CJS `node --check`、`git diff --check` 和 Next 生产构建通过。
- 归档内容是用户与 Nia 的文字转写、打断标记和工具记录，不是麦克风原始音频。修复后的真实麦克风会话仍需在重启 Electron 主进程后说一轮，再从“会话记录”或 SQLite 核验。

## Nia 对齐 Mochi v0.1.19：Shell PATH 探测与 IPC 类型契约重构（2026-09-05）

### Interpretation

对照 `Mochi_Update_Report_v0.1.19.md` 与最新 Mochi 源码（`faa3340` ➔ `97ddef3`），Mochi 的两次核心升级聚焦于两项系统级机制：
1. **运行时环境修复（v0.1.19）**：解决 macOS GUI 启动时仅继承 launchd 精简 PATH，导致无法识别通过 `mise`、`nvm`、`asdf`、`fnm`、`pnpm` 等安装的 Codex/Node CLI 问题。
2. **IPC 类型通信契约重构（v0.1.18）**：消除 Electron 主进程与渲染端在 IPC 通信中的类型漂移，建立单一事实源契约与强类型请求/响应映射。

### Implementation path

- 新增 `electron/nia/companion/shell-path.cjs`：在 macOS/Linux 应用就绪阶段通过交互式登录 Shell（`$SHELL -ilc 'printf %s "$PATH"'`）探测真实环境，4000ms 超时门限，过滤 Banner 并安全合并环境变量（launchd 原生路径前置、用户 Shell 路径后置去重）。
- `electron/main.cjs`：在 `app.whenReady()` 首行执行 Shell PATH 拓宽，确保后续的 Codex 探测、CLI 适配器（`claude`/`codex`/`gemini`）以及 Node shim 脚本可无障碍运行。
- 新增 `src/features/nia/nia-companion-answers.ts`：对齐 Mochi `Answers` 单一事实源模型，将所有 11 个宿主窗口陪伴命令（`snapshot`、`conversations`、`conversation-turns`、`conversation-detail`、`conversation-search`、`conversation-saving`、`wake`、`rest`、`mute`、`companion-visibility`、`text`）及陪伴窗口会话协商命令（`open-session`、`sdp` 等）返回值进行严格强类型定义。
- 新增 `electron/nia/companion/companion-answers.cjs`：提供强类型宿主命令调度器 `createNiaCompanionHostDispatcher`，集中处理所有陪伴指令。
- 更新 `src/features/nia/nia-companion-bridge.ts`：将 `invoke` 方法重构为基于 `NiaCompanionHostAnswers` 的泛型自动类型推导，消除前端 `unknown` 及不安全的类型断言。
- 更新 `src/components/nia/nia-conversation-archive.tsx` 和 `src/components/nia/companion/realtime-transport.ts`：统一消费共享契约模型，移除内部重复类型定义与裸 cast。
- 更新 `docs/third-party/mochi.md` 补齐新模块的开源衍生说明。

### Checks

- 新增单测：`tests/unit/electron/nia/companion/shell-path.test.ts`（10 项全通）、`tests/unit/electron/nia/companion/companion-answers.test.ts`（6 项全通）。
- 全量 Nia 测试：54 个测试文件、319 项测试全部通过。
- 语法与静态检查：`node --check`、定向 ESLint（0 errors, 0 warnings）、`npm run quality:desktop-ipc`、`git diff --check` 通过。
- 生产构建：`npm run build` 成功完成。

## Nia 桌面形象透明区域点击穿透对齐（2026-09-07）

### Diagnosis and implementation

对照 Mochi 渲染器的实际路径确认，Mochi 虽保留足够容纳气泡的大窗口，但每帧用与绘制共用的 `Path2D` silhouette 执行 `hitTest`，只在指针命中实际角色、气泡或控件时关闭 Electron 点击穿透。Nia 原先在 320×360 根容器的 `pointerenter` 上直接接管整扇窗口，因此透明外框也会吞掉点击。

修复集中在 `src/components/nia/companion/companion-runtime.tsx` 与 `companion.css`：去掉根容器进入即接管的逻辑，仅将头部和身体标记为真实命中区；容器和光晕保持不参与命中，DOM 自身的变换与圆角边界跟随当前动画。指针移入真实形体时才调用 `pointerCapture(true)`，移回透明区立即恢复穿透；透明区的按下和右键也不再触发唤醒、拖拽或菜单。用 ref 去重复用的 IPC 切换，避免每次 pointer move 都往主进程发相同状态。

### Checks and boundary

- 新增组件回归，验证透明区不接管鼠标，头部/身体命中时接管，移出形体后恢复穿透，以及透明区按下不唤醒或拖拽。
- Companion 相关 7 个测试文件、19 项通过；定向 ESLint、`git diff --check` 和 `npm run build` 通过。
- 真实 Chromium 320×360 视口复核 `elementFromPoint`：左上角与角色旁空白均命中根容器（保持穿透），头部与身体点位命中对应形体。验证用开发服务器已关闭，未留后台进程。
- 本轮保留 320×360 原生窗口与现有角色缩放，因为故障在命中策略而非窗口物理尺寸；未改动 Realtime、唤醒、拖拽定位或菜单 IPC。

## Nia 桌面悬浮形象鼠标松手恢复、动画持续命中与异常拖拽释放兜底（2026-09-07）

### Interpretation and diagnosis

根据代码审计与运行状态复现，确诊并解决三项漏洞：
1. **左键松开原地右键失效**：此前松手时无条件 `setPointerCapture(false)`，导致即使鼠标仍在角色身上，原地右键也会因 macOS 点击穿透只转发 mousemove 而被忽略。
2. **鼠标不动时命中状态不持续更新**：角色动画、缩放和松手后，单次 move 事件无法感知角色轮廓的动态位移。
3. **缺少拖拽丢失松手事件的兜底**：拖拽移动时无按键状态检查，缺少 `lostpointercapture` 及全局 blur/pointerup 容错。

### Implementation path

- `src/components/nia/companion/companion-runtime.tsx`：引入 `isDraggingRef`、`lastPointerPosRef`、`lastTargetRef` 和 `checkPointerHit`（优先 `document.elementFromPoint` 命中实时 DOM 轮廓）；松手时重算命中并传入 `dragEnd({ retainCapture: isHit })`；建立 rAF 循环在鼠标位于窗口内时每帧持续检测命中并更新状态（有门控去重）；`onPointerMove` 检测 `(buttons & 1) === 0` 自动结束拖拽；`<main>` 及 `window` 监听 `lostpointercapture`、`pointerup`、`blur`、`mouseleave` 兜底。
- `electron/nia/companion/companion-window.cjs`：`endDrag(options = {})` 在 `options?.retainCapture === true` 时保持捕获状态，不强制开启点击穿透。
- `electron/nia/companion/companion-ipc.cjs` 与 `companion-preload.cjs`：`drag-end` 管道支持透传 `payload`。
- `src/components/nia/companion/realtime-transport.ts`：更新 `CompanionBridge` 类型。

### Checks

- 单元与组件测试：`tests/unit/electron/nia/companion/` 与 `tests/component/nia/` 新增 5 组回归测试，全量 Nia 54 个文件 331 项全部通过。
- `node --check`、ESLint（0 error 0 warning）、`git diff --check`、`npm run build` 全部通过。
