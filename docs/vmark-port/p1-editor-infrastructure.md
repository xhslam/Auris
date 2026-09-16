# P1 编辑器基础设施：VMark v0.9.15 对齐记录

初始基线：VMark `v0.9.15`，commit `6f3c1be8ad3c5fb925e0e4580f6041e740e51733`。

2026-07-29 增量复核：VMark `main`，commit `2805ea81c1fe47ba8fbbc6aa582eaa087060ef7c`。

## 功能与实现映射

| 能力 | VMark v0.9.15 | Auris P1 | 关键技术差异 |
| --- | --- | --- | --- |
| Command Bus | `src/services/commands/CommandBus.ts` 统一注册和执行，逐步迁移旧 action registry | `notes-command-bus.ts` + `notes-command-catalog.ts`，菜单和全局键盘走同一 ID | VMark 是全应用 Tauri 总线；Auris 先限定 Notes 域，并用活动 surface 隔离 CodeMirror、ProseMirror、全局和 xterm |
| 快捷键 | `shortcutDefinitions.ts` 保存默认绑定，Tauri 菜单同步 | `notes-shortcut-registry.ts` 标准化组合键、按 surface 解析并检测同层冲突；设置页可改工作台命令并导入/导出 schema v1 | 修改经版本化 localStorage 和窗口事件实时广播；Electron 菜单仍只发送 command ID，编辑器原生键位保留各 surface 自己的执行语义 |
| i18n | i18next namespace、键完整性与未翻译基线 gate | Notes 工作台提供 `zh-CN` / `en-US` 完整等形资源、持久 locale 与实时切换 | 当前先覆盖 Notes 产品域；资源形状由 `notes-i18n.test.ts` 固定，CI 的 `quality:notes` 将翻译键和快捷键契约列为必过门禁 |
| Markdown 分屏 | pane/split store 支持多 pane，源码编辑由独立 source editor 驱动 | 单文档双栏：可编辑 CodeMirror + 只读 ProseMirror 实时预览 | Auris 不创建第二份可写文档状态，避免两个编辑器互相回写和污染 undo |
| WYSIWYG 查找替换 | 编辑器 finder/replace 命令 | `notes-rich-find-replace.ts` 遍历 ProseMirror text node，支持上/下一个、替换当前、全部替换 | Auris 直接生成 ProseMirror transaction，保留 schema 与 undo 历史 |
| Markdown lint | `runActiveLint.ts` 调用文档 store lint | `markdown-lint.ts` 纯函数诊断，编辑器标题显示数量、行号和原因 | Auris 首批规则无外部依赖，覆盖围栏、链接、重复标题、表格列数和尾随空白 |
| 大文件 | large-file session store 强制 source，并按设置控制 | 1 MB 进入 reduced source；5 MB 进入 plain-text strategy；按 UTF-8 字节计算 | Auris 在首次 editor render 前决策，轻量 CodeMirror state 不加载 Markdown parser、图片和 wiki-link 扩展 |
| Vault 加载 | 工作区恢复只读取已打开标签，其他文件按导航需要加载 | `vault-store.ts` 首次刷新只列举 entry 并读取 1 个初始文档；恢复标签、打开文件按路径补读 | 搜索、手动重建索引和导出是明确的全库读取边界；普通刷新只重读已经进入缓存的工作集 |
| 未知文本 | 有真实路径的未知扩展统一落到 `txt` source editor，绝不误入 Markdown WYSIWYG | 未知扩展落到 `unknown-text` source editor；已知二进制扩展仍为 attachment | Auris 在读取后额外检查 NUL、控制字符和 UTF-8 replacement ratio，未知二进制不会被物化成可编辑文档 |
| Schema-aware preview | JSON/YAML/TOML adapter 贡献 `schemaDetector` / `schemaRenderers`，支持 package.json、GHA、Cargo、pyproject | 结构树上方增加语义摘要，支持 package.json、tsconfig、GHA、Compose、OpenAPI、Cargo、pyproject | Auris 保留有界通用树作为 fallback；schema 检测只消费已安全解析的值，不执行文件内容 |
| 历史版本 | save pipeline 调用 history snapshot，具备 merge/age/size 设置 | 不超过 512 KB 的成功保存记录去重版本，最多 50 条；右下角历史面板恢复 | VMark 由 Tauri 文件历史服务持久化；Auris 由 Electron main 的 durable recovery store 持有，恢复后重新进入正常 dirty/save/conflict 流程 |
| Hot Exit | `_hotExitCapture.ts` / `_hotExitRestore.ts` 协调 Tauri 多窗口 session | V2 对不超过 2 MB 的内容变化捕获 vault/path/source/磁盘基线，并持久化每个 vault 的 tabs、active tab、pinned tabs、editor mode 与侧栏状态 | Auris 保持单 Notes 工作台；恢复时磁盘相同则清理，磁盘已外部变化则进入冲突流程，文件缺失则保留虚拟 dirty 文档并仅在手动保存时重建 |
| 文件树 | Tauri fs/file actions | Electron IPC 提供 copy/move/reveal/trash/restore；删除移动到 userData 回收站 | 回收站在 vault 外，避免索引和 watcher 将已删除文件重新纳入；恢复前拒绝覆盖原路径 |

