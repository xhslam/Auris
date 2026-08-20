# Workspace Agent Instructions

## Keep a concise engineering trajectory

When completing a feature or another meaningful code change in this workspace, leave a concise, reviewable engineering trajectory.

Record:

- how the task was interpreted and decomposed;
- the implementation path chosen and the practical reason for it;
- the files changed and the role of each change;
- important commands, checks, and test results;
- problems encountered, failed approaches worth remembering, and how they were resolved;
- remaining risks, assumptions, or follow-up work.

Keep the trajectory proportional to the task. Capture observable actions and useful engineering decisions, not private chain-of-thought or a verbatim transcript. Prefer a compact summary that can be reused later without consuming unnecessary context.

## Engineering trajectory: Auris 首页三栏工作台重构（2026-08-18）

本次任务将首页的主内容区对齐深色三栏工作台参考，同时明确不在首页重复渲染应用已有的侧边导航。实现保留现有首页数据与操作契约，包括记录日历、工作区、每日格言、任务、复习、快速闪念、浏览器状态，以及人生阶段的记录编辑。

实现路径是保留现有工作台卡片和布局持久化机制，移除 `HomePage` 中的内置 `auris-demo-home__rail`，并令主工作台以桌面框架的实际内容视口为边界。中列继续使用原有 `LifeRoad` 组件并显式加载 `home-v3.css`；其星空漂移、路径流光、当前节点呼吸光晕、滚动时间路与节点编辑弹窗均没有被替换为静态图像。

改动涉及 `auris/src/components/home/home-page.tsx` 和 `auris/src/components/home/home-demo-workbench.css`：前者移除了重复导航并补足工作区、今日任务与快速笔记的语义入口；后者调整三栏比例、内容区高度和人生阶段主舞台的卡片内呈现。未改动已有的 `main.cjs` 及其他未提交文件。

已在本地开发预览中检查 1280×720 与 1440×900 视口。运行时检查确认无重复首页导航、人生阶段有 3 个路径光点、星空和当前节点动画均处于运行状态，并可从“记录 20 岁”打开编辑框。定向 ESLint 通过；`desktop-home-shell`、课程链接和首页单元测试共 10 项通过。全仓 `tsc --noEmit` 仍因既有测试与服务接口的 118 项不相关错误失败，未在本次范围内修改。

## Engineering trajectory: Auris 首页布局管理补齐（2026-08-18）

用户补充参考截图后，确认首页原先仅有编辑与恢复按钮，缺少布局预设选择、命名保存、导出与导入。实现将布局管理保持为纯本地能力：`home-page.tsx` 新增 Default 预设、命名快照、活动预设、严格的 JSON 归一化与导入校验；`home-demo-workbench.css` 新增紧凑布局选择器和深色浮层。导入内容只接受版本 1、已知卡片 ID 与受限高度，并会补齐缺失卡片；无效文件不会覆盖当前布局。已用浏览器检查保存、切换、导出、导入和无效导入保护；首页相关 10 项测试及定向 ESLint 仍通过。

## Engineering trajectory: Auris 可编排三栏 Workspace 与命名布局（2026-08-18）
本次改造严格保留首页既有的「左侧｜中间｜右侧」和 Auris 深色设计语气，将按固定卡片 ID 管理的局部交互升级为统一 Widget 实例注册与布局状态。布局状态单独保存工作区宽度、收缩状态、实例 zone、顺序、高度、中区 grid span、可见性与固定状态；任务、笔记、复习及人生记录仍使用原有内容存储，因此切换布局不会复制或删除真实内容。

改动集中在 `auris/src/components/home/home-page.tsx` 与 `auris/src/components/home/home-demo-workbench.css`：前者新增 v1 兼容迁移、v2 布局模型、三栏分隔线、拖动插入预览、ResizeObserver、动态 Widget Library、Widget 菜单、Focus、初始布局与多命名自定义布局；后者补齐三栏网格、收缩、尺寸把手、拖放提示、组件抽屉及响应式样式。改造前版本已备份至 `auris/docs/homepage-backups/2026-08-18-workspace-v2/`。

验证完成：定向 ESLint 无错误（仅保留既有 `<img>` 优化提示）；4 个首页相关测试文件的 11 项测试通过；`npm run build` 完成；浏览器自动化确认三栏存在、动态添加 Countdown 后可经菜单和拖拽把手移到左栏且 `zone: "left"` 会写入 v2 状态、拖动左分隔线保持侧栏不大于中栏、命名布局「考研模式」会保存并成为活动布局。未提交或推送 Git 改动；既有的 `auris/main.cjs` 与其他未提交文件未修改。

## Engineering trajectory: 人生阶段动态主舞台修复（2026-08-18）
用户反馈中间「人生阶段」被缩成窄小的静态预览。检查本地历史确认 `life-road.tsx` 的动态实现未丢失，仍包含确定性星空漂移、星点闪烁、沿路径流光、当前节点呼吸光晕、滚动时间路和节点记录弹层；问题来自工作台布局允许已保存组件使用过窄的中区 span，并将动态容器强制为 `display: block`。

修复在 `auris/src/components/home/home-page.tsx` 和 `auris/src/components/home/home-demo-workbench.css`：人生阶段在中间工作区现在强制占满 6 列、最小高度 560px（默认也升级为 560px），并恢复为原组件所需的 grid 舞台与可滚动 viewport。浏览器自动化验证舞台为 997×560px、viewport 995×524px，68 个节点存在，星空漂移、路径流光、当前节点呼吸动画均运行，点击当前节点可打开记录编辑框；首页相关 11 项回归测试通过。未提交或推送改动。

## Engineering trajectory: Widget 菜单、满宽自适应与中区拖拽修复（2026-08-18）
用户反馈设置菜单文字与按钮重叠、卡片未随 Workspace 宽度填充、且中间默认组件无法拖动。检查发现菜单行受旧样式约束后高度塌缩为 1px；中间仍保留六列 Grid 宽度策略；每日格言和人生阶段的历史布局带有 Pin 标记，而拖拽逻辑将 Pin 当作移动禁令。

修复统一将组件菜单改为具有固定行高的两列 Grid，并为正文菜单项提供明确字体、尺寸与溢出规则；所有三栏堆栈改为单列满宽排列，每张卡片宽度由所在 Workspace 的内容宽度决定，高度仍保留编辑模式拖拽调整。Pin 现在仅为轻量视觉标记，不再阻断拖拽和高度调整。浏览器自动化验证两组菜单尺寸按钮各为 59px 高、菜单排版正常；所有测试卡片均填满所属工作区内容宽度；原先带 Pin 的每日格言和人生阶段均可通过真实标题把手拖至左、右工作区，zone 状态会持久化。首页相关 11 项测试通过，未提交或推送改动。

## Engineering trajectory: 全组件视觉适配与设置菜单功能修复（2026-08-18）
用户反馈每日格言正文在矮卡片中以过大单行溢出、Countdown 等信息组件存在尺寸风险，并指出设置菜单的尺寸按钮只是空壳。完成全量 Widget 巡检后，统一为内容区域增加最小尺寸、内部滚动和横向边界约束；每日格言改为根据卡片尺寸自适应字号且可换行；信息类 Widget 的大数字、标题和辅助文字增加可用范围与省略规则。工作区在纵向空间不足时现在滚动，不再压缩用户已选择的卡片高度。

