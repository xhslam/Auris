# VMark v0.9.92 → Auris 1.0.17 选择性同步

## 固定版本与范围

上游固定为 `2d3903cb2887a7c6a7a8df7b814f14b745bc2415`，已核对 [正式 v0.9.92 Release](https://github.com/xiaolai/vmark/releases/tag/v0.9.92)。内置 `vmark-upstream/` 从 `fa785a7008999bc2077889a9faaca0175f122cee` 快进到该提交，工作树干净。相对 Auris 上次比较点，本次跨越 **632 个提交、3383 个变更文件**；附件复盘的 630 个提交采用 `ab947c650` 起点，两个数字的基线不同。提交数不等于新增功能数。

`latest.json` / `latest.md` 已重新生成，仍使用原始 provenance 基线，累计差异不能当作本轮增量。历史 **12 项 stale mappings** 的比较版本未批量推进。[逐文件增量清单](./incremental-review-2026-10-04.json) 将未逐一审查的文件明确标为 `not-individually-reviewed`。

本轮修改共用 Notes 的格式化、富文本转换与保存适配，沿用 Electron 桌面端现有框架。初始已有的公式修复、测试与文档保留并参加回归；没有把它们记成本轮新增实现。没有修改主进程、预加载、认证、Supabase、Vault 工厂或 API routes。

## 已实现与源码依据

| 领域 | Auris 改动与验证边界 |
| --- | --- |
| CJK 格式化纯逻辑 | 更新原有 formatter，不另建引擎；复用上游 30 份源码/类型适配文件，包含线性扫描、Unicode 文字分类、技术子串保护、段落内引号/括号配对与合法 fence 检测。货币/单位只收紧 ASCII 同行空格，保留换行和不换行空格；长英文和空格串不再触发原来的重复扫描。保留 Auris 的设置默认值、日志/表格拆分适配与 `formatSelection` / `formatFile` 安全别名。 |
| Markdown 富文本往返 | 通过既有 MDAST → HTML → ProseMirror 桥传递完整代码 fence info 与 list spread；列表保留 `tight` 和有序起点。终末/连续 hard-break 节点用受限 `<br>` 表达，并在导入时识别该标签；一般 raw HTML 仍沿用旧的丢弃策略。带元数据的 fence 预览只取第一个语言 token。 |
| 惰性解析 | 参考上游 `src/utils/htmlToMarkdown.ts`，将 Auris 自己的 Markdown 富文本 HTML 转换放入无 browsing context 的独立文档。ProseMirror 1.41.8 的剪贴板 `readHTML()` 已使用 `createHTMLDocument()`，因此没有重复重写粘贴框架。独立文档是解析阶段的防副作用措施，不能当作对最终插入 DOM 内容的通用 sanitizer。 |
| UTF-8 BOM | 在 `saveNoteToVault()` 从已有磁盘基线/输入恢复 BOM，扫描时暂时去掉前缀以保留 frontmatter 保护。新文档不无故添加 BOM；已有前缀不重复添加。Node 的 UTF-8 读取与 VMark 会剥除 BOM 的 Tauri 文本读取不同，没有照搬字节解码框架。本轮保证针对该共用 Vault writer，不宣称所有外部文件写入入口已覆盖。 |
| MCP 保存 | 复核发现 `workspace.save` 以前只返回捕获内容的 revision。现在通过 facade 调用已有 `handleSaveDocument()`，复用 live buffer、保存队列、磁盘基线、历史与冲突处理；等待 writer 成功后返回实际 persisted source 的 revision。失败/缺失/冲突、writer 尚未就绪以及已关闭但仍缓存的文档均不确认保存。MCP document.write 仍走已有审阅/缓冲更新流程，本轮没有改写所有 MCP 写入语义。 |

逐文件来源、完整 SHA、许可证与本地差异见 [CJK provenance](./cjk-provenance-2026-10-04.json)。完整 ISC 通知继续保存在 `docs/vmark-port/UPSTREAM-LICENSE.txt` 并随桌面包交付。上游保存对照入口为 `src/services/persistence/saveToPath.ts`、`src/services/files/saveAllQuit.ts`；格式往返对照入口为 `src/utils/markdownPipeline/serializerBreak.ts` 与 parser/serializer。Auris 的 ProseMirror schema 与 VMark Tiptap schema 不同，因此格式桥为行为适配，没有声称逐字复制上游 serializer。

## 验证

可复现命令：

```bash
npx vitest run tests/unit/notes tests/component/notes tests/unit/vmark
npm run lint
npx tsc --noEmit
npm run quality:singleton-deps
node tests/electron/notes-inert-html-smoke.cjs
npm run desktop:island:build
npm run build
npm run desktop:assemble
npx electron-builder --mac --publish never --config.mac.identity=-
node scripts/verify-macos-terminal-permissions.cjs release/mac-arm64/Auris.app --require-signature
codesign --verify --deep --strict release/mac-arm64/Auris.app
node tests/electron/packaged-mcp-sidecar-smoke.cjs --app release/mac-arm64/Auris.app
node tests/electron/notes-rich-fidelity-smoke.cjs --app release/mac-arm64/Auris.app
```

先确认旧实现失败，再修改：货币/跨行格式化定向组 59 项失败；代码 fence metadata 与列表 tight 契约失败；BOM 保存失败；MCP 保存没有等待 writer/错误状态仍报告成功。移植测试第一次因全局 setup 依赖 DOM 而在 Node 环境执行 0 项，随后改为 Auris 现有 jsdom 环境；这次零用例错误没有被记为通过。

Chromium 检查直接执行生产 `notes-inert-html.ts`，4 项检查通过：旧的 live-document detached element 确实请求图片并执行 onerror，惰性解析则保留可解析内容且没有请求/处理器/script 执行。该浏览器测试覆盖生产 helper，单元测试另确认真实 rich importer 使用它。

全仓 `tsc --noEmit` 仍未通过：248 项错误；筛查本轮生产源码、新增测试与移植文件没有报错。没有取得任务开始前的完整 tsc 基线，因此不把这个观察写成“整个仓库 0 new errors”。

最终测试、签名、安装与实机结果记录在本目录的 `verification-2026-10-04.json`、`desktop-smoke-2026-10-04.json`、`packaged-smoke-2026-10-04.json` 与 `installation-2026-10-04.json`。

## 未宣称完成的领域

上游脚注 popup/store、`content-visibility` 与 SplitPane 不是 Auris 现有同构实现，脚注完整功能差异继续保留。保存全部并退出涉及 Electron 关闭协调与多窗口状态归属；本轮未修改主进程，没有把热退出恢复或已有 save-all 误当作上游跨窗口退出保证。终端进程许可、预览 SVG 样式隔离、所有外部写入的 IME 协调、第三方许可 UI、更新说明 UI、供应链/ADR/文件头门禁等仍需逐项独立复核，不能从本次 3383 文件清单推导已经对齐。

MCP 保存返回的是已持久化快照的 revision；随后继续编辑会产生新 revision，并不保证全局静止。独立解析阶段无网络请求也不禁止用户之后有意查看图片。列表标记可以规范化为 `*`，格式往返保证已覆盖语义与关键 metadata，不承诺 Markdown 字节完全一致。Windows/Linux 桌面实机、本轮所有上游审计项和公开 Release 均未验证/执行。

## 本机交付

145 个测试文件、1548 项回归全部通过；全仓 ESLint 为 0 errors / 20 warnings。生产构建、桌面组装、包隐私审计、签名权限检查与已安装包严格签名验证通过。版本从 1.0.16 递增至 1.0.17；本地 macOS arm64 包使用 ad-hoc 签名，没有 Developer ID 公证或公开发布。

已按用户授权替换 `/Applications/Auris.app`，旧包保存在 `release/backups/Auris-1.0.16-before-vmark-0992-20261004-194128.app`。安装后在独立临时用户目录与测试笔记上实际打开 Notes、富文本输入并保存，确认代码完整 metadata、松列表和带 metadata 的 Mermaid SVG 均保留；临时测试数据已清理。安装包的 authenticated MCP sidecar / Nia / workflow smoke 通过。随后正常启动用户应用，日志确认窗口 ready-to-show 和首页加载，实际 `/notes` 返回 200；用户笔记未用于写入测试。

正常启动时既有 GitHub 自动更新源 `xhslam/auris/releases.atom` 返回 404，本地安装与笔记 smoke 均不依赖该网络源。没有据此修改 updater 或公开发布版本；后续远程自动更新需要另行核查仓库可见性和发布源。
