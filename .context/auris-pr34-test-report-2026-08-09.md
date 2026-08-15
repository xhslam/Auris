# Auris PR #3 / #4 集成测试报告（2026-08-09）

> **后续勘误（2026-08-09 修复阶段）**：原报告把 `.notes-start*` 判为 72 行孤立 CSS，结论不成立。当前 `NotesPageClient` 默认渲染的 `NotesStartScreen` 明确使用这些 class；当时按带点号的 CSS selector 搜索 TSX，漏掉了 `className="notes-start…"`。修复阶段已保留该样式，避免 Notes 首屏退化成无样式布局。

## 结论

- **PR #4 `port/vmark-sync-tooling`：已于 2026-08-09 14:17 GMT+8 合并。** Merge commit `5e6ee78de63a79993a54fa1e06884754777bf231`；成功路径、失败路径、诊断脱敏、稳定退出码与 symlink 拒绝均通过。
- **PR #3 `port/vmark-5-to-8`：暂不建议合并。** 自动测试没有新增失败，但真实 Electron 集成测试发现 3 个测试未覆盖的功能缺陷；另有 6 个新增 TypeScript test errors 和 72 行孤立 CSS。
- PR #3 与 PR #4 在 `origin/main@3e766241c` 上依次 merge 均为零冲突。

测试树：`/tmp/auris-pr34-test`，内容为 `origin/main + PR #3 + PR #4`。桌面测试使用隔离 userData `/tmp/auris-pr34-userdata` 与两个测试 vault，未触碰真实 Auris 配置/笔记。

## 自动门禁

### 全量测试

| 树 | Test Files | Tests |
|---|---:|---:|
| 新 main `3e766241c` | 9 failed / 292 passed | 29 failed / 2257 passed |
| 新 main + PR #3 + PR #4 | 6 failed / 308 passed | 23 failed / 2499 passed |

按失败用例名比较：**集成树零新增失败**。只在基线失败的 6 条中，三个独有失败文件单独运行均全绿，因此差异来自已知 load/order flakes，不是 PR 修复或回归。

### 专项测试

- PR #3：13 files / **218 tests passed**。
- PR #4：2 files / **51 tests passed**。

### 其他门禁

- `npm run build`：exit 0，Next compiled successfully。
- `npm run security:secrets`：exit 0。
- ESLint：集成树与新 main 均为既有基线 **79 errors / 8 warnings**；PR 文件零命中。
- TypeScript：新 main 119 errors，集成树 123 errors；PR #3 引入 6 个新错误位置（总量净增 4）：
  - `tests/unit/electron/nia/nia-ipc.test.ts`：2 条 TS2322；
  - `tests/unit/workflows/nia-workflow-runner.test.ts`：2×TS2352 + 2×TS2493。
  这些是 test mock inference 错误，runtime tests 通过，但仍应在 PR #3 内清掉。

## PR #3 真实 Electron 测试

### 隔离与测试数据

- userData：`/tmp/auris-pr34-userdata`；
- Vault A：4 篇互链 Markdown（Graph Test、Index、Nia Test、Rail Test）+ 1 个故意不存在的 `[[Missing Note]]`；
- Vault B：2 篇 Markdown；
- 真实配置 `/Users/apple/Library/Application Support/auris/shadowing-desktop-config.json` 测试前后 sha256 均为：
  `e7d0d35d7f92b1eee8edd329dc4ec9e0310fa2cbb08aa99a0a386d2037e0fc59`，mtime 未变化；
- 两个测试 vault 的文件数、mtime、大小测试后均未变化。

### 1. Workspace Rail：通过

- workbench 挂载 `.notes-v2__rail`；
- 两个授权根分别显示完整 aria-label/title，`data-unavailable=false`；
- A→B→A 切换时，`aria-current` / `aria-pressed` 与主进程 config 的 `vaultPath` 同步；
- 右键菜单正常显示“切换到此工作区 / 从列表移除”，Escape 可关闭；
- `+` 原生 picker 入口存在（未自动点击，避免弹系统目录选择器）。

### 2. Knowledge Graph：算法/canvas 通过，但“整库”首次打开错误（阻塞）

局部图对 `Nia Test ↔ Graph Test` 正确显示：

- 2 篇笔记；
- 2 条关系；
- React Flow 2 nodes / 2 edges。

**缺陷：首次切到“整库”时只显示已打开过的 2 篇，把磁盘上真实存在的 `Index.md` 标成未解析，并完全漏掉 `Rail Test.md`。**

根因已定位：

- main bridge `vault.listFiles()` 正确返回 4 篇；
- `createVaultStore` 有意懒加载，只把 initial/open/recent 文档放进 `snapshot.documents`；
- `NotesGraphPanel` 直接接收 `workbench.documents`，切“整库”时没有调用 `ensureDocuments(all editable paths)` 或 `refresh({ loadAll: true })`；
- component tests 直接注入完整 documents，因此漏掉真实集成路径。

