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


## Engineering trajectory: Widget 单一删除入口恢复（2026-08-20）

用户在移除完整 Widget 设置菜单后发现无法删除组件，要求仅恢复删除键。`auris/src/components/home/home-page.tsx` 现为每张 Widget 标题栏增加单一垃圾桶图标按钮，`aria-label` 为“删除组件 {名称}”；按钮使用既有 `useNotesDialog` 的确认流程，确认文案明确提示默认组件可通过“恢复初始布局”重新添加。确认后仅从当前 Workspace Layout 中移除对应实例并更新布局状态提示；取消不会改变布局。没有恢复“更多操作”菜单、尺寸预设、固定、复制、菜单内移动或隐藏逻辑，任务自身的删除操作也未受影响。

`tests/component/home/desktop-home-shell.test.tsx` 新增完整确认回归：点击第一张卡片的删除按钮会打开 `alertdialog`，确认后记录日历从页面消失，且仍无“更多操作”菜单。首页与学习摘要两个测试文件共 14 项通过；定向 ESLint 无 error（仍有既有 `<img>` warning），`npm run build` 与 `git diff --check` 通过。未提交或推送 Git 改动。

## Engineering trajectory: 首页工作台无装饰线条（2026-08-21）

用户要求隐藏首页的所有装饰性线条，同时不改变原有功能。实现仅修改 `auris/src/components/home/home-demo-workbench.css`，在现有主题覆盖规则之后追加首页作用域样式：移除三栏容器、组件卡片、标题分隔、布局管理浮层、编辑工具条、弹层以及拖放预览的边框、分隔线和阴影，并关闭首页背景网纹。按钮、布局选择、拖放、焦点可见性和表单操作仍保留；进度条、人生阶段时间路径与其他承载状态或内容含义的元素未被隐藏。键盘焦点使用明确的金色 outline，以避免去除边框后损失可访问性反馈。

已执行 `git diff --check`；6 个首页相关 Vitest 文件、18 项测试全部通过。测试输出保留仓库既有的 React `act(...)` 警告，但无失败。`npm run build` 成功完成，Next 路由构建正常。未提交或推送 Git 改动。

## Engineering trajectory: Notes 设置 Vault、文件与文件夹管理（2026-08-22）

用户要求补齐 Vault 删除能力，并可在 Notes 的设置中管理当前 Vault 内的文件和文件夹。实现新增 Settings 侧栏的 **Notes** 分类及 `NotesVaultSettings` 面板：它列出已授权 Vault、允许通过原生目录选择器添加、打开、仅从 Auris 列表移除，或将整个 Vault 移入系统回收站；面板同时列出当前 Vault 的可搜索文件/目录、可按相对路径新建 Markdown 文件或文件夹，并可将其中任意文件或目录移入 Auris 回收站。

桌面端新增受信任的 `vault:remove-root` 与 `vault:trash-root` IPC。两者都只接受已授权的 Vault 根；删除整个 Vault 走 `shell.trashItem` 而非永久删除，并拒绝删除包含另一个已登记 Vault 的目录。若移除或删除的是活动 Vault，主进程会切换到第一个仍可达的已登记根，否则清空活动根、刷新 watcher 和插件运行时。改动涉及 `auris/electron/main.cjs`、`auris/electron/preload.cjs`、`auris/src/platform/desktop/desktop-bridge.ts`、`auris/src/components/settings/auris-settings.tsx`，以及新增的 Vault 设置 TSX/CSS 和组件测试。

验证完成：新增 Vault 设置组件测试 2 项通过；相关的 Workspace Rail、Vault 根目录和 Vault 文件操作测试共 54 项中 54 项通过；定向 ESLint、`npm run build` 与 `npm run quality:desktop-ipc` 均通过（IPC 契约报告 108 invokes、110 handlers）。另一次包含 `auris-settings-feature-truthfulness.test.tsx` 的回归运行有 1 个既有失败：该测试期望文件设置页仍显示已不存在的“512 KB / 50 个版本 / Hot Exit”说明；`git show HEAD` 确认此说明在本次改动前已不在该页，故未为了通过测试恢复不真实的文案。未修改既有的个人词汇索引或其他未追踪资料目录；未提交或推送 Git 改动。

## Engineering trajectory: Notes 文件浏览器统一网格与列表视觉系统（2026-08-22）

用户要求只重构 Notes 的文件浏览与呈现区域，不触碰侧边栏、Vault/笔记读取写入逻辑、编辑器、路由或全局主题系统。实现保留原有文件搜索、排序、Grid/List 切换和打开笔记行为，集中调整 `notes-folder-browser.tsx`、其全局样式和两组回归测试。网格卡片现在采用固定 180px 的纵向结构：图标与单行标题、固定两行预览区域、弹性内容区和底部元数据使用统一基线；空预览保留空间但不显示占位噪音；时间缺失时隐藏而非渲染破折号；文件类型通过同一 `fileTypeLabel` 在 Grid/List 中都显示精简标签（Markdown 为 MD）。

列表重构为共享 `minmax(0, 1fr) 172px 120px` 列定义的真实文件列表，表头和行使用完全相同的 Grid；默认行保持透明与底部分隔线、hover 才显示轻微表面；名称包含可选的次级目录信息，时间和类型保持稳定对齐。工具栏控件统一为 36px 高及同一圆角；大屏四列、1399px 以下三列、1099px 以下两列、窄屏单列；列表在 920px 以下先隐藏 Type，在 700px 以下再隐藏次级路径信息。所有新样式仅使用既有 `--notes-*` 与 accent 令牌，静态主题断言覆盖 white、paper、mint、sepia（棕褐）和 night。

验证完成：文件浏览器组件和样式测试 16 项通过；包含 NotesPageClient 的定向回归共 34 项通过；定向 ESLint、`git diff --check` 与 `npm run build` 均通过。NotesPageClient 套件仍输出仓库既有的 React `act(...)` 警告，但无测试失败。未修改本次范围以外的既有未提交文件，未提交或推送 Git 改动。

## Engineering trajectory: 笔记文件夹列表仅展示 Markdown（2026-08-22）

用户希望 Notes 的文件夹列表不再暴露 Vault 中的 `.vmark` 元数据、JSON 和未知文件，只显示可作为笔记阅读与编辑的 Markdown 文档。实现选择在 `NotesFolderBrowser` 的展示层进行格式筛选：在原有搜索和排序前，仅保留 `formatId === "markdown"` 的 `NoteDocument`，因此底层 Vault 文件仍被保留，文件树和其他功能也不受影响；已注册的 Markdown 扩展仍统一按 Markdown 类型展示。

改动涉及 `auris/src/components/notes-v2/notes-folder-browser.tsx`，新增 Markdown 文档的预筛选；以及 `auris/tests/component/notes/notes-folder-browser.test.tsx`，使测试数据可声明格式，并新增 JSON Vault 元数据不会出现、计数只包含 Markdown 的回归断言。使用仓库现有依赖运行 `node_modules/.bin/vitest run tests/component/notes/notes-folder-browser.test.tsx`，8 项测试全部通过；定向 ESLint 与 `git diff --check` 通过。首次用 pnpm 运行检查因现有 node_modules 并非由 pnpm 安装而触发依赖状态检查失败，并生成了临时 `pnpm-lock.yaml` 和 `pnpm-workspace.yaml`；这些临时文件已删除，随后改用仓库现有的本地二进制完成检查。未修改既有的 `src/features/dictionary/personal-vocab/word-index.json` 或仓库外未跟踪目录；本次未提交或推送 Git 改动。

补充验证：随后执行的 `npm run build` 在仓库既有的测试类型错误处失败（包括桌面桥接 mock 缺少字段、`SessionSourceType` 过期值和导出服务测试的隐式 `any`）；失败输出未涉及本次修改的 `notes-folder-browser` 组件或测试文件。定向组件测试与 ESLint 已通过，故未扩大本次范围去修复这些无关的全仓问题。


## Engineering trajectory: Notes 文件夹浏览器 Markdown 全量显示与元数据修复（2026-08-22）

用户反馈文件夹浏览器只显示两个条目、列表行文件名和更新时间空白，且排序与网格/列表切换缺乏可感知反馈。本次将问题拆分为数据范围、文件元数据和呈现反馈三层处理。根因一是桌面 Vault 客户端把 `mtime` 硬编码为 `null`；二是全库临时加载会读取全部可编辑的未知/文本文件，任何无关读取异常都会丢弃整批结果，因而只保留已打开的少量 Markdown 文档。

实现中，`electron/vault/vault-file-walker.cjs` 为文件记录采集 ISO 修改时间，`desktop-bridge.ts` 与 `vault-client.ts` 将其传入 `VaultEntry`。`notes-workbench.facade.ts` 的全量浏览加载改为只读取 `formatId === "markdown"` 的文件，且最终聚合结果同样限定 Markdown；这使 Vault 根目录及子目录中的 `.md` 都被加载，同时避免 `.vmark`、JSON、Git 元数据等无关文件干扰。`notes-folder-browser.tsx` 显示当前排序和 Grid/列表模式，`globals.css` 为列表文件名、时间和类型设定主题令牌色，并为激活视图和模式切换加入清晰状态和短暂过渡。

新增/扩展 `vault-file-walker`、桌面 Vault 客户端和文件夹浏览器的测试，覆盖修改时间传递、只显示 Markdown、排序重排及视图模式反馈。定向 Vitest 共 4 个文件、21 项通过；定向 ESLint、样式令牌测试、`git diff --check` 和 `npm run build` 均通过。按实际桌面扫描逻辑检查 `/Users/apple/Desktop/考研`，确认递归扫描得到 25 个 `.md`，且 0 个缺失修改时间。最终 macOS 应用包已安装到 `/Applications/Auris.app` 并成功启动（Auris 1.0.1）。打包使用本地 macOS 产物且未发布 Release；因没有 Developer ID 证书，包保持未签名状态。未提交或推送本次改动，且未纳入词库索引或既有未跟踪目录。

## Engineering trajectory: 今日任务批量录入（2026-08-23）

用户希望点击“添加任务”后一次输入全部任务，而不是每次先创建一条空任务。`plan-list.tsx` 已改为在卡片内打开批量录入面板：每行解析为一项任务，忽略空行，并自动去除数字序号、项目符号和 Markdown 复选框前缀；面板实时显示有效任务数，支持 Ctrl/Cmd+Enter 提交与 Escape 取消。`home-page.tsx` 将有效任务在一次持久化更新中创建，保留原有单项编辑、完成、删除、记录与导出行为；组件边界保留旧 `onAdd` 兼容层，因此未修改历史备份文件。`home-v3.css` 新增与当前 Auris 主题令牌一致的纸张式多行编辑区和窄卡片响应式布局。

回归测试覆盖批量解析、一次提交、持久化后继续编辑/完成/删除及原有首页功能；首页相关 7 个测试文件、30 项全部通过。定向 ESLint 无错误（仅保留 `home-page.tsx` 既有 `<img>` 优化警告），`npm run build` 和 `git diff --check` 通过。未提交或推送 Git 改动，未触碰其他已有未提交文件。

## Engineering trajectory: 外观设置窗口与专注模式接线（2026-08-23）

用户指出“在标题栏显示文件名”、“自动隐藏状态栏”和“暗化程度”仅改变设置页内部状态，没有任何运行时消费者。实现新增 `app-window-preferences.ts` 与订阅 hook，统一存储、归一化并广播三项偏好；设置页在 mount 后恢复偏好，任意改动立即持久化，并纳入既有设置导入/导出。Toggle 同时补足了可键盘操作的 `switch` 语义。

