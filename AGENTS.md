# AGENTS.md — 桌面端专属维护规则

本项目自 2026-06 起仅维护桌面端（Electron）。  
Web 端（登录、注册、计费等）已于 2026-06 移除，请勿恢复。

## VMark 源码对照与复用纪律

根据用户 2026-10-01 的要求，持续对齐时遵循“不重复造轮子”：在实现相关功能前、关键改动后及回归异常时，主动对照固定版本的 VMark 源码。先核查 Auris 已有实现，能直接复用的纯逻辑优先复用；需要 Electron 适配时保留行为与边界，注明上游路径、提交、许可及差异。摘要和版本号不能替代源码与运行证据；不将未验证的历史映射批量标记为已对齐。

---

## Agent 修改范围

### 允许修改

- `electron/` — Electron 主进程
- `src/platform/desktop/` — 桌面平台适配层
- `src/components/desktop/` — 桌面专属 UI 组件
- `src/features/ai-dock/` — AI Dock（纯桌面功能）
- `src/features/app-runtime/` — 桌面运行时状态
- `src/app/video/`、`src/app/notes/`、`src/app/` 根页面
- `src/components/workspace/word-definition-popover.tsx`、`src/components/notes-v2/`

### 可以读取，修改前需声明影响范围（共用层）

- `src/platform/runtime.ts`、`src/platform/files/`、`src/platform/notes/`
- `src/features/notes/`（文档/编辑器/vault 核心逻辑）
- `src/features/sessions/`
- `src/app/api/` — API routes（桌面端本地 HTTP 调用依赖这些 routes，修改需说明双边影响）

### 禁止修改（保护桌面端依赖）

- `src/features/auth/session-actor.ts` — 桌面端本地用户绕过逻辑的核心
- `src/lib/supabase/` — API routes 运行时依赖，桌面端间接依赖
- `electron/preload.cjs`、`electron/main.cjs` — 除非任务明确是 Electron 主进程改动

### 不存在、请勿新建

- `src/app/login/`、`src/app/register/` — 已删除，不再维护
- `src/features/billing/` — 已删除，不再维护
- `src/components/auth/` — 已删除，不再维护

---

## 桌面端路由清单

桌面端侧边栏实际使用的路由（来源：`desktop-shell-fixtures.ts`）：

| 路由 | 组件 | 说明 |
|---|---|---|
| `/` | `ReviewPageClient` | Review 默认首页 |
| `/video` | `DesktopVideoLibraryShell` | 视频库 |
| `/notes` | `NotesPageClient` | 笔记工作台 |

**修改任何上述路由对应的页面或组件时，必须同时验证桌面端可正常打开该页面。**

---

## 验证命令

```bash
npm run lint          # ESLint，预期 0 errors
npx tsc --noEmit      # TypeScript，预期 src/ 下 0 new errors
npm run desktop:dev   # 桌面端开发模式启动
npm run build         # Next.js 构建（桌面端生产依赖）
```

> `npm run start` 已删除（Web 独立部署命令，桌面端不使用）。

---

## 共用层修改规则

修改 `src/platform/` 下的工厂文件（files/notes/notifications）后，必须验证：

1. 桌面端打开 `/notes` 页面，vault 正常加载
2. 运行 `npx vitest run tests/unit/notes/`

修改 `src/app/api/` 下的 API routes 后，必须说明：

- 该 route 被哪些桌面端功能调用
- 修改是否影响 `isDesktopLocalRequest()` 的处理路径


## Engineering trajectory: VMark 差异补齐——PDF 交付与学习依赖复核（2026-08-20）

本轮根据 VMark 对齐报告先做源码复核，再仅实现已确认的缺口。复核发现 Auris 原本已有 `printToPDF` 与安全受管浏览器，因此没有重做 PDF 或浏览器框架，也没有碰用户未提交的浏览器 UI 改动。用户明确授权后，在 `electron/main.cjs` 与 `electron/preload.cjs` 最小扩展既有 PDF IPC：新增 `electron/pdf-export-options.cjs`，默认请求 A4、背景、CSS 页面规格、页码页脚、Tagged PDF 与 Document Outline；渲染端只允许传入受限纸张、方向及两项布尔选项。`src/platform/files/`、`desktop-bridge.ts` 和笔记 HTML 导出保持桌面/网页回退兼容，HTML 增加语义主区域、分页控制与 A4 页面规则。

学习产物新增 `learning-dependency-review.ts`、`learning-dependency-sync.ts` 和 `learning-dependency-note-update.ts`：新建学习笔记会将材料与来源笔记的标准化指纹写入 `aurisDependencySnapshot` frontmatter 和可读审计区块；来源材料保存、摘录追加、词汇追加后会扫描相关学习笔记并标记 `needs-review`；`NotesWorkbench` 底部在待复核时提供“确认已复核”，确认后以当前来源刷新指纹并写入 `reviewed` 决策。对应实现还扩展了 `learning-note-template.ts`、`use-workspace-learning-memory.ts`、`source-material-note.ts`、`notes-workbench.tsx`、`notes-workbench-bottom-right.tsx` 及定向测试。

验证：11 个定向 Vitest 文件、61 项通过；定向 ESLint 无 error；`node --check` 覆盖主进程、预加载与新 CJS 模块；`git diff --check` 通过；`npm run build` 完成；本地服务 `GET /notes` 返回 HTTP 200。新启动桌面开发命令因已有 Electron 单实例锁未创建第二个窗口，但现有本地服务与 `/notes` 路由可达。全仓 `tsc --noEmit` 仍有 118 项既有错误；筛查确认本轮源码和新增测试均不在错误清单。实现细节与余留边界见 `docs/vmark-sync/implementation-status-2026-08-20.md`。未提交或推送改动。


## Engineering trajectory: Markdown 个人操作系统首页接入（2026-08-21）

本次实现按“Markdown 为长期事实底座、Auris 为当日执行界面”的边界完成第一阶段接入。首页新增可注册的「个人操作系统」学习组件：它只在用户通过既有 Vault 目录选择授权的根目录内读取 `00_总览.md`、`02_项目库.md`、可选的 `03_资源索引.md` 与当天 `daily/日期.md`；若根目录不满足必需文件约束，则不会读取或写入任何内容。组件显示当前周期、每日投入提示、两个项目、今日主项目、学习记录数和资源索引，并允许用户在本地选择“今日主项目”。该选择仅为 Auris 本地偏好，不会改写 Markdown 项目优先级。

新增 `src/components/desktop/personal-os-markdown.ts`，以纯函数解析现有 Markdown 标题、项目字段、资源表和 daily 目录，并生成可读的学习时段记录；每次提交附带 `<!-- auris:personal-os-session:... -->` 稳定标记，写入前重新读取当天文件，因此同一 ID 可检测为重复而不会再次追加。新增 `personal-os-dashboard.tsx` 与 CSS，提供受限工作区的连接、刷新、项目选择、资源摘要和“结束学习时段”表单。表单只收集时长、内容、可验证结果、卡点和下一步，并仅向当天日志追加，不自动改写项目目标、状态或下一步。`src/components/home/home-page.tsx` 将组件纳入统一 Widget 注册表和初始布局；已有用户保存的布局会把该新增系统组件标为隐藏，因而不会覆盖既有布局，用户可从组件库手动添加。未修改 `electron/main.cjs`、预加载、认证、Vault 工厂或用户既有未提交的词库文件。

新增 `tests/unit/home/personal-os-markdown.test.ts` 覆盖项目/资源解析、嵌套 daily 目录及带标记的追加去重。验证：新测试 3 项通过；首页、桌面外壳及样式隔离回归共 16 项通过；定向 ESLint 无错误（仅保留 `home-page.tsx` 已有的 `<img>` 优化警告）；`git diff --check` 通过。`npx tsc --noEmit` 仍报告仓库既存 118 项错误，但筛查确认新增个人操作系统文件和 `home-page.tsx` 不在错误列表。`npm run build` 已成功完成编译、类型检查、静态页面生成、页面优化和构建 trace；命令在打印完整路由表后未自行结束，因此人工停止了仍占用的调用会话。后续建议先连续使用两周，再考虑受控的项目状态/下一步 diff 写回及周复盘草稿。


## Engineering trajectory: 学习结束表单的心情与能量记录（2026-08-21）

用户要求优化学习结束时的最小记录表单，并补充心情或能量字段。实现选择不增加自由文本负担的五档“结束时状态”选择器：1 透支、2 疲惫、3 平稳、4 投入、5 充沛；默认值为 3「平稳」。选择器提供明确的当前选中态、`aria-pressed`、悬停与键盘焦点样式，并用“按结束时的真实感受选择，不作好坏评价”说明减少心理负担。

改动集中在既有个人操作系统模块：`personal-os-markdown.ts` 将 `energyLevel` 纳入 `StudySessionInput`，并在每条每日记录中以 `- 心情/能量：投入（4/5）` 的可读格式追加；旧日志不需要迁移。`personal-os-dashboard.tsx` 在时长和学习内容之间插入紧凑的五档选择器；CSS 补齐深色表单下的网格、选中态、焦点态与窄屏尺寸。`tests/unit/home/personal-os-markdown.test.ts` 现在断言心情/能量字段会随记录写入。

验证：个人操作系统单元测试 3 项通过；包含桌面首页外壳与首页组件的回归测试 13 项通过；新增模块定向 ESLint 通过；`npx tsc --noEmit` 仍只有仓库既有的 118 项错误，个人操作系统文件和首页文件不在错误列表。未修改主进程、预加载、Markdown 既有内容或用户已有未提交的词库改动。


## Engineering trajectory: 开发工作副本 GitHub 一键同步与补丁版本递增（2026-08-21）

用户所说的“更新”实际包含两条不同链路：已安装桌面端的更新仍由 `electron-updater` 从 GitHub Releases 获取构建产物；源码工作副本的拉取、提交与推送则不能由前者完成。检查确认现有开发模式会有意停用自动更新源，而 `electron-builder.yml` 已配置 `xhslam/auris` 的 Releases 发布源，因此没有把“检查应用更新”误改成任意 Git 命令。

本次新增 `electron/development-repository-sync.cjs`，并只向开发模式暴露受限 IPC。点击设置页开发模式的「同步并推送」会固定在 Auris 当前工作副本执行 `git fetch --prune origin`、`git pull --rebase --autostash origin <当前分支>`、递增 `package.json` 与 `package-lock.json` 的补丁版本、只暂存 `auris/` 及根 `.gitignore`、创建 `chore(release): vX.Y.Z` 提交并推送。它不接受 renderer 提供的路径、分支或 shell 命令，打包版本也会被主进程拒绝，因而不会变成通用命令执行入口。远端分叉、rebase 冲突或 Git 身份缺失时会停止且不强推。`1.01` 不是三段语义版本号，故采用可被 Electron/GitHub Releases 可靠识别的 `1.0.0 → 1.0.1` 规则。

