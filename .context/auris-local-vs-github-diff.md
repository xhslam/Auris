# Auris 本地开发版 vs GitHub 版 功能差异报告

生成时间：2026-08-08 22:11
比对对象：
- 本地开发版：`/Users/apple/Desktop/大学markdown/auris`（工作区，含 17 个未提交改动）
- GitHub 版：`/Users/apple/Desktop/auris-github-clone/auris`（origin/main @ `4caac1e`，2026-08-08 21:32）

两条代码线**没有共同祖先**，是完全岔开的历史。

---

## 0. 结论先说

不是"GitHub 版更新所以功能更多"。真实情况是**各有独有功能，且方向不同**：

- **本地开发版**：功能更真实（清理了空壳设置、有 lint 校验、大纲面板已接线、排版调节、视频库细节、学习血缘追踪）
- **GitHub 版**：Flash 闪念功能远更完整、vault 文件操作抽成独立模块、多了打包隐私审计，但**设置页有约 7 个纯空壳开关**（UI 存在、无任何实现）

---

## 1. 完全一致的部分（不用担心）

| 项目 | 状态 |
|------|------|
| 页面路由 | 8 个全同：`/` `/notes` `/reading` `/review` `/settings` `/video` `/flash` `/browser` |
| API 路由 | 11 个全同 |
| 命令面板命令 ID | 各 14 个，完全一致 |
| 快捷键注册表 | 一致 |
| i18n 文案结构 | 一致 |
| IPC 通道总数 | 各 99 个（仅 1 进 1 出，见下） |
| 编辑器扩展 | 除 `markdown-lint.ts` 外全同 |
| 设置页区块文件 | 5 个文件全同 |
| 首页 home-page / 热力图 | 行数与文案完全一致 |
| vault 前端模块 | 15 个文件全同 |

---

## 2. 只有本地开发版有的功能

### 2.1 学习血缘追踪（Learning Lineage）— 已接线，10 处引用
- `src/features/lineage/learning-lineage-contract.ts`（38 行）
- `src/features/lineage/learning-lineage-client.ts`（127 行）
- `electron/lineage/learning-lineage-store.cjs`（364 行）
- `electron/lineage/learning-lineage-ipc.cjs`
- 接入点：desktop-bridge、wordbook store、session-client、notes facade、use-notes-actions
- **额外暴露 2 个 MCP 工具**：`auris_learning_lineage`、`auris_learning_lineage_resolve`

### 2.2 插件执行运行时 — 已接线
- `electron/plugins/plugin-runtime.cjs`（121 行）→ 被 `electron/main.cjs` 引用
- `src/features/plugins/plugin-execution-policy.ts`（43 行）→ 被 `plugin-host.ts` 引用
- GitHub 版只有 `plugin-api.ts` + `plugin-manifest.ts` 骨架，**没有真正的执行运行时和执行策略**

### 2.3 Markdown 校验（真实实现）— 已接线
- `src/features/notes/editor/markdown-lint.ts`（106 行）→ 被 `notes-editor-pane.tsx` 引用
- 实际提示文案：代码围栏未闭合 / Markdown 链接缺少右括号 / 表格列数与分隔行不一致 / 行尾包含多余空白
- 对比：GitHub 版有"启用 Markdown 检查"开关，但 `enableMarkdownLint` 这个 key **只在设置页出现一次，没有任何消费者**

### 2.4 大纲面板已接线
- `notes-outline-panel.tsx`（63 行）两边都有，但**只有本地把它接进了左下角栏**
- 本地：左下角有大纲按钮 + popover，可跳转标题（`onJumpToHeading`）
- GitHub：文件存在但无人引用 → **死代码**

### 2.5 排版调节
- 正文左右间距（可拖动滑块，含"铺满"选项）
- 编辑器字号
- 位置：`notes-workbench-bottom-right.tsx`（本地比 GitHub 多 83 行）

### 2.6 笔记起始页
- `notes-start-screen.tsx` → `NotesStartScreen`，文案"笔记起始页"

### 2.7 视频库细节（多 68 行）
- 视频库概览、数据库、缩略图、转码缓存、AI 解析结果

### 2.8 Hot Exit 接入更深
- 本地：接入 `use-notes-documents.ts` + 设置页 + 中英文案（6 处）
- GitHub：只有 store 和英文案（3 处），未接设置页

### 2.9 独有 IPC
- `shadowing:vault:create-file`（main.cjs:3402 + preload.cjs:416）

### 2.10 工程质量更严
- `lint`: `eslint . --max-warnings=0`（GitHub 是 `eslint .`，容忍 warning）
- 独有脚本：`check:notes-contracts`、`quality:notes`
- 测试更多：313 单元/组件 + 9 e2e（GitHub 310 + 8）
- 独有测试：`auris-settings-feature-truthfulness.test.tsx`、`markdown-lint.test.ts`、`notes-rich-markdown-roundtrip.test.ts`、`notes-save-integrity.spec.ts`、5 个 roundtrip fixture

### 2.11 死代码（本地也有一处）
- `src/features/billing/billing-service.ts`（45 行）→ **0 处引用**

---

## 3. 只有 GitHub 版有的功能

### 3.1 Flash 闪念 — 明显更完整
| | 本地 | GitHub |
|---|---|---|
| flash-page-client | 194 行 | 369 行 |
| 独立 store | 无（localStorage 内联） | `flash-store.ts` 98 行 |
| 专用 CSS | 无 | `flash-page.css` |
| 测试 | 无 | 3 个 |

GitHub 独有能力：搜索闪念、收藏/取消收藏、筛选（全部/今日/收藏）、插入任务/列表/引用/标签、整理成笔记、闪念活跃记录与统计、首页热力图接入（`calendar-heatmap.tsx` 读 `auris-flash-items`）