Notes 笔记页在开启标题偏好时将当前文件名写入 Electron 窗口标题，离开笔记或关闭偏好后回复 `Auris`。自动隐藏状态栏作用于 Notes 底部左右状态簇：停止交互 1.4 秒后淡出，指针、键盘、点击或焦点交互会立即恢复，并保留 `prefers-reduced-motion` 兼容。专注模式的非活动内容可见度明确定为标准 30%、强 16%、更强 7%，活动编辑块始终保持 100%。

新增偏好归一化/持久化、设置控件、Notes 运行时数据属性和桌面标题回归；定向 8 个测试文件、78 项全部通过。定向 ESLint、`git diff --check` 和 `npm run build` 均通过。未提交或推送 Git 改动，未纳入既有个人词库或未跟踪资料目录。

## Engineering trajectory: 继续学习组件扫描 Notes Vault（2026-08-23）

用户希望“继续学习”的学习笔记入口直接扫描 Notes 当前 Vault，而不是再选择一组独立的学习子目录。实现移除首页专用的目录选择弹窗、localStorage 配置和目录有效性判断；学习笔记摘要现在通过平台统一的 `NotesStorage` 检查 Vault 配置，并调用 `listPages()` 扫描整个 Vault，仅保留 `.md` 路径后按 `updatedAt` 选择最近笔记。桌面存储本身递归使用 `listMarkdownFiles()`，浏览器存储也递归目录并跳过非 Markdown 文件，因此组件与 Notes 使用同一 Vault、同一解析结果和同一变更订阅。

界面在扫描期间显示禁用的“扫描中”，有结果时直接打开最近笔记，没有结果或 Vault 不可用时引导进入 Notes。改动涉及首页学习摘要、摘要 hook、继续学习卡片、首页装配与对应单元测试，并删除已无消费者的 `learning-note-folders-store.ts`。

发布前全量回归最初暴露 8 个长期漂移的测试文件、23 项失败：终端测试仍断言旧 `create` 契约而运行时已使用 `resume`；源码编辑器测试仍把独立标题输入框算作 CodeMirror 第一行；排版与欢迎页样式测试固化了旧默认值和 CSS 单行格式；设置真实性测试仍要求已删除的空壳历史文案；审批测试没有区分 owner 校验；PDF 导出 mock 没有覆盖可选参数；词库契约未包含新增 context，且 150 个轻量词条没有 `sections`。测试已更新为当前真实契约，词库分组函数对缺失章节返回空集合，保留现有词库数据并避免运行时崩溃。

版本更新至 1.0.2。最终 `npm test` 为 371 个文件、2767 项全部通过；定向 ESLint 通过，`git diff --check` 和 Next 生产构建通过；`desktop:build:verify` 完成打包隐私审计、原生模块探测与桌面工具烟雾测试。macOS arm64 的 DMG、ZIP 和应用包生成成功；本机没有 Developer ID，产物保持未签名。全仓 ESLint 仍会把仓库根部旧 CommonJS 兼容入口的 `require()` 当作 90 项规则错误，本次没有为追求形式通过而把 Electron 启动文件错误迁移到 ESM。既有个人词库索引变化与未跟踪研究目录未纳入发布提交。

后续实机反馈发现组件标题与点击后打开的笔记不一致。根因有两处：普通 Markdown 没有 Auris `updatedAt` frontmatter 时，解析器会用扫描时刻作为更新时间，导致每次扫描都把文件误判为刚更新；同时卡片传递旧 `NotePage.id`，而 Notes 工作台按 Vault 路径恢复，匹配失败后会回退到自身最近文档。修复让桌面扫描使用文件 `mtime`、浏览器扫描使用 `File.lastModified`，并让卡片以 `relativePath` 作为恢复参数；新增解析器、桌面存储和卡片导航回归。定向 ESLint、4 个文件 15 项定向测试、全仓 372 个文件 2770 项测试、`git diff --check` 与 Next 生产构建均通过。此次修复尚未提交或推送，既有个人词库和未跟踪资料目录保持不动。

## Engineering trajectory: Auris 紧凑胶囊侧边栏与夜间模式适配（2026-08-25）

按 `PRD-auris-reference-compact-sidebar.md` 规范重构 Auris 桌面侧边栏，将原本 48px/74px 贴边通顶条改造为 30px 悬浮胶囊 Rail（8px 外边距、15px 圆角、28px 项目尺寸与 14px 图标）。收缩态移除了粒子爆发（burst/particle）、水波纹（ripple）与冲击环等冗余动画层，激活态采用 2×20px 珊瑚橙（`#E55E51`）垂直指示条与沉浸微发光；全面对齐 Night 深色主题（Rail 背景 `#2B2E33`、激活项目背景 `#333D4B`、激活图标 `#6BA4F8`）并为全部 6 套主题提供颜色令牌映射。

改动集中在：
1. `auris/src/components/desktop/desktop-app-sidebar.tsx`：精简收起态组件结构，移除粒子/水波纹状态及 DOM，保留所有 7 条导航路由、阅读精选子树、Vault 开关及 Next.js prefetch/transition 快速导航契约。
2. `auris/src/styles/auris-redesign.css`：收敛 sidebar 尺寸令牌与 Night 语义色；重写 Section 5 样式，实现 30px 悬浮胶囊、28px 项目、珊瑚橙激活指示条与 240px 悬浮展开菜单；更新 Notes 视图左侧角标偏移公式。
3. `auris/tests/unit/desktop/desktop-sidebar-reference-geometry.test.ts`：新建几何契约单测，覆盖 30px 宽度、8px 偏移、15px 胶囊圆角、28px 项目、14px 图标、2×20 指示条及 Night 主题色，防止历史 48/74/78px 宽度与金色选中色回潮。
4. `auris/tests/component/runtime/desktop-app-sidebar.test.tsx`：更新导航测试，移除对已下线粒子和 `data-bursting` 属性的断言，保留快速导航调度与防重复点击回归。

验证通过：
- 定向 Vitest：`desktop-app-sidebar.test.tsx`、`desktop-app-frame.test.tsx`、`desktop-sidebar-reference-geometry.test.ts` 共 3 个文件、33 项测试全部通过。
- 定向 ESLint 0 错误 0 警告；`git diff --check` 无空白或格式问题。
- `npm run build` Next.js 生产构建完成并成功输出所有 22 个静态/动态路由。
- 历史代码已备份至 `auris/docs/homepage-backups/2026-08-25-compact-sidebar/`。未提交或推送 Git 改动。

## Engineering trajectory: 桌面灵动岛全栈验证与 Proma 对标（2026-08-26）

用户要求参考 Proma（proma-ai/Proma）灵动岛功能完成 Auris 桌面灵动岛。代码审查确认前一次会话已完成 95%+ 的全栈实现；本次工作集中在架构审计、打包验证、实机烟雾测试和缺口排查。

### 与 Proma 对标

Proma 灵动岛为 Agent 运行状态监视器（idle/working/waiting），仅展示 Agent 状态。Auris 灵动岛在交互深度上超越 Proma：支持今日任务直接勾选、间隔复习知识点深链、隐私模式、悬停自动展开/收起状态机。技术方案一致：NSPanel + stdin/stdout JSON 行跨进程通信。

### 验证的完整组件清单

- **数据层**：`desktop-island.types.ts`（5 类型）、`desktop-island-projection.ts`（投影）、`desktop-island-contract.cjs`（严格验证）
- **主进程**：`desktop-island-service.cjs`（状态机 compact/expanded/hidden）、`mac-desktop-island-native-host.cjs`（helper 生命周期）
- **main.cjs**：5 个 IPC handler（L3451-3477）、`app.whenReady()` 初始化（L4299-4326）、`before-quit` dispose（L4384）
- **原生 Helper**：`AurisDesktopIslandHelper.swift`（359 行，NSPanel + SwiftUI CompactView/ExpandedView）
- **渲染器**：`preload.cjs`（6 方法桥接）、`desktop-island-sync-host.tsx`（根布局挂载，多事件源监听 + 意图队列重放）
- **设置**：`auris-settings.tsx` 中 3 个 toggle（显示/悬停展开/隐私模式）
- **打包**：`electron-builder.yml` L64-66 `extraResources` 包含 helper、`scripts/build-desktop-island-helper.cjs` 支持 arm64/x86_64、`package.json` 注册 `desktop:island:build`
- **默认配置**：`createDefaultDesktopConfig()` 仅在 `process.platform === "darwin"` 时启用

### 实机验证结果

- `npm run desktop:dev`：Electron PID 6345 启动后，AurisDesktopIslandHelper PID 6356 以父 PID 6345 为参数运行
- helper 二进制：`Mach-O 64-bit executable arm64`，697KB，可执行
- 退出清理：kill Electron 后 3 秒内 helper 进程消失（Swift 端 `monitorParent()` 孤儿检测生效）
- 无内容时灵动岛保持 hidden（`currentPresentation()` 在 `hasContent === false` 时返回 hidden，不缓存）

### 测试与构建

- 灵动岛定向测试 4 文件 9 项 + 首页回归 11 文件 35 项全部通过
- ESLint 定向 0 错误
- `npm run build` Next.js 生产构建成功

### 设计稿

已有 `docs/designs/2026-08-26-auris-dynamic-island-compact.png`（收起态药丸）和 `2026-08-26-auris-dynamic-island-expanded.png`（展开态双栏）。新设计稿因图片生成配额限制未能重新生成。

### 后续风险

1. 尚未在有真实任务和复习数据的环境下验证灵动岛可见效果（当前测试数据为空，island 保持 hidden）
2. Intel Mac 需要单独编译 x86_64 产物（脚本已支持，但无测试机验证）
3. `openMainRoute` 使用 `loadURL` 而非 Next.js 客户端路由，会导致 review 深链触发页面重载而非 SPA 跳转

未修改任何代码文件。未提交或推送 Git 改动。

## Engineering trajectory: Auris 桌面灵动岛实现补齐与原生验收（2026-08-26）

用户确认按收起态 430×40px、展开态 560×310px 的设计标准开始实施，并在后续要求核实先前“完成报告”是否属实。本轮不把报告截图当作运行证据，而是从当前工作树补齐实现并独立验证。方案保持 Auris 的任务与输出复习 localStorage 为唯一内容真相源：新增纯投影、根布局 `DesktopIslandSyncHost`、严格主进程 contract、待确认的幂等 `set-task-done` 意图队列和 `/review?knowledgePointId=` 深链；主进程只接受固定动作，不暴露任意 URL、路由或脚本执行。

原生层新增 SwiftUI/AppKit `NSPanel` helper，支持 hidden/compact/expanded、300ms 悬停展开、420ms 移开收起、当前快照 dismiss、全 Space/全屏辅助窗口、外接屏菜单栏回退、父进程/EOF 退出监控。收起态实现任务环形进度、任务/复习数量、分隔线和逾期提示；展开态实现三条可勾选任务、进度条、一条最急复习卡、任务/复习深链、隐私模式、收起/关闭按钮与“数据已同步至 Auris”底栏。设置页新增显示、悬停展开和隐私模式三项持久化开关。

构建链新增 `scripts/build-desktop-island-helper.cjs`，产物位于 `build/native/desktop-island/<arch>/`，并由 macOS 专属 `extraResources` 复制到 `Auris.app/Contents/Resources/native/desktop-island/AurisDesktopIslandHelper`，避免进入 asar。开发态与发布构建均先编译 helper；打包验证脚本检查可执行位、Mach-O 类型，并在存在应用签名时执行 deep/strict 校验。

