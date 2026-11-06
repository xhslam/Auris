# Auris Notes 类 Obsidian 流畅体验第二阶段实施 Spec

- 日期：2026-11-06
- 状态：待实施
- 前置文档：`docs/notes-large-vault-performance-spec-2026-11-05.md`
- 范围：桌面端 `/notes` 的首屏、加载状态、任务调度、后台索引和编辑器输入链路
- 本文性质：仅实施规格，不包含业务代码修改

---

## 1. 本轮要解决什么

第一阶段已经降低了“大 Vault 直接卡爆”的严重程度：正文指纹复用、有界 `stat`、refresh 合并、文件树窗口化、搜索派生缓存和分页均已有实现。

剩余问题不只是“工作量太大”，而是：

1. **全量工作仍占据交互的关键等待路径。**
2. **加载状态不能准确表达“已有可用内容，正在后台刷新”。**
3. **新调度器存在 Promise 完成顺序和旧快照回写风险。**
4. **编辑器每次输入仍同步序列化、解析整篇文档。**
5. **部分增量优化只有纯函数，没有正确接入真实 Hook 数据流。**

本轮目标不是笼统追求“更像 Obsidian”，而是落实以下体验原则：

- 有内容就立即可用，不用全局 loading 覆盖已有内容。
- 用户当前操作永远优先于全库扫描、索引和图谱。
- 首屏先显示轻量目录与活动文档，完整元数据和搜索索引在后台补齐。
- 后台任务分片、可让渡、可过期，不允许一次 `loadAll` 长时间堵住点击和输入。
- 任何性能优化都不能削弱自动保存、冲突检测和重命名链接改写的完整性。

---

## 2. 当前实现复核

### 2.1 已有且应保留的能力

| 能力 | 当前位置 | 结论 |
|---|---|---|
| 正文按 `mtime/size` 复用 | `src/features/notes/vault/vault-store.ts:260-293` | 保留，但桌面 `size` 仍需补全 |
| refresh 尾随合并 | `vault-store.ts:299-425` | 框架保留，Promise 生命周期需修正 |
| walker 有界并发 | `electron/vault/vault-file-walker.cjs:20-38,92-110` | 保留，但不能让全量 stat 阻塞首屏 |
| 未变文档引用稳定 | `vault-store.ts:151-185` | 保留 |
| 搜索派生 WeakMap | `document-search.ts` | 保留 |
| 搜索结果分页 | `notes-search-panel.tsx` | 保留 |
| 文件树窗口化 | `notes-file-tree.tsx` | 保留，修复交互细节 |
| 增量反链纯函数 | `backlinks.ts:248-337` | 保留，修正 Hook 输入 |
| 图谱复用 `parsed.links` | `relationship-graph.ts` | 保留 |

### 2.2 剩余关键问题

| 优先级 | 位置 | 当前问题 |
|---|---|---|
| P0 | `use-notes-runtime.ts:103-117` | `getDirectoryInfo()` 完成后才启动 `vaultStore.refresh()`，首屏被串行 IPC 延迟 |
| P0 | `use-notes-runtime.ts:84-96`、`notes-explorer.tsx:23,81-89` | 初始 `directoryInfo.isConfigured=false` 会把“尚未知道配置”错误显示为“未配置” |
| P0 | `notes-workbench-center.tsx:68-100` | 已有活动文档时仍显示全库 loading 横幅，强化等待感 |
| P0 | `vault-store.ts:367-378,413-424` | 首批 Promise 在 `finally` 中等待尾随队列，可能晚于新快照返回 |
| P0 | `use-notes-runtime.ts:103-163` | renderer 提交没有 root/generation/revision 守卫，旧快照和旧 `finally` 可覆盖新状态 |
| P0 | `vault-store.ts:385-424` | 当前笔记 `loadDocuments` 与全量 rebuild 共用唯一执行边界 |
| P0 | `use-notes-documents.ts:245-258` | 首次非空搜索仍请求全库正文装载 |
| P0 | `use-notes-documents.ts:464-509` | live 新文档覆盖 previous map；单 timer/单 changedDocument 可能漏反链变化 |
| P0 | `use-notes-actions.ts:327-525` | 重命名/移动主要依赖已加载文档，未加载来源中的链接存在漏改风险 |
| P1 | `vault-store.ts:138-149` | 每次 publish 仍全量构建反链 |
| P1 | `notes-rich-editor-pane.tsx:1186-1225` | 每次 `docChanged` 同步序列化并解析整篇文档 |
| P1 | `notes-rich-editor-pane.tsx:516-545` | 未传 previous index；resolver 函数身份变化仍可能触发 decoration dispatch |
| P1 | `vault-client.ts:12-21` | 桌面 entry 固定 `size:null`，完整指纹没有真正落实 |
| P1 | `vault-store.ts:295` | 普通 refresh 会把 `fullyIndexed` 重置为 false |
| P1 | `vault-file-walker.cjs:54-120` | 每轮扫描仍等待所有目录和全文件 stat；另有多层重复排序 |
| P1 | `notes-graph-panel.tsx`、`notes-workbench.facade.ts` | local graph 仍先构建全图，graph cache 随整个 snapshot 过度失效 |

