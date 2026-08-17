# Auris × VMark（xiaolai/vmark）功能与技术差异报告

> 生成时间：2026-08-17（GMT+8）
> 比对对象：
> - **VMark**：`https://github.com/xiaolai/vmark`，`main` @ `e7b9f2f711`（2026-08-17 04:32Z，v0.9.40，512 stars）
> - **Auris**：本地工作区 `/Users/apple/Desktop/大学markdown/auris`（HEAD `d7dee45` + 少量未提交改动；origin/main 基线 `b14a148`）
> 上次 vmark-sync 快照：`docs/vmark-sync/latest.json`（compared `e1eea490` = v0.9.6，2026-07-21），**已滞后 3 个主版本**。

---

## 0. 结论先说

两边定位不同，**不是谁"全面领先"的关系**：

- **VMark**：纯本地 Markdown 编辑器 + AI 协作工作区。核心是"文件类型感知 + 三态编辑器 + MCP 让 AI 直接读写同一份文件"。最近一周（v0.9.38→v0.9.40）的增量集中在 **跨平台 PDF 导出**、嵌入式浏览器、UI 打磨、异步/依赖债务清理。
- **Auris**：语言学习 + 笔记 + AI 助手（Nia）的桌面工作区。编辑器已按 VMark 思路对齐过（vmark-style 输入规则/快捷键、Source Peek、多光标等），但产品重心是**听读跟读、词库、视频库、闪念、学习血缘**，而不是通用文件工作区。

**最值得 Auris 跟进（按价值排序）**：
1. VMark **跨平台 PDF 导出**（v0.9.40 刚完成 Windows/Linux 后端，Auris 目前只有 HTML 导出）
2. VMark **知识库 / 关系图 / 全文搜索 / Slidev 预览**（本地内容服务器，Auris 的 graph/backlink 是应用内实现的，可借鉴"本地服务器 + 浏览器查看"形态）
3. VMark **coherence 文档血缘层**（8/9 移植时 Auris 已有 `learning-lineage`，但 VMark 的"读集→依赖边→stale/diverged→Accept/Revise/Waive"模型更完整，值得对照）
4. VMark **嵌入式浏览器 UI 细节**（地址栏跟随重定向、书签按精确 URL 存储、崩溃 overlay、窗口中性化）——Auris 浏览器能力更强，但 UI 打磨可借鉴

---

## 1. 版本与更新概况（2026-08-09 → 08-17）

| 版本 | 日期 | 主要变化 |
|---|---|---|
| v0.9.32 | 08-09 | 命令类型化、MCP bridge 修复、knip 清理 |
| v0.9.33 | 08-10 | **恢复阅读位置**（remount 后回到原位置） |
| v0.9.34 | 08-12 | Windows 非 home 盘文件打开修复、窗口关闭流程可观测、commit 消息泄密 gate |
| v0.9.35 | 08-14 | notarize + staple DMG（Gatekeeper 通过）、更新流 stall 恢复 |
| v0.9.36/37 | 08-14 | **异步 promise 债务清理**（152→0）、IPC 契约 gate、cargo-machete、按功能证据 ledger |
| v0.9.38 | 08-15 | **嵌入式浏览器默认开启（macOS）**、HTML 独立预览、UI 打磨、终端面板上限 50%→80% |
| v0.9.39 | 08-15 | 导出阅读器暗色主题跟随、Finder 打开聚焦 |
| v0.9.40 | 08-17 | **跨平台 PDF 导出（Windows ICoreWebView2 / Linux webkit）**、PDF 打印对话框 |

关键：vmark 版本节奏约每 1-2 天一个版本，且几乎全是 issue 驱动的 AI 修复（"vibe-coded"）。Auris 的 vmark-sync 工具仍以 `latest.json` 基线（v0.9.6）为准，需要更新 manifest 基线再跑一次 `npm run vmark:diff` 才能得到精确 diff。

---

## 2. 功能差异矩阵

图例：✅ 有且可用 / 🟡 部分或实现不同 / ❌ 无

### 2.1 编辑器（Markdown 核心）