验证结果：Swift helper 编译成功，`file` 确认为 arm64 Mach-O，`LC_BUILD_VERSION` 最低 macOS 12.0；Next.js 生产构建成功；灵动岛、首页、回顾、设置、桌面 runtime 与 IPC 合约共 10 个测试文件、43 项通过；定向 ESLint 0 error（仅首页既有 `<img>` 1 条警告），IPC 合约为 113 invoke / 115 handler，`git diff --check` 通过。electron-builder `--mac --dir` 成功，打包版 helper 存在且可执行；实际启动打包版 Auris 后 helper 以主进程 PID 运行，退出后无残留进程。用完全合成数据实机截取 compact 与 expanded 原生窗口，确认两态尺寸、内容、操作按钮、进度与同步底栏可见。当前本机没有 Developer ID，electron-builder 明确跳过正式应用签名；helper 只有 linker ad-hoc 签名，正式 Release 仍须由 CI 的 Developer ID 完成全包签名与公证。Intel 路径由脚本分架构生成，但未在 Intel 实机验证。

最终全仓回归首次发现既有首页高度链契约与样式不一致，按既有测试要求为 home workspace 的 `height/min-height` 补回 `!important`；随后一次全量运行暴露阅读器在无 `scrollIntoView` 的测试/嵌入环境会抛异步异常，增加函数能力检测后安全降级。定向用例通过后，最终 `npm test` 为 381 个文件、2820 项全部通过且无未处理错误；再次执行 Next.js 生产构建与 `git diff --check` 均成功。

改动集中在 `auris/electron/desktop-island/`、`auris/native/desktop-island/`、Electron main/preload、桌面桥、根同步 Host、任务存储、回顾深链、设置页、构建脚本/配置及对应测试。工作在 `codex/auris-dynamic-island` 分支完成，未提交或推送；工作树中原有个人词库、Notes 与首页学习卡等无关变更保持未触碰。

用户选择本地合并与更新应用后，仅将上述灵动岛文件提交为 `36eefd3`，未纳入工作树既有的词库、Notes、首页学习卡等改动；`main` 已从 `5807aa3` 快进合并到该提交，功能分支随后删除。合并结果再次执行全仓 381 个文件、2820 项测试并全部通过。重新编译 helper、Next 生产包、standalone 运行时及 macOS arm64 `.app` 后，旧 `/Applications/Auris.app` 已正常退出并移动到可恢复备份 `/Applications/Auris.app.backup-before-dynamic-island-20260826`，新版安装到原路径。旧应用遗留的 Notes MCP sidecar PID 2095 在确认身份后终止；新版 Auris PID 20507 启动成功，打包内 helper PID 20547 以主进程 PID 为父参数运行。

### 灵动岛点击外部自动收起（2026-08-26）

用户实机确认点击胶囊展开正常，希望点击桌面其他空白区域即可收起。Swift helper 新增互补的 `NSEvent` local/global mouse-down monitor：应用内部点击由 local monitor 观察，桌面或其他应用点击由 global monitor 观察；事件只旁观并原样返回，不吞掉用户原点击。只有当前 presentation 为 expanded 且鼠标坐标不在 `NSPanel.frame` 内才发出固定的 `set-expanded: false`，因此任务勾选、开始复习和面板内按钮不会误收起。增加 `collapseRequested` 门控，在主进程返回下一份 snapshot 前最多发送一次收起请求；helper 退出时移除两个 monitor。

新增原生源码契约测试覆盖双 monitor、实际窗口边界、事件不拦截、单次请求和清理；Swift helper 编译成功，灵动岛定向 4 个文件、11 项通过，`git diff --check` 通过。系统自动点击命令因本机未授予 osascript 辅助访问而返回权限错误，但该尝试仍产生了原生 outside-click 动作；功能实现不依赖辅助功能权限或 CGEventTap。

改动提交为 `2f9783b` 并快进合并到本地 `main`，临时分支已删除。重新打包 macOS arm64 应用后，上一版安装移动到 `/Applications/Auris.app.backup-before-click-away-20260826`，新版已安装并启动；Auris 主进程 PID 21342，打包内原生 helper PID 21385。更早的 `/Applications/Auris.app.backup-before-dynamic-island-20260826` 仍保留，用户数据目录未变更。

用户要求推送 GitHub 并更新版本后，`package.json` 与 `package-lock.json` 的应用版本由 1.0.3 升至 1.0.4，提交为 `fe0bf8f`。生产构建通过，`main` 从 `5807aa3` 到 `fe0bf8f` 已推送至 `https://github.com/xhslam/auris.git`，随后 fetch 验证 `origin/main...main` 为 0/0。重新生成 1.0.4 的 helper、standalone 和 macOS arm64 `.app`；安装阶段第一次尝试因 zsh 不拆分多行 PID 而在覆盖前安全中止，确认旧应用仅剩 4 个 Notes MCP sidecar 后逐个终止。旧 1.0.3 安装保存在 `/Applications/Auris.app.backup-before-1.0.4-20260826`，新版 `/Applications/Auris.app` 的 Info.plist 确认为 1.0.4，主进程 PID 22803、helper PID 22872 正常运行。现有本机无 Developer ID，生成的本地包仍为未正式签名开发包。

## Engineering trajectory: 终端中文路径 locale 回归修复（2026-08-27）

用户更新后的终端提示符将中文目录显示为 `�\M-...`。用 `LC_ALL=C` 在同一中文工作目录启动 zsh 可稳定复现，确认是 Electron 从 Finder/更新启动时继承了缺失或非 UTF-8 locale，zsh 在生成提示符时已将中文字节转义，不是 xterm 字体或渲染问题。

修复同步落在实际打包入口 `auris/electron/terminal-session-manager.cjs` 与保留的根目录副本 `auris/terminal-session-manager.cjs`：POSIX 会话在有效 UTF-8 locale 下保持原值；只在有效 locale 缺失或为 `C` 等非 UTF-8 值时注入 UTF-8 `LANG`/`LC_CTYPE`，并在既有 `LC_ALL` 会覆盖分类 locale 时一并修正。Windows 仍沿用现有 code page 65001 逻辑。

新增回归断言覆盖 `LC_ALL=C` 修正与既有 `zh_CN.UTF-8` 保留。定向 Vitest 14 项通过，两份 CommonJS 管理器均通过 `node --check`，`git diff --check` 通过；真实 zsh 验证在输入 `LC_ALL=C` 时已正常输出 `~/Desktop/大学markdown/auris`，无 Unicode replacement character。未提交、未推送，未覆盖安装中的应用。

## Engineering trajectory: Reading 完形填空题型移除（2026-08-28）

用户确认 Reading 区的完形填空格式已淘汰。本次从 `ReadingExamType`、题型别名、题型标签、展示配置及专属 `cloze-sheet` CSS 中完整移除 `cloze`；其余阅读理解、新题型、翻译与写作题型保持不变。`__1__` 这类编号空仍保留为通用 Markdown 行内元素，以支持其他题型的空位表达。

旧 Markdown 中的 `## 题型: 完形填空`、`## 完形填空` 或 `Use of English` 不再被解析为考试内容，而是作为普通 Markdown 导入，避免旧数据触发已删除的展示配置；词典中已有的完形来源注释未改动。删除了本次刚生成的完形整理格式替换稿。

更新 Reading 组件、解析器、类型与回归测试；定向 Vitest 3 文件、33 项通过，定向 ESLint、`git diff --check` 与 `npm run build` 均通过。未提交或推送 Git 改动。

## Engineering trajectory: 完形填空复用阅读理解精读格式（2026-08-28）

用户补充阅读理解提示词后，明确完形填空不应恢复已淘汰的独立 `cloze` 类型，而应通过 `## 完形填空` 进入阅读理解现有的 0—10 精读流。解析器因此将“完形填空”识别为 `reading` 别名，但只在完整包含“一分钟读懂全文、逐句翻译和讲解、全文逻辑地图、长难句精讲、关键词与表达、阅读理解题精讲、同义替换、误解、大白话、记忆与最终压缩”11 个区块时启用；旧的 standalone cloze 结构继续作为普通 Markdown 处理。

序列化同步保留 `## 完形填空` 与 0—10 二级标题，避免首次导入后保存为扁平三级标题、再加载时丢失共用精读布局。新增首次导入、旧格式拒绝和保存往返回归。定向 Reading Vitest 4 文件、46 项通过，定向 ESLint、`git diff --check` 与 Next 生产构建均通过。

根据用户提供的阅读理解提示词，新增 `考研英语一完形填空真题整理提示词-阅读理解共用格式.md`。新提示词重点补齐逐句翻译和讲解：全文每句固定包含英文原句、答案补全句、中文、句子结构、语法现象、常见用法、词汇与表达及综合点评；同时保留年份顺序、PDF 保真、20 题解析、词库/JSON 同步、processing-record 和质量检查要求。未提交或推送 Git 改动。

## Engineering trajectory: 桌面打包 Next 运行时依赖修复（2026-08-28）

本地安装的 Auris 无法打开时，运行日志显示主进程正常启动但 Next utility process 在创建窗口前退出；根因是 standalone 输出缺少 `@swc/helpers`，补入后继续暴露 `@next/env` 缺失，证明问题是 Next 16 的输出文件追踪未打入完整运行时闭包，而不是单一模块遗漏。`scripts/assemble-standalone.cjs` 现在读取已安装 Next 的正式依赖，递归解析每个依赖的生产依赖并复制到 `.next/standalone/node_modules`；缺失依赖会在打包阶段抛出明确错误，不再生成可打包但无法启动的应用。

更新 `tests/unit/electron/desktop-packaging.test.ts`，用最小 Next 包清单断言 helper 被放入 standalone。定向 Vitest 10 项、定向 ESLint 与 `git diff --check` 通过。已将修复提交为 `2f58439` 并推送至 `main`。现有已安装 `/Applications/Auris.app` 采用同一闭包补齐后成功启动：Next server ready、主窗口 ready-to-show/loaded 与 Renderer 均已确认。未触碰用户数据；工作树其余未提交修改未纳入该提交。

## Engineering trajectory: Reading 题型画布居中（2026-08-28）

用户反馈 Reading 的题型内容在宽屏桌面壳中视觉偏移，希望获得以主内容区正中央为基准的阅读体验。问题处理限定为布局：`reading-workbench.css` 让阅读壳和页面显式占满可用内联尺寸并用 `justify-self` / `margin-inline` 锚定中心；考试内容再建立独立的居中画布，最大 1240px，所有题型共享该画布，精读原有的行宽设置仍在画布内生效。页面宽度与行宽的用户设置、移动端宽度约束、题型内容和解析逻辑均未改变。

新增 CSS 回归断言，防止未来移除外层、页面或考试画布的中心定位。Reading 样式、题型视图与工作台定向 Vitest 共 27 项通过，相关 TypeScript 定向 ESLint 与 `git diff --check` 通过。工作树原有的完形填空格式移除/复用修改保持未触碰；未提交或推送 Git 改动。

## Engineering trajectory: Reading 精选展示页编辑式重构（2026-08-29）

用户希望将导入后的 Reading 列表按参考图的布局直接还原，并保留 Auris 主题、导入与现有阅读器契约。实现将封面网格替换为大号无衬线粗标题、正在阅读窗口、日期横线和大留白文章列表；标题、正文与作者信息均使用 Hanken Grotesk / Noto Sans SC，日期使用等宽字体。内容画布桌面端为 1120px，文章正文相对日期轴内缩 18px。不复制参考配色，六套应用主题继续通过 Reading 语义令牌适配。

正在阅读窗口会以 22 秒周期往返滚动真实文章段落；默认展示英文，鼠标悬停或键盘聚焦时英文层向下离场、中文层从上方落入，离开后反向恢复。日期列表的摘要使用同一双语下切，标题与作者保持稳定，中文来自现有 translation / summary；无译文时提供诚实空态。系统开启减少动画时禁用滚动与过渡。为对齐参考图，原先的可见搜索/语言工具条与封面式视觉已移除；日期排序、导入分类、材料移动、删除和点击进入原阅读器保留。