截图中“编辑器已有正文 + 顶部正在加载 + 左侧提示打开文件夹”的组合，正是当前分散状态模型允许出现的状态。本轮必须用统一状态机和提交守卫消除，而不是仅调整文案。

---

## 3. 体验验收目标

以下为实施验收目标，不是当前实测结果。墙钟指标在真实 Windows/NTFS 桌面端测量；CI 优先断言调用次数、顺序和任务预算。

| 场景 | 确定性要求 | 体验目标 |
|---|---|---|
| 有上次目录缓存的暖启动 | 不等待目录扫描即可提交缓存 entries | 首帧到可操作文件树 p95 `≤150ms` |
| 无缓存冷启动 | `getDirectoryInfo` 不阻塞 names-only 列表请求 | 根目录/首批可见条目 p95 `≤300ms` |
| 已有活动文档的后台刷新 | 顶部初始 loading 横幅数为 0，编辑器保持可输入 | 无明显“整库等待”状态 |
| 点击已缓存笔记 | 不执行目录全扫，不等待后台索引 | 正文可见 p95 `≤100ms` |
| 后台全量索引时打开未缓存笔记 | 当前路径进入交互通道，不排在全量任务后 | 普通笔记正文可见 p95 `≤300ms` |
| 连续输入 | 每次 transaction 同步整篇 serialize/parse 次数为 0 | 输入到下一次绘制 p95 `≤32ms` |
| 后台主线程派生 | 每片约 `4–8ms`，片间主动让渡 | 后台任务导致的 `>50ms` Long Task 为 0 |
| 冷搜索 | 不调用 `ensureDocuments(allPaths)`；已有结果先显示 | 100ms 内出现结果或明确索引进度 |
| 过期异步提交 | 旧 root/generation/revision 提交数为 0 | 无状态回退和闪烁 |
| 文件树 | DOM 仅与视口和 overscan 相关 | 万级条目滚动不挂载整树 |

测量必须区分冷/暖启动、OS 文件缓存冷/暖、索引无/部分/完整，并报告 p50/p95。不能用两次瞬时采样推断趋势。

---

## 4. 总体架构

将当前“一条全局串行链”拆成四条协调但不被全量任务阻塞的通道：

```text
A. 目录配置与首屏通道
   cached entries / names-only scan → 文件树立即可用

B. 当前交互通道
   active note / clicked note / save / conflict check → 最高优先级

C. 元数据与搜索后台通道
   分批 stat / title / alias / links / search fields → 分片让渡

D. 非关键派生通道
   backlinks / graph / decoration → 只消费有效版本，过期即丢弃
```

所有通道共享：