改动涉及 `electron/main.cjs`、`electron/preload.cjs`、`src/platform/desktop/desktop-bridge.ts`、`desktop-runtime.ts` 及 `src/components/updates/app-update-panel.tsx`；`.gitignore` 新增 `*.backup-*`，避免词库生成备份被自动提交。新增 `tests/unit/electron/development-repository-sync.test.ts`，覆盖补丁递增、拉取先于写版本、受限暂存、提交与推送的顺序。`node --check` 覆盖新增模块、主进程和预加载；4 个定向 Vitest 文件共 42 项通过；定向 ESLint 与 `git diff --check` 通过。更新指示器测试保留原有 React `act(...)` 警告，但测试均通过。未执行实际提交或推送；按钮执行时会处理当时工作副本中的改动。

补充事务保护：同步前会先检查本地改动与相对 `origin/<branch>` 的提交差异；远端已同步且无改动时不创建空版本提交。若上一次已生成 `chore(release): vX.Y.Z` 但推送失败，再次点击只重试推送，不会重复递增版本号。若提交本身失败，会将两个版本文件恢复为点击前内容；如果提交已落地而推送失败，界面会明确说明“本地提交已创建”，以便修复远端问题后安全重试。新增回归后，仓库同步服务定向测试为 5 项通过；前述 IPC、语法、ESLint 与 diff 检查仍通过。


## Engineering trajectory: 参考 VMark 的不可变标签与草稿发布链路（2026-08-21）

用户要求参考公开仓库 VMark 的 App 更新管理。调研确认 VMark 将自动检查、手动操作、卡死恢复和多窗口同步拆为独立可测试层；其发布由 `vX.Y.Z` 标签触发，拒绝相同或较旧版本，先创建草稿 Release，分别构建各平台、验证签名/更新清单和资产，最后才将草稿转为正式 Release。原始链接与对照结论记录在 `docs/vmark-release-reference-2026-08-21.md`。

Auris 不复制 Tauri 特有的跨窗口待下载对象同步（Electron 的 `autoUpdater` 已是主进程单例），而采用等价且适合 Electron 的发布边界：新增 `electron/release-tag-preparer.cjs`，桌面开发模式的「创建标签并发布」只会在当前源码已与 `origin/<branch>` 一致时创建并推送 `vX.Y.Z` 标签；远端同名标签或不指向当前提交的本地标签均失败，推送中断后再次点击只重试标签推送。新增 `.github/workflows/release-desktop.yml`：标签先经 package 版本和最新正式 Release 的严格比较，创建草稿；macOS Apple Silicon 与 Windows x64 分别构建并上传资产，检查 `latest-mac.yml`/`latest.yml`；最终作业确认安装包与更新元数据均已在草稿中，再发布正式 Release。`electron-builder.yml` 改为草稿发布类型，且取消硬编码 ad-hoc macOS identity；工作流要求 `MAC_CSC_LINK` 与 `MAC_CSC_KEY_PASSWORD`，以允许 Developer ID 签名的 macOS App 就地更新。

桌面入口保持受限 IPC：renderer 不可指定路径、命令、分支或发布凭据；已打包 App 拒绝源码/标签操作。`desktop:release` 现为安全的标签准备命令；`desktop:release:build:mac` 与 `desktop:release:build:win` 由 GitHub Actions 调用，旧的直接本机构建发布入口保留为 `desktop:release:local`。新增发布标签服务与工作流契约测试。验证：发布相关 10 项测试通过；此前更新与 UI 回归合计 54 项通过；桌面 IPC 合约 106 invokes / 108 handlers 通过；定向 ESLint 与 `git diff --check` 通过。没有创建标签、触发工作流或发布 GitHub Release；这些动作需由用户点击按钮或执行 `npm run desktop:release` 后进行。


## Engineering trajectory: Notes 根入口与文件夹浏览分层（2026-08-21）

本次按“Notes Landing 是入口、Folder Browser 是空间、Editor 是内容”的边界重构桌面端 Notes 导航。`/notes` 不再以单一 `hasEnteredWorkbench` 布尔值在欢迎页与编辑器之间切换；新增 `notes-navigation.ts`，用 `landing | folder | note` 位置模型以及 sessionStorage 中的 Landing 已访问和最后活跃文件夹信息表达会话级规则。首次进入 Notes 保留 Welcome / Landing；同一会话后再次点击 Notes 一级入口会恢复最后文件夹；没有可恢复文件夹时仍回到 Landing。

新增 `notes-folder-browser.tsx` 和其 token-only 全局样式：文件夹点击会由 `desktop-notes-vault-nav.tsx` 发出直接文件夹导航事件，并与既有 vault root 切换并行，页面先渲染 Folder Browser skeleton，因此不会闪出 Landing。浏览页以现有 vault/文档数据提供 Grid（默认）与 List、session 内视图保存、文件名/路径搜索、最近修改/最早修改/名称排序、独立空文件夹状态、受控错误状态和新建笔记入口；预览重用现有全量文档加载能力，不改 vault 核心或编辑器。`desktop-app-sidebar.tsx` 还为 Notes 一级入口增加根导航事件；`notes-workbench.tsx` 仅增轻量“返回文件夹”入口，继续使用既有编辑器与文档打开逻辑。

改动范围为 `src/components/notes-v2/`、`src/components/desktop/`、`src/app/globals.css` 及定向测试；未修改 `src/features/notes/`、`src/platform/notes/`、`src/platform/files/`、认证、Supabase、Electron 主进程或预加载。新增测试覆盖会话位置、侧边栏文件夹事件、Grid/List、搜索、空状态和真实笔记打开；现有 Notes 页面回归测试明确以恢复笔记参数进入编辑器，以保持其原有编辑器测试范围。

验证完成：定向 ESLint 无错误/警告；Notes、工作台、侧边栏与文件夹浏览定向 Vitest 6 个文件、73 项通过；`git diff --check` 通过；`npm run build` 成功，路由表包含 `/notes`；`npm run desktop:dev` 已启动 Electron 开发进程且本地 `GET /notes` 返回 200。全仓 `npm run lint` 仍因未修改的 CJS `require()` 规则问题等 90 项既有错误失败；`npx tsc --noEmit` 仍有 118 项既有错误，筛查确认新增/修改的 Notes 文件不在错误列表（其中已有 `notes-workbench.test.tsx` 的 `DesktopTerminalBridge.resume` 缺失类型错误仍存在）。未提交或推送 Git 改动；根目录已有未跟踪 `markdown/` 与 `research/vmark-upstream/` 未触及。


## Engineering trajectory: Notes Folder Browser 第二轮视觉收敛（2026-08-21）

本轮严格限定在 Folder Browser 的视觉层，未改动 Vault、导航状态、Editor、Electron 主进程或预加载。实际 macOS 截图确认第一轮 List 虽已设为透明背景，但浏览器的原生 button appearance 仍将每行绘制成连续的圆角外框，视觉上仍接近横向卡片；这也是“所有文件像被选中”的主要残留来源。

实现集中在 `src/app/globals.css` 与 `notes-folder-browser.tsx`：Folder 标题改为工作区级别尺寸并压缩 Header；Search、Sort 与 View Toggle 统一为相同高度、边框、圆角和低对比 surface；List 行使用 `appearance: none`、透明默认背景、弱底部分隔线和 58px 密度，仅在 hover 使用 token-derived surface，在最后打开的文档回到文件夹后才使用 `--accent-10` 与 2px indicator。Grid 继续保留独立 card 信息密度，但同样仅使用 Notes/accent tokens。因桌面 vault 文件记录未公开 mtime（`DesktopVaultFileRecord` 仅含路径与名称），未扩大平台桥接范围；缺失时间在 UI 中降级为 `—` 而非重复显示“未记录时间”。页面将现有 `activePath` 传给浏览器，从而不新增选择模型也能表达唯一低调的当前文档状态。

新增 `tests/unit/notes/notes-folder-browser-styles.test.ts`，防回归透明默认行、hover/selected token 状态、无固定灰色、Grid/List 密度差与 white/night/solarized 主题令牌；组件测试补充唯一选中状态和缺失 mtime 文案。定向 ESLint 通过；Folder Browser 样式与组件测试 11 项通过；包含页面与 Workbench 的 Notes 回归组 4 个文件、63 项通过；`npm run build` 成功。全仓既有 lint/TypeScript 基线未在本轮改变。已重新打包 macOS 应用并替换 `/Applications/Auris.app`，保留安装前副本于 `/Applications/Auris.app.backup-1.0.1-before-native-appearance`；由于系统未授权辅助访问，最终包启动后无法通过自动化切回 Notes 进行第二次前台截图，但打包前的 List 截图、编译 CSS 与回归测试均已确认修正被纳入安装包。未提交或推送本轮代码。


## Engineering trajectory: Folder Browser 通用按钮颜色泄漏修复（2026-08-21）

用户截图确认第二轮后 Grid 与 List 仍出现浅灰卡片/行和金色高亮。根因定位为 `globals.css` 中既有的 `.desktop-app-frame .notes-v2 button` 通用规则：它以 `background: rgba(255, 255, 255, 0.52)` 和 `button[data-active="true"] { background: var(--notes-accent) }` 给所有 Notes 按钮施加表面与活动色；Folder Browser 将文件卡、文件行与视图切换实现为 button，因而被污染。此前的局部规则无法在实际打包的样式顺序中可靠抵消该规则。

修复在 `globals.css` 末尾新增只作用于 `.notes-v2--folder-browser` 的高优先级颜色隔离层。它对 card、row、工具栏、搜索关闭按钮、视图切换与空状态按钮统一重置 native appearance、阴影和 transform；Grid 默认用 `color-mix(var(--notes-surface), var(--notes-bg))`，List 默认强制透明；hover 仅用 Notes surface；selected 改为以 accent 6% 混合背景和最多 20% 的弱边框，彻底避免 `--notes-accent` 作为整块填充。该层不修改通用 Editor/Vault 样式或全局主题令牌。

