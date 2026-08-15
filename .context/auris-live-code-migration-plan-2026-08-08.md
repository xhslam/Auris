# Auris 活代码搬迁清单（2026-08-08）

基线：`origin/main` = `4caac1e9e`。本地 main = `1ccf54523`（166 提交，与 origin/main 无共同祖先）。
所有结论均在隔离 worktree `integrate/mac-capabilities` 实测得出，实测后已回滚至干净基线。

## 结论摘要

| 项 | 结论 | 优先级 |
|---|---|---|
| `notes-rich-markdown.ts` 两处修复 | origin/main 存在数据损坏 bug，本地已修 | P0 |
| roundtrip 测试 + 5 fixture | 需与上面的修复一起搬，否则 3/9 失败 | P0 |
| `markdown-lint.ts` + 测试 | 零依赖纯函数，可直接搬；需补 UI 接线 | P1 |
| truthfulness 测试 | 需同时搬 settings 空开关清理 | P1 |
| `notes-save-integrity.spec.ts` | origin/main 已有等价单测，可不搬 | P3 |
| 死代码 10 个文件 | 不搬 | — |

## P0：origin/main 的代码块数据损坏 bug

### 现象

`origin/main` 的富文本↔源码往返不是幂等的。带空行的代码块每存一次，收尾栅栏前多一个空行：

```text
原文   : ```text\na\n\nb\n```\n
存一次 : ```text\na\n\nb\n\n```
存两次 : ```text\na\n\nb\n\n\n```
```

内容随保存次数单向增长，不收敛。属于真实数据损坏，不是测试洁癖。

### 根因与修复

本地 main 的 `auris/src/features/notes/editor/notes-rich-markdown.ts` 比 origin/main 多两处（+21/−3）：

1. `codeBlockNodeSpec.parseDOM` 增加 `getContent`，从 DOM 取回代码块文本时剥掉结尾换行
   （`.replace(/\n$/u, "")`）。这是空行增长的直接修复。
2. `getCellText` → `getCellMarkdown`：表格单元格改用 serializer 重新序列化，
   保住单元格内的行内标记（粗体、链接、代码）。原实现用 `cell.textContent`，会把标记吃掉。

### 实测

- 仅搬 roundtrip 测试到 origin/main：3/9 失败（basic-cjk、code-and-math ×2、
  escaping-and-breaks、lists-and-quotes、table-and-links 均命中）
- 补上两处修复后：7/7 通过
- 回归 6 个依赖 `notes-rich-markdown` 的既有测试
  （math、wikilinks、input-rules、source-peek、table-toolbar）：37/37 全通过，无回归

### 搬迁内容

- 修改 `auris/src/features/notes/editor/notes-rich-markdown.ts`（+21/−3）
- 新增 `auris/tests/unit/notes/notes-rich-markdown-roundtrip.test.ts`
- 新增 `auris/tests/fixtures/notes/roundtrip/` 5 个 fixture（basic-cjk、
  lists-and-quotes、code-and-math、table-and-links、escaping-and-breaks，共 46 行）

## P1：markdown-lint

- `auris/src/features/notes/editor/markdown-lint.ts` 106 行，零 import，纯函数
- 导出 `lintMarkdown(source): MarkdownLintIssue[]`，5 条规则：
  `duplicate-heading` / `malformed-link` / `table-column-count` /
  `trailing-whitespace` / `unclosed-fence`
- 实测直接复制到 origin/main，其测试 2/2 通过，无需任何适配
- **额外工作**：origin/main 的 `notes-editor-pane.tsx`（827 行）没有 lint 接线。
  本地版（867 行）在 155-157 行算 `lintIssues`，722-726 行渲染 `.notes-v2__lint-summary`
  徽标。要让用户看到 "Lint N"，需把这段接线也搬过去，并确认 CSS 类存在。

## P1：settings truthfulness 测试

单搬会 5/6 断言失败。原因是 origin/main 仍在渲染本地已删的空开关。

### origin/main 现状（已核实）

仍渲染：`最大版本数`、`保留文档历史记录`、`检查更新`、`自动下载更新`。
`INITIAL_TOGGLES` 仍含 `largeFileSource`、`confirmLargeFile`、`keepHistory`、
`autoUpdate`、`autoDownloadUpdate`；`INITIAL_SELECTS` 仍含 `maxVersions`、
`keepVersionDuration`、`mergeWindow`、`historyMaxFileSize`、`updateFrequency`；
`ButtonAction` 仍含 `checkUpdate`。

### 关键：底层实现已在 origin/main，文案数字全部吻合

| 文案声明 | origin/main 实现 | 位置 |
|---|---|---|
| 1 MB / 5 MB 字节阈值 | `LARGE_FILE_LIMIT_BYTES` = 1MB、`HUGE_FILE_LIMIT_BYTES` = 5MB | `note-open-strategy.ts:7-8` |
| 512 KB / 最多 50 个 | `HISTORY_MAX_SOURCE_BYTES` = 512KB、`HISTORY_LIMIT` = 50 | `notes-recovery-store.ts:12-13` |
| Hot Exit 不超过 2 MB | `RECOVERY_MAX_SOURCE_BYTES` = 2MB | `notes-recovery-store.ts:14` |
| Pandoc 只是检测 | `pandoc` 仅在 `DETECTABLE_BINARIES` 名单，无导出管线 | `main.cjs:3568` |
| 更新器未接入 | 无 `electron-updater` 依赖；`onCheckForUpdates` 只跳升级页 | `main.cjs:2953` |