- `rootId`：规范化 Vault 根身份的本地标识；
- `generation`：每次切换 Vault 或重建运行上下文时递增；
- `revision`：当前 root 内单调递增的快照提交版本；
- per-path singleflight：同一路径的交互和后台读取共享结果，交互请求可提升优先级；
- dirty/save 保护：任何旧磁盘结果都不能覆盖未保存编辑。

禁止用一个全局 `inFlightExecution` 串住所有通道。

---

## 5. 阶段 A：先修调度竞态与数据完整性

这是后续体验优化的硬前置，必须独立交付。

### A1. 修正 store 任务生命周期

主要文件：`src/features/notes/vault/vault-store.ts`

要求：

1. 当前批次的 Promise 在自己的结果完成后 settle，不得等待所有尾随批次。
2. 尾随任务可以随后启动，但不得让 B 的调用方先于 A 可见完成、再让 A 晚到覆盖 B。
3. 持续新增 watcher 请求时，首批调用不能饥饿等待。
4. 每个批次的 deferred 全部 settle；异常后队列必须继续可用。
5. `loadDocuments` 与 `refresh` 的结果都携带单调 revision。
6. store 内部最新状态可以前进，但调用方只能按 revision 提交；旧结果即使晚返回也无效。

建议返回 envelope，而非仅返回裸 snapshot：

```ts
type VaultSnapshotEnvelope = {
  rootId: string;
  generation: number;
  revision: number;
  snapshot: VaultSnapshot;
};
```

保留现有公开行为所需适配，但不要继续以 `generatedAt` 充当并发版本。

### A2. renderer 增加统一提交守卫

主要文件：`src/features/notes/workbench/use-notes-runtime.ts`

所有异步结果在提交前必须满足：

```text
result.rootId === current.rootId
result.generation === current.generation
result.revision > current.committedRevision
```

适用于：

- snapshot；
- directoryInfo；
- loading/indexing 状态；
- errorMessage；
- media reload key。

旧请求的 `finally` 不得清除新请求的 loading/error。卸载和 Vault 切换后不得 setState。

### A3. 修复实时反链 Hook 集成

主要文件：`src/features/notes/workbench/use-notes-documents.ts`

要求：

- `previousDocumentsByPath` 必须来自“上一次已派生版本”，不能让 `liveDocumentsRef.current` 中的新文档覆盖旧版本。
- 用一个 dirty path Map/Set 累积 debounce 窗口内全部变化；执行时批量传入 `changedDocuments`，不能只保留最后一篇。
- 每次成功派生后更新 previous-derived ref；root/generation 改变时清空 timer 和 ref。
- title/alias 变化可保守全量重建，但普通正文编辑只更新旧/新 target。
- store `publish()` 接入同一增量机制；无文档变化时不得遍历全部已加载 Markdown 重建反链。

### A4. 重命名/移动必须先获得完整链接事实

主要文件：`src/features/notes/workbench/use-notes-actions.ts`

要求：

- 不允许用“当前恰好加载的 documents”代表全库链接事实。
- 执行写计划前，`NavigationIndex` 必须对当前 root/generation 达到 `complete`，并包含所有 Markdown 的出链元数据。
- 索引未完成时，操作可以等待一次必要的后台元数据补全，并在操作局部显示进度；不得直接执行可能漏改的计划。
- 保留现有写前 baseline 校验、冲突停止、历史记录和 live document reconciliation。
- 该等待只发生在低频写操作，不得重新放进普通打开/输入路径。

### A5. 补齐桌面文件指纹

主要文件：

- `electron/vault/vault-file-walker.cjs`
- `src/platform/desktop/vault-service.ts`
- `src/platform/desktop/vault-client.ts`

在完整元数据结果中传递真实 `size`；names-only 结果明确标记元数据不完整，不能伪装成 `size:null` 的完整事实。

### 阶段 A 必测

1. A 执行中、B 尾随：A 的 Promise 先完成，B 后完成，UI 不回退。
2. 人为让旧请求晚返回：root/generation/revision 守卫拒绝提交。
3. 旧 `finally` 不清除新请求状态。
4. A 链接由 B 改为 C：B 反链移除 A，C 增加 A。
5. 同一 debounce 窗口修改两篇文档，两组变化都保留。
6. 冷启动仅加载一篇时，重命名仍能发现并改写未加载来源中的链接。
7. 同 mtime、不同 size 的桌面文件不会被误判为未变化。

