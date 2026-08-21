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