扩展样式回归测试，验证专属 card/row 覆盖携带 `!important`、默认透明行、6% accent selected 与原生外观重置；Folder Browser 组件和样式测试共 12 项通过，定向 ESLint 与 `git diff --check` 通过，`npm run build` 成功。重新组装、打包并替换了 `/Applications/Auris.app`；从已安装包的编译 CSS 中提取并确认 Grid 默认、List 默认和 selected 规则均已进入产物。旧安装包保留在 `/Applications/Auris.app.backup-1.0.1-before-color-isolation`。未提交或推送本次补丁。


## Engineering trajectory: Folder Browser 点击后持久选中状态移除（2026-08-21）

用户在浅色主题截图中进一步确认：点击任一文件并从编辑器返回后，该文件会获得整行/整卡 Accent 综合色，即使 6% 混合也不符合浏览器应有的中性文件清单。原因不是新的全局样式泄漏，而是上一轮为表达“最后打开文件”而显式从 `NotesPageClient` 传入 `workbench.activePath`，组件随之添加 `data-selected` 与 `aria-current`，CSS 通过该属性持久绘制选择表面。

修复选择完全去除 Folder Browser 的持久选择概念，而非继续微调色值：`notes-folder-browser.tsx` 不再接受 `activePath`，DocumentCard/DocumentRow 不再写入 `data-selected` 或 `aria-current`，页面也不再传递活动路径；对应的 card/row selected、粗字体和 2px 指示条 CSS 一并移除。点击仍会正常进入编辑器；返回文件夹后，文件列表全部回到相同的中性默认态，只有鼠标 hover 保留瞬态 surface 反馈。

组件回归测试改为断言点击后不存在任何 `data-selected` 或 `aria-current`；样式测试改为禁止 Folder Browser card/row 定义 data-selected 规则。Folder Browser、Notes 页面与样式测试 3 个文件共 30 项通过；定向 ESLint、`git diff --check` 与 `npm run build` 通过。最新安装包已替换 `/Applications/Auris.app`，安装前副本保留于 `/Applications/Auris.app.backup-1.0.1-before-no-selection`；从安装包编译 CSS 验证不存在 card/row 的持久选中选择器。未提交或推送本轮补丁。


## Engineering trajectory: 首页工作台主题隔离修复（2026-08-22）

用户截图显示设置页的 Notes/应用主题处于 paper 时，首页工作台、Widget 和人生阶段画布被整体改为浅纸色。根因不是 Notes 页面残留在 DOM，而是首页样式本身存在高特异性选择器：`.desktop-app-shell[data-app-theme] .auris-demo-home[data-system-color-scheme]` 的所有 Widget 直接消费继承的 `--app-*`、`--accent-*` 令牌；人生阶段则额外为每个 `data-app-theme` 定义了主题场景。因此在 paper/white/mint/sepia 下，首页会有意但不符合产品要求地被重绘。

修复保留 Notes 和设置页的主题机制，不修改外壳全局令牌；而是在 `home-demo-workbench.css` 末尾、同等作用域的首页根节点局部重设深色工作台的 `--app-*` 与 `--accent-*` 令牌。这样所有已有首页 Widget 保持其变量契约，同时不再继承外壳的阅读主题。为胜过 paper 等同特异性人生阶段变体，另在同一末尾把 `.demo-widget--life` 的 `--life-scene-*` 固定为既有 night 场景。首页仍能读取 `data-system-color-scheme`，但该属性不会再造成浅色内容面。

新增 `tests/unit/home/home-workbench-theme-isolation.test.ts`，断言局部 dark palette 和 night life-scene 规则位于 paper 变体之后；结合首页样式隔离、人生阶段、隐藏滚动条、首页单元与桌面首页组件测试共 16 项通过。定向 ESLint、`git diff --check` 和 `npm run build` 通过。最新 macOS 包已安装并启动；安装前副本保留为 `/Applications/Auris.app.backup-1.0.1-before-home-theme-isolation`。已从安装包的压缩 CSS 确认 `--app-bg:#171819` 与最终 night life-scene 场景声明存在。未提交或推送本轮补丁。


## Engineering trajectory: 全应用主题统一与首页同步修复（2026-08-22）

用户澄清产品目标：White、Paper、Mint、Tan（内部 id 为 `sepia`）、Night 和 Solarized 是整个应用的统一主题，而非 Notes 专属阅读主题；首页、人生阶段及相关 Widget 必须和设置页同步变化。上一轮固定首页深色的规则因此是错误策略，已被完整移除。

本轮新增 `src/features/appearance/app-theme.ts` 作为唯一主题契约：定义 `AppThemeId`、六个主题 ID、稳定默认值、统一 localStorage 键与 `auris:app-theme` 广播事件。原 `notes-reading-theme.ts` 保留为兼容出口，但只重导该核心值，不再形成第二套状态源。`use-app-theme.ts` 将默认值、水合后读取、同窗口事件及跨窗口 storage 订阅收敛为共享 Hook；桌面外壳、Notes 工作台和独立浏览器窗口均改用它。外观设置直接写入核心契约；浏览器原生背景、Notes 欢迎页和嵌入式浏览器的类型也改为 `AppThemeId`。因此，改变设置主题会同时刷新外壳 `data-app-theme`、首页/人生阶段场景、Notes 根节点、阅读、复习、浏览器与独立窗口。

首页删除了错误的局部 `--app-*` 深色重置和固定 night `--life-scene-*` 覆盖，重新继承桌面壳的语义令牌。既有六个 `.desktop-app-shell[data-app-theme="..."] .auris-demo-home ... .demo-widget--life` 场景规则保持为各主题的唯一场景源，使纸张、白色、薄荷、棕褐、夜间和 Solarized 呈现各自背景与前景，而非强制同一种夜景。

新增 `tests/unit/appearance/app-theme.test.ts`，覆盖持久化、广播、共享 Hook 实时更新，以及六个主题在桌面壳、Notes、首页、人生阶段和阅读的令牌选择器完整性；更新首页主题测试为“消费应用令牌 + 每主题独立人生阶段场景”契约。统一主题、首页、人生阶段、阅读、Notes 与桌面首页定向回归共 96 项通过；定向 ESLint、`git diff --check` 和生产构建通过。最新 macOS 包已经安装并启动；运行时截图确认 Solarized 已同时驱动首页所有 Widget 与人生阶段的青绿色场景，而不是被固定为夜间。安装前副本保留于 `/Applications/Auris.app.backup-1.0.1-before-unified-theme`。未提交或推送本轮补丁。


## Engineering trajectory: 首页最外层画布主题背景修复（2026-08-22）

统一主题重构后，用户在 Paper 截图中发现首页卡片与「人生阶段」已切换为纸色，但工作台最外层仍保持深色。根因是 `home-demo-workbench.css` 末尾保留了一条早期策略的 `.auris-demo-home { background: #171819 !important; }`：它绕过了已经正确继承的 `--app-*` 令牌，并以 `!important` 固定覆盖首页画布。此前「首页工作台主题隔离修复」轨迹中关于固定深色画布的处理已不再适用；当前产品约束是全应用主题同步，首页不能拥有私有深色背景。

修复将该规则替换为与应用壳同一作用域的 `.desktop-app-shell[data-app-theme] .auris-demo-home[data-system-color-scheme] { background: var(--app-bg) !important; }`。因此 White、Paper、Mint、Tan（`sepia`）、Night 和 Solarized 都由 `DesktopAppFrame` 的 `data-app-theme` 与语义 `--app-bg` 令牌驱动首页外层画布；现有卡片、控件和六套人生阶段场景规则继续各自消费同一主题来源。没有改动 Electron 主进程、预加载、认证、Supabase、Vault 或 Editor 核心。

`home-workbench-theme-isolation.test.ts` 现验证最终同选择器覆盖规则使用 `var(--app-bg)`，并禁止旧的固定 `#171819 !important` 根画布规则，以防止同类回归。验证：应用主题、首页工作台、人生阶段、跨主题对比和桌面首页共 5 个定向测试文件、59 项通过（桌面首页既有 React `act(...)` 警告不影响结果）；首页样式隔离与 Folder Browser 样式共 10 项通过；定向 ESLint 和 `git diff --check` 通过；`npm run build`、`npm run desktop:assemble` 与 macOS `electron-builder --mac --publish never` 完成。新包已安装为 `/Applications/Auris.app`（版本 1.0.1），旧包备份为 `/Applications/Auris.app.backup-1.0.1-before-home-canvas-theme`；从安装包编译 CSS 核验到最终主题画布规则。用户的 `src/features/dictionary/personal-vocab/word-index.json` 改动及上层 `markdown/`、`research/vmark-upstream/` 未暂存。

## Engineering trajectory: 参考图式 30px 胶囊侧边栏验收与收敛（2026-08-25）

本次先以 `docs/PRD-auris-reference-compact-sidebar.md` 为意图基线审查 Antigravity 的未完成实现。组件层已经移除了导航 ripple、粒子和 burst 状态，并在 `auris-redesign.css` 中建立了 30px 轨道、28px 活动项、14px 图标、2×20px 指示条和六主题变量；但运行时仍被 `globals.css` 中旧的 48/74/78px、贴左直角、36px 按钮和金色活动态 `!important` 规则压过，展开文字也被 `auris-theme.css` 的全局隐藏规则阻断。

实现保留 `DesktopAppSidebar` 的七个现有路由、预取、Notes Vault、Reading 二级导航和 sessionStorage 展开状态。清理了 `globals.css` 中两轮已失效的侧栏几何、皮肤和主题强制覆盖，将 Notes 左下角状态簇改为按 8px 左距 + 30px 轨道 + 16px 间隙计算；`auris-redesign.css` 的 Electron 权威块显式恢复 flex 顶部布局，并将折叠态 Vault 入口收敛为 28px；`auris-theme.css` 不再给首页预留旧 56px 列，也不再以 `!important` 永久隐藏展开标签。样式契约测试同步扩展为同时检查新规则与旧级联冲突，而非只搜索数字是否存在。

验证完成：侧栏、桌面外壳和几何契约 3 个文件共 36 项 Vitest 通过；定向 ESLint、`git diff --check` 和 `npm run build` 通过。Playwright 在 1440×900 运行时测得折叠轨道 `x=8, y=8, 30×884`、首个活动项 `x=9, y=48, 28×28`、图标 14×14，Night 背景、活动、指示色分别为 `#2B2E33`、`#333D4B`、`#E55E51`；展开态为 240×884、16px 圆角且七个标签可见。1280×720 下 `/`、`/notes`、`/reading`、`/video`、`/settings` 均返回 200、各有且仅有一个正确活动入口；六主题保持同一几何。未替换已安装包，也未关闭用户正在运行的 Auris 实例；未触碰现有词库、笔记存储和其他未提交改动。

