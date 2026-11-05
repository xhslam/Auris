# Auris Notes 大型 Vault 性能修复实施 Spec

- 日期：2026-11-05
- 状态：待实施
- 范围：桌面端 `/notes` 工作台及其 Electron Vault 数据链路
- 目标：文件数量增长到 10,000 篇时，打开、输入、保存、搜索和浏览仍可使用；工作量随“实际变化量”增长，而不是随“历史缓存过的文件总数”反复增长
- 交付约束：本文档仅定义实施方案，不包含业务代码修改

---

## 1. 问题定义

当前 Notes 首次启动已经是懒加载，千文件测试也证明首次不会读取全库正文。因此，本任务不重写 Notes，也不以“首次打开慢”作为唯一问题。

真正需要消除的是以下退化链：

```text
第一次全文搜索或显式 rebuildIndex
  → 全部可编辑文档进入 documentCache
  → 后续普通 refresh 重读全部缓存文档
  → 全部 Markdown 重新解析并重建反链
  → 全部文档被克隆并发布新引用
  → 编辑器重建全库 wiki-link resolver
  → ProseMirror 重新计算 decoration
```

保存还会同时触发显式刷新和 Vault change 刷新；现有 `refreshChain` 只串行执行，不合并请求。文件树、搜索和目录遍历又分别存在独立的全量工作。

### 1.1 源码证据

| 优先级 | 位置 | 已确认问题 |
|---|---|---|
| P0 | `src/features/notes/vault/vault-store.ts:82-105,123-135` | 普通刷新把 `documentCache` 全部路径加入读取集合，未使用已有 `mtime` 跳过未变化正文 |
| P0 | `src/features/notes/vault/vault-store.ts:57-77` | 每次发布都重建反链并克隆全部文档及 `parsed` |
| P0 | `src/features/notes/workbench/use-notes-runtime.ts:218-227`、`use-notes-documents.ts:1164-1170` | watcher 与保存成功均可触发刷新 |
| P0 | `src/features/notes/vault/vault-store.ts:140-147` | 刷新只排队，不合并连续请求 |
| P0 | `electron/vault/vault-file-walker.cjs:9-57` | 每次全量递归，逐文件串行 `stat()`；部分最终隐藏子树仍被遍历 |
| P1 | `use-notes-documents.ts:263-299,453-468`、`workbench-documents.ts:25-49` | 编辑派生和反链应用处理全语料，未变文档也获得新引用 |
| P1 | `notes-rich-editor-pane.tsx:513-546` | `documents` 引用变化会重建 resolver 并发送同步 decoration transaction |
| P1 | `notes-file-tree.tsx:82-169,308-417` | 平铺目录反复线性 `.some()`；展开节点全部递归挂载，无窗口化 |
| P1 | `document-search.ts:54-130` | 每次查询重复对正文、标题、标签等执行 lowercase，并扫描、排序全部语料 |
| P1 | `notes-search-panel.tsx:70-85` | 搜索结果全部挂载 |
| P1 | `use-notes-actions.ts:196-235,259-364` | wiki-link、重命名和移动存在一次或多次全库 `rebuildIndex()` |
| P1 | `notes-workbench.facade.ts:141-220`、`relationship-graph.ts:141-155` | 图谱按需读取全库并重新扫描正文提取链接；独立 graph cache 是已有正确设计，必须保留 |

### 1.2 已排除的错误方向

1. 不将问题归因为“启动时读取全库”；现有实现和测试均不支持这一判断。
2. 不将异步 `fs/promises` 改写为 Worker 当作第一优先级；当前首先是总 IO 和总派生工作过多。
3. 不只添加 `React.memo`、`useDeferredValue` 或 `startTransition`；它们不能减少磁盘读取、Markdown 解析和 lowercase 次数。
4. 不把图谱文档重新塞入主 `documentCache`，否则会重新引入保存时全库读取。
5. 不声称现有反链构建必然是逐链接 `O(N²)`；共享 lookup 已存在，问题是全量派生被高频执行。

---

## 2. 目标与非目标

### 2.1 功能目标

- 大 Vault 下打开、切换、编辑和保存笔记保持响应。
- 搜索过一次全库后，后续保存和无变化刷新不再重读全库。
- 单文档变化只重读、解析和发布必要文档；未变文档保持引用稳定。
- 文件树和搜索结果 DOM 数量由视口/分页决定，而非由总文件数决定。
- 保留自动保存、冲突检测、恢复草稿、wiki-link、反链、重命名、拖放、右键菜单、图谱和外部文件变更能力。

