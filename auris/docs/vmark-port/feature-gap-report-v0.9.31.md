# Auris(GitHub) ↔ VMark v0.9.31 功能差异与技术差异报告

审计日期：2026-08-08 23:0x

## 基线声明

| 侧    | 仓库                                                              | 提交          | 版本         | 时间               |
| ---- | --------------------------------------------------------------- | ----------- | ---------- | ---------------- |
| 上游   | [`xiaolai/vmark`](https://github.com/xiaolai/vmark) `main`      | `981afc01`  | **0.9.31** | 2026-08-08 15:52 |
| 上次对比 | 同上                                                              | `8c9cb503`  | 0.9.29     | 2026-08-07       |
| 本侧   | [`xhslam/auris`](https://github.com/xhslam/auris) `origin/main` | `032b9ba51` | 1.0.0      | 2026-08-08 22:3x |

本轮上游增量：**294 commits，2 个版本（0.9.29 → 0.9.30 → 0.9.31）**。

本报告对齐对象是**已推送到 GitHub 的 auris**，不是 Mac 本地 `main`（`1ccf54523`，166 提交未推送）。两者差异见 `.context/auris-local-vs-github-diff.md`。

比对方法：两侧均用 `git ls-files` 计数（vmark worktree 启用了 sparse-checkout，文件系统遍历会漏算），Rust 行数取 git blob。

---

## 0. 一句话结论

**本轮上游 294 个提交里，约 220 个属于同一个全新子系统：`coherence`（文档溯源与一致性层）。** 这是 vmark 从"Markdown 编辑器"向"递归写作项目的可信基础设施"迈的一步，也是本轮唯一的 🔴 级功能差异。

除 coherence 之外，本轮上游几乎没有新的表面功能，剩下的是文件树/扩展名/快捷键三块小增量和大量审计修复。

同时值得记录的是：**GitHub 侧 auris 在本轮期间自己前进了 4 个提交**，闭合了 markdown lint 接线、富文本往返幂等性（真实数据损坏 bug）和空壳设置清理——这三项此前是本地独有优势，现已进入 GitHub 基线。

---

## 1. 上游本轮增量总览（8c9cb503 → 981afc01）

### 1.1 版本主题

| 版本     | 主题                                                                                                                                | 提交占比  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 0.9.30 | **coherence 子系统落地**：kernel → ledger → index → 语义检查 → claims/contexts → delegation → group-commit → operator runtime → merge audit | \~75% |
| 0.9.31 | 文件扩展名显示、Show All Files、快捷键 i18n、explorer/tabs/settings 审计修复、测试分层、CI Node 24 迁移                                                    | \~25% |

### 1.2 coherence 的开发形态（技术信号）

这个子系统的提交历史本身值得注意：

- 出现了 **9 轮命名评审**（`3rd review` → `9th review`），每轮都记录 High/MAJOR findings 并逐条修复；
- 出现了明确的 `DO-NOT-SHIP` 记录（`fb463739`）和 `owner sign-off`（`3cfd4ec6`）；
- 出现了 `dogfood finding`（`d6fd88ee`、`1abacd76`）——作者自己用它跑真实工作流并把发现写回 ledger；
- 一个子系统的设计被推翻重做过一次：`C2 group-commit` 从"物理 revert"改成 2PC（`f9c128a8`），随后整个 C2 分支被判定不可达并切除（`34868901`）。

这种"反复自审 + 记录不可发布结论 + 切除已建成但不可达的子系统"的工作方式，是 auris 目前在流程上最缺的一环。

### 1.3 非 coherence 的用户可见变更

| 提交         | 变更                                                         |
| ---------- | ---------------------------------------------------------- |
| `6848de86` | **文件树显示文件扩展名**，隐藏改为 opt-in（`showFileExtensions` 默认 `true`） |
| `fbf3d38f` | 文件树头部暴露 **Show All Files**                                 |
| `03682d03` | Toggle All Files 分配默认快捷键                                   |
| `5c3c8758` | **44 条快捷键描述完成 10 语言 i18n**                                 |
| `7f78859a` | 修复快捷键"解绑"无效 + 静默丢设置                                        |
| `1ef2d8b4` | 文件树不再把"读取失败"呈现为"目录为空"                                      |
| `88b57bcd` | 侧栏 header 跟随它所描述的 tab                                      |
| `414ce749` | 标题栏重命名改为 session 语义，不再实时读盘                                 |
| `a776e855` | tab store 6 个审计缺陷修复                                        |
| `c15a6795` | 扩展名功能的 10 条审计发现闭合                                          |
| `2031056c` | 跟随 macOS 系统外观，明暗主题成对切换                                     |
| `830efe86` | 测试分层（tier），全局 mock 不再谎报被测对象                                |
| `118892e9` | CI 全量迁出 Node 20 弃用运行时                                      |

---

## 2. 功能差异矩阵

| #  | 功能                                               | VMark 0.9.31                                | Auris GitHub `032b9ba51`                                            | 等级         |
| -- | ------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------- | ---------- |
| 1  | **coherence：文档溯源 + 陈旧/分叉检测 + 语义检查**              | ✅ 完整（见 §3.1）                                | ❌ 无任何对应物                                                            | 🔴 大       |
| 2  | **Breakdown 视图（下游产物可能过期清单）**                     | ✅ pull-based 面板 + 8 类动作                     | ❌ 无                                                                 | 🔴 大       |
| 3  | **Canon claims / contexts（事实与命名视图）**             | ✅ draft→established 生命周期 + 继承               | ❌ 无                                                                 | 🔴 大       |
| 4  | **Agent delegation（限时授权 AI 代解 stale）**           | ✅ principal-bound、默认 7 天、可撤销                | ❌ 无（MCP 无授权分级概念）                                                    | 🟠 中       |
| 5  | **Workspace Rail：单窗口多工作区**                       | ✅ 实验性（`workspaceRailMode` 默认关）              | ❌ 无（notes 单工作区 + Electron 多窗口）                                      | 🟠 中       |
| 6  | **知识库图谱（KB Graph）**                              | ✅ `KnowledgeBasePanel` 11 文件，图视图            | ❌ 无                                                                 | 🟠 中       |
| 7  | **Genies（AI provider 编排 + picker）**              | ✅ Rust genies 模块 + 15 文件前端                  | ⚠️ Nia provider 存在，形态不同                                             | 🟠 中       |
| 8  | **自动更新**                                         | ✅ `tauri-plugin-updater`                    | ❌ 无 updater（本轮明确把假的"已是最新"提示删掉了）                                     | 🟠 中       |
| 9  | **Split-pane 编辑器 + per-format source 扩展**        | ✅                                           | ❌ 有 source peek（F5），无 split-pane                                    | 🟠 中       |
| 10 | **多格式适配（json/toml/mmd/svg/html/代码只读预览）**         | ✅ 分类开关 + 用户关联覆盖 + 外部编辑器逃生口                  | ⚠️ 有 JSON/JSONL/YAML/TOML/纯文本识别与 schema 预览，无 mmd/svg/html/代码 viewer | 🟡 小       |
| 11 | **文件树显示扩展名 / Show All Files**                    | ✅ 本轮新增，带设置                                  | ⚠️ 文件树有 `getExtensionLabel`，无 Show All Files、无设置开关                  | 🟡 小       |
| 12 | **快捷键描述 i18n（44 条 × 10 语言）**                     | ✅                                           | ⚠️ 有可自定义快捷键，i18n 仅 notes 局部 en-US/zh-CN                             | 🟡 小       |
| 13 | **大纲面板**                                         | ✅ `Sidebar/OutlineView` 含 a11y 测试           | ⚠️ 文件存在但**无任何引用（死代码）**                                              | 🟡 小       |
| 14 | **跟随 macOS 系统外观**                                | ✅ 本轮新增，明暗成对                                 | ❓ 未见对应实现                                                            | 🟡 小       |
| 15 | **命令面板 / QuickOpen / QuickLook / ContentSearch** | ✅ 各自独立组件目录                                  | ⚠️ 有命令面板（14 命令）与查找替换，无 QuickLook/QuickOpen                          | 🟡 小       |
| 16 | **统一版本历史（unifiedHistory）**                       | ✅ `services/history` 8 文件                   | ✅ `local-history-db.cjs` 673 行 + notes-recovery-store               | ⚪ 对等       |
| 17 | **终端**                                           | ✅ `services/terminal` 9 文件 + Terminal 组件    | ✅ notes 终端面板 + session manager/policy                               | ⚪ 对等       |
| 18 | **MCP 工具集**                                      | 9 个                                         | 8 个（缺 coherence 两个）                                                 | ⚪ 近似对等     |
| 19 | **Workflow**                                     | ✅ `services/workflow` + workflowEditor i18n | ✅ nia workflow runner/schema/self-heal 12 文件                        | ⚪ 对等       |
| 20 | **内嵌浏览器**                                        | ✅ Rust WKWebView 驱动                         | ✅ Electron WebContentsView                                          | ⚪ 对等（实现不同） |

---

## 3. 重点差异详解

### 3.1 🔴 coherence：本轮唯一的产品级新能力

#### 它解决什么问题

递归写作项目里，AI 生成一份文档时读了若干上游文档。上游后来改了，下游产物就可能过期——但没人知道哪些过期了。coherence 就是把这条依赖关系记下来，并在上游前进时**按需**告诉你哪些下游可能失效。

关键设计原则（从 website 指南与提交信息里都能读到同一条）：**永不自动更新，你始终是总编**。

#### 分层能力

**1) 溯源捕获（opt-in）**

- 设置项 `coherenceCaptureOnSave`，**默认 `false`**。未开启前 vmark 不写用户文件、不创建 `.vmark/`。
- 开启后：每次保存、genie apply、接受 AI 建议、MCP 写入、workflow `save-file` 步骤都记为一条 **transformation**。
- 存储是工作区内的 `.vmark/` 明文 JSONL ledger——git 友好、人类可读；派生的 `index.db` 删掉不丢信息。
- 应用内插桩路径记 `exact` 输入集；MCP 写入诚实地记 `inferred`（会话观察到的读取集）。

**2) 依赖边与状态机**

