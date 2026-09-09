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

