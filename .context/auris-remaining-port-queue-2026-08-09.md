# Auris 剩余移植队列（A 路线，2026-08-09）

目的：把「持续开 PR 移植」变成**有限、可勾掉的队列**，终点是 `origin/main` 成为唯一 main、本地 `main` 可废弃。

基线：`origin/main` = `032b9ba51`，**有效基线取 PR #3 尖端** `685c4acb5`（2 提交，OPEN）。
本地 `main` = `1ccf54523`。所有数字均在本机实测得出，可复现。

> **状态更新（2026-08-09 14:17–14:22 GMT+8）**：PR #4 已合并，merge commit `5e6ee78de`；当前 `origin/main` = `5e6ee78de63a79993a54fa1e06884754777bf231`。已删除本地与远端的 3 个完全合并分支：`fix/theme-contrast`、`integrate/mac-capabilities`、`port/vmark-sync-tooling`。PR #3 的 `port/vmark-5-to-8@685c4acb5` 本地/远端均保留且仍 OPEN，须先修复集成测试发现的问题。

---

## 一、先纠正一个此前一直搞错的前提

**本地 `main` 不是「更新的那一侧」。**

| | 提交 | 日期 |
|---|---|---|
| 本地 main HEAD | `1ccf54523` | **2026-07-29 16:08** |
| 本地 main 根 | `d7c12c9fa` | 2026-05-22 |
| 远端根提交 | `6ab235d8f` | **2026-08-08 09:27** |

远端根提交比本地 HEAD **新 10 天**。「本地领先 166 提交」只是提交计数，内容上两侧互有领先。

铁证：`electron/terminal-session-manager.cjs` 远端比本地多 172 行（Windows `chcp 65001` / PowerShell UTF-8 处理），
而该文件**未被远端那 11 个后续提交动过**——说明它就在根提交的快照里。
本地全仓 `chcp`/`65001` 命中 0 次，且本地 HEAD 恰好是 "fix: use UTF-8 locale for notes terminal"（只改了 5 行）。

结论：`origin/main` 的根提交是**另一个更新的工作树的压缩快照**，不是本地历史的旧祖先。
因此队列必须**双向判定**，不能默认「本地 → 远端」。

## 二、为什么不能一次 merge 合成一个 main

实测 `git merge --allow-unrelated-histories`：

```text
EXIT=1
冲突文件 148，全部 AA（both added）
冲突 hunk 1055
```

无共同祖先 → 无 base → 无法三方合并 → 每个共享文件都被当作「双方各自新增」，
1055 个 hunk 全部要人手裁决且**看不到谁改了什么**。

但两侧比「无关历史」近得多：

```text
共享文件 1052：内容相同 904 / 不同 148
仅远端 365（其中 348 个是 research/ 下 vendored 仓库，非产品代码）
仅本地  23
```

---

## 三、剩余移植面（相对 PR #3 尖端）

```text
diverged 总计            244
├─ modified              164
│   ├─ PR#3 已带（领先本地）  32   ← 本地未提交的 #5–#8 工作，已在 PR#3
│   ├─ 生成物排除           3   ← latest.json / latest.md / word-index.json
│   └─ 真实待判            129
├─ 仅本地存在              23   ← 全部是死代码或文档，无一可移植（见 §5）
└─ 仅基线存在              57
```

129 个真实待判文件的方向分类（规则：`added==0`→纯远端领先；`del==0`→纯本地新增；
`added ≥ 3×del`→偏本地；`del ≥ 3×added`→偏远端；其余→混合）：

| 分类 | 文件 | +行 | −行 | 处理 |
|---|---|---|---|---|
| local-only-add | 24 | 696 | 0 | **入队** |
| local-dominant | 40 | 2087 | 422 | **入队** |
| mixed | 27 | 450 | 402 | **入队**（逐文件裁决） |
| remote-dominant | 23 | 315 | 1570 | **排除**（本地落后） |
| remote-only-ahead | 15 | 0 | 410 | **排除**（本地落后） |

**队列 = 91 文件 / +3233 −824。排除 38 文件（本地落后，不可移植，否则会回退远端功能）。**

---

## 四、队列分批（15 簇，按建议顺序）

顺序原则：自包含、无死代码耦合、纯新增优先；混合与有争议的排后。