## Engineering trajectory: Notes 数学公式 AST pipeline 与 VMark 式源码交互（2026-09-01）

用户的「学习卡点与方法识别笔记」在磁盘上保存了完整的 `\(...\)` / `\[...\]` LaTeX，数据未损坏；异常来自富文本导入使用 `markdown-it` 先执行 Markdown escape，使公式没有成为独立节点。实现新增共享 `notes-markdown-dialect.ts`，用受保护的扫描器在解析前将 AI 常用分隔符规范为 `$` / `$$`，同时屏蔽 fenced/indented/inline code、转义反斜杠、URL 和 Markdown link destination；共享 dialect 固定为 `remark-parse + remark-frontmatter + remark-gfm + remark-math`。

富文本导入现在从 MDAST 的 `inlineMath` / `math` 节点生成 ProseMirror `math_inline` / `math_block` 原子节点，`content` 属性保留未转义的原始 LaTeX；序列化统一输出 canonical `$...$` / `$$...$$`。阅读面板和 HTML 导出改用同一 dialect，KaTeX 显式使用 `strict: false` 与 `throwOnError: false`，全局 KaTeX CSS 保持加载。CodeMirror 混合预览同步支持两种兼容分隔符，且不会误渲染代码中的示例。

参考 VMark 的原子节点交互新增 `notes-math-node-view.ts`：行内公式默认只显示 KaTeX，点击后原位显示 LaTeX 源码并在上方显示实时预览，Enter/失焦保存、Escape 取消；块公式使用多行源码编辑器与实时预览。新增/扩展回归覆盖用户列出的积分、绝对值、多行 `\boxed` 链路、canonical delimiter、代码保护、货币符号防误判、混合预览与点击源码编辑。定向 Vitest 8 个文件、48 项通过；定向 ESLint、`git diff --check`、Next 生产构建、桌面隐私审计与 packaged MCP sidecar smoke 均通过。未改写用户笔记源文件；macOS arm64 本地包已替换 `/Applications/Auris.app` 并启动，`/notes` 返回 200，旧包备份为 `/Applications/Auris.app.backup-1.0.4-before-math-ast`。本地没有 Developer ID 证书，因此该同版本开发包未签名且未发布 GitHub Release。

## Engineering trajectory: VMark v0.9.59 P0/P1 选择性对齐（2026-09-01）

本轮依据 `docs/vmark-sync/feature-gap-report-2026-09-01.md` 实施三项已验证的架构无关保证，不整仓复制 VMark。Markdown 媒体解析改为 HTTP(S)、安全栅格图 data URL 和 Vault 内相对路径的明确白名单，Vault 变化会推进 reload key 并重建 CodeMirror 图片 decoration。Vault snapshot refresh 改为可继续的 Promise chain；Keep/Reload 前会即时重读目标文件，以 dirty、path 和最新磁盘内容阻止过期决策。Terminal owner 贯通 renderer、desktop bridge、Electron manager 和 recovery store；可见会话、上限、编号与最后活跃项按 Workspace 计算，收起面板只断开 xterm view，不终止 shell，主进程保留最近 200,000 字符供重新打开时回放。

验证覆盖对抗性媒体源、单调 reload key、确定性 refresh race、冲突决策前二次变更、Workspace session selector/last-active、owner 持久化、有界输出回放和面板卸载不 kill。定向 Vitest、ESLint、三个 Electron CJS `node --check`、`git diff --check` 与 Next 生产构建的完整结果记录在 `docs/vmark-sync/implementation-status-2026-09-01.md`。Workspace Rail 当前的「关闭」只是临时移出列表且会在 refresh 后恢复，因此本轮没有将它扩张为销毁 Workspace 并 kill 其会话。用户后续明确授权集成：产品代码提交 `0a20a6a` 已推送至 `origin/main`，全量 2,879 项测试通过；macOS arm64 本地包已重建、替换 `/Applications/Auris.app` 并通过 `/` 与 `/notes` HTTP 200 验证，旧包保留在 `/Applications/Auris.app.backup-1.0.4-before-vmark-0959`。用户已有词库与笔记改动未触碰。

## Engineering trajectory: 胶囊侧边栏结构列修正（2026-08-25）

用户指出上一轮虽然复刻了胶囊本身，却把侧栏实现成覆盖页面的固定浮层；浏览器验收还通过强制桌面运行态与 Night 主题掩盖了真实组合关系。修正将侧栏定义为桌面壳的第一列：折叠列宽 52px（8px 左距 + 30px 轨道 + 14px 间隔），功能页面固定从第二列 `x=52` 开始；展开时第一列同步变为 262px，240px 导航与页面共同重排，不再遮挡页面。侧栏在列内使用 8px 外边距维持 `30×calc(100vh - 16px)` 胶囊几何。

改动集中在 `src/styles/auris-redesign.css`、`src/styles/auris-theme.css`、侧栏 PRD 与几何契约测试。Playwright 在 1440×900 下复核 `/`、`/notes`、`/reading`、`/video`、`/settings`：五页轨道均为 `x=8, y=8, 30×884`，Frame 均为 `x=52, width=1388`，轨道矩形内可点击内容重叠数为 0；展开实测轨道 240px、Frame `x=262`、七个标签可见。侧栏/外壳/几何测试共 37 项通过，定向 ESLint 与 `git diff --check` 通过。业务数据、首页布局状态和主题偏好均未清空或改写。

## Engineering trajectory: Nia 今日复习提醒清单与实时只读查询（2026-09-08）

用户要求接通提醒里的具体条目与对话中的最新今日复习查询。确认现有 reminder 链路已经携带 items，但 `realtime-transport.ts` 仅发送 count；伴侣窗口和主窗口使用相同 Next origin 与 Electron 默认 session，因而可直接读取 Review 的 localStorage 数据，不必新增主进程接口或第二套存储。

新增 `src/features/nia/nia-review-context.ts`：提醒按字段白名单携带有界清单；`get_today_reviews` 每次重新读取既有存储，使用 Review 的 getReviewQueue/getDashboardMetrics 和本地日期，返回今日到期、逾期、完成数及标题/项目/阶段/计划日期，并支持 20 项分页，区分空队列与读取失败。仅伴侣 transport 注册只读工具，工具输出通过 function_call_output 回传，在 response.done 后继续响应；同一 call_id 去重，会话关闭清理。协议解析补充 arguments。提示明确数据不是指令、不宣称读过材料、不自动完成复习。

验证：5 个定向 Vitest 文件共 25 项通过，覆盖最新存储、完成后重读、跨日、暂停/未来排除、分页、失败和 transport 往返；定向 ESLint 和 npm run build 通过。新增 `tests/electron/nia-review-context-smoke.mjs`，用隔离浏览器会话验证实际 Review/伴侣页面、工具注册及跨页面更新，无需刷新即读到完成状态；WebRTC/provider 使用 mock，未调用真实语音服务。首轮 fixture 将 pause 动作误写为 paused 导致一项失败，修正测试调用后通过。全仓 diff 检查发现用户既有根 AGENTS.md 与 output-review-model.ts 的 EOF 空行；本次文件定向检查通过。未改动用户既有 Review/Nia 外观修改，未提交、推送或替换已安装应用；打包版需在后续重新打包后生效。

## Engineering trajectory: 闪念主题统一与完整视口布局（2026-09-08）

用户要求闪念配色符合当前主题、补齐不完整画面且不改字体。检查确认独立六主题硬编码覆盖了应用强调色（Paper 使用蓝色），固定宽度居中网格造成左侧空带，父层网格的百分比高度又随内容收缩造成底部分段。修改仅集中在 `src/components/flash/flash-page.css`：改用现有 app/accent 令牌，轻化卡片阴影；两栏填满实际内容宽度；通过仅匹配 Flash 的 :has 规则建立确定视口轨道，侧栏/列表内部滚动，小屏仍采用纵向布局。所有 font、line-height、letter-spacing 声明与改前逐项一致；没有修改业务和存储。

更新既有 `tests/unit/flash/flash-theme-styles.test.ts`，移除与用户当前要求冲突的独立配色/禁止应用暖色断言，改为共享主题令牌契约。3 个闪念测试文件共 21 项通过，定向 ESLint 与 diff 检查通过。独立 Electron 窗口加载真实 preload、使用隔离用户目录及示例闪念，验证六主题 × 1440×900/1160×700：工作区与 viewport 等高同起点、侧栏到底、无横向溢出、强调色等于 app accent。初次验证用沙箱默认值导致 preload 未载入，按应用实际 sandbox:false 配置后完成桌面验证。样张保存于 `docs/flash-theme-2026-09-08/`；测试窗口未注册完整主进程 IPC，因此开发样张包含测试宿主的错误指示，不作为真实应用运行错误的结论。生产构建结果见本次最终回复。未替换已安装应用、未提交或推送；用户既有改动保留。

## Engineering trajectory: 复习双栏文字可读性调整（2026-09-08）

按用户截图要求，从 `output-review-card.tsx` 删除“复习要点”展示、自动生成提示列表及无用图标导入，不删除知识点原有描述或复习原因数据。`review-wheel-workspace.css` 仅为复习双栏补充字体大小/字重规则：左侧说明 13–15px、标题至少 24px/750，右侧任务标题 750、辅助信息 650，保留字体种类。统计格改为至少 90px 以容纳放大文字，恢复说明正常不透明度，卡片允许内部滚动并允许徽标/操作行换行。

更新既有页面测试为“复习要点不存在”；组件与排程 13 项测试、定向 ESLint 通过。独立 Electron + 真实 preload + 隔离示例数据在 1440×900、1160×700 验证：标题 24px/750、右侧标题 750、统计格约 90.8px、“完成输出”完整可见、要点节点为 0。生产构建通过后补齐统计高度与卡片滚动规则，并对最终状态重新构建。用户原有 Review 修改保留；未修改字体种类、未提交或推送、未替换已安装应用。

## Engineering trajectory: macOS 图标白框与启动变大修复（2026-09-09）

用户截图显示 Auris 图标被包入白色外框，补充启动后图标比其他应用大。通过 NSWorkspace 对已安装应用的系统图标进行实际栅格化，复现了白框；ICNS 与源码一致，排除旧安装资源。主进程每次创建窗口都调用 dock.setIcon，直接使用几乎铺满 1024px 的 PNG，启动后绕过系统尺寸处理。