| 能力 | VMark v0.9.40 | Auris | 说明 / 解决的问题 |
|---|---|---|---|
| WYSIWYG（所见即所得） | ✅ Tiptap/ProseMirror | ✅ 自研 ProseMirror schema（notes-rich-markdown） | 降低非技术用户 Markdown 心智负担 |
| Source 模式（CodeMirror 6） | ✅ F6 | ✅ 同栈 | 精确控制格式，编辑器差异最小化 |
| Source Peek（F5 局部看源码） | ✅ | ✅（已移植） | 不离开 WYSIWYG 精修单块语法 |
| Split 源码+预览 | ✅ Shift+F6 | 🟡 有预览 pane，未明确三态互斥 | VMark 预览=WYSIWYG 渲染器，永不漂移 |
| 多光标 | ✅ WYSIWYG + Source | ✅ Source（WYSIWYG 未做） | 批量编辑同一模式多处 |
| Tab Escape / 自动配对 | ✅ 含 CJK 引号 | ✅ vmark-style | 快速跳出成对符号 |
| 输入规则（`# `→标题、`**x**`→粗体） | ✅ | ✅（已按 vmark 补齐，CJK-aware） | 边打字边格式化 |
| 阅读位置恢复 | ✅ v0.9.33 | ✅（本地有 scroll memory） | 切换 tab/模式不丢位置 |
| 大文件策略 | ✅ 1MB/5MB/50MB 分级 | ✅（已移植"按 UTF-8 字节数评估"） | 大文件秒开、防误操作 |
| 表格 | ✅ 全功能 | ✅ 富文本表格 + 工具栏 | 结构化内容编辑 |
| 公式 / Mermaid | ✅ popup + 渲染 | ✅ katex + mermaid + 代码块高亮 | 数学/图表 |
| Wiki 链接 `[[..]]` | ✅ 渲染/跳转/backlink | ✅ 渲染/跳转 + backlink 面板 | 双链笔记 |

### 2.2 文件与格式

| 能力 | VMark | Auris | 说明 |
|---|---|---|---|
| JSON/JSONL/YAML/TOML | ✅ | ✅（已移植结构化预览 + 字节安全保存） | 结构化文件的可读/安全编辑 |
| Schema-Aware 预览（GitHub Actions/Cargo/package.json） | ✅ | 🟡 部分（format-registry 有语义识别） | 打开 `.yml` 直接给流程图/依赖树 |
| 代码文件只读/编辑 | ✅ 9 种代码 viewer | 🟡 基础语法高亮 | 在编辑器内读代码 |
| HTML 预览（sandboxed / origin-isolated） | ✅ v0.9.38 | 🟡（浏览器可开，编辑器内 preview 有 sanitize） | 本地 HTML 安全预览 |
| Mermaid 校验 MCP | ✅ 外部 server 建议 | 🟡 | 防语法错误写入 |

### 2.3 导出 / 发布

| 能力 | VMark | Auris | 说明 |
|---|---|---|---|
| 导出 HTML（文件夹/单文件） | ✅ | ✅（note-export.ts，MarkdownIt+KaTeX+Mermaid） | 便携分享 |
| **导出 PDF（跨平台）** | ✅ v0.9.40（macOS/Win/Linux） | ❌ 仅 HTML | **核心差距**：VMark 刚完成三平台打印；Auris 有 pdfjs-dist 但仅用于读取 |
| 打印（系统对话框） | ✅ | 🟡 | 直接送打印机 |
| Pandoc 导出（docx/epub） | ✅ | 🟡（有检测，未接真实导出） | 学术/出版 |
| 微信发布 | ❌ | ✅（WeChat 发布预览，PR #5） | Auris 独有中文生态能力 |
| Slidev 预览 | ✅ v0.9.38+ 知识库 | ❌ | 演示文稿 |

### 2.4 AI / MCP / 助手

| 能力 | VMark | Auris | 说明 |
|---|---|---|---|
| MCP 服务 | ✅ 9 复合工具（session/workspace/document/workflow/selection/browser/browser_read/coherence/coherence_resolve） | ✅ 99 通道 + 11 路由 + 身份认证 + 风险分级 | VMark 更"编辑器纵深"；Auris 更"安全纵深" |
| AI Genies（提示词模板） | ✅ 13 个内置 + 自由 prompt | 🟡 Nia picker + AI Dock（不同形态） | 选中文本就地 AI 改写 |
| AI Provider | ✅ Claude/Codex/Gemini CLI + REST | ✅ Nia REST + CLI（claude/codex/gemini） | 两边同源设计 |
| 嵌入式浏览器 | ✅ macOS WKWebView（实验性） | ✅ Electron WebContentsView（多窗口+分区隔离+授权链） | 看网页同时记笔记；Auris 安全模型更强 |
| AI 沙箱浏览 | ✅ Sandbox session 默认 | ✅ AI Sandbox 非持久分区 | 防止 AI 用登录态乱逛 |
| Coherence 文档血缘 | ✅ 依赖边/stale/diverged/waive | 🟡 learning-lineage（方向不同） | **见 §4 详述** |

### 2.5 工作区 / 导航 / UI