| 批 | 簇 | 文件 | +/− | 备注 |
|---|---|---|---|---|
| 1 | B1 vmark-sync 工具链 | 5 | +801 −58 | ✅ **已合并，PR #4**（merge `5e6ee78de`）。实际落地 7 文件（见 §9） |
| 2 | B2 Notes MCP server | 15 | +636 −95 | 6 个纯新增（`auris-notes-mcp-server.mjs` / `notes-mcp-bridge.cjs` + 测试） |
| 3 | B3 workbench 布局/facade | 7 | +459 −48 | facade +129；含 202 行纯新增测试 |
| 4 | B8 browser/nia | 8 | +68 −10 | 小而独立 |
| 5 | B13 plugin manifest | 2 | +23 −0 | 纯新增，注意勿牵入 plugin-runtime（死代码） |
| 6 | B11 文档模型/存储 | 7 | +48 −4 | ⚠ `get-notes-storage.ts` 有死代码耦合 |
| 7 | B9 video | 3 | +88 −17 | |
| 8 | B5 vault 写入/路径 | 8 | +133 −54 | 5 个 mixed，需逐个裁决 |
| 9 | B6 文件树 | 3 | +77 −62 | |
| 10 | B15 文档/CI/配置 | 4 | +22 −8 | |
| 11 | B10 样式 | 3 | +368 −167 | `home-v3.css` +362/−164，两侧都改过，风险高 |
| 12 | B7 编辑器 | 7 | +172 −110 | 全 mixed；`notes-editor-pane.tsx` 上本地曾**落后**于远端（见 §6） |
| 13 | B4 词书/句书/session | 6 | +90 −2 | ⚠ 4 文件死代码耦合，需先决 lineage |
| 14 | B16 其他 | 9 | +207 −186 | ⚠ `use-notes-documents` / `use-notes-actions` 死代码耦合 |
| 15 | B12 通知/导出 | 4 | +41 −3 | ⚠ **与已批准决策冲突，默认不做**（见 §6） |

完整逐文件清单：`/tmp/queue-calc/QUEUE.txt`（易失，需要时按 §7 脚本重算）。

---

## 五、23 个「仅本地存在」文件：无一是待移植的**功能**

全部命中 `auris-live-code-migration-plan-2026-08-08.md` 已判定的死代码/半死代码或文档：

- 死代码（4 文件）：`billing-service` / `mobile-notes-storage` /
  `native-notification-service` / `native-file-export-service`
- 半死（有运行时、无产品出口）：`plugin-runtime` + `plugin-execution-policy`、
  `lineage` ×4（ipc/store/client/contract）
- 其余为文档（5 份）与各自测试、1 个 e2e spec

所以队列的**功能面**只由那 129 个 modified 文件构成。

### ⚠ 纠正（批次 1 实测）：文档类可能是被测试强制要求的

原判「无一可移植」过强。批次 1 发现 `docs/vmark-port/p1-editor-infrastructure.md`
**必须**随之移植：`vmark-manifest.test.ts:548` 对每个 `reviewDomains[].aurisPaths`
做磁盘存在性硬断言（`expect(existsSync(...)).toBe(true)`），而该文档是
`editor-infrastructure` 域的 aurisPath。不带它测试必失败。

**所以每个批次都要先查：本批要移植的数据/配置文件是否引用了那 5 份仅本地文档。**
可用命令（在本地 main 上）：

```bash
# 列出本批 manifest/配置引用的所有路径，再逐个查 origin/main 是否存在
git show main:auris/docs/vmark-port/manifest.json \
  | python3 -c "import json,sys; m=json.load(sys.stdin); \
print('\n'.join(sorted({p for d in m['reviewDomains'] for p in d['aurisPaths']})))"
```

注意区别：`entries[].aurisPaths` 缺失只计入报告的 `missingAurisTargets` 计数（软），
而 `reviewDomains[].aurisPaths` 缺失是**测试硬失败**。

---

## 六、三个已核实的硬约束

### 1. B12 会撤销你批准过的决定 —— 默认排除

B12 的 4 个文件会把 `isNativeApp` 分支和两条 native 断言重新加回：

```text
+ import { createNativeFileExportService } from "@/platform/files/native-file-export-service";
+ if (runtime.isNativeApp) { return createNativeFileExportService(); }
+ it("uses native sharing on mobile", ...)
```

这正是远端提交 `032b9ba51`（"test: drop assertions for absent native platform services"，
即上一轮你选的**选项 B**）刻意删掉的。项目无 Capacitor 依赖、无 android/ios 目录，
`isNativeApp` 恒为 false。**除非你改主意，B12 不做。**

### 2. 8 个队列文件耦合死代码 —— 需先决 lineage 去留

这些文件要移植的 hunk **内部就含**对已判定不搬模块的 import（不是无害的孤立引用）：

