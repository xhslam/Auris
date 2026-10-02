# Auris 1.0.13：VMark v0.9.90 选择性对齐

## 对照依据与范围

本轮固定对照 [VMark v0.9.90](https://github.com/xiaolai/vmark/tree/662d73d46d2ed6294d087ad1ced30223384de170)，而不是跟随移动的 main。用户提供的 `662d73d46` 是版本合并提交；功能来自其之前的提交，包括 [终端记录 11d804838](https://github.com/xiaolai/vmark/commit/11d804838)、[macOS 权限 cdb4b1d3b](https://github.com/xiaolai/vmark/commit/cdb4b1d3b)、Markdown 线性补丁和公式调度队列。报告摘要是线索，源码、测试与实际包是验收依据。

修改前已声明共享 Notes 编辑器层、Electron 终端 IPC 与 macOS 包配置的影响范围。本轮复用既有 PTY、会话管理、Notes Markdown AST、KaTeX、桌面信任检查和主题令牌；没有重建终端或文档框架。没有修改认证、Supabase、Vault 工厂、API routes 或用户 Markdown 内容。

按用户要求，`AGENTS.md` 已加入持续对照纪律：相关实现前、关键改动后与回归异常时检查固定版本上游，先核查本地已有能力，记录复用出处、许可、适配与未验证边界。没有创建定时自动任务。

## 实际补齐

| 保证 | 上游源码 | Auris 实现与差异 |
| --- | --- | --- |
| 依赖安装后可复现 | `patches/mdast-util-find-and-replace@3.0.2.patch`、`patches/mdast-util-from-markdown@2.0.3.patch` | 将同版本线性补丁适配到 patch-package，保留原有 GFM autolink 补丁，升级并固定 markdown-it 14.3.1。安装后及构建前验证版本与五个实际文件的 SHA256；构建后再验证三个补丁标记确实进入 bundle。标记名为 Auris 调整，算法与语义保持对照。 |
| 大量公式按可见区域分批渲染 | `src/plugins/shared/renderQueue.ts`、`nearViewport.ts` | 直接适配上游纯 TypeScript 队列，近处优先、滚动后重排并过期远处任务；增加帧取消与每帧最多八项。每个真实编辑滚动容器共享 observer，1200px 预取、6ms 调度预算；点击编辑与更新仍即时渲染。单项 KaTeX 调用不可中断，所以 6ms 是调度预算，不是硬性帧时限。 |
| 当前终端的助手输出可观测 | `src-tauri/src/terminal_transcript/`、`src-tauri/resources/terminal-transcript-hook.cjs`、`src/components/Terminal/transcriptMarkdownTree.ts` | SessionStart hook 按上游协议适配为 Electron 服务；默认关闭，由用户在终端面板显式开启。保留既有 CLI 配置，仅添加幂等 hook。每个 shell 由主进程绑定随机 token，renderer 不能指定文件路径。仅读 Claude projects / Codex sessions 下受限 JSONL 尾部（2MiB，100 条助手文本），跳过用户、工具与 reasoning 内容。隐藏面板停止轮询，切换会话与停用时取消旧结果。 |
| 系统权限请求具备包级前提 | `src-tauri/app-entitlements.plist`、`Info.plist` | Electron 主应用声明麦克风、摄像头和 Apple Events 用途与 entitlement；helper 保持最小 Electron 权限。afterSign 验收实际 Info.plist 和签名内权限，缺失即失败。系统最终是否授权仍取决于用户及调用程序。 |

队列复用遵循 VMark ISC 许可，完整声明保存在 `docs/vmark-port/UPSTREAM-LICENSE.txt`，并随桌面包交付到 `licenses/vmark-ISC.txt`。终端 hook 的上游协议与出处见本表。

执行记录目前是助手文本预览，不是完整操作审计。表格等内容复用 Notes AST；原始 HTML、图片及本地链接保持惰性，Mermaid 显示代码，尚未接入上游 Mermaid 图形渲染。正常 HTTPS 链接需用户点击才打开。需要支持 SessionStart 的 CLI、Node 与相关 CLI 信任设置；SSH 远端会话不保证绑定。

UI 参考了 [Shape of AI](https://www.shapeof.ai/) 的可控性与状态模式、[Astryx](https://astryx.atmeta.com/) 的可访问性和组合组件思路，继续使用 Auris 现有按钮、主题令牌和折叠终端布局。用户指定的本地 `UI_DESIGN_SYSTEM_GUIDE.md` 未在指定路径或桌面搜索范围找到，因此不能声称已读取该手册。

## 根因与不变量验证

- Markdown 语义对照：用未打补丁的 npm 原版生成 197 份 AST 指纹（含位置与 list spread），开发与生产解析器都通过相同对照；额外验证 5000 siblings 不重复调用 indexOf，及匹配回调顺序、别名语义。新增字节校验的负例确实拒绝被改写的依赖。
- 性能采样：串行进程 CPU 时间、预热、七次中位数、2000/4000/8000 输入；短列表、宽列表、未匹配 siblings 的增长指数约 0.96、1.23、1.00，故意保留的二次控制组约 2.00。详见 `markdown-scaling-2026-10-01.json`。这证明采样范围内的趋势，不证明任意 Markdown 都线性；计时不作为易受硬件波动影响的 CI 硬门禁。
- 广泛回归暴露了旧终端在异步 resume 完成前没有绑定 onData 的输入丢失窗口。将已有 listener 提前，继续使用已有 pendingInput 队列；新增延迟 resume 测试确认输入先等待、完成后发送。
- 首次生产构建虽成功编译，bundle 门禁仍拒绝旧 Next 缓存中缺失的新补丁；移出旧缓存后重新构建，三个标记均通过。这是门禁阻止错误产物的实际证据。
- 默认本地打包没有 Developer ID，已有 ad-hoc 签名缺少隐私 entitlement；afterSign 验收确实失败。仅对本轮本地构建传入 `--config.mac.identity=-`，重新签入权限；未将 ad-hoc 身份硬编码进发布配置。

## 验证与交付

- Notes、组件、Electron 终端/权限与 VMark 回归：137 个文件、1160 项通过。
- 全仓 ESLint：0 errors，保留其他文件已有的 20 条 warning；修改路径定向 ESLint 通过。CJS 语法、diff 空白、桌面 IPC（126 invokes / 129 handlers）、singleton 依赖检查通过。
- 从干净 `npm ci` 复现全部三个 patch 与文件哈希；干净 Next 生产构建、desktop island、assemble 隐私审计、packaged MCP sidecar smoke 通过。
- macOS arm64 1.0.13 包的三个用途声明、实际签名 entitlement 和 `codesign --verify --deep --strict` 通过；DMG 与 ZIP 已生成，使用本地 ad-hoc 签名，没有 Developer ID 签名或公证。
- 在隔离 userData、临时 Vault 与临时 CLI 配置目录启动实际打包的 Electron：`/notes` 加载 1200 个公式，初始 1163 个保持待渲染，滚到末尾后公式呈现；真实 PTY 可输入，JSONL 测试记录的 Markdown 表格成功呈现，终端保留约 386px 可见高度，停用正常。证据见 `desktop-smoke-2026-10-01.json` 与同名截图。这是受控记录夹具，不是实际 Claude/Codex 端到端运行。

全仓 `tsc --noEmit` 未通过：250 项，其中 108 项来自已有 `release/pre-micromark-rebuild-20260929` 备份，另 142 项位于未修改源码/测试；本轮修改路径不在错误清单。生产构建沿用项目已有的忽略 TypeScript build errors 配置，因此不能用构建成功替代全仓类型检查。

尚未验证真实 CLI 生命周期、用户 macOS 权限弹窗、Windows 打包和运行。Auris 当前没有使用上游 content-visibility，终端 restart 原本会创建新 xterm；因此没有移植对应 CSS 尺寸规则或旧鼠标状态清理。PDF 来自独立导出 HTML，不依赖实时编辑器 DOM，不需要为本轮延迟节点增加打印前 flush。

历史映射仍有 12 项待复核，累计差异报告 `latest.md` 不能解释为整个 VMark 已完成对齐。本轮没有替换 `/Applications/Auris.app`、关闭用户原应用、修改真实 CLI 配置、创建 Git 提交/标签、推送或发布 Release。

## 用户授权后的本机安装（2026-10-02）

用户明确要求“本地 app 打包替换”后，正常退出旧应用并安装、启动 `/Applications/Auris.app` 1.0.13。安装验收发现此前 `--dir` 后接 `--prepackaged` 的组合不会触发 electron-builder 的 macOS 更新源生成逻辑：其 `PublishManager.js` 仅在 afterPack 的 target 含 dmg/zip 时生成 `app-update.yml`。改用完整的 `electron-builder --mac --publish never --config.mac.identity=-`，让安装器目标参与打包、生成更新源后再签名；DMG/ZIP 一并重新生成。未手工修改已签名安装包，未上传远端。

最终已安装包的版本、深层严格签名、三个隐私用途与权限，以及 GitHub provider 配置均通过；启动日志确认主窗口加载，首页和 `/notes` 返回 200，实际已安装包的 MCP sidecar smoke 通过。更新源文件缺失的问题已解决；远端检查另返回 HTTP 404，因此不声明 GitHub 自动更新可用。本地 ad-hoc 包仍不具备 Developer ID 公证和可靠就地自动更新的发行保证。

旧版 1.0.12 备份安装过程中在 `/Applications` 创建，随后复查发现被移至废纸篓；移走原因未知。为保留可回退副本，将该备份复制到 `release/backups/Auris-1.0.12-before-vmark-0990-20261002.app`，保留废纸篓原文件及用户数据。