## 验证证据

- [VERIFY: `git -C .tmp-vmark-explore/repo rev-parse HEAD` 返回 `6f3c1be8ad3c5fb925e0e4580f6041e740e51733`。]
- [VERIFY: `src/services/commands/CommandBus.ts` 的 `registerCommand`、`registerCommands`、`executeCommand` 明确禁止重复 ID，并把执行聚合到单一路径。]
- [VERIFY: `src/stores/settingsStore/shortcutDefinitions.ts` 定义默认快捷键、scope 和 native menuId。]
- [VERIFY: `src/services/persistence/resilience/_hotExitCapture.ts` 与 `_hotExitRestore.ts` 分别负责 session 捕获和恢复。]
- [VERIFY: Auris `notes-command-bus.test.ts` 覆盖注册、重复 ID、分层解析和冲突检测。]
- [VERIFY: Auris `notes-rich-editor-sync.test.tsx` 同时验证真实 split DOM、只读 preview 和 WYSIWYG 全部替换。]
- [VERIFY: Auris `notes-recovery-store.test.ts` 覆盖 Hot Exit V2 草稿替换、磁盘基线、last-good fallback、vault 隔离 workspace、缺失文件手动重建与历史去重。]
- [VERIFY: Auris `vault-store.test.ts` 证明首次刷新只读取一个初始文档，显式 `loadDocuments()` 与 `rebuildIndex()` 分别覆盖按需和全量读取。]
- [VERIFY: Auris `document-repository.test.ts` 与 `format-registry.test.ts` 覆盖未知文本 source fallback 和二进制内容拒绝。]
- [VERIFY: Auris `structured-schema.test.ts` 与 `structured-data-preview.test.tsx` 覆盖七类 schema detector、语义摘要和通用树 fallback。]
- [VERIFY: Auris `notes-i18n.test.ts` 固定中英文资源键形状、持久 locale 与动态 copy；`notes-shortcut-settings.test.ts` 固定版本化导入导出、即时广播与命令 registry override。]
- [VERIFY: `.github/workflows/notes.yml` 执行 `npm run quality:notes`，在 Notes 测试前先跑 ESLint、i18n 和 shortcut contract gates。]
- [VERIFY: Auris `desktop-vault-client.test.ts` 与 `desktop-vault-service.test.ts` 覆盖 copy、reveal 和 trash restore 桥接。]

## 有意保留的差异

1. Auris 不复制 VMark 的 Tauri/Rust 层；平台能力落在 Electron main/preload，renderer 只持有最小 IPC API。
2. Auris 分屏只允许一个写入源；右侧是只读预览。这比双可写 pane 更适合现有自动保存、冲突检测和 Markdown round-trip 边界。
3. Hot Exit V2 与历史服务于单窗口 Notes 工作台；Auris 没有复制 VMark 的多窗口捕获协调器，但单窗口内的脏文档、冲突基线和 workspace UI 状态已形成完整恢复闭环。
4. 编辑器内部的格式键仍由 CodeMirror / ProseMirror 原生 keymap 执行；设置页当前开放工作台级命令的自定义，尚未把每个编辑器原生命令提升为全局可重绑项。

---

## 2026-09-16 增量复核：VMark `v0.9.74`，commit `2fc00f4c21389eb5282abe91d9aee93093541c8e`

本轮根据 VMark v0.9.74 的 40 个提交与核心 PR（#1407、#1410 ~ #1417）完成增量对齐：

### 1. 吸收项与对齐落地

- **Markdown 极限病态输入线性化（O(n) Fast Paths）**：
  - 针对大量未闭合反括号 `]`、反引号和未闭合强调符导致的 O(n²) 回溯与 ReDoS 卡死，引入 `fast-paths`（`inertLabelEnd`、`inertCodeTextSequence`、`attentionWithoutFutileWalks`），在获得完全反证时提前消耗为普通数据，统一接入 `notes-markdown-dialect.ts`。
- **富文本编辑器 Undo/Redo 历史完整性守卫（Undo Integrity）**：
  - 引入 `notes-undo-integrity.ts`。在历史事务分发窗口期，拦截并拒绝任何插件通过 `appendTransaction`（如表格修正或普通格式化）对文档附加的修改，杜绝历史分支撕裂与连续 Undo 抛出 `RangeError: Position out of range`。
- **不可解析/超限文档安全降级（Unparseable Document Refusal）**：
  - 废除原先将不可解析或超限 Markdown 强行拆解为纯文本 `<p>` 段落的危险行为（该行为在自动保存时会洗掉 Markdown 格式造成数据损坏）；
  - 遇到解析拒绝时，自动降级至源码模式（Source Mode）打开并向用户提示，同时冻结与丢弃来自被拒绝富文本编辑器的任何自动保存写回。

### 2. 有意保留的差异

- Auris 坚决不引入 Tiptap 庞大封装，继续保持原生 ProseMirror + CodeMirror 双 surface 架构。
- 平台持久化与回收站管理依然由 Electron 主进程 IPC 承接，不引入 Tauri/Rust 逻辑。
- 分屏编辑保持“左侧源码可写，右侧只读预览”原则不变。