即搬过去后这些文案是**说真话的**，不是空承诺。

### 搬迁内容

- 修改 `auris/src/components/settings/auris-settings.tsx`：删 5 个 toggle、
  5 个 select、1 个 ButtonAction 及其渲染行，补 4 条诚实说明文案
  （本地 1524 / 1555 / 1581 / 1844 行）
- 新增 `auris/tests/component/settings/auris-settings-feature-truthfulness.test.tsx` 94 行
- 依赖已满足：`notes-locale-settings.tsx` 与
  `resetHydratedDesktopBridgeCacheForTests` 均已在 origin/main
- 注意：本地 SWATCHES 六个色值与 origin/main 不同（白/纸张/薄荷/棕褐/夜间/Solarized）。
  属独立的主题调色改动，与 truthfulness 无关，需单独决定是否搬。

## P3：不搬

- `notes-save-integrity.spec.ts`：origin/main 已有
  `tests/unit/notes/use-notes-documents-save-integrity.test.tsx`。且本地这个 e2e
  从未进 CI（CI 只跑 `notes-obsidian-workbench` 和 `notes-editor-focus`），
  package.json 也无脚本引用。
- 死代码 10 个文件：见下。

## 死代码（不搬，建议在本地也删）

根因：项目无 Capacitor 依赖（package.json 0 命中，无 android/ios 目录），
`detectRuntime()` 的 `isNativeApp` 恒为 false，所有 native 分支不可达。

| 文件 | 行数 | 死因 |
|---|---|---|
| `features/billing/billing-service.ts` | 45 | 生产零引用 + native 不可达 + 无付费 UI + adapter 从不传入 |
| `platform/notes/mobile-notes-storage.ts` | 126 | 仅在 `get-notes-storage.ts:49` 的 `isNativeApp` 分支内 |
| `platform/notifications/native-notification-service.ts` | 51 | 同上，且依赖 `Capacitor.Plugins.LocalNotifications` |
| `platform/files/native-file-export-service.ts` | 56 | 同上；且 `exportPdf` 实为改名成 .html 分享 |

半死（有运行时、无产品出口）：

| 能力 | 文件 | 状态 |
|---|---|---|
| 插件系统 | `electron/plugins/plugin-runtime.cjs` 121 行、`features/plugins/plugin-execution-policy.ts` 43 行 | main.cjs 14 处真实调用，但策略对 `source === "vault"` 一律 `allowCodeExecution: false`；无内置插件目录；无插件管理 UI；`plugin-host.ts` 生产零引用 |
| 学习谱系 | `electron/lineage/*.cjs` ×2、`features/lineage/*.ts` ×2 | 挂在词书/句书/会话/笔记保存 5 处写入点，但零 UI 读出口；`userData/learning-lineage/` 从未生成 |

## 建议顺序

1. P0 一起走：`notes-rich-markdown.ts` 修复 + roundtrip 测试 + fixtures。
   这是修 bug，独立成一个提交。
2. P1a：`markdown-lint.ts` + 测试 + editor-pane 接线 + CSS 确认。
3. P1b：settings 空开关清理 + truthfulness 测试。
4. 本地清理死代码（10 文件约 933 行）单独一轮，不与搬迁混。

---

## 执行结果（2026-08-08 22:36 补记）

三项全部完成，已合并进 GitHub `main`。PR #2 状态 MERGED，`main` = `6d1ec285a`。

| 提交 | 内容 |
|---|---|
| `a60f1ca71` | fix: keep rich markdown round-trip idempotent（P0） |
| `e40405984` | feat: surface markdown lint issues in the notes editor（P1a） |
| `6d1ec285a` | fix: remove inert settings controls and state the real behavior（P1b） |

### 与计划的偏差

1. **P1a 未整文件复制 `notes-editor-pane.tsx`**。核对发现本地 main 在该文件上
   **落后于** origin/main 两处：缺 CRLF 保留修复（`lineSeparator`），readOnly 守卫
   11 处 vs origin/main 的 16 处。整文件搬会回退这两项。改为只补 lint 接线三处
   （import、`lintIssues` useMemo、徽标 span），并新增
   `tests/unit/notes/editor-lint-summary.test.tsx` 6 条断言锁住接线。
   已验证：移除接线后该测试 4/6 失败，非空过。
2. **P1b 额外发现并修复 locale 无障碍缺陷**。truthfulness 测试第 4 条在
   origin/main 上失败，根因是 `notes-locale.ts` 的 `saveNotesLocale` 未设置
   `document.documentElement.lang`（本地 main 有这 3 行，origin/main 无）。
   切换到英文后文档仍向读屏软件声明中文。已补。