本地只有：记录闪念、删除闪念

### 3.2 vault 文件操作抽成独立模块 — 已接线
- `electron/notes/vault-file-operations.cjs`（531 行）→ 被 `electron/main.cjs` 引用
- 含回收站条目上限、路径安全断言（`assertRelativePath`）
- vault-service 额外能力：`copyEntry`、`restoreLastDeletedEntry`、`revealEntry`

### 3.3 笔记欢迎页
- `notes-welcome-screen.tsx` → `NotesWelcomeScreen`（86 行）
- 文案：文件操作、最近使用文件、还没有文件
- 与本地 `NotesStartScreen` 是**同一位置的不同实现**（重命名 + 内容不同）

### 3.4 打包隐私审计
- `scripts/audit-package-privacy.cjs`（48 行）
- 接入 `desktop:assemble` 与 `desktop:assemble:win`，新增 `desktop:privacy:audit` 脚本
- 构建时会校验产物里没有私有运行时数据

### 3.5 MCP 凭据写入加锁
- 独有依赖 `proper-lockfile@^4.1.2` → 用于 `electron/mcp/client-credential-store.cjs`

### 3.6 独有 IPC
- `shadowing:clipboard:read-text`（main.cjs:3087 + preload.cjs:176）

### 3.7 恢复上次删除（接线位置不同）
- 两边都有 `restoreLastDeleted`
- 本地：接在**左下角栏** + 文件树右键菜单
- GitHub：接在**右下角栏**

---

## 4. GitHub 版的空壳设置（重要）

GitHub 设置页多出约 23 行、约 30 条文案，但这些 toggle 的 key **在整个代码库里 0–1 处引用，没有任何消费者**：

| 设置项 key | 界面文案 | 引用数 |
|---|---|---|
| `enableMarkdownLint` | 启用 Markdown 检查 | 1（仅设置页） |
| `keepDocumentHistory` | 保留文档历史记录 | 0 |
| `maxVersions` | 最大版本数（20/50/100 个版本） | 1（仅设置页） |
| `historyMaxAge` | 历史记录的最大年龄（3/7/30 天） | 0 |
| `autoDownloadUpdates` | 自动下载更新 | 0 |
| `checkUpdateFrequency` | 检查更新的频率（启动时/每天/每周） | 0 |
| `confirmLargeFile` | 打开超过 5 MB 的文件前提示确认 | 1（仅设置页） |

补充证据：
- `electron-updater` **两边都不在依赖里**，`main.cjs` 里**两边都没有 autoUpdater** → GitHub 的"检查更新 / 已是最新版本（v1.4.0）"是假 UI
- 文档历史相关 IPC 两边完全一致（只有 ai-history / assessment-history / training-history，与"文档版本快照"无关）

**本地开发版刻意删掉了这些空壳，并加测试防回归**。`auris-settings-feature-truthfulness.test.tsx` 明确断言：
- `queryByText("最大版本数")` → **不应存在**
- `queryByText("超过 1 MB 的文件自动以源码模式打开")` → **不应存在**
- "关于"页应写明：桌面端自动检查、下载和安装更新**尚未接入**
- Pandoc 应写明：检测成功只代表运行环境就绪，**不代表已支持** Pandoc 格式导出
- 大文件策略应写真实的"按 UTF-8 实际字节数评估 1 MB / 5 MB"

---

## 5. GitHub 版的历史遗留文件

根目录有 4 个与 `electron/` 下同名的 `.cjs`：

| 文件 | 根目录 | electron/ | 状态 |
|---|---|---|---|
| `main.cjs` | 3648 行 | 3764 行 | 打包入口是 `electron/main.cjs`，根目录版本更旧 |
| `preload.cjs` | 376 行 | 436 行 | **无人引用，历史遗留副本** |
| `terminal-session-manager.cjs` | 445 行 | 540 行 | 引用的是 `electron/` 版 |
| `video-library-db.cjs` | 717 行 | 717 行 | 引用的是 `electron/` 版 |

本地开发版已清理，只保留 `electron/` 下的版本。

---

## 6. 共有文件的规模差异（Top）

| 文件 | 本地 | GitHub | 差 |
|---|---|---|---|
| `notes-workbench.facade.ts` | 751 | 639 | +112 |
| `notes-workbench-bottom-right.tsx` | 523 | 440 | +83 |
| `notes-workbench.tsx` | 870 | 795 | +75 |
| `desktop-video-library-shell.tsx` | 341 | 273 | +68 |
| `notes-mcp-request-handler.ts` | 426 | 372 | +54 |
| `notes-editor-pane.tsx` | 867 | 827 | +40 |
| `notes-workbench-bottom-left.tsx` | 184 | 145 | +39 |
| `use-notes-terminal-sessions.ts` | 925 | 1004 | −79 |
| `auris-settings.tsx` | 1989 | 2012 | −23 |
| `editor-extensions.ts` | 286 | 311 | −25 |

界面中文文案总数：本地 994，GitHub 1039（GitHub 多出的大部分是空壳设置 + Flash）

---

## 7. 你现在装的是哪个

`/Applications/Auris.app` = **GitHub 版**构建产物。

所以你现在打开会看到：完整的 Flash 闪念、笔记欢迎页（最近使用文件）、右下角恢复删除、设置页里那批不生效的开关。

看不到：大纲面板、正文间距/字号调节、Markdown 校验提示、笔记起始页、视频库概览细节、学习血缘（含 2 个 MCP 工具）、插件执行运行时。

## 8. 未提交改动提示

本地 17 个文件仍未提交（约 34235 行插入），另有 3 个 vmark 报告未跟踪，`git stash` 里有 4 条记录。本报告的"本地"一侧已包含这些未提交改动。