### 2.2 性能目标

以 10,000 个 Markdown 文件、普通目录深度、本地 NTFS Vault 为主要验收数据集，另设单目录 5,000 文件用例。CI 使用确定性计数，本地/Electron 验收使用墙钟和交互指标。

| 场景 | 必须满足的确定性预算 | 桌面端体验目标 |
|---|---|---|
| 冷启动 | 仅读取初始文档及显式打开文档，不读取全库 | 文件列表出现后不阻塞输入；记录 p50/p95 |
| 全量搜索后的无变化 refresh | 新增正文 `readFile = 0`，新增 Markdown 解析 `= 0` | 无可感知全库暂停 |
| 单文件磁盘变化 | 仅重读该文件；`eagerPaths` 另行计数 | 当前文档及时更新，无全库 IO 峰值 |
| 同一保存/变更事件窗口 | 最多一个执行中刷新加一个合并后的尾随刷新；合并窗口结束后无重复刷新 | 保存指示及时结束 |
| 连续输入 | 未编辑文档不被重新解析、克隆或应用反链 | p95 输入到绘制 `< 100ms`；无由未变语料引起的 `> 200ms` Long Task |
| 文件树滚动 | 挂载行数不超过“视口行数 + 2 × overscan” | 10,000 文件连续滚动无整树挂载卡顿 |
| 搜索结果 | 首屏最多 100 条，剩余按需显示 | 输入查询时列表不制造万级 DOM |
| 暖缓存重复搜索 | 同文档版本不重复生成 lowercase 派生字段 | 10,000 篇暖查询目标 `< 100ms`，超出时再进入 Worker 阶段 |

墙钟目标用于真实桌面验收，不作为共享 CI 的唯一通过条件。实施前必须记录同一设备、同一数据集的基线，实施后附前后对照。

### 2.3 非目标

- 不重写编辑器、不更换 ProseMirror/CodeMirror 技术栈。
- 不引入数据库或持久化全文索引作为第一阶段依赖。
- 不改变 Markdown/frontmatter 格式，不迁移用户 Vault。
- 不恢复 Web 登录、注册、计费或已删除模块。
- 不在本轮默认引入新 npm 虚拟化/搜索依赖；固定行高窗口化可先由现有 React 实现。
- 不牺牲写前 baseline 校验、冲突检测或草稿恢复来换取性能。

---

## 3. 总体设计

采用四层治理，按依赖顺序交付：

1. **数据层**：按文件指纹复用正文，合并刷新，降低目录扫描成本。
2. **派生层**：稳定文档引用，反链和 wiki-link 目标索引按变化更新。
3. **展示层**：文件树窗口化，搜索派生缓存与结果分页。
4. **重操作层**：去除 wiki-link/重命名的重复全库 rebuild，图谱复用元数据并按需扩展。

核心原则：

- `entries` 是轻量目录事实；`documents` 是按需正文缓存；两者生命周期分离。
- 普通刷新成本为 `O(目录元数据 + 变化正文)`，不是 `O(历史缓存正文)`。
- 内容派生缓存以文档对象身份或 `(path, mtime, size)` 版本失效。
- 目标拓扑变化与正文变化分开处理：普通正文编辑不应触发全库目标索引重建。
- 所有异步旧请求仍不得覆盖新快照；性能优化不能削弱现有串行正确性。

实施前按仓库 VMark 对照纪律，记录固定版本 VMark 中对应的 vault/index/watcher 实现路径、提交和许可。只复用已验证的纯逻辑或设计，不以摘要替代源码和运行证据。

---

## 4. 阶段 0：建立可重复基线与观测

### 4.1 测试数据生成器

新增仅用于测试/本地基准的生成器，不读取或改写用户真实 Vault：

- `tests/fixtures/notes/create-large-vault-fixture.ts`
- 参数：`fileCount`、`flatDirectoryCount`、`averageBodyBytes`、`linkDensity`、`directoryDepth`。
- 默认数据集 A：10,000 Markdown，分布式目录，含 frontmatter、标题、标签和链接。
- 数据集 B：单目录 5,000 Markdown，用于暴露建树二次复杂度。
- 数据集 C：1,000 Markdown + 附件 + 隐藏目录，用于扫描与过滤正确性。
- 所有测试在临时目录创建并清理数据，不触碰真实笔记。

