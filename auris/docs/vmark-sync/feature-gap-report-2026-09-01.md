# Auris × VMark 最新更新对齐报告（2026-09-01）

> 核对时间：2026-09-01（GMT+8）
> VMark：`xiaolai/vmark` `v0.9.59` @ `47161298299a887a349003843b938f2c19dca261`（2026-09-01 09:10 GMT+8）[VERIFY: ../research/vmark-upstream/package.json:4]
> Auris：本地 `main` @ `4cc3ec1c6f32739b57f858c16bb898d7b8621635`，版本 `1.0.4`。[VERIFY: package.json:3]
> 人工增量基线：上一份报告使用的 VMark `6f1e1d9777d4ef62eed03cebe1c69b3c9013941d`（2026-08-23）。[VERIFY: docs/vmark-sync/feature-gap-report-2026-08-24.md:3]

官方来源：[VMark 仓库](https://github.com/xiaolai/vmark)、[v0.9.59 Release](https://github.com/xiaolai/vmark/releases/tag/v0.9.59)、[本轮完整比较](https://github.com/xiaolai/vmark/compare/6f1e1d9777d4ef62eed03cebe1c69b3c9013941d...47161298299a887a349003843b938f2c19dca261)。

## 执行结论

本轮从上一份人工基线到 VMark `v0.9.59` 共 **70 个提交、779 个文件、+29,768 / -7,906 行**，跨越 `v0.9.51` 至 `v0.9.59` 九个版本。自动 provenance 报告已刷新到同一提交，但它从更早的 manifest 基线累计比较，因此其中 1,841 changed、1,728 added 等数字不能解释成“本轮新增功能数”；`missing Auris targets = 0` 也只说明 manifest 指向的 Auris 文件仍存在，不代表功能已经对齐。[VERIFY: docs/vmark-sync/latest.md:3]

不建议整仓追平。VMark 是 Tauri v2 + 系统 WebView，Auris 是 Electron + Next.js；本轮真正值得 Auris 吸收的，是三项架构无关的行为保证：

1. **P0：收紧 Markdown 媒体源的协议白名单，并为磁盘媒体变更提供 reload key。**这是可验证的输入边界差异，不应等到出现利用或陈旧图片投诉后再处理。
2. **P1：串行化外部文件变更刷新，并在用户处理冲突前重新验证当前文档身份。**Auris 已有自写抑制、dirty/missing 和 Keep/Reload，不是从零开始；缺口是并发顺序与延迟决策的有效性。
3. **P1：把 Terminal session 绑定到 Workspace instance，并让“收起面板”不等于“杀死 shell”。**Auris 已有 Workspace Rail，但终端仍是窗口级全局集合。

UI 一致性可以作为 P2 渐进治理；欢迎页、系统打开、超长文档 viewport 应按真实需求补测试后决定。Linux 打印、WebKitGTK 字体、Tauri StrictMode ready handshake、VMark 自定义标题栏偏移均不应直接移植。

## VMark v0.9.51–v0.9.59 更新概览

| 版本 | 日期 | 上游核心变化 | 对 Auris 的判断 |
|---|---|---|---|
| 0.9.51 | 08-26 | 外部媒体变更刷新；媒体 URI 拒绝；外部文件批处理串行化、requeue、revalidate；真实 ready handshake | **P0/P1，选择性吸收** |
| 0.9.52 | 08-27 | 从操作系统打开文件时保留当前 Workspace | Auris 尚无等价 OS 文件打开分发；有桌面文件关联需求时再做 |
| 0.9.53 | 08-27 | Welcome window 命名、复用与最近 Workspace | Auris 已有 Welcome + 最近文件，但没有最近 Workspace 列表；P2 |
| 0.9.54 | 08-27 | 实测候选字体是否真等宽，规避 WebKitGTK/CJK cascade 问题 | **暂不移植**；先在 Electron/Linux 复现 |
| 0.9.55 | 08-29 | 37 项 UI 一致性工作与两轮审计：共享控件、令牌、对比度、forced-colors | Auris 部分对齐；适合做 P2 设计系统收敛 |
| 0.9.56 | 08-30 | Linux 打印 helper 隐藏；超长 WYSIWYG 文档 `cv-idle` 切换保持 viewport | 打印不适用；viewport 修复的前提在 Auris 不存在 |
| 0.9.57 | 09-01 | Linux print spooling 完成/失败语义；每个 Workspace instance 独立终端集 | 打印不适用；Terminal 是 **P1** |
| 0.9.58 | 09-01 | React StrictMode 模拟卸载后仍能发送 window-ready | VMark/Tauri ready 协议专属，不移植 |
| 0.9.59 | 09-01 | Browser 标题栏按 shell 发布宽度偏移，侧栏与卡片表面一致 | VMark shell 几何专属；只借鉴“单一宽度真源”原则 |

## 详细对比与建议

### P0 — Markdown 媒体源：Auris 的协议判定过宽

**已验证事实：**VMark 最新解析器只放行自己明确支持的外部 URL、绝对路径和安全相对路径；带有未知 URI scheme 的 `javascript:`、`file:`、custom scheme 会返回空字符串。它还给本地资源 URL 追加版本键，确保磁盘图片/视频变更后 WebView 不继续命中旧缓存，并允许调用方显式传入 owning tab，避免 Split View 用错焦点文档目录。[VERIFY: ../research/vmark-upstream/src/services/media/resolveMediaSrc.ts:8] [VERIFY: ../research/vmark-upstream/src/services/media/resolveMediaSrc.ts:105]

Auris 已正确按当前文档路径解析相对资源，说明“资源 owner”这一点已经对齐；但 `isExternalSource()` 把任意符合 URI scheme 语法的字符串都原样放行，因此 `javascript:`、`file:`、`blob:` 和任意 custom scheme 都会越过本地路径归一化。当前函数也没有媒体 reload key。[VERIFY: src/components/notes-v2/notes-editor-pane.tsx:245] [VERIFY: src/features/notes/editor/code-block-preview.ts:24] [VERIFY: src/features/notes/editor/code-block-preview.ts:54]

**判断：**这是确认存在的 trust-boundary 缺口，但不能仅凭静态代码声称已经可被利用；具体风险取决于最终 HTML 元素类型、Electron CSP 和 custom protocol 权限。最强反例是 `<img src="javascript:…">` 在现代 Chromium 通常不会执行脚本。即便如此，“校验器拒绝不了未知 scheme”仍是错误默认，且未来 audio/video/HTML preview 复用解析器时风险会扩散。

**建议验收：**先加入 adversarial table，覆盖 `javascript:`、`file:`、`blob:`、`data:text/html`、未知 custom scheme、protocol-relative URL、合法 `https:`/安全图片 `data:`、CJK/空格/尖括号路径和 `..`；再实现明确 allowlist。媒体变化时让 URL 随文件版本变化，测试“同一路径替换不同尺寸图片”会刷新。不要直接复制 Tauri `convertFileSrc`，保留 Auris 的 `shadowing-media://vault` 协议。

### P1 — 外部文件变化：冲突语义已对齐，并发顺序尚未对齐

**已验证事实：**VMark 把文件事件批次串成 Promise chain，防止旧磁盘读取晚完成后覆盖新读取；dirty 冲突采用 keyed debounce queue，处理失败会 requeue、重试有界、卸载为 terminal dispose；弹窗前还会确认 tab 未关闭、未保存、未改名。[VERIFY: ../research/vmark-upstream/src/hooks/useExternalFileChanges.ts:73] [VERIFY: ../research/vmark-upstream/src/hooks/useExternalFileChanges.ts:158] [VERIFY: ../research/vmark-upstream/src/services/files/externalChangeBatchQueue.ts:62] [VERIFY: ../research/vmark-upstream/src/services/files/resolveDirtyBatch.ts:42]

Auris 已有重要的正确行为：clean 文档更新 baseline，dirty 文档识别 pending save/self-write，磁盘内容与上次 baseline 不同时生成冲突；Reload/Keep 都存在，Keep 会把远端内容更新为新 baseline，missing 也会标记。[VERIFY: src/features/notes/workbench/use-notes-documents.ts:349] [VERIFY: src/features/notes/workbench/use-notes-documents.ts:378] [VERIFY: src/features/notes/workbench/use-notes-documents.ts:417] [VERIFY: src/features/notes/workbench/use-notes-documents.ts:1050]

差异在入口：Electron watcher 仅以 120ms debounce 发出一个无路径的 `vault:changed` 信号；每次信号都会 `void refreshSnapshot()`，刷新函数与 Vault cache 本身没有 sequence/generation guard。因此快速连续变化可以并行读取并按完成顺序发布，而不是按事件顺序发布。[VERIFY: electron/main.cjs:1483] [VERIFY: src/features/notes/workbench/use-notes-runtime.ts:102] [VERIFY: src/features/notes/workbench/use-notes-runtime.ts:217] [VERIFY: src/features/notes/vault/vault-store.ts:106]

**判断：**“缺少顺序保证”已验证；“已发生静默回退”仍只是风险假设，尚未用 Auris 实机复现。最强反例是 120ms debounce 会合并多数连续写入，且本地 SSD 上列表/读取通常很快。但云盘、网络卷、大 Vault 或一次刷新读很多文档时，完成顺序仍可能反转。

**建议验收：**先写一个受控 client 测试，让刷新 A 先开始后完成、刷新 B 后开始先完成，断言最终 snapshot 必须是 B。实现可选 Promise chain 或 generation token；dirty conflict 在展示和确认动作执行前重新核对 path、dirty 状态和当前 disk baseline。若未来 Electron watcher能提供文件级事件，再考虑 keyed queue；当前不必先重写 watcher。

### P1 — Terminal：已有 Workspace Rail，但 session 仍是窗口级

**已验证事实：**VMark v0.9.57 给每个 terminal session 写入可选 `workspaceInstanceId`，可见集合是“当前 Workspace 的 session + window-scoped session”；5 个 session 上限和编号按当前可见集合计算，并记忆每个 scope 的最后活跃 session。[VERIFY: ../research/vmark-upstream/src/stores/uiStore/terminalSlice.ts:33] [VERIFY: ../research/vmark-upstream/src/stores/uiStore/terminalSlice.ts:85] [VERIFY: ../research/vmark-upstream/src/stores/uiStore/terminalSlice.ts:146] [VERIFY: ../research/vmark-upstream/src/stores/uiStore/terminalScopeSelectors.ts:19]

Auris 已移植单窗口 Workspace instance identity/rail，但 store 明确只持有实例顺序、身份和激活项；Terminal hook 维护一份局部 `sessions` 与单一 `activeSessionId`，`list()` 后载入所有主进程 session，5 个上限按全局数组计算，session 记录没有 owner instance。[VERIFY: src/features/notes/workspace/workspace-instances-store.ts:3] [VERIFY: src/features/notes/workspace/workspace-instances-store.ts:44] [VERIFY: src/components/notes-v2/terminal/use-notes-terminal-sessions.ts:269] [VERIFY: src/components/notes-v2/terminal/use-notes-terminal-sessions.ts:306] [VERIFY: src/components/notes-v2/terminal/use-notes-terminal-sessions.ts:425]

此外，Terminal pane 只在 `isTerminalSplitOpen` 时挂载；hook 卸载 cleanup 会 kill 已登记的 backend session，因此“收起终端”目前会结束 shell，而 VMark 的语义是隐藏 Workspace 的 shell 继续存活。[VERIFY: src/components/notes-v2/notes-workbench.tsx:924] [VERIFY: src/components/notes-v2/terminal/use-notes-terminal-sessions.ts:817]

**建议验收：**renderer session model 增加 `workspaceInstanceId`，主进程 recovery descriptor 同步持久化 owner；visible selector、cap、ordinal、auto-create、last-active 都使用同一 scope predicate。把 xterm view 的销毁与 PTY 的 kill 分离：收起/切换只 dispose 或 detach view，用户关闭 session / Workspace 或应用退出才 kill。测试至少覆盖两个 Vault 来回切换、隐藏期间输出保留、每个 scope 独立 5 个上限、关闭 Workspace 清理其 session、Rail off 的兼容行为。

### P2 — UI 一致性：Auris 已有主题基础，缺的是共享组件契约

VMark v0.9.55 将约 33 种图标方按钮、37 种输入处理和大量 overlay/menu 收敛为共享 primitive，并为 forced-colors、焦点、selected/pressed 状态定义统一行为；主题使用 TypeScript 判别联合集中描述 app/editor/terminal/syntax/spacing/radius/shadow/font，自动对正文、控件边界、accent、ANSI 和 syntax 进行对比度门禁。[VERIFY: ../research/vmark-upstream/src/styles/icon-button-shared.css:1] [VERIFY: ../research/vmark-upstream/src/styles/input-shared.css:1] [VERIFY: ../research/vmark-upstream/src/styles/overlay-shared.css:1] [VERIFY: ../research/vmark-upstream/src/styles/overlay-shared.css:160] [VERIFY: ../research/vmark-upstream/src/theme/tokens.ts:1] [VERIFY: ../research/vmark-upstream/scripts/check-theme-contrast.ts:1]

Auris 不是“没有设计系统”：六个主题 ID 已统一，应用与 Notes 使用语义 CSS 令牌，测试会对六主题正文、muted、accent、Home、Reading 和 Review 检查 WCAG AA/令牌使用。[VERIFY: src/features/appearance/app-theme.ts:1] [VERIFY: src/app/globals.css:10643] [VERIFY: tests/unit/theme-contrast-styles.test.ts:23] [VERIFY: tests/unit/theme-contrast-styles.test.ts:73]

**判断：**这不是视觉功能缺失，而是维护成本差异。Auris 的令牌仍以多个 CSS 区段和页面专属规则为主，没有 VMark 等价的 typed full catalog、统一 icon/input/overlay primitives、terminal ANSI contrast 与 forced-colors 契约。建议只在触碰相关页面时渐进抽取，不做一次性大重构；优先抽 IconButton、Input、Menu/Overlay 三类并补 keyboard/focus/forced-colors 测试。

### P2/条件项 — Welcome 与系统打开

Auris 已有 Welcome screen，能新建文件、打开文件、打开文件夹并列出最近文件；只在 sessionStorage 记住一个 last folder，不展示最近 Workspace 列表。[VERIFY: src/components/notes-v2/notes-welcome-screen.tsx:29] [VERIFY: src/components/notes-v2/notes-navigation.ts:70] [VERIFY: src/components/notes-v2/notes-navigation.ts:104]

Electron 主进程取得 single-instance lock，但 `second-instance` handler 丢弃 argv，只负责聚焦/创建主窗口；检索未见 macOS `open-file` handler。因此 VMark v0.9.52 的“系统打开文件时保留 Workspace”和冷启动 queue，在 Auris 中不是行为已落后，而是入口尚未实现。[VERIFY: electron/main.cjs:3436] [VERIFY: electron/main.cjs:4368]

**建议：**若 Auris 要注册 `.md` 文件关联或支持 Finder/Explorer/CLI 打开，再把它列为 P1：冷启动先 queue，renderer ready 后 drain；热启动定位现有窗口；外部文件不能无意替换当前 Vault。若没有该产品目标，保持不做。

### 明确不直接迁移

- **Linux 打印 helper / spooling：**VMark 修的是 WebKitGTK system print dialog 与异步 CUPS job 生命周期；Auris 导出 PDF 使用隐藏 Electron `BrowserWindow.webContents.printToPDF()`，写 buffer 后销毁窗口，调用链不同。[VERIFY: ../research/vmark-upstream/src-tauri/src/pdf_export/renderer/linux_print.rs:1] [VERIFY: ../research/vmark-upstream/src-tauri/src/pdf_export/renderer/linux_print.rs:41] [VERIFY: electron/main.cjs:1695]
- **WebKitGTK 等宽字体实测：**VMark 的 helper 是为 CJK locale 下 CSS fallback 可能选中比例字体而写；Auris 当前只读取 CSS `--font-mono` 交给 xterm，但运行时是 Electron/Chromium。没有 Linux Electron 复现前，直接加入 canvas 测量会增加启动复杂度而没有已证收益。[VERIFY: ../research/vmark-upstream/src/services/fonts/verifiedMonoStack.ts:1] [VERIFY: src/components/notes-v2/terminal/use-notes-terminal-sessions.ts:148]
- **`cv-idle` viewport lock：**VMark 的跳动由超长文档上切换 `content-visibility: auto` 引发；Auris 检索不到 `content-visibility`/`cv-idle` 优化，且已有按 path + surface 的 scroll memory。不能把不同前提的补偿逻辑硬移植进 ProseMirror。[VERIFY: ../research/vmark-upstream/src/components/Editor/cvIdleViewportLock.ts:2] [VERIFY: src/features/notes/editor/notes-scroll-memory.ts:1] [VERIFY: src/components/notes-v2/use-notes-scroll-memory.ts:19]
- **StrictMode window-ready 与 browser chrome 偏移：**前者是 VMark frontend/Tauri ready 握手，后者依赖 VMark shell 发布的 `--shell-side-width`；Auris 应继续用自己的 Electron bridge 与 Notes Web Workspace 布局测试验证，不复制选择器或生命周期协议。

## 仍未解决的上一轮差异

双文档 Split View / Open to the Side 仍明确延后；Auris 当前 `split` 已用于 source-preview，还需与 Browser SidePane、Terminal split 和窄屏互斥策略共同设计。本轮 VMark 0.9.51–0.9.59 没有提供能消除这些产品冲突的新信息，因此优先级不应因“上游继续更新”而自动提升。[VERIFY: docs/vmark-sync/implementation-status-2026-08-24.md:39]

## 推荐执行顺序

1. **P0 媒体安全与刷新（0.5–1 天）：**先建 adversarial/reload tests，再收紧 allowlist、增加 media version key。
2. **P1 外部变更顺序（1–2 天）：**用 deterministic race test 锁定需求，选择 generation token 或串行 chain；补冲突 revalidation。
3. **P1 Terminal scope（2–4 天）：**先定义 renderer/main/recovery 的 owner contract，再改 view lifecycle；这是三项里状态迁移风险最高的一项。
4. **P2 UI primitive（滚动治理）：**每次修改旧控件时迁到共享 primitive，避免一次性 CSS 大爆炸。
5. **条件项：**系统文件打开、最近 Workspace、超长文档压力测试，只在产品需求或可复现问题出现后立项。

## 已验证事实、假设与未知

| 类型 | 内容 |
|---|---|
| 已验证事实 | 上游 tag/commit、70 commits 与 diff 规模；Auris/VMark 上述静态状态模型、入口与测试契约；自动同步报告成功刷新。 |
| 当前假设 | Auris 并行 snapshot refresh 在慢盘/云盘可导致旧结果后发布；未知 scheme 在当前 Electron/CSP 下的实际可利用程度；用户是否需要每个 Workspace 独立 Terminal。 |
| 未知 | Auris 在 Linux Electron 上是否出现非等宽 fallback；超大 WYSIWYG 文档是否有独立的 viewport 抖动；OS 文件关联是否属于发布目标。 |

## 验证与工程轨迹

- 将只读参考克隆 `research/vmark-upstream` 从旧 `v0.9.44` 后提交 fast-forward 到官方 `origin/main` / `v0.9.59`，并核对 tag 与 commit 指向相同。
- 执行 `npm run vmark:diff -- --repository-path /Users/apple/Desktop/大学markdown/research/vmark-upstream --upstream 47161298299a887a349003843b938f2c19dca261 --diagnostics`，成功刷新 `docs/vmark-sync/latest.json` 与 `latest.md`。[VERIFY: docs/vmark-sync/latest.md:1]
- 用 `git rev-list --count` 与 `git diff --shortstat` 单独计算上一份人工基线到最新提交的增量，避免误用 provenance 全量统计。
- 本次只生成报告和同步事实文件，没有修改 Auris 产品代码，没有推进 12 个 stale mapping 的 `lastComparedCommit`，也没有把“文件存在”误记为“功能已对齐”。[VERIFY: docs/vmark-sync/latest.md:10]
- 若未来直接复制 VMark 实现，需保留其 ISC 许可中的版权和许可声明；本报告目前只做行为级对比，没有复制上游代码。[VERIFY: ../research/vmark-upstream/LICENSE:1]