边被 pin 到"被读取时的那个 revision"。上游前进后状态：

| 状态                    | 含义                                 |
| --------------------- | ---------------------------------- |
| `version-stale`       | 上游已越过本产物构建时的版本                     |
| `diverged`            | pin 与 current 是平行版本，无继承线（如 git 分支） |
| `diverged-multi-head` | 上游自身有多个平行当前版本                      |
| `waived`              | 你已接受该分叉，并记录了理由                     |
| `unpinnable`          | 上游无法解析（如无效 pin）                    |

在 vmark 外部（终端、别的编辑器）改的文件，在 scan 时被和解为 *observed external edit*——历史不留空洞，但诚实标注为 unknown-provenance。

**3) Breakdown 视图（pull-based）**

`Window → Breakdown` 或命令面板打开。**只在打开或按刷新时刷新，绝不后台催你**。三个动作，都不重写历史：

- **Accept newer** —— 记录"本产物与更新后的上游仍兼容"（ratification）。条目离开列表；上游再变会回来。
- **Revise** —— 打开产物去改。存新版本会退役旧边。
- **Waive** —— 记录有意分叉，**理由必填**。v0 刻意做窄：只对这条边、这个上游 revision 生效。

上游有多个当前版本时，accept-newer 和 waive 被禁用——没有单一 revision 可解析，必须先 revise 或和解版本。