因果复现：先在“笔记检索”输入 `Graph`（搜索 effect 会全量 `ensureDocuments`），再打开整库图，结果立刻变为正确的 **4 篇 / 7 条关系 / 仅 Missing Note 未解析**，React Flow 5 nodes / 7 edges。

### 3. Nia Picker：主要链路通过，但收藏后 Escape 失效

通过项：

- `Mod+J` 打开；
- main IPC 真实列出 2 个内置 definition；
- 搜索 `clarity` 只保留 Improve Clarity；
- 收藏可置顶并持久化到 `auris.nia.actions.preferences.v1`；
- 在真实 ProseMirror 中选中 `Select` 后再 `Mod+J`，默认 scope 为“选区”，只列 selection action；
- 输入框有焦点时 Escape 正常关闭。

**缺陷：点击收藏星后，动作跨分组重排导致收藏按钮节点被重建，焦点掉到 `BODY`；dialog 的 Escape handler 只绑在 dialog 容器上，后续 Escape 不会冒泡进去，dialog 无法关闭。**

已有测试只覆盖输入框有焦点时 Escape，没有覆盖收藏重排后的焦点恢复/全局 Escape。

### 4. Auto Update：UI/偏好通过，但失败仍写检查时间戳（阻塞）

通过项：

- 设置 → 关于中更新面板真实显示 main updater 状态；
- dev 构建无 feed 时如实显示 `UPDATE_FEED_NOT_CONFIGURED`，没有假“已是最新”；
- 自动检查 toggle、频率 startup→daily、禁用时频率按钮 disabled、恢复默认均正确写 localStorage；
- 无就地安装能力时自动下载正确 disabled。

**缺陷：全新隔离 userData 在 13:57:30 自动检查失败，但 localStorage 仍写入 `lastCheckTimestamp=1786255050882`；main snapshot 同时为 `status=error, lastCheckedAt=null`。**

根因：`shadowing:updates:check` IPC 返回最终 snapshot，但 renderer 的 `checkForUpdates()` 丢弃返回值，等待后立即读取可能尚未收到 state push 的 Zustand store；读到旧状态后错误写入 timestamp。这正违反源码注释中的约束：失败不能更新时间戳，否则 daily/weekly 会把下次检查错误推迟。

### 5. 孤立 CSS

PR #3 在 `globals.css` 带入 `.notes-start*` 共 72 行（17131–17202），但仓库中 TS/TSX 对这些 class 为零引用，新 main 也没有。当前 welcome screen 使用 `.notes-welcome*`，不是 `.notes-start*`。应删除。

## PR #4 CLI 测试

### 真实命令

1. fake git stderr 含 `secret-user:secret-token/private.git`，默认模式：
   - exit 8；
   - 仅公开 `GIT_FETCH_FAILED`；
   - secret 命中 0；
   - `Diagnostic:` 命中 0。
2. 同一失败加 `--diagnostics`：
   - exit 8；
   - 输出 `git=clone status=128 stderr_bytes=94 stderr_sha256=<12hex> cache=<fingerprint>`；
   - secret 命中 0。
3. `--repository-path` 指向 symlink：exit 5，按安全策略拒绝。
4. `--repository-path` 指向真实本地 VMark clone：exit 0；结果为：
   - schemaVersion 2；
   - reviewDomains 7；
   - domainCandidates 509；
   - compared `7c409688...` → `981afc010...`。
5. 生成的 `docs/vmark-sync/latest.json/.md` 测试后已恢复，测试树 clean。

## 额外发现：不归因于 PR #3/#4

`electron/utils/find-open-port.cjs::waitForPort()` 有既有指数请求风暴：timeout handler 先 `req.destroy()` 并安排下一 poll，而 destroy 又触发 error handler，再安排一次 poll。若 Next 首次编译超过 1 秒，每轮 poll 翻倍。本次产生 299 个并发 `GET /`，Next heap 膨胀后超时。

该文件在集成树与新 main 的 sha1 完全一致，因此不是 PR #3/#4 回归。测试后改用 production Next + `SHADOWING_DESKTOP_URL` 绕过该函数完成 Electron 验证。建议另开独立修复 PR，并增加“timeout 后只安排一次下一 poll”的测试。

## 合并建议

1. **PR #4 已合并。** 与 PR #3 无运行时依赖；当前 `origin/main` 为 `5e6ee78de`。
2. **PR #3 修复后再合并，至少包括：**
   - 图谱 whole-vault 打开时全量加载文档，并新增真实 lazy-store 集成测试；
   - update check 使用 IPC 返回 snapshot 决定是否写 lastCheckTimestamp，并加失败 race 测试；
   - Nia Picker 收藏重排后恢复输入焦点，或在 dialog 打开期间注册 document-level Escape；
   - 删除 72 行 `.notes-start*` 孤立 CSS；
   - 修掉 6 个新增 TypeScript test errors。
3. `waitForPort` 另开独立修复，不与 PR #3 的功能修复混在一起。