### 4.2 开发/测试计数器

为 `createVaultStore` 增加只读 `getDebugStats()`，生产默认不暴露全局变量、不输出正文：

```ts
type VaultStoreDebugStats = {
  listEntriesCalls: number;
  readFileCalls: number;
  parsedDocumentCount: number;
  executedRefreshCount: number;
  coalescedRefreshCount: number;
  reusedDocumentCount: number;
  backlinkDocumentVisits: number;
};
```

要求：

- 计数器可按测试重置，不能携带原始正文或向外部发送遥测。
- Markdown 解析计数放在统一文档创建边界，避免只测 store 而漏掉直接 `loadNoteDocument`。
- React/Electron 手工验收记录 Long Task、输入延迟、保存耗时、JS heap；不将单次峰值当趋势。
- 基准至少预热一次、执行 5 轮，报告中位数和 p95；同时记录设备、文件数、总字节数和是否暖缓存。

### 4.3 阶段出口

- 基线报告写入实施 PR 描述，覆盖冷启动、搜索后保存、连续输入、树滚动和暖搜索。
- 后续每一阶段均复用相同数据集与计数器，禁止只报“感觉更快”。

---

## 5. 阶段 1：消除全库重读、重复刷新和串行扫描

### 5.1 正文缓存按指纹复用

主要文件：

- `src/features/notes/vault/vault-store.ts`
- 必要时 `src/features/notes/documents/document-types.ts`，但不改变持久化格式

将缓存从单纯 `Map<string, NoteDocument>` 改为内部缓存记录：

```ts
type CachedVaultDocument = {
  document: NoteDocument;
  mtime: string | null;
  size: number | null;
};
```

刷新规则：

1. 路径已删除或非可编辑：删除缓存。
2. 缓存存在且 `mtime`、`size` 均与当前 entry 相同：复用文档，不调用 `readFile`，不重新解析。
3. `mtime` 或 `size` 改变、缓存不存在：读取并替换该路径。
4. `mtime === null`：无法安全证明未变化，请求该路径时必须重读；不得永久复用。
5. `eagerPaths` 表示调用方要求与磁盘同步，必须重读这些路径；通常只有初始/当前保存路径，不得扩展为全库。
6. `loadAll` 只表示“确保全语料已加载”，未变化的已有缓存仍可复用。
7. 为保留显式全量重建能力，增加内部 `forceReload` 选项；`rebuildIndex()` 可暂时映射为 `loadAll + forceReload`，直至阶段 4 移除热操作调用。
8. 读取失败不得把旧成功快照伪装成最新磁盘事实；沿用现有错误处理，并保留可恢复的旧缓存供冲突 UI 使用，但不能标记为已验证最新。

建议接口：

```ts
type VaultRefreshOptions = {
  eagerPaths?: readonly string[];
  loadAll?: boolean;
  forceReload?: boolean;
};
```

不得把 `forceReload` 暴露给 renderer IPC；它只是 renderer 内部 store 选项。

### 5.2 刷新合并而非仅串行

在 `vault-store.ts` 内实现单执行中请求 + 单尾随请求：

- 无执行中请求：立即启动。
- 有执行中请求：后续刷新合并进唯一 pending，不建立无限 Promise 链。
- 合并 `eagerPaths` 的并集；`loadAll`、`forceReload` 按逻辑 OR 合并。
- 当前执行完成后只执行一次最新 pending。
- 每个调用方的 Promise 必须在包含其请求的那次刷新完成后 settle；成功返回最新快照，失败按所属执行批次 reject，不得永久等待。
- `loadDocuments` 继续与 refresh 共用顺序边界，空初始列表不得晚于真实列表发布。
- 组件卸载后允许完成 IO，但不得触发已卸载组件状态更新。

在 `use-notes-runtime.ts` 将外部 change 使用 75ms trailing debounce 接入同一刷新入口；保存后的刷新与 watcher 刷新必须共享此调度，不允许分别维护队列。媒体 reload key 同样按合并后的有效变更触发，避免无意义重复 bump。

### 5.3 Vault walker 有界并发与忽略规则前移

主要文件：