设置菜单现只保留真实含义明确的高度预设 Small、Medium、Large、Auto，并显示「宽度将自动填满所在工作区」提示；移除与满宽要求相冲突的中区宽度空壳控制。每个预设都会将高度写入持久化布局状态；固定标记、复制、移动、隐藏及删除均保留真实状态操作。浏览器验证在 1420px 宽度下，8 个现有 Widget 无横向溢出；每日格言 Small/Medium/Large 使用受控字号；Large 实测由 108px 增至 180px；生产构建成功，首页相关 11 项回归测试全部通过。未提交或推送改动。

## Engineering trajectory: 今日复习与考研 Countdown 窄栏布局修复（2026-08-18）
用户反馈「今日复习」及「考研 Countdown」在窄栏卡片中内容拥挤且视觉重心漂浮在卡片中部。今日复习现采用摘要、进度、行动三段式结构：待复习数量与完成状态位于顶部、进度条紧随其后、继续复习和条目说明稳定置于底部行动区。Countdown 现采用顶部标签与日期、核心天数及底部说明的层级，不再使用 `justify-content: center` 垂直居中堆叠。

两张卡均有窄栏字号、最小尺寸和横向溢出约束。浏览器自动化测试通过组件库添加 Countdown 并移至左栏，确认今日复习摘要与 Countdown 标签均位于卡片顶部 50px 内，内容无横向溢出；首页相关 11 项回归测试通过。未提交或推送改动。

## Engineering trajectory: 四张窄栏学习组件 UI 统一优化（2026-08-18）
用户要求调整今日复习、Pomodoro、学习进度与当前学习四张卡片。四卡现在统一采用顶部信息结构和明确的视觉节奏：今日复习的摘要、进度、行动区域顺序固定；Pomodoro 增加「专注计时」眉标、倒计时主数据与主操作按钮；学习进度将科目、时长与全宽进度条整齐分层；当前学习将课程、章节、主题和预计时长保持为由上至下的学习状态层级。所有组件均使用窄栏字号与边界约束，避免贴边、漂浮和无效留白。

生产构建成功，首页相关 11 项回归测试通过。未提交或推送改动。

## Engineering trajectory: CSS 编译错误与 Pomodoro 404 修复（2026-08-18）
用户截图显示旧开发服务器仍报告 `home-demo-workbench.css` 第 763 行损坏选择器的语法错误；同时点击 Pomodoro 的「开始专注」会访问尚不存在的 `/focus`，因而显示 404。样式文件当前第 763 行已恢复为有效的 `.workspace-current-study em` 规则。新增 `auris/src/app/focus/page.tsx`，提供可运行的 25 分钟专注计时页面，包含开始／暂停、重置与进度显示。

生产构建成功且路由表包含 `/focus`；重启本地开发预览后，首页响应含 41 个 Widget 标记且不含 Build Error。真实浏览器读取 `/focus` 的可见内容为 Pomodoro 专注计时、25:00、开始专注和重置，不显示用户可见的 404。未提交或推送改动。

## Engineering trajectory: 全部内部跳转巡检与 assessment 路由修复（2026-08-18）
完成应用内静态路由与显式跳转目标盘点。首页、Browser、Flash、Focus、Nia、Notes、Reading、Review、Settings、Video 等静态页面均返回 HTTP 200。巡检中发现 `/assessment` 已被运行时路径映射与预取配置引用，但原先没有页面实现并返回 404；已新增 `auris/src/app/assessment/page.tsx`，提供发音评估入口和通往视频学习页的链接。

生产构建成功并包含 `/assessment`、`/focus`。并行路由检查确认 11 个静态页面均为 200；视频页当前没有可点击的视频详情数据，因此没有需要验证的动态详情目标。首页与导航相关 11 项回归测试通过。未提交或推送改动。

## Engineering trajectory: 首页全组件交互与响应式回归（2026-08-18）
对 20 个可注册首页组件执行 2048、1440、1180、900、720、480px 六档宽度巡检。初始巡检发现 480px 时仍沿用三栏网格，中心和右栏组件被裁切到视口外；已新增窄屏覆盖规则：720px 以下取消三栏最小宽度并将 Workspace 纵向堆叠，隐藏分隔线；540px 以下隐藏侧轨并调整顶部与编辑工具条。

修复后，20 个组件在全部六档宽度下均满足：页面宽度等于视口、组件主体无横向溢出、无卡片落在可视区域外。实际交互验证通过：格言 Large 尺寸预设、从组件库添加 Music、跨区移动、隐藏，以及 Pomodoro 跳转至专注页面。生产构建成功，首页相关 11 项回归测试通过。未提交或推送改动。

## Engineering trajectory: 笔记受管浏览器 SidePane（2026-08-19）

用户要求参考 Proma 的“主内容保留、右侧受管浏览器并排”形态，但保留 Auris 自身浏览器安全与会话机制。实现没有迁移 Proma 的浏览器控制器或 profile 逻辑；Auris 已有 `WebContentsView` 和 renderer viewport 同步，因此将 Notes 工作台从 `note | browser` 的全屏二选一状态改为笔记常驻的 `isBrowserPaneOpen` 状态。

改动集中在 `auris/src/components/notes-v2/notes-workbench.tsx`、`notes-embedded-browser.tsx`、`notes-embedded-browser.css`、`notes-layout-resize.ts` 及 `src/app/globals.css`。笔记中心现在始终渲染；打开受管浏览器会显示右侧可收起、可鼠标或键盘调宽的 SidePane，默认 520px、最小 400px、最大 640px，并保证笔记区至少 320px。收起时仅卸载 SidePane，现有浏览器标签/会话仍由原浏览器运行时保持。打开浏览器与终端分栏彼此互斥，以免在笔记页出现不可用的三列窄栏；现有 Human、AI Sandbox、AI Shared、审批、分区和原生 viewport bridge 均未修改。浏览器独立组件兼容旧的 `onReturnToNotes` 回调，同时支持新 `onClose` 语义。

新增/更新回归断言：`tests/component/notes/notes-workbench.test.tsx` 现在验证打开浏览器后编辑器仍存在、分隔条可用键盘从 520px 调至 552px、且收起后编辑器继续存在。定向 Vitest：2 个文件、36 项通过；定向 ESLint 通过；`npm run build` 已完成 Next 生产构建。`npx tsc --noEmit` 仍有仓库既存的 118 项测试/服务接口错误，但筛查确认本次 4 个 TypeScript 文件不在错误列表。桌面开发预览已成功启动 Electron 进程后关闭，未保留验证用后台进程。未提交或推送改动。

### SidePane 拖拽与宽度复核（2026-08-19）