改动限定在 `reading-library.tsx`、`reading-library.css` 及对应组件测试。定向 ESLint 通过，Reading Library Vitest 10 项通过，`git diff --check` 通过，Next.js 生产构建成功。Playwright 在 1440、720 和 480px 视口确认无横向溢出；悬停后英文层实测下移 112px 且 opacity 为 0，中文层回到原位且 opacity 为 1。未修改已有 Reading 工作台、题型、导入解析或其他未提交文件；未提交或推送 Git 改动。

### Reading 顶部标题中英切换（2026-08-29）

用户要求顶部 `Curated Reads` 改为 `Reading`，并在指针靠近文字时切换为“阅读”。标题现使用与内容双语窗口一致的纵向双层动画：英文向下离场，中文从上方落入，离开后恢复英文；键盘聚焦触发同样效果，并保留焦点反馈。减少动画模式下取消过渡。Reading Library 回归现为 11 项全部通过，定向 ESLint、`git diff --check` 与 Next.js 生产构建通过。

### 参考图布局限定为文章分类（2026-08-29）

用户进一步明确编辑式 `Reading` 布局只属于 Reading 区的“文章”页。`ReadingLibrary` 现依据 URL filter 选择展示分支：仅 `/reading?filter=article` 渲染双语标题、正在阅读窗口和日期文章流；阅读概览、书籍、题目、收藏与历史继续使用封面书架。两个分支共用原有导入、分类移动、删除、进度与打开阅读器逻辑，没有拆分或复制数据存储。

新增回归明确断言书籍 filter 存在封面书架且不存在“正在阅读”编辑式区域。Reading Library 定向 Vitest 12 项、ESLint、`git diff --check` 与 Next.js 生产构建全部通过。Playwright 实测文章路由仅出现编辑式布局，概览/书籍/题目路由均不出现，四个路由在 1440px 下均无横向溢出。

### Reading 栏目收敛为文章、书籍、题目（2026-08-29）

用户明确 Reading 只保留题目、书籍和文章三个栏目。展开侧边栏现改为三个平级链接，移除“阅读精选”手风琴父级、阅读概览、收藏夹和阅读历史入口。公开 filter 白名单仅接受 `article | book | exam`；`/reading` 默认解析为文章，旧的 `all | favorite | history | episode` 查询会安全回退到文章页。阅读材料自身的历史进度和收藏存储未删除，只移除它们作为顶层栏目的展示与路由。

改动涉及 `reading-library.ts`、`desktop-reading-sidebar-nav.tsx`、侧边栏样式和相关回归。新增侧边栏 DOM 断言与公开路由白名单断言；Reading 定向 3 个文件、22 项 Vitest 通过，定向 ESLint、`git diff --check` 和 Next.js 生产构建通过。

用户要求合并、推送并更新本地 App 后，本次 Reading 改造与测试以 `03e1f95`（`feat(reading): redesign article library`）直接提交到 `main`；提交严格限定为 9 个 Reading/侧栏文件，工作树既有 Notes、首页、词库、题型与终端改动均未纳入。全量测试首次发现两个旧侧栏断言仍期待“阅读精选”父级，以及 mint Reading 主题缺少显式契约且辅助文字对比度为 4.41:1；同步更新断言、补回显式主题规则并将 muted 色调整至 4.61:1 后，最终 383 个测试文件、2834 项全部通过，定向 ESLint 与 `git diff --check` 通过。提交已推送到 GitHub，fetch 后 `origin/main...main` 为 0/0。

为避免把工作树其他未提交内容混入桌面包，应用在固定于 `03e1f95` 的临时隔离 worktree 中构建。首次复用 `node_modules` 软链接触发 standalone 同源复制保护；改为 APFS clone 的独立依赖树后完成 Desktop Island helper、Next 生产构建、standalone 组装和 macOS arm64 `.app`。本机无 Developer ID，产物仅作本地 ad-hoc 深度签名；隐私审计、签名校验和 packaged MCP sidecar 冒烟测试通过。旧应用已移动到 `/Applications/Auris.app.backup-before-reading-03e1f95`，新版 1.0.4 安装并启动，主进程、Next server、Renderer、GPU/Network Helper 与原生 helper 均正常；本地 `/reading` 返回 HTTP 200 且包含 Reading/阅读双层标题。临时构建工作树已删除。

## Engineering trajectory: Reading 父子导航层级恢复（2026-08-30）

用户指出文章、书籍和题目不应在展开侧边栏中充当三个独立一级入口。检查确认 `/reading` 路由会用三个平级链接替换原 Reading 父级；实现恢复「阅读精选」手风琴父级，文章、书籍、题目继续使用现有 `/reading?filter=...` 路由并以缩进子栏显示。原有引导线、箭头、激活色和收起行为得到复用；移除已无用的平级样式覆盖。底部导航「会议片段」同步改名为「视频」，路由仍为 `/video`。

改动涉及 `desktop-reading-sidebar-nav.tsx`、`desktop-shell-fixtures.ts`、`auris-redesign.css` 及两个侧边栏组件测试。定向 Vitest 2 个文件、13 项通过，定向 ESLint、`git diff --check` 与 Next.js 生产构建通过，构建路由表仍包含 `/reading` 和 `/video`。工作树中其他未提交改动未触碰；未提交或推送 Git 改动。

### Reading 页头避让桌面灵动岛（2026-08-30）

用户截图显示 Reading 大标题末尾进入顶部原生「今日任务／回顾复习」灵动岛的阴影区域。`reading-library.css` 现在仅对桌面运行时的 Reading 画布保留 82–104px 顶部安全区，标题与右侧排序、导入控件整组下移，不缩小标题或改动全局灵动岛。新增 CSS 契约回归防止安全区被误删。Reading 组件与样式定向 Vitest 2 个文件、24 项通过，定向 ESLint 与 `git diff --check` 通过。未提交或推送 Git 改动。
## Engineering trajectory: Reading 完形标题彻底归一为阅读理解（2026-08-30）

用户反馈文章中的 `## 完形填空` 仍会唤起旧完形格式。根因是已删除 `cloze` 类型与展示样式后，解析器仍保留独立的完形别名、专属解析分支和序列化回写分支。`reading-exam-parse.ts` 现在只在输入边界兼容 `## 完形填空` 与 `## 题型: 完形填空`，立即将它们规范化为 `## 题型: 阅读理解`；后续与普通阅读理解共用完全相同的解析、数据类型、布局和序列化通道，不再保留完形标签或分支。

更新 `tests/unit/reading/reading-import.test.ts` 覆盖两种旧标题、紧凑题型文档、0–10 精读文档及保存往返；断言产物始终为 `type: reading`、label 为「阅读理解」，且保存结果不再出现独立 `## 完形填空`。Reading 定向 3 个文件、35 项通过，定向 ESLint、`git diff --check` 与 Next.js 生产构建通过。未提交或推送 Git 改动，工作树其他未提交内容保持不变。

## Engineering trajectory: Nia 与 Reading 页面背景与全局主题统一（2026-09-04）

用户反馈 Nia 页面（`/nia`）与 Reading 页面（`/reading`）两个大页面的背景与其他页面不一致，要求修改一致。

### 根因分析与分解

1. **全局主题契约**：Auris 外壳（`.desktop-app-shell` 与 `.desktop-app-frame`）及 Home、Notes、Flash、Review、Settings、Video 均统一绑定 CSS 变量 `var(--app-bg)`。在 6 套应用主题中：`white` (`#f4f2ec`)、`paper` (`#efe9d8`)、`mint` (`#edf3e8`)、`sepia` (`#f1e7d0`)、`night` (`#1b1c1f`)、`solarized` (`#002b36`)。
2. **Nia 页面背景不一致**：
   - `auris/src/app/nia/nia.css` 声明了 `:root { color-scheme: dark; }` 与 `html:has(.nia-workspace), body:has(.nia-workspace) { background: #0b0b0c !important; }`，直接强行将根文档涂抹为硬编码极黑 `#0b0b0c`。
   - `.nia-workspace` 变量 `--nia-bg: #0b0b0c;` 且未接入外壳的 6 套主题，卡片亦使用硬编码纯黑半透明。
   - `nia.css` 给 `.desktop-app-frame` 增加了冗余的 `padding-left: calc(14px + ...)`，在桌面端留出 102px 空白凹陷，导致底层背景泄漏。
3. **Reading 页面背景不一致**：
   - 库视图 `auris/src/components/reading/reading-library.css`：在 `night` 主题下硬编码为 `#0b0b0c`（偏离全局 night 的 `#1b1c1f`）；在 `white` 下为 `#f6f4ee`（偏离 `#f4f2ec`）；`.reading-library` 使用 `background: var(--reading-background)` 且 `min-height: 100vh`。
   - 阅读器工作台 `auris/styles/auris-redesign.css`：`.reading-minimal, .reading-minimal[data-theme="light"]` 硬编码设置 `--reading-background: #0b0b0c;`，导致任何文章点开均强制黑底。
   - 阅读器样式 `auris/src/components/reading/reading-workbench.css`：默认 light 阅读器主题使用 `--reading-background: #f7f5ee !important;` 阻断了全局主题继承。

### 改动文件与角色

1. `auris/src/app/nia/nia.css`：
   - 移除 `:root { color-scheme: dark; }` 与 `html/body` 的 `#0b0b0c !important` 覆盖。
   - `.nia-workspace` 采用 `background: var(--app-bg, var(--nia-bg));`，`min-height: 100%`。
   - 为 `.desktop-app-shell[data-app-theme="${theme}"] .nia-workspace` 建立全部 6 套主题的 `--nia-bg`、`--nia-surface`、`--nia-line`、`--nia-text` 规范，`--nia-bg` 严格对齐 `--app-bg`。
   - 审查卡、实时卡、聊天卡、检查器和设置面板统一采用 `var(--nia-surface)`。
   - 移除 `.desktop-app-frame` 的 `padding-left` 偏移，保持与桌面网格无缝贴合。
2. `auris/src/components/reading/reading-library.css`：
   - `.reading-library` 采用 `background: var(--app-bg, var(--reading-background));`，`min-height: 100%`。
   - 对齐全部 6 套主题令牌：`night` 下修正为 `#1b1c1f`（面板 `#212226`、高亮面板 `#282a30`）；`white` 下修正为 `#f4f2ec`（面板 `#fbfaf6`）；`mint` 与 `sepia` 面板对齐 `--app-surface`。
3. `auris/src/styles/auris-redesign.css`：
   - 将 `.reading-minimal, .reading-minimal[data-theme="light"]` 中的 `--reading-background: #0b0b0c;` 替换为 `background: var(--app-bg) !important;` 及 `--reading-background: var(--app-bg);`，解决文章阅读器漆黑底色问题。
4. `auris/src/components/reading/reading-workbench.css`：
   - `.reading-minimal` 基类采用 `background: var(--app-bg, var(--reading-background));`，`min-height: 100%`。
   - 移除 `[data-reader-theme="light"]` 中的硬编码 `#f7f5ee !important;`，改为使用 `var(--app-bg)` 并允许外壳主题自由透传；保留用户明确指定的非默认阅读主题（如 dark/sepia/contrast）覆盖。
   - 对齐 white 与 night 的 `--reading-background` 与 `--reading-panel`。
5. `auris/tests/unit/appearance/app-theme.test.ts`：
   - 扩展断言，确保全部 6 套应用主题（white, paper, mint, sepia, night, solarized）均包含 `.nia-workspace` 规则。

### 验证与测试结果

- `git diff --check`：无空白或格式异常。
- 定向 ESLint：`src/app/nia/` 及 `tests/unit/appearance/app-theme.test.ts` 0 错误 0 警告。
- 定向 Vitest：`tests/unit/appearance/`、`tests/unit/theme-contrast-styles.test.ts`、`tests/unit/reading/`、`tests/component/reading/`、`tests/component/nia/` 共 21 个测试文件、167 项测试全部通过（包含 WCAG AA 颜色对比度回归）。
- 生产构建：`npm run build` 成功完成，23 个路由全部生成，包含 `/nia` 与 `/reading`。
- 未提交或推送 Git 改动。