| 能力 | VMark | Auris | 说明 |
|---|---|---|---|
| Workspace Rail（多工作区） | ✅ 实验性 | ✅（已移植 workspace-rail） | 一个窗口多套 tabs/侧栏 |
| 关系图 / Knowledge Base | ✅ 本地内容服务器 + 关系图 + 全文搜索 | 🟡 graph canvas + backlink + 学习血缘 | VMark 把笔记变成可浏览器访问的知识库 |
| 终端 | ✅（xterm，面板上限 80%） | ✅（terminal-session-manager + xterm，5 会话） | 不离开编辑器用 shell |
| 命令面板 | ✅ | ✅（notes-command-catalog 14 命令） | 键盘流 |
| 快捷键自定义 | ✅ 122 个可配置 | ✅（notes-shortcut-settings） | 个性化 |
| 主题 | ✅ 6 主题 | 🟡 2-3 套 | 观感偏好 |
| 语言 | ✅ 10 种 | ✅ 中/英双语 | 国际化 |
| CJK 排版 | ✅ 20+ 规则 | 🟡 基础 | 中文标点/间距处理 |

### 2.6 Auris 独有（VMark 无对应）

| 能力 | 解决的问题 |
|---|---|
| **听读跟读（shadowing）+ 音频生成** | 语言学习者"听-跟-评"闭环，VMark 是通用编辑器，无此领域 |
| **词库 / 单词学习（word-index 4500+）** | 阅读中收集生词、复习 |
| **视频库（本地视频 + 元数据 + AI 解析）** | 把视频变可检索学习素材 |
| **闪念（Flash）** | 快速捕捉灵感（收藏/搜索/热力图） |
| **Ebbinghaus 输出复习** | 间隔重复巩固学习内容 |
| **学习血缘（learning-lineage，2 个 MCP 工具）** | 记录学习材料间的前后依赖 |
| **AI Dock / Nia 工作流（YAML/Browser Markdown）** | 可编程 AI 流程 |
| **本地多窗口浏览器 + MCP 授权链** | 安全 AI 上网（lease/approval/审计） |
| **结构化笔记库 + 个人词库同步** | 本地优先知识管理 |

---

## 3. 技术差异

| 维度 | VMark | Auris | 说明 |
|---|---|---|---|
| 桌面外壳 | **Tauri v2（Rust）** | **Electron 41** | VMark: 小体积、Rust 原生、WKWebView/WebView2；Auris: Node 生态、成熟 IPC、浏览器分区隔离 |
| 前端 | React 19 + Zustand v5 + Tailwind v4 | React 19 + Zustand v5 + 自研 CSS | 几乎同代 |
| 编辑器 | Tiptap（WYSIWYG）+ CodeMirror 6（Source） | 自研 ProseMirror schema + CodeMirror 6 | 共同核心：PM/CM6；VMark 用 Tiptap 封装，Auris 直用 PM |
| 包管理/构建 | pnpm + Vite + Tauri build | npm + Next.js(webpack) + electron-builder | Auris 桌面 = Next SSR + Electron 主进程 |
| 浏览器 | 自建 WKWebView 子视图（无桥） | WebContentsView + 分区 + 授权链 | VMark 隐私优先（无注入桥）；Auris 控制优先（精确授权） |
| MCP 实现 | Rust 侧 mcp_bridge + websocket | Node/Electron 侧 MCP server + 客户端凭据注册表 | 语言栈不同，安全设计一致（readOnlyHint/风险分级） |
| PDF | Rust 直接调用平台打印 API（PrintToPdf/webkit_print） | pdfjs-dist 仅读取 | 导出差距的技术根源 |
| SQLite | rusqlite（coherence index） | better-sqlite3（本地库）+ Supabase | Auris 有云同步通道 |
| CI | 全量 gate：lint/test/build/mutation/fuzz/coverage | tsc/lint/vitest/build + 桌面 smoke | VMark 更重工程化（"vibe-coded 但门禁严格"） |
| 语言学习栈 | 无 | openai、wordpos、katex、语音引擎、ffmpeg | Auris 领域独有 |

---

## 4. 重点功能详述（含"解决什么问题"）

### 4.1 跨平台 PDF 导出（VMark v0.9.40，Auris ❌ 差距最大）
- **做什么**：File → Export → PDF，按对话框所选纸张/方向/边距/排版直接写 PDF；Cmd+P 走系统打印对话框。macOS 用 WKWebView 打印、Windows 用 ICoreWebView2 `PrintToPdf`、Linux 用 `webkit_print_operation_print`；含 6 种纸张几何矩阵测试、打印窗口资源清理、`pdf_smoke` 单测。
- **解决什么问题**：用户写完要交付 PDF（报告/简历/论文），此前只有 HTML；页面尺寸"对话框说了不算"（macOS 一直出 Letter）是真实痛点。
- **Auris 现状**：`src/features/notes/export/note-export.ts` 只出 HTML；pdfjs-dist 只用于阅读。**建议按 VMark 的 PageSpec 思路做，或先做 macOS 打印路径。**