复核发现原先 360px 最小宽度会让浏览器 toolbar 的地址栏与模式选择在窄 pane 中拥挤，且仅按“笔记至少 320px”计算的最大宽度会允许浏览器在大屏上压缩过多笔记正文。主窗口最小宽度为 1160px，因此将 SidePane 宽度调整为默认 520px、最小 400px、最大 640px；在可用壳宽更小时仍以笔记 320px 与实际 8px 分隔条为最终空间上限。浏览器 pane 现在使用 container query 而非窗口媒体查询：在 pane 不超过 560px 时隐藏非核心状态 pill、收紧 toolbar，并缩短模式选择，拖到最小宽度仍保持地址栏和关键控制可用。

新增 `tests/unit/notes/notes-layout-resize.test.ts`，覆盖最小值、阅读友好最大值和窄壳结构上限；结合既有 SidePane 组件测试共 39 项通过，定向 ESLint 与 `git diff --check` 通过。未提交或推送改动。

## Engineering trajectory: 首页布局状态水合修复（2026-08-19）

用户截图显示 Next 的 Recoverable Error：首页服务端输出的“布局已保存”标记与浏览器首个渲染的“布局有未保存修改”标记不一致。根因是 `HomePage` 原先在 `useState` 初始化器中调用 `loadCurrentLayout`、`loadSavedLayouts` 与 `loadActiveLayoutId`；服务端获得默认布局，而客户端在水合前读取 localStorage，从而改变 class、title 和布局选择器文本。

修复集中在 `auris/src/components/home/home-page.tsx`：首屏统一用 `initialLayout`、空保存布局和初始布局 ID 初始化；仅在 mount 后的 effect 读取 localStorage 并一次性恢复布局、保存列表和活动 ID。三个写回 localStorage 的 effect 以 `isLayoutHydrated` 为门控，避免初始默认布局在恢复前覆盖用户原有数据。首页组件回归 10 项通过；定向 ESLint 仅保留既有 `<img>` 优化警告；`npm run build` 完成。未提交或推送改动。

## Engineering trajectory: 视频源根目录预创建目录收敛（2026-08-19）

用户询问视频源根目录中的 `analysis` 与 `transcodes` 是否有实际用途，并希望如果尚未使用就停止自动创建。静态检索确认当前视频库仅会实际写入缩略图目录：`analysisDirectory` 与 `transcodesDirectory` 除初始化和快照展示外不存在读写调用，数据库只会预登记 transcript、chaptering、quality-ladder 三项 idle 分析任务，并未产出分析或转码文件。

改动涉及 `auris/electron/video-library-db.cjs`、`electron/main.cjs` 与 `tests/unit/electron/video-library-db.test.ts`。仓库初始化现在仅创建数据库父目录和 `thumbnails`；`analysis` 与 `transcodes` 改为未来功能真实写入时再懒创建，快照在未启用时返回 `null` 而不是虚假的路径。此策略也保护任何仍把缓存路径传为视频源路径的旧运行版本，不会再创建这两个空文件夹。视频库数据库、列表和详情测试共 14 项通过；生产构建通过。未删除用户已有目录，未提交或推送改动。

### 空视频副产物目录安全清理（2026-08-19）

用户要求清理本机既有的空 `analysis` 与 `transcodes` 目录。新增 `auris/scripts/clean-empty-video-artifact-directories.cjs`：默认 dry-run；仅允许处理 `/Users/apple/Documents/视频区` 与 Auris/Electron 私有 `video-libraries` 数据根；严格要求名称为 `analysis` 或 `transcodes`、真实普通目录且为空；拒绝符号链接、非白名单路径和非空目录。执行删除须同时显式使用 `--apply` 与确认环境变量，并会在检测到本地 Auris Electron 进程时拒绝运行。

预演确认 10 个候选均为空且无阻断项；缺失确认令牌与 Auris 运行中两种场景均已验证脚本拒绝删除。首次实际执行发现对象而非路径传给 `rmdirSync`，未删除任何目录；修复后重新 dry-run 并成功删除全部 10 个目录。最终核验无残留候选目录，视频源根目录的数据库、缩略图与抽样源视频仍存在，脚本 dry-run 返回空目标集。未提交或推送改动。

## Engineering trajectory: 视频工作区与英语陪练模式解耦（2026-08-19）

本次工作严格限定在视频详情/播放模块。原详情页把播放器与 `EnjoyShadowingStudio` 固定为双栏并列；改造后由 `DesktopVideoDetailShell` 持有 `VideoWorkspaceMode = "watch" | "english-practice"`。任何视频详情初始均为 `watch`，仅渲染一个既有 HTML `<video>`；用户点击顶部「英语陪练」才加载并进入增强面板。面板首次打开后在关闭时仍保持挂载，因此当前句、录音选择、评分与倍速等陪练 session 状态可恢复，同时网格收回侧栏空间让播放器真正扩展。

改动涉及 `auris/src/components/desktop/desktop-video-detail-shell.tsx`、`desktop-video-detail-shell.css`，以及新增 `auris/src/components/video/english-practice/english-practice-panel.tsx`。原生播放器、视频源桥接、进度/音量/全屏逻辑没有替换；`EnglishPracticePanel` 只订阅该单一播放器的 ref 和共享状态。英文字幕、翻译、字幕导入、字号、跟读、录音、发音评估、逐句跳转、循环、倍速与设置均复用既有 `EnjoyShadowingStudio`，并被移入陪练面板。窄于 1100px 时，陪练面板改为播放器下方的完整工作区，避免压窄视频画面。

更新 `tests/component/video/desktop-video-detail-shell.test.tsx`，新增默认观看模式、首次按需初始化、面板开合以及同一 video 元素/currentTime/volume/playbackRate 保持的回归覆盖；原有翻译、主题、字号、播放器、全屏和查词覆盖同步迁移到新入口。验证通过：定向 Vitest 共 8 项、定向 ESLint、`git diff --check` 与 `npm run build`（Next 生产构建成功，包含 `/video/[videoId]`）。未提交或推送 Git 改动；未修改首页、阅读、导航、视频源读取或桌面桥接。

剩余风险：本地实机 Electron 视觉巡检未在本次自动化会话中执行；布局逻辑已通过响应式 CSS 和组件测试覆盖，后续如调整桌面壳宽或侧栏尺寸，应在 1100px 临界宽度实机复核。

## Engineering trajectory: 首页 Workspace 目录标题水合修复（2026-08-19）

用户在 Electron 开发预览中看到首页 `Recoverable Error`：服务端渲染 `Workspace`，而客户端首次渲染已读取笔记运行时的浏览器回退目录名「浏览笔记库」。布局状态此前已在 mount 后恢复；这次问题来自 `workspaceBody` 直接输出 `workbench.directoryInfo?.directoryName`，而 `useNotesRuntime` 会依据运行环境给服务器与客户端不同的初始 `directoryInfo`。

修复仅修改 `auris/src/components/home/home-page.tsx`：工作区标题在 `mounted === false` 时固定为 `Workspace`，只在水合完成后的 effect 触发重渲染时读取实际目录名。现有 `isVaultConfigured` 的 mount 门控保持不变，因此目录树与真实目录信息仍会在客户端正常恢复，不会牺牲本地库体验。

