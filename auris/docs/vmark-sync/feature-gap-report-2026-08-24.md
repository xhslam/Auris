# Auris × VMark 增量更新报告（2026-08-24）

> 当前时间基准：2026-08-24（GMT+8）
> VMark：`xiaolai/vmark` `main` @ `6f1e1d9777d4ef62eed03cebe1c69b3c9013941d`（2026-08-23 09:16 GMT+8，`v0.9.50` 后 9 个提交）
> Auris：本地 `main` @ `bcf0e02d138a6367a4f4bb333b55ad122f457868`（Auris 1.0.2）
> 增量人工基线：上一份功能报告使用的 VMark `31213f161556e1ab82bc8e39c478389f6cf3e917`（2026-08-20，v0.9.44）

## 实施状态补充

本报告最初用于实施前差异判断；同日已按选择性同步策略完成以下项目：VMark v0.9.49 CJK 纯函数安全修复、大纲可见文本、`Ctrl+Tab` 最近使用 Tab，以及 Notes Tab 单行溢出/箭头/键盘导航。双文档 Split View 因与 Auris 现有 source-preview、Browser SidePane 和 Terminal split 冲突而延后。实现文件、验证结果与明确排除项见 [`implementation-status-2026-08-24.md`](./implementation-status-2026-08-24.md)。manifest 的人工复核提交仍未推进。

## 结论

本轮已经抓取 VMark 最新 `main`，并刷新 `docs/vmark-sync/latest.json` 与 `latest.md`。从 2026-08-20 的人工基线到当前 VMark，共有 **81 个提交、296 个文件变化、+15,272 / -2,376 行**，跨越 **v0.9.45 至 v0.9.50** 六个版本。

对 Auris 最有价值的新增内容不是整仓同步，而是两组可独立评估的能力：

1. **P0：CJK 格式化正确性修复。**Auris 当前保留了 VMark 较早版本的 CJK formatter，静态核查确认仍存在上游本轮已修复的保护与完整性缺口。
2. **P1：多文档 Tab 导航与双文档分栏。**Auris 已有按 Vault 持久化的基础 Tab，但尚无 VMark 新增的 MRU 切换、溢出导航和双文档并排工作流。

Windows/Tauri 窗口线程、macOS traffic lights、Rust 依赖与 GitHub Actions 变更不应直接移植到 Electron/Next.js 架构；它们只适合作为测试和发布门禁参考。

## 抓取结果

自动同步报告仍以 provenance 基线 `7c409688dc510d87183bdc46308e1ee645c2579f` 进行全量比较，因此数字较大：

| 项目 | 数量 |
|---|---:|
| changed | 1,694 |
| added | 1,570 |
| deleted | 351 |
| renamed | 201 |
| mapped upstream changes | 81 |
| capability-domain candidates | 545 |
| unmapped upstream changes | 3,190 |
| stale mappings | 12 |
| missing Auris targets | 0 |

12 个 mapping 的 `lastComparedCommit` 仍停在 `2805ea81…`。本次只刷新事实报告，没有把 manifest 自动标记为“已人工复核”，避免把抓取成功误写成能力已移植。

## VMark 本轮版本内容

| 版本 | 时间（GMT+8） | 主要内容 | Auris 判断 |
|---|---|---|---|
| v0.9.45 | 08-20 | Windows 设置窗口创建线程与死锁修复；Rust 安全依赖清理 | Tauri/Rust 专属，不直接移植 |
| v0.9.46 | 08-21 | 新启动欢迎页、孤立空白 Tab 清理、恢复策略拆分、按身份去重 Hot Exit Tab | Auris 已有按 Vault 的 Tab 持久化与去重；只借鉴恢复测试 |
| v0.9.47 | 08-21 | 清除源码 NUL 字节；大纲显示标题文本而非 Markdown 源码；窗口 chrome 调整 | 大纲纯文本处理对 Auris 有小型可用性价值 |
| v0.9.48 | 08-21 | macOS traffic lights 与设置窗口 shell 修复 | Tauri/macOS 专属，不直接移植 |
| v0.9.49 | 08-22 | CJK formatter 正确性、保护区、完整性校验、拒绝反馈和性能重构 | **Auris 高优先级候选** |
| v0.9.50 | 08-22 | MRU Tab、Tab 溢出导航、双文档 Split View、Open to the Side、Pane 状态 | **Auris 产品增强候选** |
| v0.9.50 后 | 08-23 | Cargo `uuid`、GitHub Actions 小版本与 `actions/checkout@7` | 依赖/CI 维护，不移植业务代码 |

## 重点差异

### 1. P0：CJK 格式化器需要选择性同步正确性修复

VMark v0.9.49 的更新不是样式调整，而是针对内容损坏风险的集中修复，包括：

- 格式化选区不再改写代码与 frontmatter；
- 保留未闭合 fenced code block 与 TOML `+++` frontmatter；
- 保留受保护区前空格、Markdown 两空格硬换行和文末换行；
- 只有与 CJK 相邻时才转换全角标点；
- 不错误拉开 CJK 与引号，也不吞掉路径前空格；
- 行内数学检测与真实 parser 对齐；
- 完整性校验从“结构标记计数”升级为内容骨架序列校验；
- 格式化被安全拒绝时给出明确反馈，不与“无需变化”混淆；
- 整篇格式化保持光标和滚动位置；
- 复用保护区扫描，避免同一文档重复解析。

Auris 当前源码核查确认：