- `electron/vault/vault-file-walker.cjs`
- 可新增 `electron/vault/vault-ignore-rules.cjs`
- `src/features/notes/vault/vault-path.ts`

要求：

- 将“根级点目录、`视频区`、`.shadowing`”的忽略语义抽成明确契约；主进程不进入被忽略目录，而不是扫描后再由 renderer 丢弃。
- 不擅自忽略普通子目录中的点文件；保持当前产品可见性，除非契约测试明确允许。
- 文件 `stat()` 使用有界并发，建议 `8`，目录 `readdir()` 仍保持可控调度；不能创建无界 Promise 数组。
- 单个 `stat` 失败仍返回 `mtime: null`，不中断全库扫描。
- 保留显式栈遍历，禁止重新引入大规模 `push(...records)`。
- 主进程与 `src/platform/desktop/vault-service.ts` 只保留一次权威排序；返回顺序契约不变。
- 本阶段不实现目录快照持久缓存；先以计数和 profile 判断是否必要。

### 5.4 阶段 1 测试

扩展：

- `tests/unit/notes/vault-store.test.ts`
- `tests/unit/electron/vault-file-walker.test.ts`
- `tests/unit/notes/use-notes-documents-save-integrity.test.tsx`

必须新增用例：

1. 全量 `loadDocuments` 后，条目指纹不变的普通 refresh 新增 `readFile = 0`。
2. 仅一个文件 `mtime/size` 改变时，只读取该文件，其他文档对象身份不变。
3. `mtime = null` 的缓存文件会重读。
4. `eagerPaths` 强制重读且合并时不丢路径。
5. 10,000 文件冷启动仍只读取初始文档。
6. 执行中收到 20 次刷新，只产生一个尾随执行；所有 Promise 均 settle。
7. `loadAll` 与 `forceReload` 合并语义正确，旧读取不能覆盖新快照。
8. 保存与紧随 change 在合并窗口内只形成一个逻辑刷新；冲突、自写识别和恢复测试全部保持通过。
9. walker 不进入忽略目录，最大 `stat` 并发不超过配置，失败文件仍列出。
10. 既有 150,000 文件无参数展开栈溢出测试继续通过。

### 5.5 阶段 1 出口

- P0 IO 计数全部达标。
- 全量搜索后连续保存 10 次，不再出现每次读取全库正文。
- 无变化文档引用稳定，为阶段 2 提供基础。
- 若目录扫描仍单独造成明显长暂停，先完成 walker 优化再进入下一阶段。

---

## 6. 阶段 2：切断编辑时的全库派生与编辑器重算

### 6.1 稳定快照和文档引用

主要文件：

- `src/features/notes/vault/vault-store.ts`
- `src/features/notes/workspace/workbench-documents.ts`
- `src/features/notes/workbench/use-notes-documents.ts`

要求：

- store 内部维护路径到文档的 Map，发布时按 entries 顺序生成数组，但复用未变文档对象。
- `applyBacklinksToDocuments` 对 backlink 内容及文档版本均未变化的项返回原对象；仅在反链实际变化时创建新对象。
- backlink 数组比较先比较引用，再做长度和逐项比较；不能仅凭数组非空就克隆。
- `documentsRef`、活动文档选择和搜索缓存使用稳定身份，避免每次编辑全量失效。
- live edit 只替换被编辑路径；不得在每 180ms 对所有 live/snapshot 文档重新解析。

### 6.2 反链增量更新

主要文件：

- `src/features/notes/documents/backlinks.ts`
- `src/features/notes/workspace/workbench-documents.ts`

建议新增纯函数：

```ts
updateBacklinksIndex(previousIndex, {
  changedDocuments,
  previousDocumentsByPath,
  targetLookup,
  targetTopologyChanged,
});
```

更新规则：

- 普通正文或链接变化：只移除该 source 的旧出边，再加入新出边，仅更新受影响 target 的 backlink 列表。
- 文档新增、删除、重命名、标题或 alias 变化：标记 `targetTopologyChanged`，允许重建目标 lookup，并只重解析可能受影响的 source；若首版无法安全证明影响集合，可执行一次全量重建并记录原因，但不得把它留在普通 keystroke 热路径。
- 标题是否变化必须比较规范化后的解析结果，而不是仅因 `rawSource` 变化就判定拓扑变化。
- 自引用、重复链接、大小写、相对路径、CJK、alias 和缺失目标语义保持现有测试一致。
- 未受影响 target 的数组保持引用稳定。