**4) 语义检查 + claims + contexts**

- 版本陈旧只说"上游动了"；语义检查回答"这次改动是否真的与派生文档矛盾"。
- **pull-only**：在 stale 边上按 Check，vmark 才去问 AI provider，比较 pin 版本、当前版本、派生文本。
- 三种裁决：*checked valid* / *contradicted*（必须附逐字证据引文）/ *unchecked*（模型不确定、超时或低于置信阈）。**不确定就诚实说不确定**。
- 置信阈 `coherenceCheckTau` 默认 `0.9`，可配。
- 任一文档再动，或 claim 集变化，检查结果立即过期。
- **Canon claims**：选中文本 → Extract Claim from Selection，生成带溯源的 draft，晋升为 established 后才喂给语义检查。修正/退役只追加历史，不删除。
- **Contexts**：工作区的命名视图，决定"当前"指什么、哪些 claim 生效，子 context 加性继承父 claim。默认 *greenhouse*（裁决只作为咨询性张力），显式确认后可翻成 *enforcing*（矛盾标记为 canon 违规）。检查结果绑定到产生它的确切 context + claim 快照，绝不跨界泄漏。

**5) Provenance recovery / delegation / branches**

- **溯源恢复**：手改派生文档会（正确地）丢掉记录的输入集。Breakdown 的 *Provenance unknown* 分组提供 **Suggest inputs**（提议最近一次输入集，角色保留、预勾选、可编辑）+ **Confirm provenance**（重新挂边但不产生新 revision，所以它自己的下游不会看到虚假变更）。从没有输入的文档永不列出。
- **Agent delegation**：默认只有你能解 stale 边。要让 AI 通过 `coherence_resolve` 代劳，需从 Breakdown 授予**限时委托**：指定 agent 名、范围（accept-newer 和/或 waive）、过期时间（默认 7 天，**没有"永久"选项**）。每次代解都记录在授权之下，审计链始终能查出"谁以谁的名义做的"。一键撤销。**Canon claims 与 contexts 保持 human-only**。