验证通过：首页组件测试 8 项、`home-page.tsx` 定向 ESLint（仅保留仓库既有 `<img>` 优化警告）、`git diff --check` 与 `npm run build`。同时用本地 Electron 开发预览的 HTTP 首屏输出检查，首页只出现确定的 `Workspace` 文本、未出现「浏览笔记库」。未提交或推送改动。

## Engineering trajectory: 英语陪练单行头部与可调面板宽度（2026-08-19）

用户反馈英语陪练标题与工具栏占用两行，并希望桌面端面板可由自己左右拖拽调整。改造将 `EnglishPracticePanel` 的标题、字幕/翻译/导入/字号/主题工具和关闭按钮放入同一 54px Header；不改动既有英语练习内容与控制逻辑。

`DesktopVideoDetailShell` 现持有可选的 `practicePanelWidth`，并通过面板左侧的键盘可聚焦分隔条处理 pointer drag。宽度范围按当前工作区动态约束：面板至少 360px、播放器至少 520px，面板最多占工作区约一半；因此不会破坏视频的最小观看空间。桌面默认宽度改为流体 CSS 值而非固定比例，用户拖拽后通过 CSS 自定义属性即时更新。分隔条同时支持方向键微调（左键扩展、右键收窄）。在 1100px 以下仍按原策略将面板堆叠到播放器下方，并隐藏无意义的横向拖拽条。

改动涉及 `auris/src/components/desktop/desktop-video-detail-shell.tsx`、`desktop-video-detail-shell.css`、`src/components/video/english-practice/english-practice-panel.tsx` 与视频详情组件测试。新增分隔条宽度拖拽断言；视频详情回归共 9 项通过，定向 ESLint、`git diff --check` 与 `npm run build` 均通过。未提交或推送 Git 改动。

## Engineering trajectory: 视频详情播放器桥接水合修复（2026-08-19）

用户在 Electron 视频详情页看到 `Recoverable Error`：SSR 输出「正在加载播放器…」，客户端第一帧因直接读取 `window.shadowingDesktop.videoLibrary` 已存在而输出「当前网页环境不提供本地视频播放器」。根因是 `DesktopVideoDetailShell` 用 `useState(() => getDesktopVideoLibraryBridge())` 初始化桥接，导致服务端和客户端首帧分支不同。

修复仅修改 `auris/src/components/desktop/desktop-video-detail-shell.tsx`。`videoLibrary` 现在从确定的 `null` 初始值开始，`isBridgeHydrated` 初始为 `false`；仅在 mount effect 中读取桌面桥接。页面在水合前和等待桥接时固定显示「正在加载播放器…」，之后才根据桥接结果加载详情或呈现不支持提示。现有视频播放、英语陪练、可拖拽面板、详情加载和错误处理均未替换。

验证通过：视频详情组件回归 9 项、定向 ESLint、`git diff --check` 与 `npm run build`。未提交或推送 Git 改动。

## Engineering trajectory: 英语陪练 Attempt 与真实发音评估闭环（2026-08-19）

本次任务严格限定在 English Practice 的 Shadowing / 跟读训练及其既有评估、录音持久化服务。审查确认项目原有 Azure Speech server route 和 `evaluatePronunciationAssessment` 已能返回真实的 PronScore、准确度、流利度、完整度及单词级 ErrorType；录音使用 IndexedDB Blob 存储，但 UI 将录音与评分分开管理，缺失 Attempt 生命周期、删除与清晰的失败状态。

实现保留 WAV Recorder、`/api/assessment/pronunciation`、Azure 服务和 IndexedDB，不创建第二套录音存储，也不暴露密钥。`LocalRecordingRecord` 扩展为单句稳定 Attempt：包含不可变 `attemptIndex`、source/sentence 关联、`idle | pending | success | failed` 评估状态、真实结果及错误。新增浏览器侧 `pronunciation-assessment-client.ts` 只调用应用 server route；Azure Key/Region 继续只在服务端环境变量中读取。每次录音先保存 Attempt，再按 Attempt ID 异步评分；低于 300ms 或空 Blob 不创建记录。评分请求使用 AbortController，删除或卸载后会中止，结果回写前还确认 Attempt 未被删除，避免幽灵数据。

`EnjoyShadowingStudio` 现会在无录音时隐藏空评分框；录音后展示紧凑的 pending、success、failed / 未配置状态。真实结果显示综合、准确度、流利度、完整度和 Provider 返回的低分/异常单词；单词详情只展示真实准确度与 ErrorType，不伪造音素或诊断。练习下拉保留稳定编号、显示真实分数和最佳成绩；可删除当前 Attempt、删除当前句全部记录并确认，删除同步 IndexedDB Blob、内存选中态、浏览器/桌面评分历史及 Object URL 生命周期。失败或未配置的旧录音可重新评估。

为桌面评分历史补齐 `delete` bridge / IPC / SQLite 删除与逐词项级联清理；新增或更新 `enjoy-shadowing-studio` 和 `local-history-db` 回归。验证通过：跟读组件、桌面评分数据库、发音 API route 共 12 项 Vitest；定向 ESLint、`node --check`（main/preload/local-history DB）、`git diff --check` 与 `npm run build` 均通过。未提交或推送 Git 改动。

## Engineering trajectory: Note Web Workspace 空态与主题化外壳重构（2026-08-20）

本次任务依据执行手册，将 Note 右侧受管浏览器明确为 Auris 原生 Web Workspace。审计确认 DuckDuckGo 自动打开的根因在 `notes-embedded-browser.tsx`：SidePane 初次就绪时显式调用 `createTab({ url: "https://duckduckgo.com/" })`。Electron 原生层的 `browser-registry.cjs` 与 `browser-surface-manager.cjs` 已支持 `url: ""` 的真空标签，并且此形态不会调用 `loadURL`，因此没有引入 `about:blank`、遮罩或隐藏 URL 等替代方案。

实现集中在 Note Web Workspace、浏览器外壳与导航状态：`notes-embedded-browser.tsx` 现在创建无 URL 的 Human 空标签、在 Empty/Error 状态隐藏原生 WebContentsView、提供 Auris 本地空状态和失败后的重新加载操作，并在点击新增标签时聚焦地址输入框；`notes-embedded-browser.css` 以现有 `--notes-*` / `--accent-*` 令牌映射浏览器 chrome，压缩标签栏与工具栏、补齐输入框、按钮与 Empty/Error 状态的交互层级，而没有修改第三方网页内容。`use-browser-window.ts` 将纯搜索文本解析为 DuckDuckGo 查询，仅在用户提交搜索时使用；域名仍补全为 HTTPS。`browser-registry.cjs`、`browser-bridge.ts`、`browser-toolbar.tsx` 与两个浏览器外壳调用点补充真实的前进/后退可用性状态，使无历史记录的控制按钮禁用。空标签标题统一显示 `New Tab`。