3. **P1b 额外清理伪造的更新提示**。`runAction` 的 `checkUpdate` 分支硬编码
   `window.alert("已是最新版本（v1.4.0）。")`，而 `package.json` 版本是 `1.0.0`，
   且无 `electron-updater` 依赖。已随开关一并删除。

### 验证数据

- 全量测试 before/after 断言列表**逐条一致**：零新增失败、零回归。
  - baseline: 288 files passed / 10 failed, 2212 tests passed / 25 failed
  - after: 292 files passed / 10 failed, 2232 tests passed / 25 failed
  - 净增 20 条通过断言（roundtrip 7 + lint-summary 6 + markdown-lint 2 + truthfulness 5）
- 旧报告记录的「26 个既有失败」不准确，实测 baseline 为 25。
- `npm run build`：通过。`npm run security:secrets`：通过。
- 全量 lint：79 errors / 8 warnings，与 baseline 完全一致。
- 改动文件定向 ESLint：通过。
- 每项搬迁均先在干净 baseline 上复现失败，再确认修复，实测后回滚，无残留。

### 遗留：origin/main 有 4 个测试的源文件缺失

`origin/main` 的 10 个失败文件中有 4 个，根因是**测试存在但源文件未随初始提交带上**：

| 测试 | 缺失源文件 | 失败形式 |
|---|---|---|
| `tests/unit/billing/billing-service.test.ts` | `features/billing/billing-service.ts` | Failed to resolve import |
| `tests/unit/notes/mobile-notes-storage.test.ts` | `platform/notes/mobile-notes-storage.ts` | Failed to resolve import |
| `tests/unit/platform/file-export-service.test.ts` | `platform/files/native-file-export-service.ts` | expected 'native' got 'web' |
| `tests/unit/platform/notification-service.test.ts` | `platform/notifications/native-notification-service.ts` | expected 'native' got 'web' |

实测：仅复制 4 个源文件可修掉前 2 个；后 2 个还需在 `file-export-service.ts` 与
`notification-service.ts` 里恢复被删掉的 `isNativeApp` 分支——origin/main 这两个
工厂的 native 分支是被**刻意剥掉**的，只留下了断言 native 行为的测试。

两条出路（未执行，待决定）：
- **A. 补源码 + 恢复分支**：失败从 25 降到 21，但重新引入 Capacitor 缺失下不可达的死代码。
- **B. 删掉这 4 个孤儿测试**：失败同样降到 21，且不引入死代码。属删除操作，需明确授权。

建议 B，理由是项目无 Capacitor 依赖、无 android/ios 目录，native 路径目前是空承诺；
留着断言 native 行为的测试等于给不存在的能力做背书，和本轮清掉的空开关是同一类问题。

## 执行记录补充：孤儿 native 测试清理（选项 B）

提交 `032b9ba51`，已快进合并进 GitHub `main`。

### 背景

上一轮全量验证发现，origin/main 的 10 个失败测试文件里有 4 个的根因是
**测试在、源文件不在**。做干净基线时 native 源码被剥掉，但断言 native
行为的测试留下来了。

### 处理方式：不是一律删文件

核对后发现只有 2 个是真孤儿，另 2 个仍覆盖有效分支，故分开处理：

| 文件 | 处理 | 理由 |
|---|---|---|
| `tests/unit/billing/billing-service.test.ts` | 整文件删除（23 行） | import 解析失败，两条断言全依赖缺失源码 |
| `tests/unit/notes/mobile-notes-storage.test.ts` | 整文件删除（47 行） | 同上，唯一用例全依赖缺失源码 |
| `tests/unit/platform/file-export-service.test.ts` | 只删 native 用例（−8 行） | 保留 desktop、web 两条通过用例 |
| `tests/unit/platform/notification-service.test.ts` | 只删 native 用例（−12/+1 行） | 保留 web 用例 |

附带修一处潜在类型错误：`notification-service.test.ts` 的 web 用例向
`createNotificationService()` 传了参数，而 origin/main 的签名不接受任何参数。
已移除该无效实参。

### 实测结果

- 失败文件 10 → 6
- 失败断言 25 → 23
- 通过断言 2232 不变；通过文件 292 → 294
- 断言级比对：**零新增失败**；消失的正好是两条 native 断言
  （`file export service uses native sharing on mobile`、
  `notification service uses native notifications inside mobile app containers`）
- build 通过、secrets 通过、全量 lint 79 errors / 8 warnings 与基线一致

### 一处预测修正

我先前预测失败断言会降到 21，实际是 23。原因是我误以为 4 个目标文件各贡献
1 条失败断言。实际上 billing 与 mobile-notes-storage 在 import 阶段就解析失败，
测试根本没注册，只计入「失败文件」而贡献 0 条失败断言。正确算式是
文件 10−4=6、断言 25−2=23，与实测吻合。

### 剩余 6 个失败文件（既有债务，与本轮无关）

`notes-page-client`（16 条，欢迎页假设）、`desktop-video-detail-shell`（1）、
`personal-vocab-markdown`（1）、`browser-approvals`（1）、
`editor-mixed-rendering`（2）、`notes-typography`（2）。