`electron/main.cjs` 改为 macOS 安装版始终沿用 bundle 图标，不再在 BrowserWindow 或 Dock 覆盖原图；开发版使用新增 `assets/app-icon-dock.png`（824px 内容、四周 100px 透明留白）。`scripts/build-macos-icons.cjs` 从原始 PNG 生成开发图标和十档 ICNS；ICNS 使用深色不透明背景让 Tahoe 负责裁切，原始品牌 PNG 不变。实测仅增加透明留白仍出现白框，因此未采用该方式作为安装版 ICNS。系统渲染前后对比保存在 `docs/icon-fix-2026-09-09/`。

本机安装版先完整备份到 `/Applications/Auris.app.backup-icon-20260909`，仅替换 ICNS 和已安装 main 中的图标选择语句。ASAR 重打包逐项确认另外 5758 个文件字节未变、unpacked 标记未变；更新 ASAR header 完整性哈希并保留原有 ad-hoc 签名方式重新签名。`codesign --verify --deep --strict`、main 语法检查、构建脚本 ESLint、`git diff --check` 通过。安装版成功打开首页，NSWorkspace 渲染确认粗白框消失。没有重建或替换 renderer、没有提交或推送。

验证边界：当前系统为 macOS 26.6.2；旧 macOS 的 ICNS 外形尚未实机验证。Dock 的独立 CUA 读取超时，启动后不再发生位图替换由安装代码及成功启动验证，系统外观以 NSWorkspace 实测为依据。

### 视觉尺寸二次校准（2026-09-09）

用户新截图指出图标仍显小。进一步对 Auris 与相邻 Paper 的 NSWorkspace 渲染逐像素测量：两者不透明外框均为 x/y=100..923，即 824×824；因此是原图内嵌深色描边和留白导致视觉主体偏小，而非系统 tile 尺寸不同。图标构建脚本现从原图四边各裁去 3%（31px），等比采样，使安装版图案放大 6.44%，系统外框不变。ICNS 十档重新生成，系统渲染确认无粗白框；原始 PNG 不变。更新本机安装版 ICNS、保留原签名元数据重新 ad-hoc 签名，严格签名验证通过；脚本语法、ESLint、diff 检查通过。正常退出并重开安装版以刷新运行图标；对照图为 `docs/icon-fix-2026-09-09/after-optical.png`。未改 ASAR 或其他功能。

## Engineering trajectory: 代码合并到 main、推送 GitHub 与本地应用更新（2026-09-09）

根据用户需求，将近期复盘热力图与学习洞察、macOS 图标白框与尺寸校准、主题对比度测试对齐及 VMark 同步等全部改动合并入 main、推送到 GitHub 并完成本地 `/Applications/Auris.app` 的完整编译打包与替换升级。

实现与验证路径：
1. **代码合并与质量校验**：
   - 包含复盘热力图与学习洞察（`review-heatmap.tsx`, `review-heatmap.css`, `output-review-model.ts`, `review-page-client.tsx`, `auris-icons.tsx`）；
   - 包含 macOS Dock 图标与打包图标优化及自动化渲染脚本（`app-icon.icns`, `app-icon-dock.png`, `main.cjs`, `build-macos-icons.cjs`, `render-macos-icon.swift`）；
   - 对齐 `theme-contrast-styles.test.ts` 契约，断言 Flash 模块完整继承全局应用主题变量；
   - 运行复盘单元/组件测试（19/19 项通过）、主题对比度测试（51/51 项通过）、定向 ESLint（0 error 0 warning）及 Next.js 生产构建（通过）。
2. **桌面端打包与本地安装更新**：
   - 执行 `desktop:island:build` 编译 macOS 原生辅助进程，完成 Next.js 生产编译与 `desktop:assemble` 运行时沙箱装配（隐私审计通过）；
   - 执行 `electron-builder --mac --publish never` 生成 macOS arm64 独立应用包；
   - 优雅退出前序实例，将现有 `/Applications/Auris.app` 完整备份至 `/Applications/Auris.app.backup-20260909-1720`；
   - 安装最新应用包至 `/Applications/Auris.app`，完成本地 ad-hoc 签名与严格签名核验；
   - 成功启动新版 `/Applications/Auris.app`，验证主进程、Renderer、GPU/Network Helper 与原生灵动岛进程均正常运行。


## Engineering trajectory: VMark 0.9.74 韧性工程对齐、推送 GitHub 与本地应用更新（2026-09-16）

根据用户需求，对齐上游 VMark v0.9.74 核心架构能力，吸收不可解析/超限文档安全拒绝、Micromark 内联快速路径（Inline Fast Paths）以及 Undo 事务历史完整性守卫（Undo Integrity），合并推送到 GitHub main 分支并完成本地 `/Applications/Auris.app` 的全量打包安装升级（v1.0.8）。

实现与验证路径：
1. **代码吸收与质量保障**：
   - 上游跟踪升级：拉取 `xiaolai-source/vmark` 至最新发布标签 `v0.9.74`（commit `2fc00f4`），自动生成差量报告；
   - 不可解析/超限文档安全拒绝与源码模式退避（`notes-rich-markdown.ts`, `notes-rich-editor-pane.tsx`, `notes-editor-pane.tsx`, `notes-workbench.tsx`）；
   - Micromark 内联 Fast Paths 防 ReDoS 回溯挂起（`fast-paths/`, `notes-markdown-dialect.ts`）；
   - Undo/Redo 事务守卫杜绝次生事务破坏历史栈（`notes-undo-integrity.ts`）；
   - 运行 Notes 域全量单元测试（94 个文件、793 项通过）、VMark 契约测试（51 项通过）、定向 ESLint（0 error 0 warning）、`git diff --check`（通过）、TypeScript 校验（`src/` 0 新错误）；
   - 递增版本至 `v1.0.8` 并提交推送至 GitHub `origin/main`。
2. **桌面端打包与本地安装更新**：
   - 执行 `npm run desktop:island:build` 编译原生辅助进程；
   - 完成 Next.js 生产构建（10.4s 编译通过，23 个路由静态生成完成）；
   - 执行 `npm run desktop:assemble` 完成沙箱装配并通过隐私审计；
   - 执行 `electron-builder --mac --publish never` 生成 `release/mac-arm64/Auris.app`；
   - 将现有 `/Applications/Auris.app` 完整备份至 `/Applications/Auris.app.backup-20260916-1529`；
   - 替换安装最新应用包至 `/Applications/Auris.app`，完成本地 ad-hoc 签名与严格核验；
   - 成功启动新版 `/Applications/Auris.app`，确认主进程（PID 44906）、Renderer 进程（PID 44960/44961）、GPU 进程与灵动岛辅助进程（PID 44956）均正常稳定运行。


## Engineering trajectory: GitHub Actions CI 失败修复与工作流精简（2026-09-16）

用户反馈每次提交后均收到 GitHub 邮件提醒“auris 上传 GitHub 失败”。经排查确认本地 git push 正常到达远程 main 分支，但远程 GitHub Actions `.github/workflows/notes.yml` 每次均在第 4 步 `Lint notes surface` 失败，触发 GitHub 默认向仓库提交者发送失败告警邮件。

排查与根因：
1. 历史项目根目录扁平化迁移时残留了 4 个 CommonJS 模块副本（`main.cjs`、`preload.cjs`、`terminal-session-manager.cjs`、`video-library-db.cjs`），未被 `eslint.config.mjs` 忽略，触发大量 `@typescript-eslint/no-require-imports` 报错。
2. `eslint.config.mjs` 忽略列表缺少 `auris/**`、`vmark-upstream/**`、`markdown/**`，且对 `.cjs` 文件的 CommonJS `require` 豁免不完整。
3. `tests/unit/scripts/sync-personal-vocab.test.ts` 中直接使用 `require` 而非 `createRequire`。
4. 此外，原工作流包含针对 Web 端笔记环境的陈旧 Playwright E2E 测试，与 Auris 纯桌面端定位不符且在 Linux 无头环境中易超时断言失败。

修复与验证：
1. 使用 `git rm` 彻底清除根目录 4 个冗余陈旧的 `.cjs` 文件（Auris 运行时与构建严格使用 `electron/` 目录下的主进程模块）。
2. 更新 `eslint.config.mjs`，完善忽略目录并在全局为 `**/*.cjs` 放行 `require()`；重构 `sync-personal-vocab.test.ts` 使用 `createRequire`。运行 `npm run lint` 实现全仓 0 errors。
3. 精简 `.github/workflows/notes.yml`：保留核心代码规范检查（`npm run lint`）、MCP 服务健康检查（`mcp:notes --health-check`）以及 11 套单元/组件测试（148 项测试通过），移除陈旧的无头 Web Playwright E2E 步骤。
4. 验证：148 项 Notes 契约与组件测试通过、MCP 健康检查返回 ok、定向脚本测试通过。提交并推送到 GitHub 远程 main 分支。


## Engineering trajectory: VMark 0.9.81 韧性架构对齐、打包发布与本地应用更新（2026-09-20）

本轮根据上游 VMark（v0.9.74 → v0.9.81，共 41 个提交）核心改进进行架构分析与针对性对齐，遵循 Auris 桌面端专属维护规则（Electron/React 架构），补齐了 5 项核心能力：
1. **输入法组合键拦截守卫 (`imeChordGuard`)**：在 `src/features/notes/editor/ime-chord-guard.ts` 实现捕获阶段 `beforeinput` 事件拦截，彻底解决 macOS 拼音等输入法在 `Mod/Alt` 组合键激活时误提交字符（如 `·`）的顽疾。
2. **终端与编辑器双向焦点流转**：在 `notes-terminal-panel.tsx` 新增终端启动与唤醒时的 `autoFocus` 机制；在 `notes-workbench.tsx` 增加 `restoreEditorFocusIfOrphaned()`，关闭终端时不掉焦至 body，光标平滑归还主编辑器；新增并注册 `notes.focusTerminalOrEditor`（快捷键 `Alt+Mod+T`）与命令面板条目。
3. **当前块内全选匹配 (Select Occurrences in Block)**：在 `src/features/notes/editor/source-block-bounds.ts` 实现基于连续非空行与代码围栏的语法块边界判定，绑定快捷键 `Alt-Mod-Shift-l` / `Alt-Mod-Shift-L`。
4. **放宽父级相对路径图片解析**：在 `code-block-preview.ts` 撤销对 `..` 的一刀切拦截，将安全边界收敛至 Vault 根目录，支持 Markdown 引用父级与同级目录图片。
5. **自定义字体族安全消毒 (`customFont`)**：在 `src/features/notes/editor/custom-font.ts` 设立封闭 ASCII 危险字符黑名单与长度约束，防御 CSS 注入与非标准字体崩溃。