#### 技术实现

| 层         | 实现                                                                                                                                                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kernel    | Rust，`src-tauri/src/coherence/` **110 个文件 / 20,630 行**，规范化哈希 + envelope typing                                                                                                                                                                        |
| Ledger    | 分段 JSONL + snapshot CAS（`ledger_segments.rs`、`cas.rs`），新段/新目录创建时 fsync 目录                                                                                                                                                                             |
| Index     | SQLite（`rusqlite` bundled），可从 scan 完全重建；索引重建批成单事务（**47×** 加速）                                                                                                                                                                                         |
| DAG       | revision DAG + context-relative 边投影；每次 scan 只加载一次 DAG（原为每文件一次）                                                                                                                                                                                        |
| 并发        | 跨进程 workspace flock 栅栏**所有**写者；heal-on-open 在锁内串行化；拒绝并发 check sweep                                                                                                                                                                                   |
| 一致性模型     | 显式 ratify 的 **R1**，配 owner-delegated 规则 9R-3                                                                                                                                                                                                          |
| 错误        | 整个 coherence 表面迁到 `CommandError` 类型化错误，配 `lint:command-errors` ratchet 门禁                                                                                                                                                                             |
| 前端        | 76 个文件：`BreakdownPanel`（含 AnchorAction / DelegationsSection / LogbookSection / MergeBanner / ProvenanceGroup / SuppressedGroup）、`ClaimPanel`、`CoherenceOverlays`、`services/breakdown`、`services/claims`、`services/coherence`、`CoherenceSettingsGroup` |
| MCP       | 新增 `coherence`（只读）与 `coherence_resolve`（写，principal-bound）两个工具                                                                                                                                                                                        |
| 新 Rust 依赖 | `rusqlite`(bundled)、`uuid` v4+v7、`sha2`、`unicode-normalization`                                                                                                                                                                                       |
| 专用门禁      | `check-coherence-phase.sh`、`check-coherence-runtime-phase.sh`                                                                                                                                                                                         |
| i18n      | 新增 `breakdown` / `claims` 两个命名空间 × 10 语言                                                                                                                                                                                                              |

#### Auris 侧现状

**完全没有对应物。** 全仓库搜 `lineage|provenance|coherence|dependency.*track` 只命中 nia 的 4 个无关文件（`nia-context.ts` 等，是 AI 上下文而非文档溯源）。

需要说清楚一件事：Mac 本地 `main` 有一个 `learning-lineage` 子系统（`electron/lineage/*` 约 550 行 + 2 个 MCP 工具），**但它与 coherence 不是同一个问题**——lineage 追的是"学习行为血缘"（词书 → 会话 → 笔记），coherence 追的是"文档内容依赖 + 版本陈旧检测"。lineage 没有 revision DAG、没有 pin、没有 stale/diverged 状态机、没有语义检查。而且它没进 GitHub。

#### 对齐判断

**不建议整体移植。** 理由：

1. 20,630 行 Rust kernel + 9 轮评审的成本，对 auris 当前阶段不成比例；
2. auris 的核心场景是"学习"（阅读、生词、复习、视频），不是"递归写作项目的多文档依赖"；
3. coherence 的价值密度依赖"一份文档由 AI 读多份上游生成"这个工作流，auris 用户还没到那儿。

**建议提取的三个设计模式**（成本低、跨场景通用）：

1. **pull-only + 绝不自动改用户内容**：auris 的 MCP 写入、AI 建议应用都可以照这个原则复核一遍；
2. **诚实的第三态**：语义检查的 `unchecked`（不确定就说不确定，不猜）——auris 的 AI 判定路径普遍缺这一态；
3. **限时可撤销的 agent 授权**：auris MCP 已有 client principal 与读写风险分级，但**没有"限时 + 可撤销 + 记录在谁的授权之下"**。这是最值得单独抄的一条，成本也最低。

