# VMark main 增量 → Auris 选择性同步

日期：2026-10-16（Asia/Shanghai）。Auris 版本保持 **1.0.18**，源码基线为 `fbf65bc`。

## 对照范围与分工

固定上游：[`f2bf1b3fc..8887701db`](https://github.com/xiaolai/vmark/compare/f2bf1b3fce06ca21fe7cd19382bef9c4774d0558...8887701db097cef0dea00584b70a0ea1dac5ae05)，**7 个主线提交、84 个文件**。早上 08:40 的上游是 `220d84399`，本轮在线查询发现另外 3 个提交，最终固定到 09:58 合入的 `8887701db097cef0dea00584b70a0ea1dac5ae05`，不在任务中持续追逐移动的 main。

ChatGPT 负责源码对照、适用性判断、实现、失败回归、构建与真实 Electron 验收；`agy --dangerously-skip-permissions` 仅作**只读独立审查**，范围为早上 4 个提交（截至 `220d84399`），已返回结果。agy 没有修改 Auris；它关于“无生产缺口”的结论仅限这 4 个提交，不能扩展为后续 3 个提交或整个项目无缺口。主 Agent 复核采纳其“不为同步引入无对应基础设施”的建议。

`vmark-upstream/` 已快进，原有 4 个 SVG 本地删除补丁哈希保持不变。回退引用为 `gamma/before-vmark-20261016`。累计 `latest.json/latest.md` 已刷新；历史 manifest 的比较时间戳未批量修改。逐文件清单见 [incremental-review-2026-10-16.json](incremental-review-2026-10-16.json)，清单不是对所有历史映射的完整验收。

## 已适配：阅读位置与主动导航的优先级

参考 [PR #1561](https://github.com/xiaolai/vmark/pull/1561) 的 `restoreChoice.ts`、`sourcePendingNav.ts`、`tiptapFocus.ts` 和 cursorSync：**阅读视口与编辑光标是不同状态；主动跳转优先于被动恢复**。

Auris 已有 `notes-scroll-memory.ts`，按路径和 source / wysiwyg / preview 分开记录，因此没有复制 VMark 的 tab store、Tiptap 或新增另一套滚动存储。实际改动：

| Auris 文件 | 行为与取舍 |
| --- | --- |
| `src/components/notes-v2/notes-rich-editor-pane.tsx` | 同一篇笔记的外部正文同步不再无条件请求 `scrollIntoView`。文档切换仍保留初始选区处理，再由该文档自己的阅读记忆恢复；不把后台内容同步误当成导航。 |
| `src/features/notes/editor/notes-scroll-memory.ts` | 增加主动导航版本。显式跳转取消正在执行的恢复，并使尚未开始的旧恢复失效；内部恢复接替不算新的导航，不无故作废另一 surface 的首帧。 |
| `src/components/notes-v2/use-notes-scroll-memory.ts` | 首帧执行前核对导航版本。若 bridge 已完成主动跳转，则跳过旧记忆恢复，但继续跟踪后续阅读位置。 |
| `editor-state-bridge.ts`、`notes-rich-editor-bridge.ts` | `setSelection` / `revealLine` 明确取消旧恢复，覆盖程序调用没有 wheel / pointerdown / keydown 的情况。 |
| `notes-rich-editor-bridge.ts` | 真实 Electron 验收发现额外缺口：ProseMirror 的 `scrollToSelection` 在 DOM 选区不属于编辑器时跳过滚动。显式跳转现先 `focus()` 再 dispatch；`focus()` 本身采用 ProseMirror 的 prevent-scroll 路径。此修复属于 Auris 适配中发现的本地问题，不声称是上游同一段代码的直接移植。 |

这是**行为不变量适配**，没有直接复制新的上游实现文件；既有 ISC 许可文件保留。没有改笔记存储、Vault 工厂、主进程或 preload。

### 保留的功能差异

本轮**没有新增跨 source / WYSIWYG 的光标位置映射，也没有新增逐文档光标持久化**。Auris 继续使用已有各 surface 独立滚动记忆；不能宣称完整移植 `restoreChoice` 的“切换 surface 跟随映射光标”策略。既有全局单活动恢复和 90 帧恢复上限也保留，没有借本轮重做滚动框架。

## 不照搬的增量

| 上游变化 | Auris 判断与证据 |
| --- | --- |
| [#1558 变异测试有界化与超时告警](https://github.com/xiaolai/vmark/pull/1558) | 无 Stryker / cargo-mutants、定时 mutation 任务和滚动 Issue 报告器。不新增空配置或 `issues:write`，不改用户正在编辑的 Notes Windows smoke。采用测试范围与时长可核验的思路，不虚构同构缺陷。 |
| #1558 重型 YAML workflow lazy chunk 等待预算 | `structured-data-preview.tsx` 是同步文本树，不加载 VMark 的 GHA workflow ReactFlow adapter。不引入无使用者的 45 秒常量。 |
| [#1559 图节点实际就绪后再读](https://github.com/xiaolai/vmark/pull/1559) | Nia `workflow-run-view.tsx` 为列表，不是 VMark 的执行图；Notes 关系图无 Run 按钮与此执行探针。本轮不增加无依据的延迟/标志，不声称所有 ReactFlow 时序问题都不存在。 |
| #1558 rustls 0.23.46 | Auris 的 Electron/Node 依赖没有该 Cargo TLS 链，不移植 Cargo.lock，也不声称修复了 Auris 的 4 项 RustSec 漏洞。没有运行新的全量安全审计。 |
| ESLint / Action 例行补丁 | Auris 使用 `eslint-config-next`，没有对应 Rust 安装 Action 或 Claude Code Action；不按版本号强行换依赖。 |
| [#1560 Tauri fs lstat 授权](https://github.com/xiaolai/vmark/pull/1560) | 不存在 Tauri capability 文件。Auris 仍沿用 Electron 受限 IPC，不扩大文件权限；既有 IPC 门禁通过，但本轮没有重新验收所有导出图片场景。 |
| [#1562 双文档 F6 模式震荡](https://github.com/xiaolai/vmark/pull/1562) | Auris `split` 为同一篇 Markdown 的源码＋公众号预览，不是两个独立文档共享 window sourceMode；没有对应 PaneContext / useTabModeSync 循环。不引入双文档分屏框架。 |
| 网站文案、file-size baseline、上游 ledger | 参考镜像中保留，未作为 Auris 功能新增或认证依据。 |

## 验证与发现过程

1. **失败先行**：原实现 6 项稳定失败：同文档外部同步仍请求滚至光标；首帧前的主动跳转被旧恢复覆盖；两种 bridge 的 `setSelection` / `revealLine` 被旧恢复抢回。一个最初失败来自测试误消费 CodeMirror 的首个 RAF，修正调度后再取 6 项真实失败，不将夹具错误算作产品缺陷。
2. **实机补证**：最初 Electron 脚本误假定存在文件树/外部文件导航历史，属于验收入口假设错误。改用真实 macOS `open-file` 处理器切换两篇临时文档。阅读恢复先通过，但程序化大纲跳转失败；读取实际 ProseMirror `scrollToSelection` 后确认焦点顺序问题，新增 2 项失败回归，再修改并重验。
3. **最终定向**：3 个文件 / **30 项通过**；扩大回归为 **174 文件 / 1,736 项通过**，覆盖 Notes、工作流、VMark 报告与合约。
4. **规范与类型**：全仓 ESLint 0 errors / 18 项既有 warnings；全仓独立 `tsc --noEmit --incremental false` 改前改后均 **241 项诊断**，去行号后的完整诊断签名及重复计数一致。全仓类型检查仍失败，不宣称类型检查通过。
5. **构建与边界门禁**：生产构建与三项 Markdown bundle 补丁门禁通过；12 个编辑器共享依赖物理单例通过，4 项门禁自测通过；IPC 合约 126 invokes / 129 handlers 通过；Electron 验收脚本语法与 diff 检查通过。
6. **真实 macOS Electron**：生产 renderer、隔离 profile、临时 Vault，5 项检查组通过：source / wysiwyg 各自切换返回保持阅读位置、各自程序化大纲跳转不被旧恢复抢回、两篇临时笔记原文字节不变；renderer pageerror 为 0。轮询与帧观察覆盖既有 90 帧恢复生命周期；未拿 jsdom 合成尺寸代替真实布局。测试结束清理临时实例及 profile，未退出或替换正常用户实例。

结构化结果见 [verification-2026-10-16.json](verification-2026-10-16.json)。原始日志、agy 审查与桌面截图保存在忽略的 `release/vmark-20261016-verification/`、`release/vmark-20261016-reading-smoke/`。可复跑：

```bash
npm run build
node tests/electron/vmark-20261016-reading-smoke.cjs
```

**未验证边界：** Windows/Linux 实机、跨 surface 光标映射、完整 PDF/HTML 导出链、全量漏洞审计、完整 E2E/变异测试，以及所有历史同步映射。本轮没有递增版本、打包安装、提交、推送、打标签或发布，当前安装 App 不会自动包含这次源码修改。原有工作流修改、图片删除、设计手册及两份 AGENTS.md 均未改写。

## 五问复盘

- **更新了什么：** 被动正文同步保留阅读位置；主动跳转可取消旧/待执行恢复；富文本先取得 DOM 焦点再请求定位。
- **为什么更新／取舍：** 接受“光标与阅读视口分离、主动意图优先”的策略；复用原有存储，不引入不适合 Electron 的 Tauri、Tiptap 和双文档模式框架。
- **解决什么：** 阅读被光标抢回、程序导航被延迟恢复覆盖，以及富文本大纲跳转在失焦状态下不滚动的问题。
- **学到了什么：** 状态值、DOM 选区、视口位置是不同事实；单元回归通过仍需真实布局验收，失败时应检查运行库实际执行条件。
- **工程思维归类：** 纠错性维护、状态所有权与异步时序、架构适配、回归测试和证据驱动验证。