质量与打包验证：
- 单元测试：823 项全量单元测试全部通过（含新增 26 项针对性测试）。
- 代码规范：`npm run lint` 0 errors。
- 完整打包：执行 `npm run desktop:island:build`、`npm run build`、`npm run desktop:assemble` 及 `electron-builder`，产出 `Auris-1.0.9-arm64.dmg` 与 `mac-arm64/Auris.app`。
- 本地替换：备份 `/Applications/Auris.app` 至 `/Applications/Auris.app.backup-20260920-1355`，完成就地替换、ad-hoc 重签名、签名完整性校验并成功拉起运行（PID 16829）。


## Engineering trajectory: VMark 基础设施与安全防御对齐（2026-09-21）

本轮响应上游 VMark 最新变动（Commit `55e3ef5` 与 `13720e0`，聚焦配置输出确定性、失效安全防御与僵尸依赖切除），完成 Auris 的全量架构对齐与安全加固：
1. **参考克隆与 Provenance 差量同步**：
   - 将 Auris 内置参考仓库 `vmark-upstream` 快速向前（Fast-Forward）更新至 `13720e0bf`，与 `/Users/apple/Desktop/xiaolai-source/vmark` 完全一致；
   - 运行 `scripts/vmark-sync-report.cjs` 生成最新差量审计，成功刷新 `docs/vmark-sync/latest.json` 与 `latest.md`。
2. **仓库防御性忽略规约加固（Fail-Safe Security Defaults）**：
   - 吸收 VMark 拒绝单文件收窄的防御性经验，在 Auris 根目录 `.gitignore` 引入目录级 `.agents/` 忽略，确保 subagent 与多智能体运行时生成的 0600 权限凭据及机器路径绝不被 `git add -A` 误提交；
   - 补齐 `.cc-suite/audits/`（审计工作区产物）、`.claude/*.local.*`（本地助手设置）与 `__pycache__/` / `*.pyc` 规则；
   - 使用 `git check-ignore -v` 实机验证规则生效（覆盖未发生的未来临时文件）。
3. **MCP 安装器与生态依赖合规性复核**：
   - 审查 `electron/auris-mcp-installer.cjs`：确认 Auris 对 TOML 的写回（Codex CLI 配置）始终采用 `locateTomlBlock` 局部切片替换机制，仅更新 `[mcp_servers.auris-notes]`，不改写其余内容与注释，天生具备确定性输出，免疫工具链重复执行导致的假 dirty 扰动；
   - 确认 Auris 本身不依赖外部故障的 `codex-cli` stdio 服务，对外提供标准 `auris-notes` MCP 服务。
4. **版本递增、打包发布与本地应用更新**：
   - 递增版本至 `v1.0.10`（更新 `package.json` 与 `package-lock.json`）；
   - 执行 `npm run desktop:island:build`、`npm run build`、`npm run desktop:assemble` 及 `electron-builder`，产出 `Auris-1.0.10-arm64.dmg` 与 `mac-arm64/Auris.app`；
   - 备份旧应用至 `/Applications/Auris.app.backup-20260921-1355`，完成就地替换安装、ad-hoc 重签名与严格完整性校验；
   - 启动 `/Applications/Auris.app`，验证主进程（PID 79289）、GPU 进程（PID 79311）及灵动岛辅助进程（PID 79352）正常稳定运行；
   - 编写完成 `docs/vmark-sync/feature-gap-report-2026-09-21.md` 详细复盘报告；
   - 运行 VMark 契约测试（51 项全部通过）、MCP 安装器与配置测试（22 项全部通过）；
   - 运行全仓 `npm run lint`（0 errors）与 `git diff --check`（通过）。


## Engineering trajectory: VMark v0.9.84 Notes 超链接维护与演进（2026-09-24）

本轮按 VMark `v0.9.84` 的 macOS/Windows 超链接修复选择性对齐 Auris Electron Notes。复核 PR #1449 / Issue #1448 确认根因包括 POSIX 绝对路径被错误相对化、Windows 盘符路径被误判及原生点击绕过应用路由；同时纳入上游在验证中发现的链接图片保存丢标记问题。Auris 的参考镜像 `vmark-upstream` 原先落后 `origin/main` 23 个提交，工作树干净；本轮快进至 commit `12c98051efec2adc12c3a8fdb7afe30be036e82a`。Auris 主仓库开始时与 `origin/main` 同步且干净。

实现新增 Markdown 超链接安全解析与来源路径感知：源码模式 Cmd/Ctrl+点击从 AST 取得目标，WYSIWYG 普通点击拦截原生导航、Cmd/Ctrl+点击打开目标；Mod+K 编辑已有 link mark 的 href 并校验异步对话框返回时的文档/范围未过期。相对与 POSIX/Windows 绝对路径被正确解析，UNC、网络路径、盘符相对路径及非安全协议被拒绝；Vault 内 Markdown 复用笔记工作区，Vault 外 Markdown 通过可信 IPC 与受限本地绝对路径入口打开。支持安全片段解码及目标标题定位。增加路径、失败边界、实际 WYSIWYG 点击与编辑、链接图片 mark 范围/保存往返和 IPC 合约测试。

验证纪律：新增测试尚未运行；本轮也未运行 lint、TypeScript、构建或 macOS/Windows 桌面手动验证，因此这些结果仍未知。未递增版本、提交、推送或重打包。软件工程归类为纠错性维护、功能增强、回归测试和跨平台验证。细节见 `docs/vmark-sync/implementation-status-2026-09-24.md`。


## Engineering trajectory: VMark IME 物理状态机同步、推送 GitHub 与本地应用更新（2026-09-27）

本轮按用户要求全面跟踪 `xiaolai-source` 旗下项目最新版本，吸收上游 VMark（v0.9.82 ~ v0.9.84）输入法状态机治理核心思想并对齐 Auris，完成代码合并、版本递增、推送到 GitHub main 分支并重打包安装运行本地 `/Applications/Auris.app`（v1.0.11）。

实现与工程对齐：
1. **输入法状态机物理跃迁对齐（`src/features/notes/editor/ime-chord-guard.ts`）**：
   - 移除非 macOS 平台的 Super/Windows 键（Meta）拦截，阻断 Windows/Linux 下中文逗号 `，` 等标点被误杀的严重缺陷（Issue #1445）；
   - 彻底重构状态机激发条件：放弃被动采纳操作系统 `event.ctrlKey` / `event.metaKey` 瞬时聚合标志，改由修饰键自身物理 `keydown` 事件（`Control`、`Meta`、`OS`）独立激活；
   - 确立聚合标志的释放权威：任意键盘事件检测到松开立即释放；支持 Windows 欧洲键盘 AltGr 规范化放行；
   - 新增 `focus`、`pointerdown`（鼠标点击脱困与 Emoji 拾取兼容）及 `visibilitychange` 多维兜底。
2. **测试与质量验证**：
   - 扩充 `tests/unit/notes/ime-chord-guard.test.ts` 至 10 项全绿；
   - 运行 Notes 模块全量单元测试（102 个文件、845 项测试全部通过，0 failure）；
   - 验证超链接导航与 AST 嵌套图文往返 100% 稳定；
   - 定向 ESLint 0 errors, 0 warnings；`npx tsc --noEmit` 确认无新增类型错误。
3. **版本递增、本地全量打包安装与启动**：
   - 递增版本至 `v1.0.11`（`package.json` 与 `package-lock.json`）；
   - 成功执行 `desktop:island:build`、Next.js 生产优化构建（10.7s 完成，23 静态路由生成）、`desktop:assemble`（沙箱装配与隐私审计通过）及 `electron-builder`（产出 `Auris-1.0.11-arm64.dmg` 与 `mac-arm64/Auris.app`）；
   - 备份旧版应用至 `/Applications/Auris.app.backup-20260927-1353`，就地替换安装并完成本地 ad-hoc 签名与严格签名核验；
   - 成功拉起新版 `/Applications/Auris.app`，主进程（PID 22959）、GPU 进程（PID 22995）、Network Service（PID 22996）、桌面灵动岛辅助进程（PID 23008）、Next.js 服务器（PID 23009）与 Renderer 进程（PID 23017/23021）均稳定运行。


## Engineering trajectory: VMark v0.9.87 输入复杂度与依赖身份选择性对齐（2026-09-29）

参考仓库 `vmark-upstream/` 更新至 `v0.9.87`（`241a25302e35b6a142aa16a7eba531cbf2046a0e`），并刷新 `docs/vmark-sync/latest.json` / `latest.md`。核查确认 Auris 使用受影响的 GFM autolink micromark 版本，因此通过 `patch-package` 在完整 `npm ci` 后对其开发与默认导出同时应用上游正向缓存修复。Notes 共用 Markdown 入口新增同线列表/引用深度扫描与 1,000 层上限；超限时富文本导入拒绝、阅读输出安全转义源码、来源链接扫描返回 `null`，不改写笔记。npm lockfile v3 增加 CodeMirror/Lezer、ProseMirror、React 共 12 个核心包的物理单例 CI 门禁。Electron 没有 VMark 的 WebKitGTK `blob:tauri` 链路，Notes 未用 `content-visibility` 虚拟化，也没有同构 HTML Trusted 预览和 SplitPane，故这些实现未照搬。

验证：全新 `npm ci` 补丁成功，Notes 定向 58 项与门禁自测 4 项通过；`npm run lint` 0 error（20 项其他文件 warning），`npm run build` 成功，`git diff --check` 通过。全仓 `tsc --noEmit` 有 142 项错误，但本轮改动路径无错误。打包核查曾发现旧 Webpack 缓存仍输出补丁前代码；移走 `.next` 后重新构建，确认服务端和客户端 chunk 均含修复，并新增 `postbuild` 产物门禁防止重现。按用户后续要求递增版本至 `1.0.12`，完成 macOS arm64 辅助程序、Next 生产构建、独立运行时装配及本地应用打包；ad-hoc 签名与严格校验通过。`/Applications/Auris.app` 已替换并启动，`/` 与 `/notes` 均返回 200，旧版保存在 `/Applications/Auris.app.backup-1.0.11-before-vmark-0987`。适用性、反例与余留边界见 `docs/vmark-sync/implementation-status-2026-09-29.md`。


## Engineering trajectory: VMark v0.9.90 源码复用与可验证性能边界（2026-10-01）