### 3.2 🟠 Workspace Rail（沿用上轮结论，未变）

上游仍是实验性：`workspaceRailFeatureFlag.ts` 读 `settingsStore.general.workspaceRailMode`，**默认 `false`**。`services/workspaces/` 已有 40 个文件（所有权 kernel、上下文切换、tab 归属重分配、跨窗口 transfer ack 等）。

auris 侧仍无对应概念。结论与 v0.9.29 报告一致：值得跟进，但应先做纯前端的 workspace instance store + rail UI，不要一上来做跨窗口 transfer。

### 3.3 🟡 文件树三件小事（本轮新增，成本低）

| 项              | 上游做法                                         | auris 差距                       |
| -------------- | -------------------------------------------- | ------------------------------ |
| 扩展名显示          | 设置 `showFileExtensions` 默认 `true`，隐藏是 opt-in | 有 `getExtensionLabel()` 但无设置开关 |
| Show All Files | 文件树 header 里的显式按钮 + 默认快捷键                    | 无                              |
| 空 vs 读不到       | 读取失败不再呈现为"目录为空"                              | 未核查，建议自查                       |

第三项是真实的正确性问题，不是打磨。auris 的 `notes-file-tree.tsx` 值得照这个思路查一遍。

### 3.4 🟡 大纲面板：GitHub 侧仍是死代码

`notes-outline-panel.tsx` 在 GitHub 侧存在，但 grep 确认**零引用**。上游对应的 `Sidebar/OutlineView.tsx` 不仅接线，还有 `OutlineView.a11y.test.tsx`。

本地 main 已把它接进左下角栏（`☷` 按钮 + popover + `onJumpToHeading`），63 行组件 + 184 行接线。这是本地独有优势中**最便宜的一项**，建议优先补推。

---

## 4. 技术差异

### 4.1 架构对照

| 维度      | VMark 0.9.31                                                | Auris GitHub                                                               |
| ------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| 桌面壳     | Tauri 2 + Rust                                              | Electron 41                                                                |
| 前端      | Vite + React 19 + Zustand                                   | Next.js 16 + React 19                                                      |
| 编辑器     | Tiptap/ProseMirror + CodeMirror，插件化（947 文件的 `src/plugins/`） | 原生 ProseMirror + CodeMirror，28 个编辑器扩展                                      |
| 原生层     | 375 个 Rust 文件 / 53,238 行                                    | 95 个 `.cjs/.mjs`                                                           |
| 本地存储    | SQLite（rusqlite bundled）                                    | better-sqlite3（local-history / video-library / runtime-state / ai-library） |
| Sidecar | `server/mcp` + `server/content`（106 文件），独立构建与覆盖率            | `auris-notes-mcp-server.mjs` 单文件 stdio                                     |
| 自动更新    | `tauri-plugin-updater`                                      | 无                                                                          |
| LSP     | 启用 typescript-lsp，并覆盖 marketplace 未服务的语言                    | 无                                                                          |

### 4.2 规模对照（均以 `git ls-files` 为准）

| 指标             | VMark                  | Auris                   |
| -------------- | ---------------------- | ----------------------- |
| 跟踪文件总数         | 4,955                  | 1,417                   |
| 前端 `.ts/.tsx`  | 2,994                  | 429（+ 95 electron）      |
| 测试文件           | 1,454                  | 320                     |
| Rust 文件 / 其中测试 | 375 / 121              | —                       |
| i18n 语言 × 命名空间 | 10 × 14–16（140 个 json） | notes 局部 2 语言（单文件 79 行） |

规模差约 3.5×，测试文件差约 4.5×。**测试密度上游更高**（1454/2994 ≈ 0.49，auris 320/524 ≈ 0.61 看似更高，但 auris 测试更集中在 notes，13 个学习类 feature 目录测试覆盖稀疏）。

### 4.3 工程门禁：最大的技术鸿沟

上游 `package.json` 有**约 30 个自定义门禁脚本**：