---

## 6. 阶段 B：即时首屏与正确的加载状态

### B1. 用状态机替代分散布尔值

主要文件：

- `src/features/notes/workbench/use-notes-runtime.ts`
- `src/features/notes/vault/vault-types.ts`
- `src/components/notes-v2/notes-explorer.tsx`
- `src/components/notes-v2/notes-workbench-center.tsx`

建议视图状态：

```ts
type VaultViewState = {
  rootId: string;
  connection: "unknown" | "configured" | "unconfigured" | "error";
  entries: VaultEntry[] | null;
  entriesAreStale: boolean;
  activeDocumentAvailable: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isIndexing: boolean;
  indexedCount: number;
  indexableCount: number;
  errorMessage: string | null;
};
```

规则：

- `entries:null` 表示尚未加载；`entries:[]` 表示已确认空目录，两者不得混用。
- 初始桌面配置为 `unknown`，不是 `unconfigured`。
- `isInitialLoading = 当前 root 没有任何可用 entries 且没有可用活动文档`。
- 有旧快照时只设置 `isRefreshing`，不触发全局初始 loading。
- `activeDocumentAvailable=true` 时不显示全库 loading 横幅。
- 后台刷新失败保留旧树和正文，以非阻塞状态提示“刷新失败，显示上次结果”。
- 只有明确的 `unconfigured` 才显示“打开一个文件夹，开始写作”。
- 新建、折叠等按钮是否禁用应由实际操作可用性决定，不因后台 indexing 一律禁用。

### B2. 目录信息与目录扫描解耦

主要文件：`use-notes-runtime.ts`

启动时独立发起：

```text
resolve root identity
getDirectoryInfo
read cached entries（若存在）
start names-only listing
load active/open-tab documents
```

要求：

- `getDirectoryInfo` 不成为 `listEntries` 的前置条件。
- 不使用 `Promise.all` 等最慢任务再统一提交；各通道按 generation 独立提交。
- `ensurePluginsDirectory` 等初始化写操作不得阻塞只读首屏；如需调整主进程，单独声明影响。
- 目录信息失败不能覆盖已经成功加载的有效 Vault entries。
- root 尚未明确前不扫描；root 一旦确定，当前活动文档读取优先启动。

### B3. names-only 首屏，完整 stat 后台补齐

主要文件：

- `electron/vault/vault-file-walker.cjs`
- `src/platform/desktop/vault-service.ts`
- `src/platform/desktop/vault-client.ts`
- `src/features/notes/vault/vault-store.ts`

建议扫描结果显式携带元数据级别：

```ts
type VaultListing = {
  entries: VaultEntry[];
  metadata: "names-only" | "complete";
  rootId: string;
  generation: number;
};
```

规则：

1. names-only 仅使用 `readdir({withFileTypes:true})` 获取 path/kind/name，不等待全库 stat。
2. 文件树可以先消费 names-only；当前活动路径和 open tabs 的 stat/read 优先。
3. 后台按目录或固定批次补全 mtime/size，主线程合并分片不超过 8ms。
4. names-only 不得抹掉已有完整指纹；合并时保留仍有效旧元数据。
5. 只有 complete 元数据才能用于“无变化正文读取为 0”的可靠缓存判断。
6. 若 watcher 给出明确变化路径，优先只刷新该路径；事件不完整时降级完整扫描。
7. walker、desktop service、store 只保留一次权威全量排序；分片列表可局部排序后归并。

### B4. 持久化轻量上次会话快照

目标：暖启动先显示上次文件树，再后台核对。

内容仅限：

```ts
{
  schemaVersion: 1;
  rootId: string;
  savedAt: string;
  entries: VaultEntry[];
  activePath: string | null;
  openTabs: string[];
}
```

约束：