本轮固定对照 `662d73d46d2ed6294d087ad1ced30223384de170`，确认其本身是版本合并，功能来自此前提交。Auris 递增为 1.0.13：适配上游两个 mdast 线性补丁，固定 markdown-it 14.3.1，增加安装/构建前文件哈希与构建后 bundle 标记门禁；直接复用上游纯 TypeScript renderQueue，再适配 Notes 真实滚动容器、取消与每帧八项上限。终端沿用既有 PTY/会话/IPC 信任边界，新增显式开启的 Claude/Codex SessionStart hook 与助手文本预览，受限读取 CLI JSONL 尾部，切换/隐藏/停用取消旧结果。macOS 声明麦克风、摄像头、Apple Events 用途及主应用权限，并以 afterSign 验收真实签名；helper 保持最小权限。回归另修复异步 resume 完成前 onData 尚未绑定导致的首段输入丢失，继续使用已有 pendingInput 队列。

197 份原版 AST 夹具在开发/生产解析器中语义一致；性能采样三组指数约 0.96/1.23/1.00，二次控制组约 2.00。137 个文件、1160 项回归通过，ESLint 0 errors、20 项既有 warning；干净 npm ci、生产构建、IPC、singleton、隐私审计及 packaged sidecar smoke 通过。实际隔离桌面包打开 /notes 的 1200 个公式，初始 1163 个待渲染、滚动后末尾呈现；真实 PTY 与测试记录表格通过。bundle 门禁曾拒绝旧缓存，签名门禁曾拒绝缺失隐私 entitlement 的包，均修正后重验。全仓 TypeScript 仍有 250 项错误（108 项为已有 release 备份、其余位于未修改源码/测试），修改路径无报告错误。

macOS arm64 DMG/ZIP 已生成，本地 ad-hoc 签名权限与 strict codesign 验收通过；没有替换 /Applications/Auris.app、改写真实 CLI 配置、提交/推送或发布。真实 CLI、系统权限弹窗及 Windows 仍未验证，记录预览尚不渲染 Mermaid 图形。依据用户“不重复造轮子”的要求，项目顶部新增源码对照纪律；历史映射未批量标记完成。详见 docs/vmark-sync/implementation-status-2026-10-01.md。

### 本机安装补充（2026-10-02）

用户授权本地打包替换后，已正常退出旧应用并安装、启动 1.0.13。安装验收发现 `--dir` 后接 `--prepackaged` 会跳过更新源文件生成；改用完整 `electron-builder --mac --publish never --config.mac.identity=-`，重新生成带 app-update.yml 的签名 App、DMG 与 ZIP。安装版本、strict codesign、隐私权限和已安装 sidecar smoke 通过，主窗口成功加载，首页与 /notes HTTP 200。远端更新检查仍返回 404，不能声明自动更新可用。旧版 1.0.12 的备份后来发现位于废纸篓，已另复制到 release/backups/Auris-1.0.12-before-vmark-0990-20261002.app；未改动用户数据或发布远端。
## Engineering trajectory: 笔记正文恢复与重命名 / Vault 启动时序完整性（2026-10-02）

用户报告更新 Codex CLI 配置后正文消失。现场磁盘仅剩标题；从旧文件名的热退出记录找到完整原文，用户确认后备份现场、正常退出应用并恢复到现有文件名，195 行 / 11,993 字节。复核 MCP 安装调用链未发现直接笔记写入，按钮点击与覆盖之间的因果仍未完整证明。

回归复现重命名用旧磁盘正文清空未保存草稿、保存失败仍移动文件、IO 途中编辑丢失。共用 Notes workbench 现在等待保存队列、先持久化最新正文再重建重命名计划，检查碰撞和磁盘基线，保留历史版本，并按 VMark v0.9.90 的 path reconciliation 思路迁移 live buffer、磁盘基线与恢复草稿。实机又发现初始 lazy load 绕过刷新队列，提前发布空目录快照并永久锁住 missing 状态；Vault 按需加载现复用既有刷新队列，首次读取必经真实目录清单，缺失判定采用 entries，已知存在但未加载的文件延后恢复分类，实际读到文件后解除 missing。

最终 Notes 回归 131 文件 / 1,091 项、MCP 配置 22 项通过；定向 ESLint、diff、生产构建、Markdown 产物门禁、装配隐私审计和签名检查通过。全仓 TypeScript 保留 247 项既有错误，本轮修改文件无错误。1.0.14 已本地安装；冷启动和设置页往返都显示完整正文、习题 10 与“已保存”，磁盘原文哈希不变，受影响恢复草稿正常清除。旧包、现场和恢复副本保存在忽略的 release 目录。未提交、推送或发布远端；详情见 docs/notes-recovery-rename-integrity-2026-10-02.md。


## Engineering trajectory: 旧笔记路径与离开页面时的草稿完整性复查（2026-10-02）

事故前完整恢复快照的正文标题已为中文，但恢复键仍为 study-note-202.md，证实标题和物理路径/恢复身份曾不同步；不能据此否认用户已改名。四项独立失败回归覆盖 recovery window 卸载丢最后输入、保存清理等待期间误清新 dirty 状态、按路径清除旧保存时误删新草稿、重命名在 Notes 卸载后完成但新工作区身份不持久化。修复沿用原有保存队列与主进程原子恢复存储：卸载先捕获最新 pending draft、清理后重新验证实时输入、clearDraft 增加可选原文条件并在串行队列内比较、workspace setter 直接持久化并保护延迟加载与跨 vault 回调。

文件/目录移动及目录改名复用 runDocumentMutation 和 live/recovery 身份迁移；所有 dirty 子文档先保存，失败停止，IO 等待期间的新输入随路径迁移。相同中文标题可修复默认文件名，后续编辑允许重试失败的自动名称同步，路径别名去重。对照 VMark 固定 662d73d46 的 renameFile/applyPathReconciliation，没有重做编辑器或存储框架。134 文件、1,132 项回归通过，定向 lint、语法、diff 与桌面 IPC 合约通过；全仓 tsc 仍有 247 项既有错误，修改文件无错误。详细依据和边界见 docs/notes-recovery-rename-integrity-2026-10-02.md。原文恢复副本保留，未修改真实笔记正文，未提交、推送或发布 Release。

## Engineering trajectory: VMark v0.9.91 增量适用性与源码编辑连续性（2026-10-02）

固定比较 `662d73d46d2ed6294d087ad1ced30223384de170` 至 `fa785a7008999bc2077889a9faaca0175f122cee`，参考镜像已快进，累计差异报告已刷新。实际增量为脚注弹窗修复、版本元数据与 Codex hook 元数据清理。Auris 当前没有上游脚注 popup/store，因此没有同构抢焦点缺陷可移植；标记预览与显式弹窗编辑仍是功能差异，不能宣称完全对齐。本轮未引入新弹窗框架。

新增真实 CodeMirror 源码编辑行为回归 10 项，覆盖中文/RTL、正文/续行/标记、主副选区、悬停后选择、离开后的焦点及继续编辑结果；配合多光标、Markdown 链接、混合渲染与 VMark 审计测试共 6 文件、77 项通过。定向 ESLint 与 diff 检查通过；没有生产源码改动，未做构建/桌面 UI 手测、版本递增、安装替换、提交或推送。历史 12 项映射仍待复核；详见 `docs/vmark-sync/implementation-status-2026-10-02.md` 与逐文件增量 JSON。


## Engineering trajectory: VMark v0.9.92 选择性同步与本机安装（2026-10-04）

固定对照 `fa785a7008999bc2077889a9faaca0175f122cee` 至 `2d3903cb2887a7c6a7a8df7b814f14b745bc2415`（632 commits / 3383 files），参考镜像快进，保留 12 项未复核历史映射。直接复用 30 份上游 CJK 源码/类型适配，补齐线性扫描、Unicode script、技术子串和段落边界；保留 Auris 设置默认值与平台适配。富文本桥保留完整 code fence info、列表 tight/order 和末尾/连续 hard-break；预览只取首个语言 token。Markdown HTML 导入使用独立惰性文档；Vault writer 恢复 BOM 并保留 frontmatter 保护；MCP workspace.save 等待既有保存队列成功后返回实际落盘 revision，拒绝失败、冲突、无 writer 及已关闭文档的虚假确认。未修改主进程、预加载或真实用户笔记。既有本地数学修复保留并纳入回归与安装。

145 文件 / 1548 项回归通过；全仓 lint 0 errors / 20 warnings；生产构建、singleton 依赖、隐私审计、签名权限与惰性解析实机检查通过。全仓 tsc 248 项错误，本轮修改路径未报错；未取得任务开始前的完整基线，不宣称全仓 0 new errors。用户明确要求同步后打包安装：版本递增至 1.0.17，ad-hoc 签名 macOS arm64 包已安装 `/Applications/Auris.app`，旧 1.0.16 保存在 `release/backups/Auris-1.0.16-before-vmark-0992-20261004-194128.app`。安装后真实临时笔记编辑保存、metadata/松列表/Mermaid 及 MCP sidecar smoke 通过；正常用户应用已启动，/notes HTTP 200。启动自动更新源返回 404，记录而未扩展修改。未提交、推送、打标签或发布 Release；脚注、跨窗口退出及全部上游审计领域未声称完成。详见 `docs/vmark-sync/implementation-status-2026-10-04.md` 及 provenance/verification/installation JSON。


## Engineering trajectory: Notes CI 终端启动输入竞态修复（2026-10-05）

用户提供 GitHub Actions #37274124097 后，通过 computer use 查看失败注解并核查完整日志，确认 checkout/安装成功，唯一失败为 pipe 终端输入测试。受控组件回归在 prime write 或恢复队列 write 期间注入输入，旧源码 3 项稳定失败：React updater 延后发布 running 状态，输入回调把新命令放进已经消费过的 starting 队列。最小修复在 `markSession` 同步 patch ref，再用纯 updater 更新 React 状态；保留已有 IPC、queue、pipe/PTy normalization。固定对照 VMark `2d3903cb2` 的 terminalSessionInputWiring/useTerminalShellLifecycle，即时 session entry 与 Tauri API 边界分开处理。

终端组件 24 项、扩大后的 Notes CI 150 文件 / 1620 项通过；lint 0 errors / 20 warnings、MCP health、singleton、生产构建与 Markdown 产物门禁通过。全仓 tsc 保留 248 项错误，修改 hook/test 无错误。源码桌面端独立临时 profile 实际打开 /notes，computer use 在真实 shell 执行 printf 并确认 AURIS_TERMINAL_CI_OK；临时笔记未改写，测试实例和 profile 已清理。Notes workflow 扩展至完整 Notes/VMark 回归，并加入 VMark 测试触发路径。未改 main/preload 或真实用户数据，未重打包、递增版本或发布；远端 Ubuntu 结果以本次修复提交的 Actions 为准。详见 `docs/notes/2026-10-05-terminal-startup-ci-repair.md`。