回归覆盖更新在 `notes-embedded-browser.test.tsx`、`browser-omnibox.test.tsx` 与 `browser-window-manager.test.ts`：分别断言嵌入 Workspace 创建标签不携带 URL、空态地址/说明可见、搜索提供方仅在搜索文本时解析为 DuckDuckGo，以及 Electron 层给空标签创建 Surface 时 `initialUrl` 为 `undefined`。定向 Vitest 覆盖 Notes、Browser chrome、布局、surface/IPC/window manager 共 55 项通过；最终浏览器窗口管理测试 14 项通过，现有 Electron 浏览器烟雾测试通过，验证导航、历史、刷新、标签保留与多窗口隔离。定向 ESLint 与 `git diff --check` 通过；`npm run build` 完成 Next 生产构建。

本次没有修改 Note 编辑器、Markdown、数据库、全局布局、其他工作区或第三方网页样式；原有的首页规格文件、vmark 同步报告与 `research/vmark-upstream/` 未跟随本次变更，保持未触碰。未提交或推送 Git 改动。

## Engineering trajectory: Note Web Workspace Header 对齐与布局精修（2026-08-20）

本次任务严格限定在 Note 右侧 Web Workspace 的 Browser Header，不修改 WebView、URL/Search、历史、空态业务、编辑器或其他页面。审计确认错位来自两层 Header 样式叠加：共享样式将 Tab strip / Toolbar 设为独立高度，Note 覆盖又以不同的 38px / 50px / 30px / 32px 数值压缩局部控件；收起 SidePane 的左箭头还使用 `position: absolute` 从第一排脱离，工具栏没有明确的 Navigation / Address / Actions 分组。

实现将 `browser-window-shell` 在 Note pane 内改为两行 Grid，并建立仅限该 Header 的尺寸变量：TabBar 46px、Toolbar 52px、常规控件 36px、Tab 34px、横向内边距 16px。`BrowserToolbar` 现在具有 Navigation、Address、Actions 三个明确 DOM 区域；`BrowserTabStrip` 支持 leading action，SidePane 收起箭头因此进入 Tab Bar 正常 flex 流，不再依赖 absolute 坐标。Tab 保持 title 与 close 为一个组件，新增 `+` 为独立 32px action；Bookmark、地址栏、模式选择与浏览状态 chip 统一为 36px。原先可见的 `NEW · 新建` 只是模式化新标签下拉的辅助文字，已移除该漂浮标签而保留 Human / Sandbox / Shared 新标签能力；顶部 `+` 仍是普通 Human 新标签入口。

响应式上，560px 以下隐藏非核心的人工浏览状态文字并收紧 actions gap，460px 以下隐藏模式选择，始终优先保留三枚导航按钮与地址栏。Header 相关样式没有新增颜色硬编码；继续继承既有 Notes / Accent Theme token。审计还确认 Note 嵌入式 Header 内不存在独立的右上角 Reload：页面加载状态沿用 Toolbar 中的 Reload → Stop 切换；共享独立浏览器的 window menu 不会渲染到 Note pane。

验证完成：Header 组件回归新增 Navigation / Address / Actions 分组断言；Notes Workbench、嵌入浏览器、模式控件、地址栏和布局测试共 43 项通过，Electron browser smoke 通过，`npm run build`、定向 ESLint 与 `git diff --check` 均通过。Notes Workbench 测试仍打印三条既有 React `act(...)` 警告但不影响通过。未提交或推送 Git 改动。

## Engineering trajectory: Note Web Workspace Tab Close 融合式重构（2026-08-20）

本次任务严格限定在浏览器 Tab 的内部结构和 Close 交互，不重新修改前一轮 Header Grid、地址栏、导航、网页加载或 Note 业务。审计确认 Close 原本虽然是 `.browser-tab` 的子元素，但它与可激活标题按钮为直接并列节点；旧样式使用独立的 margin、16px 字符和始终显眼的按钮语义，缺少 Tab-hover / Active / Close-hover 的渐进状态，因而会形成“标题块旁外挂一块 ×”的视觉关系。

`browser-tab-strip.tsx` 现增加 `.browser-tab__content` 内部容器，将 title、加载指示与 Close 放入同一布局单元；Close 保持固定 24×24px 命中热区，使用 14px 的轻量 × 图标，并在点击时调用 `stopPropagation()` 后只关闭目标 Tab。标题与 Close 热区始终占位，避免 hover 时引发文本宽度变化或抖动。`browser.css` 将 Close 改为透明、24px 固定 flex item、圆形 hover surface，并按 Inactive（0.42）、Active（0.70）、Tab hover（0.78）、Close hover/focus（1.0）渐进提高存在感；颜色、hover、pressed 与 focus 均继续使用既有 browser/Auris token。Note 专属 CSS 保持同一 24px 圆形热区，覆盖层不再把它重设为小方块。

新增 `tests/component/browser-window/browser-tab-strip.test.tsx`，断言 Close 位于 tab content 内部、点击 Close 不触发 tab activate、inactive Tab 的 Close 始终挂载并可正常切换标签。相关多标签、模式、地址栏、嵌入浏览器、Notes Workbench 和原生窗口管理共 56 项 Vitest 通过；定向 ESLint、`git diff --check` 与 `npm run build` 均通过。Notes Workbench 仍有仓库既有的 3 条 React `act(...)` 警告，未影响通过。未提交或推送 Git 改动。

### Note pane 实际覆盖链复核与强化（2026-08-20）

用户截图表明实际 Note 侧边 Web Workspace 仍呈现旧的“外挂灰块”Close 观感，不能仅以共享 Browser shell 的样式为验收。重新审计确认该界面确实由 `NotesEmbeddedBrowser → BrowserTabStrip` 渲染，且开发服务器下发的 Note 页面 CSS 已包含前序规则；因此在 `notes-embedded-browser.css` 增加了最高针对性的 Note pane 覆盖层：`.browser-tab__content` 统一内部 padding/gap，`.browser-tab__close` 强制透明背景、无边框/阴影、24px 固定圆形热区、无 margin，并以 Note token 驱动 hover/focus/active surface 与渐进 opacity。该层仅匹配 `.notes-v2__embedded-browser`，不会改变独立浏览器页面。

`npm run build` 会结束原有的开发预览，因此完成构建后已重新启动 `npm run desktop:dev`。随后通过本地运行时 `/notes` 路由解析带版本的 `app/notes/page.css`，确认实际下发的 CSS 含 `Note pane tab integration` 专属覆盖。嵌入浏览器、Tab strip 与 Notes Workbench 共 38 项回归仍通过；`git diff --check` 通过。未提交或推送 Git 改动。

## Engineering trajectory: 视频内容区沉浸播放（2026-08-20）

本次任务将视频右下角原本依赖浏览器原生 Fullscreen API 的行为重新定义为仅作用于 Auris 主内容区的沉浸播放：左侧 `DesktopAppSidebar` 保持为既有 `DesktopAppFrame` 的同级导航，右侧详情页收起工具栏、视频信息与英语陪练可见面板，并由同一个播放器占满主内容区。这样避免在 macOS/Electron 中进入系统全屏或覆盖 Sidebar。