## Engineering trajectory: Auris 复盘页去 NIA 与非金色主题重排（2026-09-07）

本次只改造 `/review` 复盘页，不修改首页、Flash 或独立 NIA 工作区。`review-page-client.tsx` 移除了旧 `getNiaReviewMessage` 调用及 Nia 复习监督区，将原先分离的 Nia 卡和数据卡重组为「今日复盘概览 + 四格数据面板」；现有 1/2/4/7 队列、后续复习和所有业务操作保持不变。

`output-review-page.css` 在复盘页局部建立六套主题感知的非金色 Accent：White 深蓝、Paper 青蓝、Mint 深绿、Sepia 陶土红、Night 亮青、Solarized 青碧。背景与表面仍继承全局主题令牌，强调色及按钮文字在六套主题下均通过 WCAG AA 对比度校验。响应式布局在 1020px 下改为上下排列，680px 下将数据面板收敛为三列指标加满宽进度。

验证结果：复盘组件 3 项测试、复盘相关 8 项主题对比度断言、定向 ESLint、`git diff --check` 和 `npm run build` 均通过。本地 1280px Solarized 实际页面检查确认无横向溢出、复盘页内无 Nia 区块，主概览与复习卡对比清晰。全量主题测试另有 6 项失败，来自工作树中已有的 NIA 主题改动，与本次复盘页修改无关。未提交或推送 Git 改动。

## Engineering trajectory: Nia 满高工作台与能力视图重排（2026-09-07）

用户截图中的“展示卡住”由两个独立问题叠加：`DesktopAppFrame` 仍保留了旧的两行 Grid，而 Nia 只占自动高度行，使会话面板停在上半屏；工具视图则在主区和检查器重复渲染同一份工具列表与模型路由，且右侧的 `nia-routing` / 分隔条样式在前次整理中缺失。

改动保留现有语音陪伴、会话日历与 SQLite 归档、文字对话、工具权限、模型路由和角色设置契约。`auris/src/app/nia/nia.css` 为 Nia 建立单行满视口框架、可调宽左右双区和 820px 以下纵向堆叠，补齐分隔条、空态形象、能力卡片与模型路由样式。`auris/src/components/nia/nia-workspace-surface.tsx` 将工具主区收敛为唯一能力目录，右侧改为已连接/等待上下文统计、当前上下文说明与唯一模型路由面板。组件测试增加了“工具目录与路由不重复”回归断言。

验证通过：Nia 定向 Vitest 2 个文件共 10 项、定向 ESLint、`git diff --check` 与 `npm run build`。真实浏览器在 1280×720 下确认工作台、主区和检查器均到达视口底部、无横向溢出，8 张能力卡正常双列滚动且路由面板只有 1 个；760px 下确认单列堆叠且隐藏无意义的竖向分隔条。未改动已有 `electron/main.cjs` 内容，未提交或推送 Git 改动。

用户追加要求左右互换后，桌面端改为左侧 320px 可调宽会话/工具资料栏、右侧自适应主展示区；拖拽和方向键语义同步反转，向右拖或按右键会增大左栏。两栏都明确使用 `calc(100dvh - 68px)` 的剩余视口高度并内部滚动。真实浏览器 1280×720 实测：左栏 320×616px，右栏 896×616px，两者顶底对齐且横向溢出为 0；定向组件测试 7 项、ESLint 与 `git diff --check` 通过。

## Engineering trajectory: 笔记数学公式展示错误排查与修复（2026-09-04）

### 任务解读与根因分析
用户提供截屏（包含报错气泡 `AB = AC \centernot\implies B = C` 及 `Invalid LaTeX syntax: Unknown command: \centernot`），要求排查 note 页面是否存在展示错误并补齐。

排查发现：
1. **笔记源文件错误**：用户正在查看/编辑的笔记 `/Users/apple/Desktop/个人操作系统/notes/线代核心背诵骨架_向量与方程组.md` 第 75 行书写了 `$AB = AC \centernot\implies B = C$`。在标准 LaTeX 中 `\centernot` 依赖外部包 `\usepackage{centernot}`，而 KaTeX 默认不支持 `\centernot` 命令，导致编辑器在公式悬浮/渲染时触发 `Unknown command: \centernot`，无法正确渲染为数学公式。
2. **知识点与内容缺失**：该段标题为 `2. **$AB = 0$ 不代表 $A=0$ 或 $B=0$**：`，但正文仅有约去矩阵一句，且缺少对“乘积为零不代表因子为零”的明确命题表述与核心秩不等式；同时考场高危坑点缺少关于“两两无关推不出整体无关”的重要考点。

### 实现路径与修改文件
1. `/Users/apple/Desktop/个人操作系统/notes/线代核心背诵骨架_向量与方程组.md`：
   - 将不可解析的 `$AB = AC \centernot\implies B = C$` 替换为 KaTeX/AMS-LaTeX 原生标准支持的 `$AB = AC \nRightarrow B = C$`（渲染为干净的 $\nRightarrow$ 符号）。
   - 补齐与标题对应的第一条结论：“乘积为零不代表因子为零：$AB = 0 \nRightarrow A = 0 \text{ 或 } B = 0$（存在非零矩阵相乘得零矩阵，此时必有秩不等式 $r(A) + r(B) \le n$）”。
   - 完善第二条消去律解释：“不可随意约去/消去矩阵：$AB = AC \nRightarrow B = C$（矩阵没有直接除法，除非 $A$ 可逆，方可两端左乘 $A^{-1}$ 得到 $B = C$）”。
   - 补充第 4 项经典高危考点：“‘两两无关’ $\nRightarrow$ ‘整体无关’：向量组中任意两两向量线性无关 $\nRightarrow$ 整个向量组线性无关”。
2. `auris/src/features/notes/editor/code-block-preview.ts` 与 `auris/src/features/notes/rendering/remark-renderer.ts`：
   - 导出并注入 `DEFAULT_KATEX_MACROS = { "\\centernot": "\\not" }` 到 `renderMathMarkup` 及 `rehypeKatex`，提供渲染层防御性兼容，即使笔记输入 `\centernot` 也能降级渲染为否定箭头而不报错。
3. `auris/tests/unit/notes/notes-rich-markdown-math.test.ts`：
   - 新增 `\centernot` 宏兼容渲染测试和标准 `\nRightarrow` 公式渲染测试。

### 验证与测试结果
- 脚本全量遍历 `/Users/apple/Desktop/个人操作系统/notes/` 下全部 Markdown 文件，确认经修复后所有数学公式 100% 通过 KaTeX 语法校验，无报错。
- 定向 ESLint：`code-block-preview.ts`、`remark-renderer.ts` 与 `notes-rich-markdown-math.test.ts` 0 错误 0 警告。
- 定向 Vitest：`tests/unit/notes/` 89 个测试文件、763 项测试全部通过。

## Engineering trajectory: Nia 定时唤醒后的麦克风链路修复（2026-09-05）

用户反馈 Nia 无法听见说话，并要求与 Mochi 实现对照。审查确认 Auris 已有 macOS 麦克风用途说明；实际差异在实时会话策略：定时提醒以 `microphone: false` 建立 `recvonly` WebRTC 会话，后续点击唤醒会复用该已连接会话，因而没有本地音轨可上传。Mochi 则对所有实时会话始终请求麦克风。

`auris/src/components/nia/companion/companion-runtime.tsx` 不再为定时提醒关闭麦克风；`realtime-transport.ts` 移除可创建无麦克风会话的分支，所有会话均加入本地音轨，并采用 Mochi 的回声消除、降噪、自动增益采集约束。`tests/unit/nia/nia-realtime-transport.test.ts` 断言每次连接均使用这些约束。定向 Vitest 3 项、定向 ESLint、`git diff --check` 和 `npm run build` 均通过；随后完成 `desktop:assemble` 与 `electron-builder --mac --publish never`，新包位于 `auris/release/mac-arm64/Auris.app`，并核验其包含修复后的 bundle。用户关闭后，已终止 4 个遗留的 Auris 笔记后台子进程，将旧版移至 `/Applications/Auris.app.backup-20260905-1026`，安装并成功启动新版 `/Applications/Auris.app`；新版主/渲染/本地 Next 服务及 Nia companion renderer 均已在启动日志中确认。未提交或推送 Git 改动。

## Engineering trajectory: Nia 对齐 Mochi v0.1.19：Shell PATH 探测与 IPC 类型契约重构（2026-09-05）

### 任务解读与根因分析
根据用户提供的 Mochi 更新报告（`Mochi_Update_Report_v0.1.19.md`）及本地 Mochi 最新源码（`faa3340` ➔ `97ddef3`），梳理出 Mochi 0.1.18 与 0.1.19 两大核心架构升级点：
1. **运行时环境修复（v0.1.19, `80bf695`）**：macOS GUI 应用（从 Finder、Dock 或 Spotlight 启动）仅继承 launchd 精简 PATH（`/usr/bin:/bin:/usr/sbin:/sbin`）。用户通过 `mise`、`nvm`、`asdf`、`fnm`、`pnpm`、`bun` 或 Homebrew 安装的 Codex CLI 和 Node.js 无法在 GUI 进程中被探测到。此外，即使找到 npm shim 脚本（`#!/usr/bin/env node`），也会因找不到 `node` 而报错 `unusable — it could not be run`。Mochi 采用交互式登录 Shell（`-ilc`）探测并在应用就绪时拓宽 PATH。
2. **IPC 类型通信契约重构（v0.1.18, `4c1d6f0` / `7af24c8`）**：Electron 官方 `ipcMain.handle` 与 `ipcRenderer.invoke` 均为弱类型或 `unknown`，原先两端各自定义类型并依赖不安全的类型断言（如 `as Conversation[]`），造成静默类型漂移（Type Drift）。Mochi 通过构建单一事实源 `Answers` 表与强类型注册器 `answer()` 解决此隐患。

Auris 中的 Nia companion 系统此前在上述两个维度均存在相同痛点：主进程在 GUI 启动时未探测 Shell PATH，导致 CLI 适配器和 Codex 探测受限；渲染端 `nia-companion-bridge.ts` 与 `nia-conversation-archive.tsx` 则依赖裸断言与 `Promise<unknown>`，未与主进程形成强类型绑定。

### 实现路径与修改文件
1. `auris/electron/nia/companion/shell-path.cjs`（新增）：
   - 实现 `shellPath({ platform, env, run, timeoutMs })`：非 Windows 环境下异步执行 `$SHELL -ilc 'printf %s "$PATH"'`，设置 4000ms 超时，提取包含 `/` 的末行非空文本（规避终端启动 Banner），失败时安全回退 `null`。
   - 实现 `widenPath(current, fromShell)`：保持当前 launchd PATH 前置（避免外部脚本劫持系统二进制），将交互式 Shell 的路径追加在后并使用 `Set` 去重。
2. `auris/electron/main.cjs`：
   - 在 `app.whenReady()` 首行执行 Shell PATH 探测与拓宽，使后续的系统二进制检测（`codex`、`claude`、`gemini`、`pandoc`）、Nia CLI 适配器注册与 Node shim 脚本均可正常解析。
   - 接入统一的陪伴命令分发器 `createNiaCompanionHostDispatcher`。
3. `auris/src/features/nia/nia-companion-answers.ts`（新增）：
   - 对齐 Mochi `Answers` 架构，建立 Nia companion 的单一事实源强类型契约。
   - 严格声明 11 个宿主命令（`snapshot`、`conversations`、`conversation-turns`、`conversation-detail`、`conversation-search`、`conversation-saving`、`wake`、`rest`、`mute`、`companion-visibility`、`text`）及陪伴窗口会话协商命令（`open-session`、`sdp` 等）的输入 Payload 与输出返回值类型（`NiaCompanionHostAnswers`、`NiaCompanionWindowAnswers`、`NiaVoiceOpened`、`NiaVoiceAnswer` 等）。