`scheduleDerivedBacklinksRefresh` 改为接收本次变化的 path/document，而不是每次传入整个 `nextLiveDocuments` 进行全量构建。180ms debounce 可保留，但它只调度增量工作。

### 6.3 wiki-link resolver 与 decoration 解耦

主要文件：

- `src/features/notes/documents/backlinks.ts`
- `src/components/notes-v2/notes-rich-editor-pane.tsx`
- 必要时 `notes-page-client.tsx`、`notes-workbench.tsx`

新增轻量 `WikiLinkTargetIndex`：

- 内容只包含路径、文件名、basename、已加载标题和 alias 的解析映射及版本号。
- 版本仅在规范化目标集合变化时递增；正文、标签、反链和普通编辑不改变版本。
- 编辑器 resolver 依赖该索引，不再依赖整个 `documents` 数组。
- 仅版本变化时更新 resolver ref 并发送 `NOTES_RICH_EDITOR_SYNC_META`。
- 当前文档正文变化但目标集合不变时，不得发送全库链接 decoration 同步 transaction。
- 未加载文档的标题/alias 解析由阶段 4 的导航索引补齐；不得为了构造 resolver 在每次打开 Notes 时读取全库。

### 6.4 阶段 2 测试

扩展或新增：

- `tests/unit/notes/workbench-documents.test.ts`
- `tests/unit/notes/backlinks.test.ts`
- `tests/unit/notes/use-notes-documents-save-integrity.test.tsx`
- `tests/component/notes/notes-rich-editor-pane.test.tsx`

断言：

1. 编辑 A 时，B/C 文档及 `parsed` 对象身份不变。
2. 仅 A 出边变化时，只访问 A 及旧/新 target，不遍历全库。
3. 标题/alias 改变、删除、重命名后反链仍正确。
4. 目标集合不变时 resolver 身份和 decoration dispatch 次数不变。
5. 目标集合改变时 decoration 恰好同步一次。
6. 连续输入期间未变文档解析次数为零，自动保存和冲突行为不回归。

### 6.5 阶段 2 出口

- 连续输入不再产生与全库文档数成正比的反链/克隆/decoration 工作。
- 10,000 文档下编辑当前篇的派生计数只随当前文档及其链接数增长。
- 若当前单篇超大 Markdown 自身仍造成长任务，另立“单文档解析”问题，不与本 Spec 的全库问题混合。

---

## 7. 阶段 3：文件树与搜索的规模治理

### 7.1 文件树近线性构建

主要文件：

- `src/components/notes-v2/notes-file-tree.tsx`
- `src/components/notes-v2/notes-explorer.tsx`

要求：

- `createTree` 使用父节点路径到 children 的 Map/Set 去重，再一次性生成排序数组；移除 root/children 上反复 `.some()`。
- 构建路径时避免每层重复 `slice().join()` 造成额外字符串分配，可递增维护 parent path。
- active ancestors 由 `activePath` 的父路径集合直接计算，不再对每个目录递归 `hasActiveDescendant`。
- Explorer 的 `visibleEntries`、过滤 entries 使用 `useMemo`；过滤小写派生可按 entry 版本缓存。

### 7.2 文件树窗口化

采用“展开后的可见节点打平 + 固定行高窗口化”：

- 新增纯函数 `flattenVisibleTree(tree, expandedPaths, activePath, options)`，输出 `{ node, depth, isExpanded }[]`。
- 滚动容器使用 `ResizeObserver` 获取高度，按 `scrollTop / rowHeight` 计算区间，`overscan = 8`。
- 使用总高度 spacer 和绝对定位/transform 渲染可见行；实际挂载行数满足预算。
- 行高由单一 CSS 变量与 TS 常量对应；若未来允许动态行高，再评估成熟虚拟化库，不在首版混用估算高度。
- 保持展开/折叠、活动文件、右键菜单、拖放、复制路径、新建、删除、重命名、reveal 和空白区域菜单。
- 使用 `role="tree"` / `role="treeitem"`、`aria-level`、`aria-expanded` 和现有 aria-label；键盘上下移动应按打平后的可见行工作，Home/End 不跳出列表。
- 活动路径来自外部导航时滚动到可见范围；用户普通滚动不得反复被 active path 拉回。
- `filterActive` 改为独立的平铺匹配结果列表，显示完整路径；不再强制展开并挂载所有匹配树节点。匹配结果首屏同样窗口化。
- workspace picker 的 `collapseAllByDefault` 和 Explorer 两种 variant 均保持原行为。