实现集中在 `auris/src/components/desktop/desktop-video-detail-shell.tsx` 与同名 CSS。组件以独立的 `isImmersive` UI 状态替换 `requestFullscreen`、`fullscreenchange` 与失败提示分支；`Esc`、`F`、双击播放器和右下角按钮均可切换状态，视频 ID 变化时重置为普通模式。视频元素始终只渲染一次，切换只改变祖先 `data-immersive` 布局；英语陪练的 `workspaceMode` 不变，面板在沉浸状态仅通过 CSS 隐藏。CSS 取消内容区 padding、普通宽度限制、圆角和视频信息，令播放器在 Main 内以 `object-fit: contain` 铺满；控制栏继续绝对覆盖视频底部，并采用轻量黑色渐变和 2.6 秒自动隐藏。

`auris/tests/component/video/desktop-video-detail-shell.test.tsx` 新增与更新回归覆盖：沉浸切换后同一 `HTMLVideoElement` 保持不变，currentTime、音量和 playbackRate 均保持；Esc 可以退出；英语陪练状态与同一面板实例保留。定向 Vitest 10 项通过，定向 ESLint、`git diff --check` 通过，`npm run build` 完成且视频动态路由存在。已检索确认上述视频详情组件与样式中没有 `requestFullscreen`、`fullscreenElement` 或“无法进入全屏模式”残留。

尝试以 `npm run desktop:dev` 启动新的 Electron 验证实例时，当前用户桌面已有同一项目的 Electron 开发实例并持有单实例锁，新启动器按单实例机制退出；为避免干扰已有桌面会话，未终止该实例。该限制不影响组件、静态检查和生产构建验证，但后续可在现有 Electron 窗口中以真实本地视频完成视觉验收。未修改 Sidebar、Electron 主进程、视频源或解码逻辑，未提交或推送 Git 改动。

### 沉浸播放空白区高度链修复（2026-08-20）

用户截图显示点击沉浸播放后，顶部栏会正常消失但 Sidebar 右侧完全空白。根因是桌面框架的通用 viewport 为可滚动 flex 容器，已有 workspace 和 notes 页面具备专门的全高子树规则，而视频页没有；原先沉浸模式再将播放器容器保持为 Grid 的隐式行，导致 `height: 100%` 沿到视频帧时缺少稳定的可用高度。

修复仅调整 `auris/src/components/desktop/desktop-video-detail-shell.css`。沉浸状态下的视频 body 改为唯一列的 flex 容器，播放器列与播放器帧都使用 `flex: 1 1 0`、`min-height: 0` 和 stretch 对齐，避免高度折叠。对含 `.video-study` 的桌面 frame，再局部建立 `viewport → layout → main → video-study` 的 flex 全高链并关闭其中间滚动，范围不外溢到其他页面或 Sidebar。运行中的 Next/Electron 开发实例已重新编译对应视频路由，日志中 `GET /video/[videoId] 200` 无 CSS/编译错误；视频详情 10 项回归、定向 ESLint 与 `git diff --check` 均通过。未重启或关闭用户已打开的 Electron 窗口。

### 视频详情隐藏滚动条（2026-08-20）

用户希望去除视频区全部可见的滚动条“轮毂”。检查确认视频详情的播放信息列、英语陪练脚本及响应式布局仍需要保留 `overflow-y: auto`，因此没有删除滚动能力。仅在 `.video-study` 及其后代增加 `scrollbar-width: none`、`-ms-overflow-style: none` 和 WebKit `::-webkit-scrollbar { display: none; width: 0; height: 0; }` 覆盖，轨道与滑块在 macOS/Electron 中不再显示，而鼠标滚轮、触控板及键盘滚动仍可用。运行中的视频路由返回 HTTP 200，`git diff --check` 通过；未影响视频页外的任何滚动条。

## Engineering trajectory: 首页系统主题同步修复（2026-08-20）
用户反馈首页固定为深色工作台，无法随 macOS/Windows 系统外观切换。审计确认 `HomePage` 未订阅 `prefers-color-scheme`，且工作台 CSS 存在大量深色硬编码；首页复用的 `home-v3` 令牌还会被桌面壳的静态应用色板覆盖。

新增 `auris/src/features/appearance/use-system-color-scheme.ts`，以稳定的首屏值避免水合不一致，并在 mount 后通过 `MediaQueryList` 的 `change` 事件实时订阅系统明暗模式。`home-page.tsx` 将状态挂到根节点 `data-system-color-scheme`；`home-demo-workbench.css` 补齐明暗令牌、浅色卡片/菜单/人生阶段舞台覆盖，并以 `.desktop-app-shell[data-app-theme]` 的优先级防止静态色板反向覆盖。新增 `tests/unit/app/use-system-color-scheme.test.tsx`，覆盖初始读取、运行时切换与监听清理。

验证完成：新增主题监听单测 2 项与首页单测共同 3 项通过；定向 ESLint 无错误（仅保留既有首页 `<img>` 优化警告）；`npm run build` 完成。Playwright 在运行中的本地首页预览中先模拟浅色、再运行时切换至深色，确认根属性从 `light` 更新为 `dark`，且 `--ink` 与 `--home-v3-text` 均切换到对应色板。首次尝试另起开发服务器因用户已有实例持有 Next dev lock 而退出；随后复用现有 `:3000` 预览完成验证，未终止用户进程。未提交或推送 Git 改动。

## Engineering trajectory: 首页全卡片主题与对比度统一（2026-08-20）
用户要求检查现有卡片组件，并确保所有卡片可随系统主题变化，同时使背景和内容保持强对比。审计覆盖默认卡片与全部 20 个已注册 Widget；发现工作台虽已有根主题状态，但不同 Widget 继续使用分散的深色硬编码，浅色模式下人生阶段的深色渐隐层尤其破坏舞台一致性。

改动仅在 `auris/src/components/home/home-demo-workbench.css`：新增明暗共用的 `--card-*` 令牌，统一卡片表面、标题栏、边框、正文、强调信息、操作按钮与进度条的层级；日历普通／标记／今日状态分别使用可访问的前景与背景配对；浅色模式下的人生阶段渐隐层改为低不透明度浅绿渐变，保留路径与节点的可读性。所有规则限定在首页桌面壳与 `data-system-color-scheme` 范围内，不改变其他页面。

验证完成：使用 Playwright 注入包含全部 20 个 Widget 的布局，分别模拟浅色和深色系统主题；两种模式均渲染 20 张卡片，标题最小计算对比度分别为 14.56:1 与 10.91:1。视觉审计确认浅色卡片、日历和人生阶段不再出现深色横向渐隐带，深色星空舞台仍正常。首页与主题单测共 3 项通过；定向 ESLint 无错误（仅有既有 `<img>` 警告）；`npm run build` 通过。验证临时脚本和截图已清理，未提交或推送 Git 改动。