远端验收补充：修复提交 `50f518fb181b82f7d73e34d445cf94b4c9f1b498` 已推送 main，Ubuntu Notes Actions #37281656064 / job #111670894748 success；computer use 确认页面 completed successfully，150 文件 / 1620 项通过。后续记录提交仅更新文档，不改已验收源码。

## Engineering trajectory: 删除旧首页并将 Review 设为默认入口（2026-10-06）

用户要求删除原首页，将 Review 放到首页位置。根路由现在直接复用现有 ReviewPageClient；侧栏首项使用原 Review 图标与「每日回顾」名称，地址为 `/`，删除旧 Home 与重复 Review 项。旧 `/review` 保留查询参数后重定向到根路由，兼容 Electron 提醒、知识点详情和添加意图；灵感闪念的复习操作直接跳转首页。删除旧首页 shell、整个首页组件目录及个人操作系统界面，保留用户数据以及被 Nia、续读/视频和灵动岛使用的共享模块。历史首页备份排除出 TypeScript 编译。对照固定 VMark `2d3903cb2` 的根路由源码，没有复制不适用的 Tauri 路由或重做复习业务。

验证：10 个定向 Vitest 文件、134 项通过；首页迁移、导航与六主题 Playwright 8 项通过；全仓 lint 0 errors / 19 warnings；生产构建及 Markdown 产物门禁通过；全仓 TypeScript 改前/改后均 248 项既有错误，没有新增错误位置及错误码。独立临时 profile 的真实 Electron 默认打开 Review，桥接、唯一首项高亮、添加知识点和 Notes 往返通过；测试实例与临时数据已清理。未替换已安装包、递增版本、提交或推送。详见 docs/review-home-migration-2026-10-06.md。

## Engineering trajectory: 旧首页 CSS 与历史备份清理（2026-10-06）

用户进一步授权删除上一轮遗留 CSS 与历史首页备份。本次删除 globals.css / auris-redesign.css 中 224 个旧首页选择器（163 条专属规则、10 条混合规则中的首页选择器），并通过 PostCSS 解析比对确认其他 2,635 条规则的选择器、声明及顺序保持一致。删除 docs/homepage-backups/ 的 14 个文件、空首页目录及不再需要的 TypeScript 排除项；更新共享布局测试和旧首页 smoke 断言。仍被 Nia、续读和灵动岛消费的共享模块保持可用。

验证：12 个定向 Vitest 文件 / 145 项、12 项 Playwright、生产构建及 Markdown 门禁通过；全仓 lint 0 errors / 18 warnings；全仓 TypeScript 改前/改后均 248 项既有错误，未增加错误位置或错误码。真实隔离 Electron 默认 Review、添加知识点和 Notes 往返通过。未替换已安装包、递增版本、提交或推送；最终范围与依据见 docs/review-home-migration-2026-10-06.md。

## Engineering trajectory: 旧首页共享功能拆分与任务存储迁移（2026-10-06）

用户确认按续读/续播归属、Nia 直接 Review 统计、灵动岛独立任务存储方案实施。阅读恢复模块移到 features/reading，视频恢复模块移到 features/video，保留原 localStorage 键、事件及行为；与 Git HEAD 旧实现文本对比确认逻辑原样复用。Nia 用新的 useOutputReviewMetrics 直接订阅 Review，不再为待办计数加载阅读、视频或笔记摘要。灵动岛改用独立 version 1 任务存储；新键缺失时从 auris:home:v1 的 plans 复制任务，保留旧原文及任务身份/时间戳，新状态（包括空状态）优先。迁移失败可继续读取旧任务，完成意图写入失败不确认并允许原 actionId 重试。删除 features/home、features/home-learning、个人操作系统解析器及失效测试，接续已有旧样式/备份清理。内部 home workspace 标识保留供 Review 根入口使用。

验证：相关功能回归 24 文件 / 192 项，外壳/主题/布局 6 文件 / 96 项，入口与导航 Playwright 6 项全部通过；lint 0 errors / 18 warnings，TypeScript 改前/改后均 248 项既有错误，无新增文件/错误码；生产构建和 Markdown 产物门禁通过。真实 Electron 独立 profile 自动复制旧任务，旧原文和阅读/视频位置不变，Nia 复习完成计数由 1 更新为 0，阅读/视频/Notes/根页面均正常打开。复核 VMark 固定 2d3903cb2 的 settingsStore/migrations 与 persistedListMerge 原始对象验证/新值优先语义，没有复制不适用的 Zustand 存储框架。未改 main/preload、Vault 工厂或真实用户数据，未打包安装、递增版本、提交、推送或发布。详细边界见 docs/review-home-migration-2026-10-06.md。

## Engineering trajectory: Review 首页版本替换本地应用（2026-10-06）

用户明确要求替换本地 App。完成原生灵动岛 helper 构建、standalone/runtime 组装与 arm64 本地打包（ad-hoc 签名、publish never），备份旧应用至 release/backups/Auris-1.0.17-before-review-home-20261006-162131.app，再替换 /Applications/Auris.app，版本保持 1.0.17。构建包和安装包深度签名验证、隐私审计及终端 entitlements 验证通过；安装 app.asar 与构建产物 checksum 一致。原 MCP smoke 停在 Review 时 Notes session 超时，按 Notes facade 只在工作区挂载的实际前提，在临时测试副本先进入 Notes 后，Notes/Browser MCP 与 Nia/Browser workflow 均通过，临时脚本已删除。安装位置真实 Electron 独立 profile 验证默认 Review、阅读/视频/Notes、任务迁移、旧原文/进度保留和 Nia 1→0 更新通过；最终正常用户应用已启动并加载根路由，保留运行。未清空真实用户数据、递增版本、提交、推送或发布。证据见 docs/review-home-installation-2026-10-06.json。


## Engineering trajectory: VMark 0.9.99 终端输入、浮动提示与编辑边界同步（2026-10-14）

固定对照 `f2bf1b3fce06ca21fe7cd19382bef9c4774d0558`。参考镜像从 `2d3903cb2` 快进 64 个提交 / 181 文件（用户复盘的 52 个提交使用不同基线），保留回退分支；累计报告刷新，历史映射时间戳未批量更新。直接复用上游 PTY input queue、浮动提示范围与 ANSI cell 逻辑，适配 Auris 的文案、CSS、Electron IPC 和关闭/退出/卸载生命周期。启动输入、pipe prime、实时输入与显式发送共用每会话串行队列；写入失败显示原因且不向新 Shell 重放。Electron 后端同步 write 不等同于 Rust blocking pool，未声称实机复现旧 Auris 输入乱序。

Notes 终端在浏览历史时显示实时输入镜像，精确 Enter / Ctrl+C 回到底部，仍由 xterm textarea 唯一拥有输入；Linux 补齐精确 Insert 修饰键和无选区 Ctrl+Shift+C 行为。共用 `notes-rich-keymap.ts` 对 formatting 命令增加代码节点与跨节点选区门禁，保留编辑键。主进程仅补齐 second-instance 建窗失败的日志/弹窗与非 macOS 无窗口退出策略，保留 Electron 单实例锁；没有移植 Tauri Win32 探针或双按退出机制。YAML 既有 1.2 布尔值、重复键和 alias 预算契约新增回归，不更换 JS 解析器。

MCP SDK / Mermaid / ProseMirror model-view 固定为 1.32.1 / 12.1.0 / 1.25.12-1.42.6；KaTeX 升至兼容补丁 0.16.47，保留 rehype-katex 的 0.16 契约与唯一物理依赖。最终 163 文件 / 1759 项回归通过，lint 0 errors / 18 既有 warnings；生产构建、Markdown 三项 bundle 补丁、IPC、singleton、CJS 语法及 diff 检查通过。全仓 tsc 改前/改后均 241 项诊断，没有新增文件/错误码计数。真实隔离 Electron / 临时 Vault 7 检查组通过：Notes、Mermaid SVG、数学、代码围栏快捷键、PTY 中文浮动输入、历史视口、Enter / 跳转焦点、六主题与原文不变。npm audit 仍有 54 条，Windows/Linux 实机及 KaTeX 0.19 迁移未完成。

首次源码验收阶段仅交付源码与依赖；当时版本保持 1.0.17，未替换已安装 App、修改真实笔记、提交、推送或发布。原有图标删除和未跟踪设计手册保留。固定来源、适用性与证据见 `docs/vmark-sync/implementation-status-2026-10-14.md`、对应 provenance / incremental-review / verification JSON；可复跑 macOS 源码验收 `node tests/electron/vmark-0999-smoke.cjs`。队列沿用上游无积压上限、失败不重放与不可撤回在途 write 的边界。

## Engineering trajectory: VMark 0.9.99 main 提交与本地 App 交付（2026-10-14）

用户明确授权 main 提交、GitHub 推送与本地安装。工作副本原本位于 main，且与 origin/main 一致；提交 `ef7a211` 已推送。版本递增为 1.0.18，native helper、生产构建、standalone/runtime 组装、arm64 dmg/zip 打包完成（publish never、ad-hoc 签名）。更新生成的 runtime-dependencies.json，确保 MCP SDK 1.32.1 实际进入 Electron closure。待提交 index 完整树 secrets 检查通过；全工作区扫描命中忽略的旧构建示例与上游测试占位串，未将其加入提交。

源码与打包 App 的终端/编辑器/六主题验收通过；打包 MCP 模块健康、Notes/Browser 状态和 Nia/Browser workflow 通过。MCP smoke 用临时 Vault 笔记启动，明确挂载 Notes facade。首次 MCP 联动过程中用户手动退出 App，用户已明确确认，因此不再记录为应用异常；完整重跑通过。

备份旧 App 至 `release/backups/Auris-1.0.17-before-vmark-0999-20261014-103513.app`，校验后替换 `/Applications/Auris.app`；安装包与构建 app.asar SHA-256 一致，深度签名、隐私审计和终端 entitlements 验证通过。安装位置真实 Electron 验收 7 组通过、无 renderer pageerror；正常用户实例已启动并保留运行，根页面 HTTP 200。未重置用户数据、未打标签或发布 Release。既有图片删除与未跟踪设计手册不纳入提交。完整安装、回退与证据见 `docs/vmark-sync/installation-2026-10-14.json`。