4. `auris/electron/nia/companion/companion-answers.cjs`（新增）：
   - 主进程端的强类型命令分发器与处理器封装，保证主进程响应与 `NiaCompanionHostAnswers` 契约严格对齐。
5. `auris/src/features/nia/nia-companion-bridge.ts`：
   - 重构 `NiaCompanionHostBridge`：`invoke` 方法改为泛型 `<C extends NiaCompanionHostCommand>(command: C, payload?: NiaCompanionHostPayloads[C]): Promise<NiaCompanionHostAnswers[C]>`，由 TypeScript 编译期自动推导对应返回值类型。
6. `auris/src/components/nia/nia-conversation-archive.tsx`：
   - 移除原组件内重复声明的本地类型与所有不安全手动断言（`as Conversation[]`、`as Partial<ConversationDetail>`、`as SearchHit[]`），直接复用共享契约类型。
7. `auris/src/components/nia/companion/realtime-transport.ts`：
   - 引入强类型 `NiaVoiceOpened` 与 `NiaVoiceAnswer` 联合类型，淘汰不规范的 `ReturnType` 提取与空值保护冗余。
8. `auris/docs/third-party/mochi.md`：
   - 记录新增派生模块的 MIT 来源与开源说明（commit `80bf695` 与 `4c1d6f0`）。

### 验证与测试结果
- 新增单元测试：
  - `tests/unit/electron/nia/companion/shell-path.test.ts`：覆盖交互式登录 Shell、Banner 过滤、超时容错、Windows 跳过与 PATH 去重合并等 10 项测试，全部通过。
  - `tests/unit/electron/nia/companion/companion-answers.test.ts`：覆盖 11 项宿主命令的分发调度、空值保护与异常分支等 6 项测试，全部通过。
- 全量 Nia 测试：54 个测试文件、319 项测试全部通过。
- 语法与静态检查：`node --check` 检查通过；ESLint 0 错误 0 警告；`npm run quality:desktop-ipc` 契约验证通过；`git diff --check` 无格式异常。
- 生产构建：`npm run build` 成功通过。
- 未提交或推送 Git 改动。

## Engineering trajectory: Nia 页面对齐 Mochi 布局重构（2026-09-06）

### 任务解读与需求分解
用户反馈 Auris 的 `/nia` 页面布局较差，要求依照 Mochi（`xiaolai/mochi`，路径 `/Users/apple/Desktop/xiaolai-source/mochi/src/renderer/history/`）的布局进行重新设计，并提出两条明确指令：
1. **左侧大娃娃彻底移除**：Nia 陪伴娃娃本身在桌面上有独立的透明悬浮窗口（`/nia/companion`），在主工作台 `/nia` 中占据左侧 70% 的静态/微动大娃娃属于空间浪费与多余元素，应当直接删除。
2. **右侧删除记忆与任务的交互**：移除与纯对话历史阅读无关的“记忆”（Memory）及“任务”（Tasks）标签页与操作面板。
3. **引入 Mochi 历史会话阅读布局**：
   - 左侧主视口转换为 Mochi 风格的纯净对话阅读台（Reading Stage）：支持按轮次（turns）气泡展示（User 气泡与 Nia 气泡）、切片标识（Cut）、相对时间戳、一键全文复制、工具调用摘要（Tool Call Pills）及空状态提示。
   - 右侧检查器（默认 320px，支持拖拽与双击复位）集成 Mochi 标志性的月历日期带（Calendar Daystrip）：月度切换（`‹ 2026年9月 ›`）、按日选择网格、会话活动点提示（dots），点击特定日期快速筛选对应日期的会话，以及实时 SQLite 全文搜索输入框。
   - 顶部保留 Mochi 状态栏语气、实时连接状态指示、文字对话侧抽屉（SidePane）开关与 Nia 陪伴设置入口。

### 实现路径与修改文件
1. `auris/src/components/nia/nia-workspace-surface.tsx`：
   - 移除 `NiaAvatar` 引用与庞大的 Hero Doll DOM 结构；
   - 移除记忆（Memory）与任务（Tasks）相关的 Tab 切换、状态监听器与管理面板；
   - 左区构建 `nia-workspace__reading-stage`：包含会话详情头部（标题、创建时间、轮次、时长）、一键复制全文、逐轮气泡对话（展示用户与 Nia 头像、消息内容、截断切片、工具调用折叠）、以及底部随选会话状态；
   - 右区重构为紧凑的历史检查器：集成日历日期带组件（计算当月天数、会话分布高亮、日期切换）、全文搜索栏（Debounced 触发 SQLite 搜索）与高亮会话列表；
   - 维持既有的板块拖拽分割条（`aria-label="调整两个板块宽度"`）、快捷键（`ArrowLeft`/`ArrowRight`）及双击复位为 320px 的契约；保留设置弹层（陪伴比例、保存设置）。
2. `auris/src/app/nia/nia.css`：
   - 清理已废弃的 Hero Doll 与动画规则（`nia-workspace__hero` 等）；
   - 新增 Mochi 风格的阅读台样式（`.nia-workspace__reading-stage`、`.nia-workspace__transcript-head`、`.nia-workspace__turns`、`.nia-workspace__turn--user/nia`、`.nia-workspace__turn-bubble`、`.nia-workspace__tools-stage`）；
   - 新增 Mochi 风格的日期带与搜索样式（`.nia-workspace__calendar`、`.nia-workspace__calendar-head`、`.nia-workspace__days`、`.nia-workspace__search-pill`）。

### 验证与测试结果
- **单元与组件测试**：
  - `npx vitest run tests/component/nia/ tests/unit/nia/`：32 个测试文件、160 项测试全部通过（包含分割条宽度拖拽、键盘调整、双击复位、会话列表及工具注册等）。
- **静态代码检查与格式**：
  - `npx eslint src/components/nia/nia-workspace-surface.tsx`：0 错误 0 警告。
  - `git diff --check`：无格式或空白问题。
- **生产构建验证**：
  - `npm run build`：Next.js 16.1.7 (webpack) 生产构建成功，生成包括 `/nia` 在内的 23 个页面路由。
- **开发版启动保障**：修复 `auris/electron/main.cjs` 中 `createMainWindow` 与 `openMainRoute` 在 Next.js 首次编译重定向或快速换页时抛出良性 `ERR_ABORTED` 导致主进程误退出的问题，增加导航中断容错保护。
- 未提交或推送 Git 改动。

## Engineering trajectory: Nia 角色设置弹窗残缺与滚动截断修复（2026-09-06）

### 任务解读与问题根因
用户截图反馈 Auris 的 Nia 角色设置弹窗（`NiaWorkspaceSurface` 中的设置模态窗）界面显示残缺：
1. **视口截断与负边距遮挡**：设置弹窗外层蒙层原采用 `position: absolute; inset: 0;` 挂在带有 `overflow: hidden; height: 100%;` 的 `<main className="nia-workspace">` 内，并设置 `align-items: center; justify-content: center;`。当弹窗内容高度（约 750px）超出工作区容器视口高度（笔记本或浏览器内通常为 580-680px）时，Flexbox 垂直居中导致弹窗顶部负偏移越界、底部正偏移越界，被 `.nia-workspace` 的 `overflow: hidden` 两端生硬裁切——顶部标题、CHARACTER 标识与关闭按钮 `×` 滚出屏幕上方；底部“保存新对话”被截断，“提醒时间”、“文字模型与 API Key”以及“完成”按钮完全隐藏在屏幕外，用户既看不到全部设置项也无法正常关闭弹窗。
2. **滚动条缺失与数据丢失**：`nia.css` 具有全局无头样式 `.nia-workspace * { scrollbar-width: none; }` 和 `*::-webkit-scrollbar { display: none; }`，导致弹窗内部无可见滚动条提示；同时因外层居中裁切，即使滚轮滚动也无法将负偏移的头部拉回视口内。
3. **缺少快捷关闭通道**：蒙层未绑定点击关闭事件（点击空白区域无反应），未监听 `Escape` 键盘关闭，在关闭按钮和底部完成按钮被裁切后导致用户被彻底困在残缺弹窗内。
4. **样式丢失**：此前提交清理过程中 `.nia-workspace__settings-backdrop` 及相关设置类样式被误漏，导致部分类名未获得预期的卡片与布局约束。

### 实现路径与修改文件
1. `auris/src/app/nia/nia.css`：
   - 蒙层改为全屏固定定位 `position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; overflow-y: auto; padding: 24px 16px;`，配合 `backdrop-filter: blur(8px)`，脱离 `.nia-workspace` 的局部裁切盒；
   - 弹窗卡片 `.nia-workspace__settings` 采用 `display: flex; flex-direction: column; margin: auto; max-height: min(720px, calc(100vh - 48px)); overflow: hidden;`，确保在任何视口高度下卡片均不会溢出视口；
   - 弹窗拆分为三段式固定架构：
     - 固定顶部 `<header>`（`flex-shrink: 0; border-bottom: 1px solid var(--nia-line);`）：常驻展示“角色设置 · CHARACTER”、“Nia”、副标题以及独立的关闭圆形按钮 `×`；
     - 独立内部滚动容器 `.nia-workspace__settings-body`（`flex: 1 1 auto; overflow-y: auto; min-height: 0;`）：强制恢复显式微型滚动条（`scrollbar-width: thin !important` 及定制 WebKit 滚动条），包含称呼、外观颜色圆圈、桌面形象大小滑块、语音徽章、显示桌面形象开关、保存新对话开关、提醒时间徽标和文字模型侧栏链接 7 个分区；
     - 固定底栏 `<footer>`（`flex-shrink: 0; border-top: 1px solid var(--nia-line);`）：常驻展示紫调“完成”按钮；
   - 增加 `@media (max-width: 520px)` 移动端及极小视口自适应规则，并配置淡入与微缩放平滑动画。
2. `auris/src/components/nia/nia-workspace-surface.tsx`：
   - 弹窗 DOM 重构为 `<header>` + `<div className="nia-workspace__settings-body">` + `<footer>` 结构；
   - 弹窗 `section` 补充 `aria-modal="true"`；
   - 蒙层增加 `onClick` 事件处理（仅在点击蒙层自身而非弹窗内部时关闭 `settingsOpen`）；
   - 增加 `useEffect` 监听 `keydown` 事件：当设置弹窗处于开启状态时，按 `Escape` 键自动关闭设置。
3. `auris/tests/component/nia/nia-workspace-surface.test.tsx`：
   - 新增专项测试用例：验证所有 8 个设置元素均正确渲染在滚动容器 `.nia-workspace__settings-body` 内；
   - 覆盖全部 4 种关闭交互模式（点击顶部关闭按钮 `×`、点击底栏“完成”按钮、点击外部蒙层、按键盘 `Escape` 键）。

### 验证与测试结果
- **单元与组件测试**：
  - `npm run test -- tests/component/nia/nia-workspace-surface.test.tsx`：7 项测试全部通过（包含新增的滚动区域与 4 种关闭通道测试）。
  - `npm run test -- nia`：全量 60 个测试文件、360 项测试全部通过。
- **静态代码检查与格式**：
  - `npx eslint src/components/nia/nia-workspace-surface.tsx tests/component/nia/nia-workspace-surface.test.tsx`：0 错误 0 警告。
  - `node --check electron/main.cjs`：语法检查通过。
  - `git diff --check`：无格式或空格问题。
- **生产构建验证**：
  - `npm run build`：Next.js 16.1.7 (webpack) 生产构建顺利通过，所有 23 个路由正常编译打包。
