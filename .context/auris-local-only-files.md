# 本地独有功能 → 文件清单

比对时间：2026-08-08
本地：`/Users/apple/Desktop/大学markdown/auris`（工作区，含未提交改动）
GitHub：`/Users/apple/Desktop/auris-github-clone/auris`（origin/main）

## Git 状态总览

- 本地 main 领先 origin/main **166 个 commit**（全部未推送）
- 落后 8 个 commit（远端独有）
- 下列文件除注明外均为「已提交但未推送」

## 1. Markdown 检查（GitHub 只有空壳开关）

| 文件 | 行数 | GitHub |
|---|---|---|
| `src/features/notes/editor/markdown-lint.ts` | 106 | 无 |
| `tests/unit/notes/markdown-lint.test.ts` | 22 | 无 |
| `src/components/notes-v2/notes-editor-pane.tsx` | 867 | 有（827，无 lint 接线）|

## 2. 大纲面板接线（GitHub 有文件但是死代码）

| 文件 | 行数 | GitHub |
|---|---|---|
| `src/components/notes-v2/notes-outline-panel.tsx` | 63 | 有（63，无人引用）|
| `src/components/notes-v2/notes-workbench-bottom-left.tsx` | 184 | 有（145，无大纲按钮）|

接线内容：`☷` 按钮、popover、`onJumpToHeading`、`outlineActiveLine`、无标题时禁用。

## 3. 排版调节

| 文件 | 行数 | GitHub |
|---|---|---|
| `src/components/notes-v2/notes-workbench-bottom-right.tsx` | 523 | 有（440，无行宽/字号）|

## 4. lineage 学习血缘（GitHub 完全没有）

| 文件 | 行数 |
|---|---|
| `electron/lineage/learning-lineage-store.cjs` | 364 |
| `electron/lineage/learning-lineage-ipc.cjs` | 58 |
| `src/features/lineage/learning-lineage-client.ts` | 127 |
| `src/features/lineage/learning-lineage-contract.ts` | 38 |
| `tests/unit/electron/lineage/learning-lineage-store.test.ts` | 217 |
| `tests/unit/electron/lineage/learning-lineage-ipc.test.ts` | 73 |
| `tests/unit/lineage/learning-lineage-client.test.ts` | 97 |

额外 MCP 工具：`auris_learning_lineage`、`auris_learning_lineage_resolve`

## 5. 插件（架构不同，非有无 —— 纠正早期结论）

| 文件 | 本地 | GitHub |
|---|---|---|
| `electron/plugins/plugin-runtime.cjs` | 121 | 无 |
| `src/features/plugins/plugin-execution-policy.ts` | 43 | 无 |
| `src/platform/desktop/plugin-host.ts` | 144 | **272（含 loadPluginModule/activatePlugin/createPluginApi/commandRegistry）** |
| `tests/unit/electron/plugins/plugin-runtime.test.ts` | 114 | 无 |
| `tests/unit/plugins/plugin-execution-policy.test.ts` | 44 | 无 |

- 本地：渲染层只做策略判定，执行搬到主进程 `plugin-runtime.cjs`
- GitHub：渲染层直接加载并激活插件

## 6. 移动端笔记存储

| 文件 | 行数 | GitHub |
|---|---|---|
| `src/platform/notes/mobile-notes-storage.ts` | 126 | 无 |
| `src/platform/notes/get-notes-storage.ts` | 58 | 有（48）|

## 7. 原生通知 / 文件导出

| 文件 | 行数 | GitHub |
|---|---|---|
| `src/platform/notifications/native-notification-service.ts` | 51 | 无 |
| `src/platform/notifications/notification-service.ts` | 23 | 有（9）|
| `src/platform/files/native-file-export-service.ts` | 56 | 无 |
| `src/platform/files/file-export-service.ts` | 29 | 有（23）|

## 8. 视频库

| 文件 | 行数 | GitHub |
|---|---|---|
| `src/components/desktop/desktop-video-library-shell.tsx` | 341 | 有（273）|

本地多出：视频库概览、AI 解析结果、缩略图、转码缓存、数据库

## 9. 空壳设置清理 + 真实性测试

| 文件 | 行数 | GitHub |
|---|---|---|
| `tests/component/settings/auris-settings-feature-truthfulness.test.tsx` | 94 | 无 |
| `src/components/settings/auris-settings.tsx` | 1989 | 有（2012，含 7 个空壳开关）|

测试断言"最大版本数""超过 1 MB 的文件自动以源码模式打开"**不得出现**。

GitHub 空壳开关（引用数 0–1，无消费者）：
`keepDocumentHistory` `historyMaxAge` `autoDownloadUpdates` `checkUpdateFrequency` `enableMarkdownLint` `maxVersions` `confirmLargeFile`

## 10. 笔记起始页 + Markdown 往返测试

| 文件 | 行数 | 状态 |
|---|---|---|
| `src/components/notes-v2/notes-start-screen.tsx` | 85 | ⚠️ **未跟踪** |
| `tests/component/notes/notes-start-screen.test.tsx` | 45 | ⚠️ **未跟踪** |
| `tests/unit/notes/notes-rich-markdown-roundtrip.test.ts` | 92 | 已提交未推送 |
| `tests/e2e/notes-save-integrity.spec.ts` | 186 | 已提交未推送 |

fixture（5 个，`tests/fixtures/notes/roundtrip/`）：
`basic-cjk.md` `code-and-math.md` `escaping-and-breaks.md` `lists-and-quotes.md` `table-and-links.md`

## 未提交的接线入口

| 文件 | 状态 |
|---|---|
| `electron/main.cjs` | M（lineage/plugin 接线已在 HEAD 中，改动是其他内容）|
| `electron/preload.cjs` | M |
| `src/platform/desktop/desktop-bridge.ts` | M |
| `src/components/notes-v2/notes-page-client.tsx` | M（新增引用未跟踪的 NotesStartScreen）|

## 待处理

1. `notes-start-screen.tsx` + 其测试未跟踪，且已被修改的 `notes-page-client.tsx` 引用 → 未完成的在改功能，漏提交会导致构建失败
2. `auris/release/` 未被 gitignore，298 个未跟踪条目里 32 个是构建产物
3. 166 个 commit 未推送
4. `git stash` 有 4 条记录