### 7.3 搜索派生缓存

主要文件：

- `src/features/notes/documents/document-search.ts`
- `src/features/notes/workbench/use-notes-documents.ts`

新增内部 `SearchableDocument` 派生记录，以 `WeakMap<NoteDocument, SearchableDocument>` 缓存：

- lowercase path/title/body；
- lowercase tags 与 headings；
- 必要时的规范化 tag Set。

约束：

- 文档对象变化才重新生成该文档派生；阶段 2 的稳定引用是前置条件。
- 匹配与评分复用同一派生记录，不在两个阶段重复 lowercase body。
- 保持现有查询语法、score 权重和稳定排序；首版不改变“所有 canEdit 文件可搜索”的产品语义。
- 首次全文搜索仍允许按需加载全部语料，但加载后不得污染后续普通刷新成本。
- 查询执行继续使用 deferred value；它是调度辅助，不替代缓存。

### 7.4 搜索结果分页

主要文件：

- `src/components/notes-v2/notes-search-panel.tsx`
- 必要时 `src/components/notes-v2/notes-ui-copy.tsx` 与对应 CSS

要求：

- `searchDocuments` 仍返回完整有序结果，供其他调用方使用；展示层维护 `visibleCount`，初始 100，每次“加载更多”增加 100。
- query 或结果集合变化时重置为 100；不得因输入新词保留旧分页状态。
- 展示“显示 X / 共 Y 条”，只有 `Y > X` 时显示加载更多。
- 高亮只处理当前可见结果；不为不可见结果创建 React 节点。
- 若产品后续要求无限滚动，可在同一 visibleCount 模型上实现，不与文件树窗口化耦合。

### 7.5 阶段 3 测试

扩展或新增：

- `tests/component/notes/notes-file-tree.test.tsx`
- `tests/component/notes/notes-explorer.test.tsx`
- `tests/unit/notes/document-search.test.ts`
- `tests/component/notes/notes-search-panel.test.tsx`

断言：

1. 单目录 5,000 节点构建无重复 children，排序和目录优先语义不变。
2. 10,000 展开节点仅挂载视口 + overscan 行，滚动后窗口正确更新。
3. 折叠、活动祖先、filter、右键、拖放和键盘导航不回归。
4. 同一文档重复不同查询不重复生成 lowercase 派生；文档改变后正确失效。
5. 搜索结果评分与顺序与旧实现 golden cases 一致。
6. 首屏最多 100 个结果按钮，加载更多和 query reset 正确。

### 7.6 阶段 3 出口

- 文件树和搜索 DOM 不再随总结果数无界增长。
- 单目录大树构建接近 `O(N log N)`（排序）而非重复线性去重的二次路径。
- 暖搜索达到体验目标；未达到时记录 profile，进入阶段 7 条件项，而非盲目加 Worker。

---

## 8. 阶段 4：移除操作级重复 rebuild 与图谱重复工作

### 8.1 轻量导航/元数据索引

主要文件：

- `src/features/notes/workbench/use-notes-actions.ts`
- `src/features/notes/vault/vault-store.ts`
- `src/features/notes/documents/backlinks.ts`

新增按需 `VaultNavigationIndex`，至少提供：

- 由 entries 即可构建的 path、filename、basename lookup；
- 已加载文档的 title/alias lookup；
- 按 `(path, mtime, size)` 失效的元数据版本；
- path 到文档的 Map，替代操作中的反复 `.find()`。

wiki-link 打开/确保存在：

1. 先使用 entries + 已缓存元数据解析，不调用 `rebuildIndex()`。
2. 对明确 path/file/basename 命中直接导航或创建。
3. 只有未命中且可能依赖未加载 title/alias 时，才执行一次按需 Markdown 元数据加载；后续复用并按指纹更新。
4. 不降低缺失目标创建、同名优先级和相对路径解析正确性。

重命名/移动：