- 默认不持久化全库正文；活动文档仍通过高优先级磁盘读取获得最新内容。
- 存在应用自己的缓存目录，不写入用户 Vault；使用异步原子写，避免损坏。
- rootId/schema 不匹配时忽略缓存；缓存损坏不阻塞正常扫描。
- 缓存 entries 显示时标记 `entriesAreStale=true`，后台扫描完成后原子替换。
- 点击已被磁盘删除的缓存条目时，局部处理 missing 并触发刷新，不清空整个工作台。
- 不使用同步 `localStorage` 保存万级 entries JSON。
- 缓存不发送任何外部遥测，不记录正文。

### 阶段 B 必测

1. `getDirectoryInfo` 永久 pending 时，names-only 列表和活动文档仍能加载。
2. 有缓存时无全屏 loading，文件树立即可用。
3. 活动文档已存在且 directoryInfo 未返回时，不出现“打开文件夹”。
4. 后台刷新失败保留旧 UI。
5. names-only 不触发全库 stat，也不覆盖已有完整指纹。
6. 缓存 root 不匹配、损坏、过期时均安全降级。

---

## 7. 阶段 C：交互优先与渐进后台索引

### C1. 分离交互读取和后台批量任务

主要文件：`src/features/notes/vault/vault-store.ts`

建议能力：

```ts
loadDocument(path, { priority: "interactive" });
loadDocuments(paths, { priority: "background" });
refreshListing({ priority: "background" });
```

要求：

- 当前文档、用户点击文档不等待全量 `loadAll/rebuild`。
- 同路径 singleflight，避免交互与后台重复读取；交互到来时提升该路径优先级。
- 目录扫描自身可 singleflight，但正文读取不与全量扫描共用全局锁。
- 每篇文档完成时按 root/generation/fingerprint 合并进最新 store，而不是用旧批次数组整体覆盖新状态。
- 当前保存和冲突检查优先级最高，继续遵循 per-path save chain。
- 批量任务有并发的 IO 上限，同时有 renderer CPU 分片上限；两者不能互相替代。

### C2. 后台索引分层

建立内存索引，必要时复用阶段 B 的轻量缓存：

| 层 | 内容 | 消费者 |
|---|---|---|
| Directory | path/kind/name/mtime/size | 文件树、快速导航 |
| Navigation | title/alias/outgoing links | wiki-link、反链、重命名、图谱 |
| Search | lowercase body/headings/tags/path | 全文搜索 |

失效规则：

- 单文件变化只失效该 path 的记录。
- 未变 fingerprint 复用旧记录。
- 普通正文编辑不重建全部 Navigation lookup。
- root 切换使用独立 namespace/generation。
- `fullyIndexed` 改为由实际 coverage 推导，不能被普通 refresh 随意重置。
- `rebuildIndex` 重建派生数据时复用未变正文，不默认 `forceReload` 全库。

### C3. 后台任务分片与让渡

- 每批建议 32–100 个文件，实际以 `4–8ms` CPU budget 动态结束分片。
- 分片之间使用可控让渡；有 `scheduler.yield` 时可使用，否则采用兼容 fallback。
- 不依赖 `requestIdleCallback` 保证保存或当前文档正确性；关键操作必须显式 flush。
- 每个任务携带 rootId/generation/documentRevision/queryRevision；过期结果直接丢弃。
- 当前输入或导航到来时，后台队列在下一个分片边界让渡，不能等待整个 10,000 文件批次。

### C4. 冷搜索改为渐进结果

主要文件：

- `src/features/notes/workbench/use-notes-documents.ts`
- `src/features/notes/documents/document-search.ts`
- `src/components/notes-v2/notes-search-panel.tsx`

删除非空 query 时的 `ensureDocuments(allEditablePaths)` 行为，改为：