- **本地应用打包与替换**：
  - 执行 `npm run desktop:island:build` 与 `npm run desktop:assemble` 成功完成独立运行时依赖装配与隐私审计。
  - 执行 `npx electron-builder --mac --arm64 --publish never` 完成 macOS arm64 应用程序打包。
  - 成功替换本地 `/Applications/Auris.app`，旧版本安全备份至 `/Applications/Auris.app.backup-1.0.4-before-nia-settings-fix`。
  - 从安装包独立编译产物中确认 `.nia-workspace__settings-body` 等样式与逻辑均已生效。
- 代码合并/提交至 `main` 分支并成功推送到 GitHub `origin/main`。

## Engineering trajectory: Nia 对齐 Mochi v0.1.20 听力打断与响应节奏（2026-09-07）

### 任务解读与范围控制
根据 Mochi v0.1.20 更新报告及 `/Users/apple/Desktop/xiaolai-source/mochi` 源码，对齐 Auris 的 Nia 伴读系统。用户明确要求「只对齐 mochi 相关的」，严格隔离任何无关功能（如既有的 notes/vmark 暂存修改）。
核心痛点与 Mochi 设计对齐：
1. **中途打断控制 (`interruptible`)**：在多设备、家庭或公共场合嘈杂环境下，避免他人闲聊或背景杂音频繁打断 Nia 正在朗读/讲解的长句。
2. **回答前等待时长 (`eagerness`)**：提供自适应调优（`auto`）与低/中/高（`low` / `medium` / `high`）四档阈值，控制判定用户说完话后的等待门限（最多 8s / 4s / 2s）。
3. **协议语义契约**：
   - `eagerness === "auto"` 时不在 `turn_detection` 中传递 `eagerness` 字段，以尊重 Realtime 服务端默认模型自适应调优；非 auto 档位显式发送；
   - `interrupt_response` 显式随 `turnTaking.interruptible` 传递布尔值（默认 `true`）。

### 实现路径与修改文件
1. `auris/src/features/nia/nia-realtime-protocol.ts`：
   - 增加 `NIA_TURN_EAGERNESS`、`NiaTurnEagerness` 与 `NiaTurnTaking` 协议接口；
   - 新增 `createNiaTurnDetectionConfig`，规范化处理 `semantic_vad` 下的 `eagerness` 与 `interrupt_response`；
   - 更新 `createNiaRealtimeSessionUpdate`，支持传入 `turnTaking` 配置。
2. `auris/src/components/nia/companion/realtime-transport.ts`：
   - 在 WebSocket 连接就绪发送 `session.update` 时，从本地存储（`auris.nia.interruptible` 与 `auris.nia.eagerness`）读取最新配置并传入 `turnTaking`。
3. `auris/src/components/nia/nia-workspace-surface.tsx`：
   - 设置弹窗状态增加 `interruptible` 与 `eagerness` 及 `localStorage` 响应式读写；
   - 在角色设置弹窗滚动区新增「允许中途打断」（带开启/关闭动态说明文案，对齐 Mochi）与「回答前等待时长」（四档选项按钮网格）。
4. `auris/src/app/nia/nia.css`：
   - 新增 `.nia-workspace__eagerness-options` 网格布局与选中高亮态。
5. `auris/docs/third-party/mochi.md`：
   - 补充 Mochi v0.1.20 的 turn-taking 衍生协议设计说明与对照。
6. 测试与用例更新：
   - `auris/tests/unit/nia/nia-realtime-protocol.test.ts`：增加默认参数、auto 策略与自定义阈值的断言。
   - `auris/tests/component/nia/nia-workspace-surface.test.tsx`：增加对打断开关和等待时长网格的点击交互与持久化断言。
### 验证与测试结果
- **单元与组件测试**：`npm run test -- nia` 60 个测试文件、360 项测试全部 PASS。
- **代码规范与检查**：`npx eslint` 0 error 0 warning；`git diff --check` 无格式问题。
- **生产构建验证**：`npm run build` Next.js 生产构建通过（23 个路由）。
- **本地应用打包与替换**：
  - 执行 `npm run desktop:island:build` 与 `npm run desktop:assemble` 完成独立依赖装配；
  - 执行 `npx electron-builder --mac --arm64 --publish never` 完成 macOS arm64 打包；
  - 成功替换本地 `/Applications/Auris.app`，并验证安装包内的独立编译包中包含完整的打断控制与等待时长逻辑。

## Engineering trajectory: Auris Note 对齐 VMark v0.9.65 健壮性与排版增强（2026-09-07）

### 任务解读与范围分解
根据 upstream VMark（`v0.9.65`，commit `75e4c5d`）审计报告及修复分析，对齐 Auris 笔记模块的核心鲁棒性与富文本能力：
1. **保存目标竞争与单调序号序列化保护（F3）**：当笔记发生重命名、移动或删除时，若后台正在进行异步保存，需立即废弃旧路径的写入声明（SaveTargetClaim），防止将新状态写回旧路径造成幽灵文件或覆盖竞态。
2. **Surrogate Pair Emoji 与星光区字符实体修复**：Markdown 序列化和保存时，防止 UTF-16 代理对高半区和低半区被切断成实体（如 `&#xD83D;\uDE42`），将其合并修复为有效 Unicode 实体（`&#x1F642;`）。
3. **原子写入符号链接保护与权限继承（B2 & B3）**：`writeFileAtomically` 在写入前解析符号链接真实目标（上限 32 级），保留目标文件原有权限模式（`chmod`），避免原子覆盖将符号链接替换为普通文件或损坏权限。
4. **会话崩溃恢复与草稿打捞（B5 & B6）**：主进程 `NotesRecoveryStore` 读取崩溃或非正常退出的 JSON 数据时，具备自动容错与数组对象逐步打捞能力，损坏的会话状态自动修复，不丢弃草稿。
5. **跨块选区安全 Enter 换行处理（F5）**：富文本编辑器中若选区横跨不同 block，拦截自定义 Enter 拆分并直接交给 ProseMirror 原生 `splitBlock`，防止破坏块级边界或造成结构紊乱。
6. **GFM 删除线（Strikethrough）所见即所得支持**：富文本 ProseMirror schema 扩充 `strikethrough` 标记定义与序列化，提供 `~~del~~` 输入规则及快捷键（`Mod-Shift-x`, `Mod-Shift-X`, `Mod-Alt-s`）。

### 实现路径与修改文件
1. `auris/src/features/notes/persistence/save-target-claim.ts`（新增）：
   - 提供基于路径的单调递增 SaveClaim 机制（`claimSaveTarget`、`isCurrentSaveTarget`、`invalidateSaveTarget`、`forgetSaveTarget`）。
2. `auris/src/features/notes/workbench/use-notes-documents.ts` 与 `use-notes-actions.ts`：
   - 提交保存时占领 claim；重命名、移动或删除笔记时立即使旧路径 claim 失效；
   - 解决保存回调顺序陷阱：在写入成功后先更新 `saveBaselineRef` 与 `rememberSelfWrittenContent`，再核对 claim 有效性，避免连续快速保存时将自身写入误判为外部磁盘冲突。
3. `auris/src/features/notes/markdown/surrogate-repair.ts`（新增）与 `auris/src/features/notes/workbench/notes-save-to-vault.ts`：
   - 实现 `repairSplitSurrogateEntities` 正则扫描及代理对拼合算法，并在向库保存前进行防御性清洗。
4. `auris/electron/main.cjs`：
   - `writeFileAtomically` 实现递归 `resolveLinkTarget` 与 `fs.statSync(resolvedPath).mode` 继承，再通过同目录临时文件原子重命名。
5. `auris/electron/notes/notes-recovery-store.cjs`：
   - 增加 `repairWorkspaceState`（补充有效 `version` 与空数组结构）和 `salvageJsonArrayObjects` 正则提取残存 JSON 对象的鲁棒机制。
6. `auris/src/features/notes/editor/notes-rich-keymap.ts`、`notes-rich-markdown.ts` 与 `notes-rich-input-rules.ts`：
   - 增加跨块 Enter 安全分发；增加 `strikethrough` 标记 spec 与序列化；增加 `~~text~~` 快捷格式化输入规则及快捷键绑定。
7. 测试更新与新增：
   - 新增 `auris/tests/unit/notes/save-target-claim.test.ts`、`auris/tests/unit/notes/surrogate-repair.test.ts`；
   - 扩展 `auris/tests/unit/electron/notes/notes-recovery-store.test.ts`、`auris/tests/unit/notes/notes-save-to-vault.test.ts`、`auris/tests/unit/notes/notes-rich-input-rules.test.ts`、`auris/tests/unit/notes/notes-rich-markdown-roundtrip.test.ts`。

### 验证与测试结果
- **单元与组件测试**：
  - `npm run test -- notes`：122 个测试文件、1048 项测试全量 PASS。
- **代码规范与检查**：
  - `npx eslint src/features/notes/ tests/unit/notes/`：0 error 0 warning；
  - `node --check electron/main.cjs electron/notes/notes-recovery-store.cjs`：语法检查通过；
  - `git diff --check`：0 格式问题。
- **生产构建验证**：
  - `npm run build`：Next.js 16.1.7 (webpack) 生产构建顺利通过，所有 23 个路由正常编译。
- **同步差异报告**：
  - `npm run vmark:diff`：成功生成 `latest.json` 和 `latest.md`。

## Engineering trajectory: Nia、Review、Flash 全局多主题统一与高对比度适配（2026-09-07）

### 任务解读与范围分解
用户提供了 Nia (`/nia`)、Review (`/review`)、Flash (`/flash`) 三张界面的截图并指出：这三处界面的颜色风格与全局主题脱节，存在自行发挥的配色（如 Nia 固定的亮紫、Flash 混色造成的浑浊低对比、Review 浮层对比度不足）；要求统一跟随用户的全局激活主题，且必须确保内容与背景对比强烈、边缘清晰，绝不出现模糊或低对比发灰发浑。
1. **全局主题契约（Auris 6 大主题）**：`white`、`paper`、`mint`、`sepia`、`night`、`solarized`。通过 `.desktop-app-shell[data-app-theme="..."]` 提供 `--app-bg`、`--app-surface`、`--app-ink`、`--app-text`、`--app-muted`、`--app-line`、`--accent`、`--accent-strong`、`--accent-ink`。
2. **Flash 页面排查与重构**：
   - 修复导航高亮按钮：此前使用 `color-mix(var(--accent) 72%, var(--app-surface))` 与 `var(--app-ink)` 混色，导致暗色金黄主题下文本对比度仅 2.97:1 严重失焦模糊；重构为 `background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 650;`，对比度提升至 11.2:1 (WCAG AAA)。
   - 修复卡片与边框溶解：`.flash-card` 原先为 `border: 1px solid transparent`，导致卡片溶解在 `#1b1c1f` 背景中无可见边界；添加 `1px solid var(--app-line)` 与微阴影。
   - 修复热力图级别混色、搜索框底色与提交按钮的 `accent-ink` 反色。
3. **Review 页面排查与重构**：
   - 修复卡片浮层：此前 `--review-elevated` 被 28% `--app-bg` 压暗导致与背景发浑；重构为清晰的 `var(--app-surface)`，辅以清晰的 `1px solid var(--app-line-soft)`。
   - 修复告警与逾期色值对比度：暗色主题 `--review-warning` 升级为高亮暖色 `#f29373`（与 `#212226` 对比度 > 6.6:1）；浅色主题 `--review-warning` 适配为加深暖色 `#b2451e`（与 `#f4f7f1` 对比度 > 5.2:1，满足 WCAG AA ≥ 4.5:1）。
   - 修复时间轴进度节点与线段：`.output-review-progress__node` 与 `.output-review-progress__line` 改用 `var(--app-line-strong)`，彻底告别原先隐形不可见的空心圈。
