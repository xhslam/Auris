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