### 4.2 Knowledge Base + 关系图（VMark 实验功能，Auris 🟡）
- **做什么**：本地 127.0.0.1 内容服务器把整个工作区渲染成可浏览知识库：wiki-link 跳转、关系图（backlink/tags/frontmatter relations）、全文搜索、实时刷新、Slidev 预览；"Open in browser" 一次性握手给浏览器 session cookie。
- **解决什么问题**：笔记多了之后"我写过什么、哪篇和哪篇有关"不可见；把笔记变成可交叉浏览的站点而不依赖第三方。
- **Auris 现状**：graph canvas + backlink 面板是应用内组件；**可以借鉴"本地服务器 + 浏览器访问"形态**，且 Auris 已有浏览器基础设施，落地成本低。

### 4.3 Coherence 文档血缘层（VMark 新重点，Auris learning-lineage 方向不同）
- **做什么**：开启后，每次保存/应用 AI 建议/MCP 写入都记录 transformation；AI 写文档时读过的其他文档成为 dependency edge（钉住 revision）；上游变化后 edge 变 stale/diverged；Breakdown 面板列出下游可能过期的产物，提供 Accept newer / Revise / Waive（必填理由）；语义检查（Check）调用 AI 判定是否真的矛盾（给出逐字证据）。
- **解决什么问题**：递归式 AI 写作（AI 生成文档 A 时读 B，B 又来自 C）容易"上下游漂移"，人工无法追踪哪个产物过期了。**VMark 不做自动更新，只做"让主编知道该重读哪篇"。**
- **Auris 现状**：`learning-lineage`（学习血缘）记录材料前后依赖 + 2 个 MCP 工具，是"学习路径"语义；**可对照 VMark 的 stale/diverged/waive 模型扩展为"笔记产物血缘"**。

### 4.4 嵌入式浏览器（VMark v0.9.38 默认开启，Auris 已更强）
- **做什么**：文档窗口里开真 webview tab；地址栏自动跟随重定向、书签按精确 URL（不"智能"改写 query）、崩溃 overlay + 自动重载、窗口"中性化"（浏览网页时去掉主题色调）；AI session 默认沙箱、禁 loopback。
- **解决什么问题**：边写笔记边查资料，不用切窗口；AI 看网页时不能拿到你的登录态/内网。
- **Auris 现状**：多窗口 + 分区隔离 + lease/approval 授权链 + 审计，安全模型显著更强；**可借鉴的是 VMark 的 UI 细节（崩溃 overlay、地址栏跟随、窗口中性化）。**

### 4.5 工程化门禁（VMark 近一周主线）
- 异步 promise 债务清零（152→0）、IPC 契约 gate、cargo-machete 死依赖检查、按功能证据 ledger、commit 消息泄密 gate、CI 并行分片、fuzz（genie/resolve_expression）。
- **解决什么问题**：vibe-coded 项目的可持续性——"每次改动有可复现验证，避免技术债滚雪球"。Auris 已有 tsc/lint/vitest/desktop smoke/feature-ledger，方向一致。

---

## 5. 建议的 Auris 跟进清单（按 ROI）

| 优先级 | 事项 | 类型 | 预估 |
|---|---|---|---|
| P0 | 更新 `docs/vmark-port/manifest.json` 基线 + 跑 `npm run vmark:diff`，把 sync 快照从 v0.9.6 提到 v0.9.40 | 维护 | 小 |
| P1 | PDF 导出：先做 macOS 打印路径（复用现有 HTML 渲染），参考 VMark PageSpec | 功能移植 | 中 |
| P1 | Knowledge Base 形态：本地内容服务器 + 浏览器访问（Auris 已有浏览器/授权链） | 功能移植 | 中大 |
| P2 | coherence 模型对照：给 learning-lineage 增加 stale/diverged/accept/waive 语义 | 演进 | 中 |
| P2 | 浏览器 UI 打磨：崩溃 overlay、地址栏跟随、窗口中性化 | UI | 小 |
| P3 | 其余 VMark 特性（CJK 20+ 规则、Split 三态、代码 viewer、Slidev）按需 | 按需 | — |

---

## 6. 数据来源与局限

- VMark：GitHub API（commits/releases/tree）+ 官网 guide（features/export/mcp-tools/coherence/browser/workspace-rail/knowledge-base）。
- Auris：本地工作区（README/PRODUCT/AGENTS/package.json、src/features、docs/browser、docs/notes/vmark-note-editor-alignment-report、vmark-sync 快照）。
- 局限：未对 vmark 源码做逐文件 diff（sync 基线停在 v0.9.6，若需精确 diff 请先跑 `npm run vmark:diff`）；Auris 功能面以本地 HEAD + 已提交能力为准，未验证打包产物。