4. **Nia 页面排查与重构**：
   - 彻底拔除硬编码紫色：此前 `nia.css` 在所有 6 个主题下将 `--nia-accent` 写死为紫色（`#7b61ff`, `#6f54ea`, `#a995ff` 等），并在 15+ 处选择器硬编码 `rgba(169, 149, 255)`；全部重构为继承全局 `--accent`、`--accent-strong`、`--accent-ink` 与 `color-mix(in srgb, var(--nia-accent) X%, transparent)`。
   - 角色头像与品牌标（Nia Brand Mark）：统一改用 `linear-gradient(145deg, var(--nia-accent), var(--nia-accent-2))` 与 `color: var(--nia-accent-ink)`，使其在暗色主题下呈现与 Review 一致的温润金黄色，在薄荷色下呈现墨绿色；对话头像的眼睛也统一采用 `var(--nia-accent-ink)`。
   - 独立陪伴与设置：`NiaAccentTheme` 扩展 `"auto" | "violet" | "gold" | "blue"`，默认值从固定 `"violet"` 改为 `"auto"`（跟随全局主题），并在设置弹窗外观中补充「跟随主题」渐变色阶选项；日历高亮选中日期文字从硬编码黑字改为 `var(--nia-accent-ink)`。

### 修改文件与职责
1. `auris/src/components/flash/flash-page.css`：
   - 统一使用 `var(--accent)` 与 `var(--accent-ink)`，修复导航、提交按钮、热力图、卡片边框高对比度与清晰度。
2. `auris/src/components/review/output-review-page.css`：
   - 统一使用 `var(--app-surface)` 浮层、分主题 `--review-warning`（暗色 `#f29373`，浅色 `#b2451e`）、清晰逾期徽标与时间轴刻度线。
3. `auris/src/app/nia/nia.css`：
   - 重构 6 大主题下的 `--nia-bg`、`--nia-surface`、`--nia-accent`、`--nia-accent-ink`、`--nia-done`、`--nia-cut`；
   - 消除硬编码紫色的品牌标、头像、日历选中、工具徽标与文本侧栏。
4. `auris/src/components/nia/nia-workspace-surface.tsx`：
   - 扩充 `NiaAccentTheme` 类型，默认状态设为 `"auto"`，持久化兼容 `"auto"`，并在设置弹框中新增「跟随主题」控制按钮。
5. `auris/tests/unit/theme-contrast-styles.test.ts`：
   - 增加 Nia 6 大主题下的文本、边框、Accent、Accent-ink、Done/Cut 标签的 WCAG AA (≥ 4.5:1) 断言与主题继承校验；
   - 增加 Flash 激活项、边框令牌、Review 警告色在浅色/暗色表面的高对比度断言。
6. `auris/tests/component/nia/nia-workspace-surface.test.tsx`：
   - 增加 Nia 默认 `data-accent-theme="auto"` 以及设置弹窗中「跟随主题」切换与本地存储持久化的回归断言。

### 验证与测试结果
- **单元与组件测试**：
  - `npm test -- tests/unit/theme-contrast-styles.test.ts tests/unit/flash/flash-theme-styles.test.ts tests/component/flash/flash-page-client.test.tsx tests/component/review/output-review-page.test.tsx tests/component/nia/nia-workspace-surface.test.tsx`：5 个测试文件、68 项测试全部 PASS。
- **代码规范与格式检查**：
  - `npx eslint src/components/nia/nia-workspace-surface.tsx tests/component/nia/nia-workspace-surface.test.tsx tests/unit/theme-contrast-styles.test.ts`：0 error 0 warning。
  - `git diff --check`：通过，无多余空格或格式问题。
- **生产构建验证**：
  - `npm run build`：Next.js 16.1.7 (webpack) 生产构建通过，23 个路由包括 `/nia`、`/review`、`/flash` 均正常生成。

## Engineering trajectory: Auris 闪念页面主题色彩适配与强对比重构（2026-09-07）

### 任务解读与范围分解
用户明确要求：
1. **彻底移除金色系**：闪念工作台不再使用违和刺眼的土金色、金黄色、泥金棕色（如 `#c7a86a`、`#d4b56e`、`#e1c55a`、`#765214`、`#6f4f18`），包括 Brand Mark 图标、活跃热力图、导航选中态、构思输入框与提交按钮、收藏星标及悬停光晕；
2. **与当前主题色彩高度契合**：全面覆盖系统「设置 → 外观」提供的 6 种全局应用主题（夜间 `night`、薄荷 `mint`、极简白 `white`、纸张 `paper`、棕褐 `sepia`、`solarized`），为每个主题定制专属色调（夜间灵感蓝、薄荷常青竹翠、白色深靛蓝、纸张青墨砚石、棕褐深焙焦茶、Solarized 经典青碧）；
3. **确保背景与内容形成强烈的视觉对比**：
   - 解决卡片底色与页面底色融合、边界模糊的痛点：浅色模式下纯白/高亮卡片浮于温润底色之上，深色模式下悬浮暗舱卡片与深邃画布形成明确明度差与立体投影；
   - 核心内容文字（卡片正文、构思输入框内容）使用最高对比度的主文本令牌，对比度远超 WCAG AAA 标准（深色模式纯净白 `#ffffff`，浅色模式曜石纯墨 `#0f172a` / `#0d2116` / `#181511`，对比度达 12:1 ~ 18:1）。

### 实现路径与修改文件
1. `auris/src/components/flash/flash-page.css`：
   - 重构色彩体系，引入 `--flash-bg`、`--flash-sidebar-bg`、`--flash-card-bg`、`--flash-card-border`、`--flash-card-hover-border`、`--flash-card-shadow`、`--flash-text-primary`、`--flash-text-secondary`、`--flash-text-muted`、`--flash-accent`、`--flash-accent-ink`、`--flash-active-item-bg`、`--flash-active-item-text`、`--flash-heat-1~4` 等完整语义令牌；
   - 针对 `.desktop-app-shell[data-app-theme="..."] .flash-workspace` 实现 6 大主题的强对比度配色映射，彻底杜绝任何金色色值；
   - 优化导航选中项（由大面积金色刺眼填充重构为高级精致胶囊）、输入框聚焦光晕、热力图梯度、卡片边框与微阴影，使正文与卡片视觉层次清晰立现。
2. `auris/tests/unit/flash/flash-theme-styles.test.ts`：
   - 更新单元测试，断言 6 大主题均具备 `.desktop-app-shell[data-app-theme="..."] .flash-workspace` 专属主题定制；
   - 增加严禁包含 `#c7a86a`、`#d4b56e`、`#e1c55a`、`#765214`、`#6f4f18` 等金色系正则测试，防止金色回潮；
   - 验证高对比度表面与文本语义令牌，同时确保保留全局 fallback 兼容。
3. `auris/tests/unit/theme-contrast-styles.test.ts`：
   - 新增闪念页面在 6 大主题下的 WCAG AA/AAA 对比度数学校验（底色、卡片、正文、次级文本、Accent、Accent-ink 均严格满足 `contrastRatio >= 4.5:1`）；
   - 更新导航、输入框、卡片边框的高对比令牌断言。

### 验证与测试结果
- **单元与组件测试**：
  - `npx vitest run tests/unit/flash tests/component/flash tests/unit/theme-contrast-styles.test.ts`：4 个测试文件、72 项测试全部 PASS；
- **静态代码检查与格式**：
  - `npx eslint src/components/flash/ tests/unit/flash/ tests/component/flash/ tests/unit/theme-contrast-styles.test.ts`：0 error 0 warning；
  - `git diff --check`：通过，无任何多余空格或格式问题；
- **生产构建验证**：
  - `npm run build`：Next.js 16.1.7 (webpack) 生产构建顺利通过，`/flash` 等 23 个路由正常编译生成；
- 未提交或推送 Git 改动。

## Engineering trajectory: Auris Nia 页面全面去紫色与主题强对比重构（2026-09-07）

### 任务解读与范围分解
用户明确要求：
1. **彻底移除紫色（不要紫色）**：Nia 伴侣工作台全面下架一切紫色及深浅紫调，包括 Mochi 伴侣形象的硬编码紫色色值（`#514c83`、`#28253e`、`#34304f`、`#32304d`、`#1a1925` 等）、微型头像紫粉渐变（`#a99aff`、`#6b57d1`、`#252044`）、设置弹窗中的「紫色主题」选项及色块；
2. **与当前主题色彩高度契合**：全面覆盖 6 大全局应用主题（夜间 `night`、薄荷 `mint`、极简白 `white`、纸张 `paper`、棕褐 `sepia`、`solarized`），严格遵循 `desktop-app-shell[data-app-theme="..."]` 的 Accent / Accent-ink 令牌与主题契约，默认及推荐使用「跟随主题」，原「紫色主题」独立强调选项升级替换为 Auris 品牌代表性的「暖橙主题」（`amber`，`#ff7b45`）；
3. **确保背景与内容对比强烈**：
   - 解决各面板底色过于扁平融合、边缘界限模糊的问题：主列工作台、审查侧边栏、文本抽屉及顶部栏增加强化边框令牌（`--nia-line-strong`）与立体阴影（浅色模式立体轻浮微阴影，暗色模式高对比暗舱沉浸阴影）；
   - 增强对话气泡可见度：用户发言气泡采用明确的边界、微投影与加粗对比文本，确保在任何底色下都一目了然；
   - 修复侧边文本聊天面板在深色主题下可能出现的白底浅字对比度失效问题，全面覆盖 `.nia-panel`、`.nia-composer textarea`、`.nia-response` 的高对比度深色模式样式；
   - 修复归档日历热力图中硬编码低对比度灰文字的问题，使用语义化 `--nia-muted` 与 `--nia-text-2` 确保清晰可辨。

### 实现路径与修改文件
1. `auris/src/app/nia/nia.css`：
   - 将 Mochi 形象头像由写死紫色重构为自适应主题色调的 `color-mix` 动态着色；
   - 将 mini 头像硬编码渐变替换为 `--nia-accent` / `--nia-accent-2` 语义令牌；
   - 移除 `.nia-workspace[data-accent-theme="violet"]` 及 `.nia-workspace__colour--violet`，升级替换为 `.nia-workspace[data-accent-theme="amber"]` 及暖橙色标；
   - 强化顶部栏、主卡片区、审查区、文字抽屉的边界对比与阴影分层；
   - 注入 `.nia-workspace .nia-panel` 等高对比度暗色覆盖，彻底杜绝白底白字；
   - 严格维护 6 大主题下的 `--nia-accent` 与 `--nia-accent-ink` 契约规范。
2. `auris/src/components/nia/nia-workspace-surface.tsx`：
   - 将类型 `NiaAccentTheme` 中的 `"violet"` 替换为 `"amber"`；
   - 设置弹窗中将「紫色主题」按钮替换为「暖橙主题」（珊瑚橙 `#ff7b45`）；
   - 增加自动兼容迁移：检测到 localStorage 中残留历史 `"violet"` 设置时，自动安全迁移为 `"auto"`。
3. `auris/tests/component/nia/nia-workspace-surface.test.tsx`：
   - 增加组件回归测试：断言弹窗中已无「紫色主题」、包含「暖橙主题」且可选中交互；
   - 增加旧版本 `violet` 历史缓存自动迁移为 `auto` 的测试断言。
4. `auris/tests/unit/theme-contrast-styles.test.ts`：
   - 保持 6 大主题下全局契约测试 100% 通过。

### 验证与测试结果
- **单元与组件测试**：
  - `npx vitest run tests/unit/theme-contrast-styles.test.ts`：51 项测试全部 PASS；
  - `npm test -- tests/component/nia/`：9 个测试文件、29 项测试全部 PASS。
- **静态代码检查**：
  - `npx eslint src/components/nia/nia-workspace-surface.tsx tests/component/nia/nia-workspace-surface.test.tsx`：0 error 0 warning。
- 未提交或推送 Git 改动。
