# VMark v0.9.91 增量适用性核查

本轮固定比较 `662d73d46d2ed6294d087ad1ced30223384de170` 与 `fa785a7008999bc2077889a9faaca0175f122cee`，共 4 个提交（含 2 个合并）、11 个文件。内置参考镜像 `vmark-upstream/` 已从前者快进到后者，工作树干净；没有跟随移动的 main。后者包含 v0.9.91 发布之后的 hook 元数据整理，因此版本号不能替代 commit。

## 结论与源码依据

| 上游增量 | Auris 核查结果与处置 |
| --- | --- |
| 定义正文／续行不再触发弹窗，仅 `[^label]` 标记可预览 | `sourceFootnotePopupPlugin.ts` 将定义触发范围缩到 markerEnd。Auris 的 `createNotesEditorExtensions()` 和 `NotesEditorPane` 没有脚注弹窗注册，源码中标记、正文和续行均保持原文可编辑。没有可修补的同构弹窗。 |
| 非空选区禁止指针预览，打开时重查所有 ranges | 上游在 detectTriggerAtPos 与 openPopup 两处重查。Auris 没有此异步脚注预览链路；验证主选区、副选区以及 mousemove 后新建选区保持不变。 |
| 指针预览保留焦点，显式 autoFocus 才聚焦 textarea | `SourceFootnotePopupView.ts` 禁止基类自动聚焦；RAF 回调重查可见性和 autoFocus。Auris 没有对应 textarea／store；验证指针事件之后编辑器能继续编辑，离开后不会重新夺焦。 |
| `.codex/hooks.json` 删除 `_cc_bridge_version` | diff 确认只有元数据删除，hooks 定义未变。Auris 没有该受版本管理的配置文件，不新增或修改用户的助手配置。 |
| app／MCP／Tauri 版本更新 | 上游版本元数据，不是 Auris 功能缺口；保留 Auris 独立版本。 |

完整逐文件核查见 [incremental-review-2026-10-02.json](./incremental-review-2026-10-02.json)。上游功能修复固定于 [3f4138e70](https://github.com/xiaolai/vmark/commit/3f4138e70d05e1f23d50149a06569f8e3b3dc225)，hook 清理固定于 [7ca87144f](https://github.com/xiaolai/vmark/commit/7ca87144fb70ca6b8c4b37833bc4cbe1d6f2e361)。上述判断来自本地固定源码与实际 diff。

此次没有新增生产功能或改写共用层。**Auris 仍缺少 VMark 的脚注标记预览与显式弹窗编辑能力**，不能把“源码编辑不受打断”写成“脚注功能完全对齐”。为适配一次不存在于 Auris 的弹窗缺陷而引入整个弹窗框架，超出了本次修复的必要范围。

## 验证与反例

新增 `tests/unit/notes/source-footnote-editing.test.ts`，参考上游 `src/plugins/sourceFootnotePopup/sourceFootnoteEditing.test.ts`（ISC），保留现有完整许可 `docs/vmark-port/UPSTREAM-LICENSE.txt`。使用 Auris 真实 CodeMirror 状态、扩展、DOM、焦点和文档变化回调，10 项回归覆盖中文／RTL 正文、续行、引用与定义标记、click／mousemove 后非空选区、主选区为空但副选区非空、悬停之后开始选择、离开编辑器后的焦点，以及继续输入的完整原文结果。没有 mock 脚注 store 或模拟一个不存在的弹窗。

关键反例是“没有抢焦点也可能没有预览功能”：因此测试仅证明现有源码编辑行为，不证明弹窗能力。鼠标事件为合成 click／mousemove，选区由真实 CodeMirror transaction 设置；沿用 jsdom 的既有布局桩，不验证原生坐标命中、真实拖选、输入法或 Electron 宿主行为。

执行命令：

```sh
npx vitest run tests/unit/notes/source-footnote-editing.test.ts tests/unit/notes/editor-multicursor.test.ts tests/unit/notes/markdown-link-source-interaction.test.ts tests/unit/vmark tests/unit/notes/editor-mixed-rendering.test.tsx
npx eslint tests/unit/notes/source-footnote-editing.test.ts
git diff --check
node scripts/vmark-sync-report.cjs --repository-path /Users/apple/Desktop/大学markdown/vmark-upstream --upstream fa785a7008999bc2077889a9faaca0175f122cee
```

结果：6 个测试文件、77 项通过；新增测试定向 ESLint 和 diff 空白检查通过。没有把用户上一轮的 VMark 136 项或 Guardian 302 项计入本轮 Auris 结果。

累计差异报告 `latest.json`／`latest.md` 已刷新，沿用原始 provenance baseline；12 项历史 mapping 仍标记 stale，没有批量更新 lastComparedCommit。逐次增量核查与历史全量对齐是两个不同范围。

本轮仅修改测试与审计文档、更新忽略的参考镜像，未改动生产源码、真实笔记、应用安装或助手配置。未运行完整构建、全仓类型检查、Electron UI 手测或 Windows 验证；未递增版本、提交、推送或发布。