```text
lint:eager            lint:file-size          lint:timer-isolation
lint:barrels          lint:shell-slots        lint:bespoke-buttons
lint:selection-styles lint:design-tokens      lint:emdash
lint:deps             lint:tauri-versions     lint:console
lint:i18n             lint:themes             lint:keybinding-manifest
lint:extension-budget lint:knip-baseline      lint:store-coupling
lint:mock-boundaries  lint:command-errors     lint:mutants-config
lint:deleted-names    lint:merge-drops        lint:hooks-purity
lint:mcp-contracts    knip / knip:files       size / size:why
mutation:ts (stryker) test:gates / test:soak / test:browser
```

auris 侧只有 4 个：`lint`（eslint）、`security:secrets`、`desktop:privacy:audit`、`db:check`。

其中几条上游门禁**直接对应 auris 已知的债务**：

| 上游门禁                   | 作用                   | 对 auris 的意义                                                |
| ---------------------- | -------------------- | ---------------------------------------------------------- |
| `lint:deleted-names`   | 已删除的名字不能悄悄回来         | auris 刚删了空壳设置，正需要这个防回归                                     |
| `lint:merge-drops`     | 合并时不许丢改动             | auris 两条无共同祖先的线正在手工移植，风险点完全一致                              |
| `lint:file-size`       | 文件大小上限（本轮为它拆了 8 个文件） | auris 有 867 行的 `notes-editor-pane.tsx`、523 行的 bottom-right |
| `lint:command-errors`  | 类型化错误的 ratchet       | auris IPC 错误未类型化                                           |
| `lint:i18n`            | key 一致性              | auris i18n 仅局部，尚不适用                                        |
| `lint:mock-boundaries` | 全局 mock 不得谎报被测对象     | 对应 auris 26 个既有失败测试里的 mock 债务                              |

**建议优先落地两条**：`lint:deleted-names` 和 `lint:merge-drops`。它们和 auris 当前正在做的事（清理空壳 + 手工移植本地成果）直接咬合，实现成本都是单个 node 脚本。

### 4.4 测试策略差异

上游本轮新增/强化：

- **分层（tier）**：`test:gates`、`test:soak`、`test:browser`、tier0 e2e 各自独立 config；
- `830efe86` 明确"停止让全局 mock 谎报它的被测对象"；
- `4d87b827` 凡是可能和生产计时器竞争的测试都控制时钟；
- `4ca6bdf8` **停止对"允许未完成的工作"做断言**——这条对 auris 尤其有参考价值，auris 现有 26 个失败测试里有一部分正是这类（断言了尚未实现的行为）；
- Rust 侧 `cargo-mutants` + 前端 `stryker` 双变异测试。

auris 侧：`vitest` + `vitest.integration` + playwright，无分层、无变异测试、无 soak。

---

## 5. Auris 独有能力（反向差异）

这些是 vmark 完全没有的方向，构成 auris 的真实产品身份：

| 模块                                              | 文件数   | 说明                |
| ----------------------------------------------- | ----- | ----------------- |
| `notes`                                         | 113   | 唯一与 vmark 正面重叠的模块 |
| `reading`                                       | 13    | 阅读区（vmark 无）      |
| `dictionary`                                    | 8     | 词典                |
| `audio`                                         | 8     | 音频                |
| `sessions`                                      | 9     | 学习会话              |
| `learning-memory`                               | 6     | 记忆模型              |
| `assessment`                                    | 4     | 测评                |
| `wordbook` / `sentencebook`                     | 3 / 2 | 生词本 / 句库          |
| `video-library` / `player`                      | 2 / 2 | 视频库与播放器           |
| `flash` / `recordings` / `templates` / `import` | 各 1–2 | 闪念、录音、模板、导入       |

页面层面：auris 有 `/reading`、`/review`、`/video/[videoId]`、`/flash` 四条 vmark 不存在的路由。

**结论：不要把对齐做成追平。** vmark 的 coherence、workspace rail、KB graph 都服务"写作项目"；auris 的 13 个学习模块服务"学习闭环"。对齐的正确目标是**借它的工程纪律和设计原则，不是抄它的功能清单**。

---

## 6. GitHub 侧本轮已闭合项

自上次报告以来，`origin/main` 前进 4 个提交，闭合了三项此前记为"本地独有"的内容：

