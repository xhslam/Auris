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