- 移除操作前后各一次的无条件全量 `rebuildIndex()`。
- 预览使用当前稳定索引； draining saves 后只重新验证源文件和受影响反链文件。
- 保留每个计划写入的磁盘 baseline 校验，任何不一致仍必须停止。
- 对无法证明影响集合的目录级移动，允许一次显式全量元数据刷新，但禁止重复两次，并记录原因。
- 重命名后仍复用现有 live document reconciliation，不能丢失等待期间的新编辑。

### 8.2 图谱复用解析元数据

主要文件：

- `src/features/notes/documents/markdown-index.ts`
- `src/features/notes/documents/document-types.ts`
- `src/features/notes/graph/relationship-graph.ts`
- `src/features/notes/workbench/notes-workbench.facade.ts`
- `src/components/notes-v2/notes-graph-panel.tsx`

要求：

- Markdown 解析时保留链接 kind，例如分别提供 wiki-link 与 Markdown-link 元数据；保留现有 `parsed.links` 兼容反链调用方。
- 图构建优先消费解析元数据，不再对同一 `rawSource` 重复提取相同链接。
- graph cache 继续独立于主 vault cache，保留 request token 和过期提交保护。
- graph 文档按文件指纹复用；单文档变化只替换对应文档和邻接边。
- local scope 从活动文档及邻接索引扩展，不无条件先构建完整可视图；全局 scope 仍可按需加载全库。
- 若全图仍超预算，优先限制可视节点/边并提示用户，不在主线程反复布局不可见全图。

### 8.3 阶段 4 测试

- wiki-link 明确路径命中时 `readFile` 不新增全库读取。
- title/alias 首次未命中与暖缓存命中均正确，文件变化后索引失效。
- 重命名/移动最多一次必要的元数据刷新，所有 baseline 冲突用例保持通过。
- 图边 kind、unresolved、自引用、tag 和 relation 与旧实现一致。
- local graph 不触发无必要全图构建；旧 graph 请求不能覆盖新快照。

---

## 9. 条件阶段：Web Worker / 持久索引 / 增量目录扫描

只有完成阶段 1–4 后，基线仍明确未达标时才启动，且单独评审：

### 9.1 Web Worker

触发条件：暖搜索或全库元数据解析在目标设备上持续产生 `> 50ms` 主线程任务，且主要耗时已证明为 CPU。

要求：

- Worker 输入为可传输的纯数据，不传递 React/ProseMirror 对象。
- 请求携带 generation，旧查询结果不得覆盖新查询。
- 文档变更只发送变更项；终止/切换 Vault 时销毁 Worker。
- 比较 Worker 序列化成本后再推广，不把 Worker 当作减少总工作量的替代品。

### 9.2 持久化全文索引

触发条件：每次冷启动的首次全文搜索仍不可接受，且内存索引优化已不足。

另行定义 schema 版本、Vault 身份、指纹校验、损坏恢复、隐私和清理策略。本 Spec 不授权写入用户 Vault 的索引文件。

### 9.3 主进程目录快照/按路径 watcher

触发条件：阶段 1 后 `listEntries` 仍占主要卡顿，且计数证明目录元数据 IO 是瓶颈。

要求 watcher 事件带变更路径、目录代际和降级全扫能力；事件丢失或目录重命名必须使受影响缓存失效。不得仅凭事件数量假定 Windows 行为，需真实 Electron 验证。

---

## 10. 回归验证矩阵

每个阶段至少执行：

```bash
npx vitest run tests/unit/notes/ tests/unit/electron/vault-file-walker.test.ts
npx vitest run tests/component/notes/
npx eslint <本阶段修改文件>
npx tsc --noEmit
node --check electron/vault/vault-file-walker.cjs
npm run build
git diff --check
```

其中全仓 `tsc` 若仍有既存错误，必须附修改文件不在新增错误清单的证据，不能用既存错误掩盖新增错误。

桌面端必须人工或通过 Electron smoke 验证：

1. `/notes` 能打开，Vault 正常加载。
2. 首次打开、切换笔记、连续输入、自动保存、手动保存正常。
3. 外部修改当前文件和未打开文件均正确更新；冲突不丢草稿。
4. 文件树新建、重命名、移动、删除、右键、拖放、筛选、折叠正常。
5. 搜索语法、排序、打开结果、分页正常。
6. wiki-link 打开/创建、反链、重命名链接改写正常。
7. 图谱 global/local 能打开，旧请求不污染新 Vault。
8. 切换到其他 Vault 后缓存、Worker、监听器不串库。

