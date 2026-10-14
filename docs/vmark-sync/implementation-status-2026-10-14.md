# VMark 0.9.99 → Auris 选择性源码同步

日期：2026-10-14。固定上游为 [v0.9.99](https://github.com/xiaolai/vmark/releases/tag/v0.9.99)，提交 `f2bf1b3fce06ca21fe7cd19382bef9c4774d0558`。Auris 基线 `5d972cc`，首次源码验收时为 1.0.17；用户随后授权 main 提交、GitHub 推送与本地 App 替换，交付版本递增为 1.0.18。

## 核查口径

用户复盘的 52 个提交来自 `07c40609d`；Auris 本地参考镜像仍在 `2d3903cb2`，此次镜像实际快进 **64 个提交、181 个文件**。终端的部分功能已在 10 月 8 日对照到 0.9.94，不能将镜像增量全部算作 Auris 新实现。已同时读取原始 diff、Auris 调用链和上游测试；清单保存在 [逐文件增量](incremental-review-2026-10-14.json)。参考镜像回退分支为 `codex/before-0999-sync-20261014`。

累计 `latest.json/latest.md` 已重新生成。历史 manifest 的 12 项比较时间戳保持原样，未把本轮没有验证的映射批量声明为完成。

## 已实现与验证

| 范围 | Auris 最终行为 | 源码对照 |
| --- | --- | --- |
| 终端输入 | 每个 renderer 会话仅一个 IPC write 在途，等待期间合并后续输入。启动缓存、pipe 启动换行、xterm 输入和显式发送共享队列。失败显示原因，避免将可能部分成功的命令重放到新 shell；关闭、自然退出、重启和卸载停止待发输入。 | `src/lib/ptyInputQueue.ts`、`src/lib/pty.ts` |
| 滚动阅读时输入 | 设置 `scrollOnUserInput: false`；直接复用光标附近行范围与 ANSI cell 转换逻辑，镜像使用 textContent，继续由 xterm textarea 处理输入。仅精确 Enter、linefeed Enter 和 Ctrl+C 跳回底部；粘贴和 CSI-u Shift+Enter 保留历史位置。 | `floatingPromptRange.ts`、`floatingPromptCells.ts`、`setupFloatingPrompt.ts` |
| 平台快捷键 | 保留既有 Linux Ctrl+字母 readline 策略；修正 Ctrl+Shift+C 无选区时不发送 SIGINT，以及 Insert 必须匹配精确修饰键。IME 仍由 xterm 原生处理。 | `terminalKeyHandler.ts` |
| 富文本代码围栏 | 对 Auris 自有 ProseMirror formatting keymap 增加代码节点/跨节点选区保护。阻止格式命令将代码改成标题、段落、引用、列表或链接，并消费按键防止下层 keymap 重试；保留 Enter、Tab 等编辑键原有行为。 | `src/plugins/shared/sourceLineNodes.ts`、`src/services/editor/runEditorAction.ts` |
| 第二次启动失败 | 保留 Electron 的单实例锁。窗口恢复失败后记录日志并显示原生错误；非 macOS 且没有存活窗口时退出持锁进程。macOS 无窗口后台生命周期保留。 | `src-tauri/src/single_instance.rs` |
| YAML 契约 | 现有 JS `yaml` 已提供 YAML 1.2 布尔值、重复键拒绝及默认 alias 展开预算。新增回归验证这些事实；不引入 Rust 解析器。现有 workflow/Nia 的禁止 alias 策略保持。 | `src-tauri/src/yaml.rs` |

输入并发缺少显式串行约束与写入失败重放由修改前测试复现；**未复现旧 Electron 终端实机输入乱序**。Auris 的主进程 node-pty write 是同步调用，不等同于 VMark 的 Rust blocking pool，不能用上游缺陷证明本地必然乱序。

直接复用文件附带固定提交、上游路径和完整 ISC 声明；已有许可在 `docs/vmark-port/UPSTREAM-LICENSE.txt`。浮动提示适配仅涉及 Auris 中文文案、专属 CSS 类名、主题与生命周期接入。样式采用 Notes 语义令牌、中性按钮和明确键盘焦点；设计参考 [Shape of AI 的 Controls](https://www.shapeof.ai/) 与 [Astryx](https://astryx.atmeta.com/) 的可访问性、主题及组件职责，结合本地 `UI_DESIGN_SYSTEM_GUIDE.md`，未安装额外 UI 框架。

## 依赖取舍

| 依赖 | 修改前 lockfile → 最终版本 | 说明 |
| --- | --- | --- |
| MCP SDK | 1.29.0 → 1.32.1 | 固定到上游版本；实际 SDK client/server 回归通过。[官方 advisory](https://github.com/advisories/GHSA-6qxp-vccf-f47h) 针对 HTTP OAuth 客户端，不可声称 Auris 的 stdio 服务端曾被证实可利用。 |
| Mermaid | 11.15.0 → 12.1.0 | 升级后真实 Electron 中生成 SVG，既有 diagram/Notes 回归通过。 |
| ProseMirror model / view | 1.25.4 / 1.41.8 → 1.25.12 / 1.42.6 | 对照上游 lockfile，保留 Auris 自有 schema/commands，依赖单例检查通过。 |
| KaTeX | 0.16.45 → 0.16.47 | 升级兼容补丁；仍为唯一物理 KaTeX 版本。`rehype-katex@7.0.1` 明确依赖 `^0.16.0`，本次不强行 override 到 VMark 主引擎 0.19.0。 |

没有照搬 Tauri、Rust quinn-proto/serde-saphyr、Tiptap 或 Graphviz 依赖。Auris 使用 Electron、ProseMirror、JS YAML 与不同预览隔离机制。

## 不适用与保留差异

- Linux WebGL 回显问题属于 WebKitGTK；Auris 已使用 xterm DOM renderer，没有相同 GPU 链路。
- VMark 的 Win32 mutex/message-window 探针依赖其 Tauri 插件内部名称，不能用于 Electron。此次适配的是窗口恢复失败策略，没有证明 Windows 卡死实例可被唤醒。
- VMark 的第一次 Cmd+Q 反馈服务依赖“双按确认”流程；Auris 不具备该确认门禁，不新增退出倒计时或重复确认。
- Mermaid 的 standalone `.mmd` / Markdown 共享 CSS 类污染未出现在 Auris 对应选择器中。真实内嵌 SVG 已验证，未移植上游 WebKit 布局补丁。
- VMark 冒充 WezTerm 并声明 release id，需要 OSC8 链接路由与 CSI-u 行为配套。Auris 继续声明 `TERM_PROGRAM=auris`；本次不虚报能力，也不宣称此项已对齐。
- 脚注 popup、独立 welcome-recents、Rolldown export 静态导入等没有同构路径。本轮不把历史功能差异算作已修复。

## 验证与交付

- 修改前：2 个文件 12 项失败，证实待修复的行为；移植测试最初遇到上游 node 环境与 Auris 全局 DOM setup 不兼容，改为本仓库 jsdom 环境后通过，没有修改生产实现来迁就 mock。
- 最终 Notes/编辑器/终端/VMark/MCP/runtime 组：**163 文件、1,759 项全部通过**。组件的简化 xterm mock 单独隔离镜像 setup；镜像本身有真实 xterm buffer、VT parser 和 DOM 回归，不以空 mock 验证镜像。
- `npm run lint`：0 errors、18 项其他文件既有 warnings；CJS 语法、`git diff --check`、IPC 合约（126 invokes / 129 handlers）通过。
- `quality:singleton-deps`：4 项门禁自测通过，12 个共享编辑器依赖均为物理单例。Markdown 安装补丁与生产 bundle 三项补丁门禁通过。
- `npm run build` 完成。Next 配置跳过类型门禁，因此独立执行全仓 `tsc --noEmit`：**改前/改后均 241 项诊断，没有新增文件/TS 错误码计数**，不能声明全仓类型检查通过。
- 最终生产构建 + source Electron、隔离 profile、临时 Vault 实机：Notes 打开、Mermaid SVG、数学公式、真实 code-fence 快捷键保护、PTY 中文输入镜像、保留历史视口、Enter 回到底部、跳转保持焦点、六主题和临时笔记原文不变，7 个检查组全部通过，无 renderer pageerror。没有读取或改写真实用户 Vault。
- npm audit：57 → **54 条**（6 low、19 moderate、27 high、2 critical），仍未通过完整安全审计。未声称零漏洞。

结构化结果见 [验证记录](verification-2026-10-14.json)，原始日志位于忽略的 `release/vmark-0999-verification/`，最终截图与桌面证据位于 `release/vmark-0999-smoke/`。可复跑：

```bash
npm run build
node tests/electron/vmark-0999-smoke.cjs
```

队列沿用上游未设置总积压字节上限的语义；正在发送的 write 不能撤回，失败不重放意味着可能丢失失败批次。Windows/Linux 本轮仅验证平台策略，没有实机验收。首次源码验收阶段仅更新源码与依赖；当时**没有递增应用版本、替换 `/Applications/Auris.app`、提交、推送、打标签或发布 Release**。用户原有 reference-vmark.png 删除与未跟踪设计手册保持。

交付阶段：1.0.18 arm64 安装包已完成构建；深度签名、终端隐私权限和包内容隐私审计通过。使用 `--app release/mac-arm64/Auris.app` 的真实包验收 7 组通过、无 renderer pageerror。MCP smoke 现从临时 Vault 笔记启动，明确挂载 Notes facade；不依赖默认首页偶然提供 Notes 服务。完整工作区 secrets 扫描命中忽略的旧构建示例与上游测试占位串，待提交 Git index 的完整树独立扫描通过。最终安装与推送证据将在交付后补充。

打包 MCP 模块健康检查、Notes/Browser 状态、Nia 与 Browser workflow 已通过。首次联动运行 App 在 Notes 状态返回前退出（exit 0），临时日志已被脚本清理，原因尚未证实；保留日志的重跑通过。安装后会再次核验联动，不把重跑通过解释为已经证明首次退出根因。