## Engineering trajectory: 人生阶段六主题场景背景（2026-08-20）
用户希望“人生阶段”不只区分明暗，而是随应用的六种外观主题呈现不同场景。现有设置主题为 white、paper、mint、sepia、night 和 solarized，因此没有新增图片资源或第三套状态；实现以 CSS 分层景观绑定 `.desktop-app-shell[data-app-theme]`，与既有设置换肤事件同步。白色为晨光草原、纸张为纸上山野、薄荷为山谷溪流、棕褐为暖色盘山公路、夜间为星空月光、Solarized 为青绿夜景。

改动集中在 `auris/src/components/home/home-demo-workbench.css`：每种主题定义独立的场景背景、渐隐层、标签、记录摘要及节点令牌；共享规则将场景落到动态时间之路、保留路径/流光/节点交互，并对标签、记录摘要与当前节点使用高对比前景。为克服前一轮浅色系统覆盖层的选择器优先级，场景规则显式带有 `data-system-color-scheme`，现可正确覆盖基础舞台背景。

新增 `tests/unit/app/life-theme-scenes.test.ts`，确认六主题均存在不同场景背景和完整前景令牌。浏览器真实切换设置主题验证六种背景均独立下发；白色、薄荷、夜间和 Solarized 的视觉截图复核确认路径、节点与标签可读。场景测试、首页测试和系统主题监听测试共 5 项通过，定向 ESLint 通过，`git diff --check` 通过，本地预览 `/` 返回 200。`npm run build` 的 CSS/TypeScript 编译阶段通过源码检查，但随后被仓库既有 `src/features/home-learning/home-reading-summary.ts` 对 `ReadingResumePosition.paragraphId` 的联合类型访问错误阻断；该文件不在本次范围内，未修改。验证临时脚本与截图已清理；开发预览已恢复运行，未提交或推送 Git 改动。


## Engineering trajectory: 首页真实学习卡片（2026-08-20）

本次按已批准的 `2026-08-20-home-real-learning-cards-design.md` 实施首页三张真实学习卡片。实现采用轻量 `home-learning` 摘要层：Review、Reading、Video 与 Notes 仍以各自已有存储或桥接为权威；新建的恢复存储只保留文章/视频定位和用户选择的学习目录，不复制正文、视频元数据或复习业务数据。`HomePage` 改为只消费 `useHomeLearningSummary()`，保留 `review`、`progress`、`current-study` Widget type 与对应实例 ID；`current-study` 的显示名更新为“继续学习”。旧布局中缺少的新系统卡片会以隐藏状态补齐，不覆盖用户既有布局。

实现新增 `src/features/home-learning/` 下的摘要类型、Review/Reading/Video/Notes 适配器、三类本地恢复存储与聚合 Hook，并新增 `src/components/home/learning/home-learning-cards.tsx`。Review 存储增加兼容的 result-bearing reader，可区分首次空状态、损坏数据与不可用状态；首页准确计算逾期和今日到期、今日完成及本地日期的今日新增提醒。Reading 打开真实用户来源后保存段落/PDF 页位置并派发进度事件；Video 以 12 秒节流保存位置，并在暂停、结束、隐藏、卸载时刷新，完成阈值为 98%；学习笔记仅从用户选择且仍存在的 Vault 目录中按 `updatedAt` 选择最近项，并在目录对话框中支持多选和失效目录提示。

路由与交互方面，`/reading?sourceId=` 能打开目标文章并恢复段落/PDF 页；`/review?intent=create-knowledge-point` 会在已有项目时直达知识点表单、无项目时先创建项目再继续；视频详情会读取恢复信息续播或对已完成视频从 0 重新开始。首页移除了“数学 2h10m、英语 1h20m、自控 1h05m”和“线性代数 42 min”等硬编码展示，新增学习目录配置弹层，并以应用语义主题令牌提供键盘焦点、进度条 ARIA 值、窄栏滚动及六种主题可读性基础。

验证完成：定向 ESLint 无 error（仅保留原有 `home-page.tsx` `<img>` 优化 warning）；6 个定向 Vitest 文件、42 项通过；`npm run build` 成功且 `/reading`、`/review` 为动态路由；`git diff --check` 通过；本地已有预览确认 `/`、`/reading?sourceId=missing` 与 `/review?intent=create-knowledge-point` 均返回 HTTP 200。全仓 `npx tsc --noEmit` 仍返回 118 项既有错误；筛查确认本次新增/修改的学习卡片、Reading、Video、Review 与路由文件均不在错误清单。本次没有提交或推送 Git 改动，且未覆盖用户原有未提交文件。


## Engineering trajectory: 首页应用主题与系统明暗冲突修复（2026-08-20）

用户报告系统浅色、应用主题「夜间」时，首页今日复习卡出现深色背景与深绿前景，正文实测约 2.09:1，属于阻断性的 WCAG AA 缺陷。根因是 `home-demo-workbench.css` 同时将系统颜色写入首页及卡片 `--card-*` 变量、又让新增学习卡片直接消费全局 `--app-*` 变量；系统浅色选择器还以较高特异性写入绿色文字和浅色卡片层，从而与夜间应用主题的深色容器发生错配。

修复没有改动全局主题或插件系统，而是在 `home-demo-workbench.css` 的末尾增加应用主题优先的首页令牌层：只要 `.desktop-app-shell[data-app-theme]` 存在，首页容器、列、Widget、学习摘要卡片、操作与进度条均从同一套 `--app-*` / `--accent-*` 令牌派生；系统明暗只保留未选择应用主题时的回退职责。`night` 与 `solarized` 显式为 `color-scheme: dark`，其他应用主题为 `light`，从而避免原生控件再次按系统浅色反向渲染。

验证覆盖静态与实际浏览器两层：按白、纸张、薄荷、棕褐、夜间、Solarized × 系统浅/深共 48 组正文、次级文字、强调动作和主按钮前景/背景组合进行 WCAG 公式校验，最低值为 5.78:1；使用本地 macOS Chrome 的 Playwright 实际渲染系统浅色 + 应用夜间，首页 Review 卡容器为 `rgb(33, 34, 38)`、正文为 `rgb(182, 180, 189)`、操作为 `rgb(228, 200, 120)`，实测分别为 7.76:1 与 9.71:1，且根 `color-scheme` 为 `dark`。定向 ESLint 无 error（仅沿用既有 `home-page.tsx` `<img>` warning）；首页与学习摘要 13 项 Vitest 通过；`npm run build` 和 `git diff --check` 均通过。临时校验脚本已删除；未提交或推送 Git 改动。

## Engineering trajectory: 首页新增按钮溢出与滚动条隐藏（2026-08-20）

用户截图中的顶部新增按钮残留了可见的“添加组件”文本，而按钮又被公共工具栏规则限制宽度，文字因此从按钮底部溢出。`home-page.tsx` 将其收敛为只有 `PlusIcon` 的 32×32 图标按钮，以 `aria-label` 提供可访问名称、以 `title` 提供悬停提示；`home-demo-workbench.css` 固定按钮尺寸、清零 padding 并隐藏溢出。首页所有内部滚动容器及承载首页的桌面内容视口同时统一隐藏 Firefox、旧 Edge 和 WebKit 滚动条，但保留原有 `overflow: auto` 与滚动能力。