- `src/features/notes/formatting/cjk-formatter/markdownParser.ts` 的 fenced code 正则要求存在闭合 fence，且 frontmatter 只识别 `---`；
- `formatter.ts` 默认调用路径没有传入硬换行保护，并在结尾使用 `trimEnd()`；
- `integrity.ts` 只统计 `` ` ``、`[[`、`$$` 等结构标记出现次数，无法发现正文复制、重排或丢失；
- `notes-workbench.facade.ts` 在格式化结果与原文相同时直接返回，不能区分“无变化”和“完整性校验拒绝”。

因此，Auris 不应直接复制 v0.9.49 的 Tiptap/MCP 接线，但应移植 formatter 的纯函数修复与相应回归样例。建议先覆盖以下破坏性边界：未闭合 fence、TOML frontmatter、两空格硬换行、文末换行、路径/引号邻接、行内数学、内容重复与拒绝反馈。

### 2. P1：Tab 导航和双文档分栏是明确的功能差异

VMark v0.9.50 新增：

- `Ctrl + Tab` 在“当前 Tab ↔ 上一个使用的 Tab”之间 MRU 切换；
- Next/Previous Tab 保持按 Tab 条顺序导航；
- Quick Open 把已打开 Tab 放在前面，并按最近使用排序；
- Tab 条溢出时显示边缘渐隐和滚动箭头，激活 Tab 自动滚入可视区；
- Tab 条可通过键盘聚焦和方向键导航；
- 两个文档并排、Open to the Side、Focus Other Pane、Close Pane 与可选同步滚动；
- Tab 条标记另一 Pane 正在显示的文档，关闭 Pane 时保留幸存文档。

Auris 已有的能力：

- `NotesWorkspaceState.openTabs` 与 `activePath`；
- `openWorkspacePath()` 的字符串身份去重；
- `useWorkspacePersistence(vaultRoot)` 按 Vault 保存并恢复最多 12 个 Tab。

本轮检索未发现 Auris 等价的 Tab MRU store、溢出导航 helper、Open to the Side 或双文档 pane state。因此这不是修复项，而是新的产品能力。建议先做 MRU 切换和溢出可见性，再单独设计双文档分栏；不要把 VMark 的 Tauri window/tab transfer 代码直接带入 Electron。

### 3. P2：大纲标题应去除行内 Markdown 标记

VMark v0.9.47 修复大纲显示原始标题源码的问题。Auris 的 `src/features/notes/documents/markdown-index.ts` 当前把 `headingMatch[2].trim()` 直接作为标题文本，因此 `## **重点**`、`## [链接](url)` 等标题可能在大纲中显示 Markdown 标记。

这是低风险、独立的小修复候选：只需在建立 heading index 时提取可见文本，并保证 slug 与现有锚点策略不被意外改变。

### 4. 已对齐或不适用的更新

- **启动/恢复：**Auris 的 openTabs 已按路径去重并按 Vault 持久化，不使用 VMark 的 Tauri 多窗口 Hot Exit 模型；补恢复回归即可，不复制状态机。
- **Windows 设置死锁：**VMark 修复的是 Tauri 窗口必须在主线程创建的问题；Auris 使用 Electron，不存在同一调用链。
- **macOS traffic lights：**VMark 针对 Tauri 自定义标题栏和菜单重建；Auris 应继续按 Electron `BrowserWindow` 独立验证。
- **Rust/Actions 依赖：**只作为安全更新和 CI 漂移检查参考，不进入 Auris 运行时代码。
- **NUL 字节门禁：**可借鉴为源码质量检查，但不构成用户功能更新。

## 建议执行顺序

1. **先移植 CJK 回归测试，再做最小纯函数修复。**这是唯一具有潜在内容损坏风险的更新。
2. **单独评估 Tab MRU 与溢出导航。**两项可在不引入 Split View 的情况下先交付。
3. **若用户确有并排对照笔记需求，再设计双文档 Pane。**需与现有浏览器 SidePane、终端分栏及窄屏布局一起定义互斥规则。
4. **顺手修复大纲可见文本。**保持为独立小变更，避免和 CJK 大改混在一起。
5. manifest 的 12 个 `lastComparedCommit` 仅在相应领域完成代码/测试复核后再推进到 `6f1e1d97…`。

## 验证与轨迹

- 通过 `git ls-remote` 核验 VMark `main` 当前提交为 `6f1e1d97…`。
- 首次运行时，自动缓存因 Windows 的目录 mode 位不具备 POSIX 权限语义而被误判为非私有并返回 `CACHE_INVALID`；先使用已核验远程地址为 `https://github.com/xiaolai/vmark.git` 的本地参考克隆完成抓取。
- `scripts/vmark-sync-report.cjs` 已补齐 Windows 可移植性：仅在 POSIX 平台校验/chmod Unix mode，并修正 PowerShell 进程启动身份查询的参数传递；对应测试在 Windows 使用 junction 验证缓存拒绝符号链接。修复后，标准命令 `npm run vmark:diff -- --upstream 6f1e1d97… --diagnostics` 已直接成功。
- VMark manifest 与同步工具测试共 **2 个文件、51 项通过**；`latest.json` 已解析核验，`comparedCommit` 与远端 HEAD 一致，`missingAurisTargets` 为 0。
- 自动报告修改 `docs/vmark-sync/latest.json` 与 `latest.md`；本报告补充从 2026-08-20 人工基线到当前提交的可读增量。
- 已完成本报告“实施状态补充”所列的选择性产品同步；未更新 manifest 的人工复核提交，未提交或推送 Git。