| 提交          | 内容                               | 此前状态                                                             |
| ----------- | -------------------------------- | ---------------------------------------------------------------- |
| `a60f1ca71` | **富文本 Markdown 往返保持幂等**          | P0：origin/main 存在真实数据损坏（带空行的代码块每存一次多一个空行，单向增长不收敛）                |
| `e40405984` | **notes 编辑器暴露 markdown lint 问题** | P1：GitHub 只有空壳开关，`enableMarkdownLint` 无消费者                       |
| `6d1ec285a` | **移除失效设置控件，改为陈述真实行为**            | 编辑器/历史/Pandoc/更新 4 个面板的假开关；更新面板还硬编码了一个与 package.json 不符的"已是最新"提示 |
| `032b9ba51` | 移除对不存在的原生服务的断言                   | 测试债务                                                             |

`6d1ec285a` 顺带做了一件对的事：locale 变化时同步 `documentElement.lang`，让辅助技术能读到当前语言。

**仍未推送到 GitHub 的本地独有项**（按性价比排序）：

1. **大纲面板接线** —— 63 + 184 行，纯 UI，零风险，GitHub 侧现在是死代码；
2. **排版调节（行宽/字号）** —— `notes-workbench-bottom-right.tsx` 本地 523 行 vs GitHub 440 行；
3. **plugin runtime 架构分歧** —— 本地把执行搬到主进程（`plugin-runtime.cjs` 121 行 + 执行策略 43 行），GitHub 是渲染层 `plugin-host.ts` 272 行含 loadPluginModule/activatePlugin。**这是架构分歧不是有无**，需要单独决策，不要顺手合；
4. **learning-lineage** —— 550 行 + 2 个 MCP 工具，与 coherence 是不同问题，建议独立评估。

---

## 7. 对齐建议与优先级

| 优先级     | 动作                                                | 成本 | 理由                                                                      |
| ------- | ------------------------------------------------- | -- | ----------------------------------------------------------------------- |
| **P0**  | 补推大纲面板接线到 GitHub                                  | 极低 | GitHub 侧现为死代码，本地已验证可用                                                   |
| **P0**  | 落地 `lint:deleted-names` + `lint:merge-drops` 两个门禁 | 低  | 与"清理空壳 + 手工移植"直接咬合，防回归                                                  |
| **P1**  | MCP 授权引入**限时 + 可撤销 + 授权链记录**                      | 中  | 抄 coherence delegation 的设计，不抄 coherence 本体；auris 已有 principal 与风险分级，缺时限 |
| **P1**  | 文件树自查："读取失败"是否被呈现为"目录为空"                          | 低  | 上游 `1ef2d8b4` 修的是真实正确性问题                                                |
| **P1**  | AI 判定路径引入诚实的第三态（unchecked/不确定）                    | 中  | 上游语义检查的核心纪律，auris 普遍缺失                                                  |
| **P2**  | 补推排版调节                                            | 低  | 纯 UI                                                                    |
| **P2**  | 文件扩展名显示设置 + Show All Files                        | 低  | 本轮上游新增，产品价值明确                                                           |
| **P2**  | 清理既有 26 个失败测试中"断言未实现行为"的部分                        | 中  | 照 `4ca6bdf8` 的原则                                                        |
| **P3**  | plugin runtime 架构分歧决策                             | 中  | 需单独设计评审，不要顺手合                                                           |
| **P3**  | Workspace Rail（纯前端 instance store + rail UI）      | 高  | 上游自己仍默认关闭，不急                                                            |
| **不建议** | 移植 coherence 本体                                   | 极高 | 20,630 行 Rust + 9 轮评审，与 auris 学习场景不匹配                                   |
| **不建议** | 追平 KB graph / genies / LSP / updater              | 高  | 服务 vmark 的写作项目定位                                                        |

---

## 8. 事实核查说明

- vmark 侧比对使用 `/tmp/vmark-981` worktree（`981afc01`）。该 worktree **启用了 sparse-checkout**，`src/locales/` 等目录在 index 中但未落盘；所有计数已改用 `git ls-files` 与 git blob 重新校准。
- auris 侧比对使用 `/tmp/auris-gh-base` worktree（`032b9ba51`，即当前 `origin/main`）。
- coherence 的产品语义取自上游 `website/guide/coherence.md`（作者自己写的用户文档），行为细节与提交信息交叉验证。
- 未执行任何构建或测试，未修改任何代码，未推送任何分支。
- 标注为 ❓ 的两项（auris 是否跟随 macOS 系统外观、文件树空/读不到区分）为未核查项，不作为结论。

Made-with: Proma