| 文件 | 引入的死模块 | 所在批 |
|---|---|---|
| `features/wordbook/local-wordbook-store.ts` | `lineage/learning-lineage-client` | 13 |
| `features/sentencebook/local-sentencebook-store.ts` | 同上 | 13 |
| `features/sessions/prepare-session.ts` | `lineage/learning-lineage-contract` | 13 |
| `features/sessions/session-client.ts` | 同上 | 13 |
| `features/notes/workbench/use-notes-actions.ts` | `lineage/learning-lineage-client` | 14 |
| `features/notes/workbench/use-notes-documents.ts` | 同上 | 14 |
| `platform/notes/get-notes-storage.ts` | `platform/notes/mobile-notes-storage` | 6 |
| `tests/unit/electron/nia/nia-preload.test.ts` | `electron/lineage/learning-lineage-ipc.cjs` | 4 |

两条出路（未决）：
- **一并搬 lineage**：4 个源文件 587 行（`store` 364 / `client` 127 / `ipc` 58 / `contract` 38）+ 4 个测试。
  代价是引入「有写入点、零 UI 读出口」的半死能力。
- **移植时剥掉 lineage 调用**：改动量小，但会让本地与远端在这些文件上继续分叉。

批次 4/6/13/14 在此决定前无法干净落地。

### 3. mixed 类不可整文件复制

上一轮已踩过：`notes-editor-pane.tsx` 上本地**落后**于远端（缺 CRLF 保留修复、
readOnly 守卫 11 处 vs 16 处），整文件搬会回退远端修复。
27 个 mixed 文件均须逐 hunk 裁决，尤其批次 11（`home-v3.css` +362/−164）与批次 12。

---

## 七、复算脚本（数字可复现）

```bash
cd /Users/apple/Desktop/大学markdown
BASE=$(git rev-parse origin/port/vmark-5-to-8)   # PR#3 尖端；合并后改用 origin/main
git diff --numstat "$BASE" main -- auris docs > /tmp/q.numstat
git log --format=%H "$BASE~2..$BASE" > /tmp/pr3.commits   # PR#3 有 2 个提交
git diff --name-only "$BASE~2" "$BASE" > /tmp/pr3.files
# 分类规则见 §3；排除 3 个生成物：
#   docs/vmark-sync/latest.json, docs/vmark-sync/latest.md,
#   src/features/dictionary/personal-vocab/word-index.json
```

⚠ 易错点（本轮踩过两次）：在 `auris/` 目录内再传 `-- auris` 前缀会导致命中 0；
`git diff A...B` 在无共同祖先时不可用，必须用两点 `A B`。

---

## 八、终局判据

队列全部勾掉后满足以下条件即可废弃本地 `main`：

1. 91 个队列文件在 `origin/main` 上均已达成裁决（移植或明确放弃）
2. 38 个「本地落后」文件不再需要——它们的正确版本已在远端
3. 23 个「仅本地」文件已确认全部为死代码/文档，无需保留
4. `origin/main` 全量 lint 仍为基线 79 errors / 8 warnings；测试失败数不高于当时基线
5. 本地重新 `git clone` 一份，从此只有一个 main

预计还需 **6–9 个 PR**（15 簇里 B12 排除、B4/B6/B13/B14 依赖 lineage 决策可合并处理）。

---

## 九、执行记录

### 批次 1（B1 vmark-sync 工具链）→ PR #4，2026-08-09（已合并）

分支 `port/vmark-sync-tooling`，基于 `origin/main` = `032b9ba51`（**不依赖 PR #3**，两者文件集仅在
`docs/vmark-port/README.md` 重叠，且改的是相隔 26 行的不同区域，实测双方均 `mergeable: clean`）。
提交 `067673409`，7 文件 / +849 −59。2026-08-09 14:17 GMT+8 合并为 `origin/main@5e6ee78de`。

**队列表记的是 5 文件，实际是 7。两个必须补的：**

1. `docs/vmark-port/p1-editor-infrastructure.md`（46 行，属那 23 个「仅本地」文件）。
   `vmark-manifest.test.ts:548` 是硬断言：**每个** `reviewDomains[].aurisPaths` 都必须在磁盘上存在，
   而 `editor-infrastructure` 域引用了这份文档。不带它测试必失败。
   → 修正 §5 的说法：那 23 个文件里**这一个是必须移植的**，不是「无一可移植」。
2. `docs/vmark-port/README.md`：原文写「`manifest.schema.json` defines schema version 1」，
   schema 升到 v2 后这句变成假话。按本地 main 的措辞同步。