1. 立即查询当前已索引语料和 live drafts。
2. 100ms 内显示已有结果；若无结果，显示“正在索引 X/Y”，而不是空白等待。
3. 后台索引分片完成后，按 queryRevision 合并新结果。
4. 新 query 使旧 query 失效；不能显示旧词结果冒充新词结果。
5. 结果区域明确标记 `partial/complete`，partial 时提示“结果仍在更新”。
6. 保留现有搜索语法、评分、稳定排序、WeakMap 和每页 100 条。
7. 当索引已 complete 时，暖搜索不显示索引进度。

### 阶段 C 必测

1. 后台 10,000 文档索引执行中，点击未缓存笔记不等待全量完成。
2. 同路径交互/后台读取只产生一次磁盘 IO。
3. 持续输入时后台任务能在分片边界让渡。
4. 冷搜索没有全路径 `ensureDocuments` 调用，partial/complete 状态准确。
5. 旧 query、旧 root、旧文档 revision 的结果提交数为 0。
6. 普通 refresh 不把完整索引 coverage 降级为 false。

---

## 8. 阶段 D：编辑器输入链路降载

### D1. 将按键立即工作与整文档派生分离

主要文件：`src/components/notes-v2/notes-rich-editor-pane.tsx`

`dispatchTransaction` 中立即执行：

- `state.apply` 和 `updateState`；
- 当前光标、选区和必要块状态更新；
- 增加当前文档 `editorRevision`；
- 标记 dirty，并记录有待 flush 的 source。

将以下工作移出每次按键的同步调用栈：

- `serializeNotesRichMarkdown(nextState.doc)`；
- `parseEditableNoteSource(...)`；
- `composeEditableNoteSource(...)`；
- TOC、反链、搜索等整文档派生。

建议用 60–100ms trailing 合并窗口，只处理最新 editorRevision。该延迟只针对派生，不得延迟 ProseMirror 自身绘制。

### D2. 明确 source flush 协议

新增内部 `flushLatestEditorSource()`：

- 从最新 ProseMirror doc 同步生成最新 Markdown source；
- 更新 `lastAppliedSourceRef` 和 editable document ref；
- 调用现有 `onDocumentChange`；
- 返回最新 source 供保存使用。

以下时机必须 flush：

- 手动/自动保存前；
- blur；
- 切换文档；
- 关闭标签；
- `pagehide` / 应用退出前既有保存链路；
- 需要读取最新全文的重命名、导出等操作。

IME 要求：

- composition 期间不应用外部旧 source 重置编辑器；
- compositionend 后 flush 最新 revision；
- 延迟派生不能丢失最后一个字符或破坏中文输入。

### D3. resolver 与 decoration 稳定化

主要文件：

- `src/features/notes/documents/backlinks.ts`
- `src/components/notes-v2/notes-rich-editor-pane.tsx`

要求：

- 调用 `buildWikiLinkTargetIndex(documents, previousIndex)`，真正复用 previous。
- target version 不变时，`wikiLinkExists` 函数身份保持稳定。
- effect 仅依赖稳定 index/version，不因新函数身份发送 `NOTES_RICH_EDITOR_SYNC_META`。
- 目标集合实际变化时只 dispatch 一次。
- 后续 profiling 若 decoration 仍昂贵，再按受影响 range 更新，不在首版引入复杂增量 decoration 系统。

### D4. 外部文档替换

- 外部 source 应用前比较 path + revision + dirty 状态。
- 旧解析结果不得覆盖用户更新后的 ProseMirror state。
- 大文档外部替换若需同步解析，先显示当前文档局部加载状态，不显示全库 loading。

### 阶段 D 必测

1. 连续输入 N 次，ProseMirror 立即更新，同步整篇 serialize/parse 不按 N 次执行。
2. trailing 只处理最新 revision，最终 source 完整。
3. 保存/blur/切换/关闭均 flush，自动保存不丢尾部输入。
4. 中文 IME composition 不卡顿、不丢字、不被外部 source 打断。
5. target 集不变时 resolver 身份稳定、decoration dispatch 为 0。
6. 长文档输入测量同步任务耗时，不能只断言最终文本一致。

---

## 9. 阶段 E：剩余交互与图谱收尾

### E1. 文件树

