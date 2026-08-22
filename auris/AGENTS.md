# AGENTS.md — 桌面端专属维护规则

本项目自 2026-06 起仅维护桌面端（Electron）。  
Web 端（登录、注册、计费等）已于 2026-06 移除，请勿恢复。

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
| `/` | `DesktopHomeShell` | 首页 |
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