---

## 11. 实施顺序与提交边界

建议拆成 4 个可独立回滚的 PR：

| PR | 内容 | 合并门槛 |
|---|---|---|
| PR 1 | 阶段 0 + 阶段 1 | IO/刷新计数达标，保存冲突无回归 |
| PR 2 | 阶段 2 | 未变文档引用稳定，输入派生不再全量化 |
| PR 3 | 阶段 3 | 树/搜索 DOM 预算达标，交互与可访问性通过 |
| PR 4 | 阶段 4 | 操作级重复 rebuild 去除，图谱行为一致 |

每个 PR 必须：

- 先提交失败回归测试，再提交实现，或至少在 PR 中展示测试在旧实现上失败的证据。
- 附相同基准的前后计数与耗时，不仅列测试通过。
- 不混入无关 UI 改版、格式迁移和依赖升级。
- 若修改 `src/app/api/`，另行声明桌面调用方及 `isDesktopLocalRequest()` 影响；本方案原则上不需要修改 API routes。
- 若必须修改 `electron/main.cjs` 或 `electron/preload.cjs`，单独声明主进程影响；本方案优先把改动限制在 walker 和既有 store/renderer，不新增 IPC。

---

## 12. 风险与回退

| 风险 | 防护 | 回退 |
|---|---|---|
| mtime/size 相同但内容变化 | eager/显式强制重读；空 mtime 不复用；保留写前 baseline | 对受影响路径强制刷新，必要时临时恢复旧 read 策略 |
| 刷新合并丢 eagerPath 或 Promise 悬挂 | 并集合并、按批次 settle、压力测试 | 回退调度器，保留指纹缓存 |
| 增量反链漏更新标题/alias 影响 | target topology 明确失效，允许保守全量重建 | 回退为保存后全量反链，绝不回退到 keystroke 全量 |
| 文件树窗口化破坏菜单/拖放/键盘 | 打平纯函数测试 + 组件交互测试 + Electron 验收 | 仅关闭窗口化，保留 Map 建树优化 |
| 搜索缓存使用旧正文 | WeakMap 绑定文档身份，文档变更必须新对象 | 清除缓存并回退纯查询，UI 分页可独立保留 |
| 图谱缓存串 Vault | root/source/token 三重隔离 | 关闭增量复用，保留现有独立 graph cache |

回退粒度按阶段隔离，不允许为了回退一个 UI 优化而恢复全库正文重读。

---

## 13. 最终完成定义（Definition of Done）

只有全部满足才算修复完成：

- [ ] 10,000 文件冷启动不读取全库。
- [ ] 全量搜索后的无变化刷新正文读取和解析均为 0。
- [ ] 单文件变化只重读必要文件，自动保存/change 不形成持续重复全量刷新。
- [ ] walker 有界并发、忽略目录正确，大目录测试通过。
- [ ] 编辑单篇时未变文档引用稳定，反链/resolver/decoration 不做无谓全库工作。
- [ ] 文件树实际 DOM 有视口上限，搜索首屏最多 100 条。
- [ ] 暖搜索不重复 lowercase 未变正文，查询语义与排序不变。
- [ ] wiki-link 明确导航不再无条件全库 rebuild；重命名/移动冲突保护不变。
- [ ] 图谱不重复扫描可复用链接元数据，独立缓存与过期请求保护保留。
- [ ] 定向 Vitest、组件测试、Electron `/notes` 验证、ESLint、`node --check`、构建和 diff 检查通过。
- [ ] 提供同一数据集前后对照：IO 次数、解析次数、派生访问量、DOM 数、p50/p95 交互耗时。
- [ ] 无用户笔记格式迁移，无数据丢失，无未声明的主进程/API 行为变化。

---

## 14. 建议的首个实施切片

首个切片只处理 `vault-store.ts` 的两件事：

1. 用 `(path, mtime, size)` 跳过未变化正文，`eagerPaths` 保持强制同步。
2. 将 refresh 队列改为“一个执行中 + 一个合并尾随”。

同时补充“全量搜索后普通 refresh 读取为 0”和“20 次刷新只产生一个尾随执行”的回归测试。该切片直接针对最明确的持续卡顿链路，改动面最小，也能为后续稳定引用、搜索缓存和增量反链提供可靠基础。