主要文件：`notes-file-tree.tsx`、`notes-explorer.tsx`

- 修正默认展开目录第一次点击的折叠逻辑，必须结合有效 expanded 状态取反。
- filter 改为独立平铺结果，显示完整路径，不强制展开整棵匹配树。
- 补齐方向键、Home/End、Enter；活动项基于 flatten 后的可见行。
- 外部 activePath 变化时 scroll into view，普通用户滚动不被反复拉回。
- 保留右键、拖放、workspace picker、两种 variant 和窗口化 DOM 预算。

### E2. 图谱

主要文件：`notes-workbench.facade.ts`、`notes-graph-panel.tsx`

- local scope 从活动文档和邻接索引扩展，不先构建完整可视图。
- graph cache 按 root + document fingerprint 失效，不因任意新 snapshot 整体清空。
- 保留独立 graph cache 和 request token，不把全库图文档塞回主 documentCache。
- 全图超出可视预算时限制节点/边并明确提示，而不是在主线程反复布局不可见内容。

---

## 10. 测试与真实桌面基准

### 10.1 必改/新增测试位置

- `tests/unit/notes/vault-store.test.ts`：Promise 顺序、饥饿、交互优先、singleflight、revision。
- `tests/unit/notes/use-notes-documents-save-integrity.test.tsx`：flush、保存、冲突和恢复。
- `tests/unit/notes/backlinks.test.ts`：纯函数继续覆盖。
- 新增 Hook 集成测试：真实 previous/live/dirty paths 数据流。
- `tests/component/notes/notes-runtime-loading.test.tsx`：首屏状态机、SWR、旧请求提交。
- `tests/component/notes/notes-rich-editor-pane.test.tsx`：输入合并、IME、resolver、flush。
- `tests/component/notes/notes-file-tree.test.tsx`：键盘、筛选、折叠和窗口。
- `tests/component/notes/notes-search-panel.test.tsx`：partial/complete、分页和 query revision。
- 真实临时 NTFS 目录集成测试：names-only、stat、size、watcher 降级。

将 `tests/fixtures/notes/create-large-vault-fixture.ts` 的随机链接改为固定种子，保证基线可复现。所有磁盘测试使用临时目录，不读取或改写用户真实 Vault。

### 10.2 每个阶段的验证命令

```bash
npx vitest run tests/unit/notes/ tests/unit/electron/vault-file-walker.test.ts
npx vitest run tests/component/notes/
npx eslint <本阶段修改文件>
npx tsc --noEmit
node --check electron/vault/vault-file-walker.cjs
npm run build
git diff --check
```

若全仓存在既存 TypeScript 错误，必须证明本轮文件没有新增错误。

### 10.3 桌面验收脚本

同一设备、同一 10,000 文件数据集分别执行：

1. 完全冷启动，无缓存、无索引。
2. 暖启动，有上次 entries 缓存、无完整正文索引。
3. 后台索引中反复打开不同笔记。
4. 后台索引中连续中文输入 60 秒并自动保存。
5. 外部修改当前/非当前文件，检查冲突和状态。
6. 冷搜索、连续修改 query、索引完成后搜索。
7. 文件树滚动、筛选、折叠、拖放和键盘导航。
8. 重命名一个被未加载笔记引用的文件，确认所有链接正确改写。
9. Vault 切换期间让旧请求最后返回，确认不串库。

报告按阶段拆分耗时：主进程 readdir/stat/read、IPC、renderer parse、React commit、ProseMirror update、绘制。不得只给一个总耗时。

---

## 11. 实施顺序与提交边界

| PR | 范围 | 合并门槛 |
|---|---|---|
| PR 0 | 阶段 A：调度、提交守卫、反链 Hook、重命名完整性 | 所有竞态与数据完整性测试通过 |
| PR 1 | 阶段 B：状态机、独立首屏通道、names-only、轻量缓存 | 截图中的矛盾状态不可复现，首屏指标达标 |
| PR 2 | 阶段 C：交互通道、后台分片、渐进搜索 | 后台索引不阻塞当前笔记和输入 |
| PR 3 | 阶段 D：编辑器 source 合并与 flush | 输入指标达标，保存/IME 无回归 |
| PR 4 | 阶段 E：树交互和图谱收尾 | 全量桌面验收通过 |