**移植方式**：整份复制。先验证本地是严格超集——脚本 79 个顶层标识符本地全部保留（新增 5 个）、
12 个 manifest entry 全部保留、18 个 sync-report 测试全部保留，唯一被替换的是
`freezes the complete JSON Schema v1 contract` → `v2 contract`（预期的契约升级）。

**内容三项能力**（schema v1→v2 破坏性变更，故必须同为一个提交）：

- `reviewDomains`：7 个能力域的 port/adapt/defer/reject 决策；报告对未被 mapping 命中的上游改动
  按最长前缀归入域，成为 capability-domain candidate 而非 unmapped noise
- `--repository-path <abs>`：用已有本地 VMark clone 替代 clone。校验必须是真目录（非 symlink）、
  是 git work tree、`origin` URL 规范化后等于 manifest 仓库。phase-3/phase-4 handoff 都记录过
  `vmark:diff` 被 `GIT_FETCH_FAILED` 阻塞——这就是那个场景的离线通路
- `--diagnostics`：git 失败时向 stderr 追加一行指纹（operation / exit status / stderr 字节数 /
  截断 sha256），**不输出 stderr 内容**，所以「公开消息不泄露私有细节」的既有保证仍成立

**验证**（全部实测，非推断）：

- 反空过：仅回滚脚本 → 8 个测试失败（含全部 3 个新测试），恢复后逐字节一致
- 端到端 CLI：对 `.tmp-vmark-explore/repo`（真 VMark clone，含 pinned baseline `7c409688`）
  跑 `--repository-path`，产出 `schemaVersion: 2` / 7 reviewDomains / 509 domainCandidates；
  `--diagnostics` 只在显式传入时打印指纹行。跑完 revert 掉生成的 `docs/vmark-sync/latest.*`
- tsc：base 与 port 各 119 个错误，**错误集逐条相同，零新增**（含一条既有的 TS7016，
  是 `.cjs` 无声明文件，base 上同样存在）
- lint：79 errors / 8 warnings，恰为基线，我的 7 个文件零命中
- 全量测试：base 与 port **都是 7 文件 / 25 用例失败**，净增 7 条通过（2230 → 2237，
  正是新增的 7 个测试）。两侧各有一个 load flake 且互不相同（base 在 `vmark-sync-report`，
  port 在 `notes-terminal-panel`），各自单独跑均全绿（22/22 ×2、18/18 ×3）
- build EXIT=0、`security:secrets` 通过、`git diff --check` 干净、新增行 secret 扫描仅命中
  测试里断言「不泄露」的假凭据

### 纠正：`origin/main` 的真实测试基线是 7 文件 / 25 用例

此前记录的「6 文件 / 23 用例」是在 **PR #3 的 worktree**（313 个测试文件）里测的；
`origin/main` 本身只有 300 个测试文件，基线是 **7 / 25**。多出的那个是
`notes-terminal-panel.test.tsx`。以后比对必须在**同一基线的 worktree** 上测，不能跨 worktree 用数字。

### 未做（避免 scope creep）

`--repository-path` / `--diagnostics` 在任何文档里都没有说明，脚本也没有 `--help`。
本地 main 同样没有，所以补文档属于新增而非移植，且 `usage-and-delivery-guide.zh-CN.md`
本身在队列 B15。留到 B15 一并处理。

### 网络：`github.com:443` 不可达时的推送通路

本轮 `git push` 全部失败（`SSL_ERROR_SYSCALL` / HTTP2 framing），12 次 TLS 探测 0 成功，
`git fetch` 同样失败——是 host 级不可达，与 push 无关，且解除代理无效。
但 `api.github.com` 通（200）。

改用 Git Data API 完成推送，且**可验证**：

```bash
gh api repos/O/R/git/blobs -f content=<base64> -f encoding=base64   # ×7，返回 SHA 与本地 blob SHA 逐个比对
gh api repos/O/R/git/trees --input <base_tree + 7 entries>          # 返回 tree SHA 必须等于本地 commit 的 tree
gh api repos/O/R/git/commits --input <tree+parent+author+committer> # 传入与本地相同的 author/committer 和时间戳
gh api repos/O/R/git/refs -f ref=refs/heads/<branch> -f sha=<commit>
```

因为 git 的 SHA 是内容确定性的，**tree SHA 与 commit SHA 都与本地完全一致**
（`bfa84ffd…` / `0676734099…`），这证明远端对象与本地提交逐字节相同，不是「大概传上去了」。
注意必须显式传 author/committer 与原时间戳，否则 API 会用自己的时间导致 commit SHA 不同。