`desktop-home-shell.test.tsx` 现断言新增按钮没有文本节点、具有提示且仍能打开组件库；新增 `home-hidden-scrollbars.test.ts` 固化首页滚动条覆盖范围。浏览器在 480、720、1280、2048px 下确认按钮始终为 32×32、唯一子节点为 SVG、图标未越界；当前首页所有实际滚动容器的计算 `scrollbar-width` 均为 `none`。相关 3 个测试文件 10 项通过，定向 ESLint 无错误（仅保留既有 `<img>` warning），`git diff --check` 与 `npm run build` 通过。未提交或推送 Git 改动。


## Engineering trajectory: 首页全 Widget 主题令牌收敛（2026-08-20）

用户补充截图后指出，纸张主题已在设置中选择，但首页仍有部分组件保留系统浅色外壳。实机 CSS 审计确认上次修复只统一了 header 与学习摘要卡；系统浅色规则此前以 `background: linear-gradient(...)` shorthand 写在 `.demo-widget` 上，而应用主题层仅写 `background`，在特异性与背景简写层叠下，Widget 外壳仍保留浅色渐变。该问题影响了默认 10 个 Widget，也会影响从组件库添加的非默认插件卡。

修复继续集中于 `auris/src/components/home/home-demo-workbench.css`：应用主题层现在显式清除 `.demo-widget` 的 `background-image` 并设置 `background-color`，同时统一标题栏、旧 Widget 正文/表单/按钮、倒计时、Pomodoro、Nia、进度条、快速捕捉、布局菜单、组件库与确认浮层的前景/边框/容器令牌。`!important` 仅用于对抗既有系统层的 legacy shorthand，选择器严格限定在 `.desktop-app-shell[data-app-theme] .auris-demo-home`，不改变其他页面或系统回退模式；Widget 的布局、交互及人生阶段按主题的场景配色均保留。

验证使用本地 macOS Chrome + Playwright，在系统浅色下分别载入纸张和夜间主题。默认 10 个首页 Widget 的外壳由纸张 `rgb(245, 240, 227)` 切换至夜间 `rgb(33, 34, 38)`，标题栏与前景同时变化；再以完整布局注入审计全部 20 个注册 Widget（包含 Reading、Pomodoro、Habit、Nia、Clock、Weather、Music 等非默认插件），容器和前景均随主题切换。首页/学习摘要 13 项 Vitest 通过，定向 ESLint 无 error（既有 `<img>` warning 未变），`npm run build` 与 `git diff --check` 通过。两份一次性浏览器审计脚本已删除；未提交或推送 Git 改动。

## Engineering trajectory: 首页 To Do List 拉伸与卡片重设计（2026-08-20）

用户截图显示「今日任务」Widget 拉高后，内层 `home-v3-plan` 仍保持内容固有高度，导致底部操作区停在上方。修复采用「摘要→进度→可滚动清单→底部操作」的四行 Grid：内层卡片完整继承 Widget body 高度，任务区吸收所有拉伸空间，添加与导出操作稳定贴底。视觉上移除重复的内层「今日任务」标题，增加进度摘要、清单横线、完成反馈和居中空状态；280px 以下容器宽度将记录/导出收成图标，避免窄栏文字换行。

改动涉及 `auris/src/components/home/plan-list.tsx`、`auris/src/components/home/home-v3.css` 和新增的 `auris/tests/component/home/plan-list.test.tsx`；任务的新增、编辑、完成、删除、记录及导出契约均保留。定向 ESLint 和 `git diff --check` 通过；2 个组件测试文件共 10 项 Vitest 通过；`npm run build` 成功。真实浏览器将任务卡从 356px 拉高到 536px，内容区同步从 320px 增至 500px，底部操作栏仍距卡片底边 12px；1180px 视口下无横向溢出。未提交或推送 Git 改动。


## Engineering trajectory: 首页组件设置层主题与强对比收敛（2026-08-20）

用户截图显示 Widget 的“更多操作”设置菜单仍停留在旧浅色层，尺寸选项、辅助文案、移动/隐藏项以及编辑状态的对比不足。审计确认这些交互元素没有被上一轮 `.demo-widget` 外壳覆盖：`demo-widget__menu`、布局管理、组件库、确认弹层、编辑条、拖拽提示、尺寸把手、分栏拖柄和空/投放状态均保留了早期硬编码颜色。

`home-demo-workbench.css` 已新增严格限定在 `.desktop-app-shell[data-app-theme] .auris-demo-home` 的交互层令牌规则。所有上述浮层均使用不透明 `--app-surface`（并清除旧背景图），正文使用 `--app-text`、提示使用 `--app-muted`、普通操作使用 `--app-fill`，选中状态使用 `--accent-strong` + `--accent-ink`；disabled 项保持可辨认的 `--app-muted` 前景和受限 opacity，而非以低对比淡出。背景遮罩、编辑/拖拽手柄、分栏拖柄、投放预览和空状态也统一使用应用主题令牌，从而满足“内容对背景强对比”的原则。

本地 macOS Chrome + Playwright 在系统浅色下实际打开纸张与夜间主题的 Widget 设置面板：纸张菜单为 `rgb(245, 240, 227)` 配 `rgb(58, 51, 36)`，夜间菜单为 `rgb(33, 34, 38)` 配 `rgb(233, 231, 236)`；选中尺寸项、提示和普通动作按钮均随主题变化。回归中发现首页组件测试没有显式 `cleanup()`，`useHomeLearningSummary` 的异步更新可在用例间残留，导致整文件测试偶发找不到日历/计划操作。为测试隔离，在 `tests/component/home/desktop-home-shell.test.tsx` 加入了 `afterEach(cleanup)`；该文件现 8 项全通过。生产构建、定向 ESLint（仅既有 `<img>` warning）与 `git diff --check` 均通过。一次性面板审计脚本已删除；未提交或推送 Git 改动。


## Engineering trajectory: 首页 Widget 设置功能移除（2026-08-20）

用户确认无需每张卡片的设置面板，希望自行决定内容，因此要求删除 Widget 设置按钮及相关逻辑，而不改动其他首页内容。实现仅修改 `auris/src/components/home/home-page.tsx`：移除了每张 Widget 标题栏中的“更多操作”按钮、菜单渲染、菜单状态 `menuId`，以及由该菜单独占的高度预设、固定标记切换、复制、菜单内跨栏移动、隐藏与删除回调。保留了 Widget 内容、今日任务的新增/编辑/完成/删除、笔记与学习恢复入口、全局布局管理、组件库、全局编辑模式、标题栏拖动、专注查看、布局持久化与既有已隐藏组件的恢复入口；拖拽跨栏与编辑模式的高度把手也保持不变。

同步更新 `tests/component/home/desktop-home-shell.test.tsx`：显式断言不再存在“更多操作”按钮或 `.demo-widget__menu`，并保留任务工作流回归。2 个定向测试文件共 13 项通过；定向 ESLint 无 error（仍有既有 `<img>` 优化 warning）；`npm run build` 与 `git diff --check` 通过。未提交或推送 Git 改动。