每个 PR：

- 附相同数据集的前后对照，至少包含调用次数、提交顺序、DOM/任务预算和 p50/p95。
- 不混入无关 UI 改版或依赖升级。
- 若新增 names-only/cache IPC，renderer 只能传受限枚举，不能传任意路径或命令；主进程/preload 改动单独声明。
- 不为了速度跳过重命名完整链接事实、baseline 校验、保存 flush 或冲突检测。
- 若某项墙钟目标未达到，先提交分段 profile，再决定 Worker 或持久全文索引；不能靠隐藏 loading 伪装完成。

---

## 12. 风险与回退

| 风险 | 防护 | 回退边界 |
|---|---|---|
| names-only 被当作完整元数据 | 显式 metadata 字段，完整指纹才参与缓存判定 | 回退完整扫描，但保留状态机和并行通道 |
| 缓存 entries 过期 | stale 标记、后台核对、missing 局部处理 | 禁用缓存读取，不影响实时扫描 |
| 多通道产生旧快照覆盖 | root/generation/revision 三重守卫 | 回退任务实现，不撤提交守卫 |
| 渐进搜索结果被误认为完整 | partial/complete 明确展示，queryRevision 隔离 | 可暂时关闭渐进结果，但不得恢复每次输入全库同步加载 |
| 延迟 source 导致丢字/漏保存 | 强制 flush 清单、IME 和退出测试 | 缩短合并窗口；必要时恢复同步 source，但保留后台降载 |
| 重命名漏改未加载链接 | 写前 NavigationIndex 必须 complete | 阻止操作并补全索引，不允许带风险执行 |
| 后台任务长期占 CPU | 4–8ms 分片、让渡、过期丢弃 | 降低批量/暂停后台索引，交互通道保持独立 |

---

## 13. 最终完成定义

- [ ] 已有正文时不再出现全库初始 loading 横幅。
- [ ] “未知配置”不再显示为“未配置”，截图中的矛盾组合有回归测试。
- [ ] `getDirectoryInfo`、完整 stat、后台索引均不阻塞活动文档加载。
- [ ] 首批 Promise 不等待尾随队列，旧 root/generation/revision 永不回写 UI。
- [ ] 当前笔记读取与全量 rebuild 不再共用全局串行锁。
- [ ] 冷搜索不调用全路径 `ensureDocuments`，结果有明确 partial/complete 状态。
- [ ] 后台任务按 4–8ms 分片让渡，当前输入和导航优先。
- [ ] 每次按键不再同步序列化并解析整篇文档，所有退出/保存路径可靠 flush。
- [ ] 反链 Hook 不漏变化，store 无变化 publish 不全量重建反链。
- [ ] resolver 在目标集合不变时保持身份稳定，不多发 decoration transaction。
- [ ] 重命名/移动能覆盖未加载来源中的链接，冲突保护不削弱。
- [ ] 暖启动、冷启动、后台索引中打开笔记和连续输入达到第 3 节目标。
- [ ] 定向测试、组件测试、真实 NTFS 集成、Electron `/notes`、lint、类型、构建和 diff 检查通过。

---

## 14. 最小首个切片

首个切片不要继续加缓存或 Worker，先完成两件事：

1. 修正 `vault-store.ts` 的首批 Promise 生命周期，并在 `use-notes-runtime.ts` 加 root/generation/revision 提交守卫。
2. 将 `directoryInfo`、names-only 目录列表、活动文档加载拆成独立提交通道，同时用 `connection:"unknown"` 和派生 `isInitialLoading` 消除截图中的错误提示。

这一切片先解决“为什么已经有内容还要等、为什么文件栏误显示未配置、为什么旧状态可能回退”。确认稳定后，再接入后台索引和编辑器输入降载。
