# VMark v0.9.87 更新对 Auris 的适用性与实施记录

日期：2026-09-29。上游基准为 `xiaolai/vmark` 的 `v0.9.87`（`241a25302e35b6a142aa16a7eba531cbf2046a0e`）。本地只读参考仓库 `vmark-upstream/` 已快进到该提交；Auris 的累计差异索引见 `latest.md` 与 `latest.json`。本次没有把 VMark 的 Tauri/WebKitGTK 实现直接移入 Electron。

累计索引仍有 12 条历史映射标为 stale、4,648 条上游文件变化未映射；索引用于发现候选差异，不代表这些内容已被实现。本页只对下表逐项给出结论。

## 事实与适用性

| 贴文提出的变更 | Auris 源码复核 | 本轮处理 |
| --- | --- | --- |
| GFM 自动链接在未闭合 `[` 中重复反向扫描 | Auris 经 `remark-gfm@4.0.1` 使用同一 `micromark-extension-gfm-autolink-literal@2.1.0`；安装包原版仅缓存否定结果 | 对该依赖的 `dev/lib` 和 `lib` 同时应用上游正向缓存补丁；`npm ci` 的 `postinstall` 失败即停止 |
| 单行链式列表标记绕过深度保护 | Auris 的 Markdown 入口此前没有同线容器深度限制；本机 2,000 个标记约 524 ms，但未复现贴文所述栈溢出 | 在 Notes 的 AST、富文本导入、阅读渲染和来源链接扫描前设置 1,000 层上限；超过时返回可读源码或既有拒绝结果 |
| CodeMirror/Lezer、ProseMirror、React 单例身份 | 当前 `package-lock.json` 中受检的 12 个包各有一份物理安装 | 新增 lockfile v3 门禁，重复路径、缺失或无版本均失败；接入 Notes CI |
| `content-visibility` 下滚动沉降 | Auris Notes 未启用该 CSS 虚拟化策略；当前滚动场景不能证明同类位移 | 暂不引入逐帧纠偏器；若以后启用动态虚拟化，需先测量实际落点与用户输入打断 |
| WebKitGTK `blob:tauri` 剪贴板持久化 | Auris 使用 Electron/Chromium，图片粘贴走桌面文件桥接；未发现相同暂存 URI 链路 | 不移植 Tauri/WebKitGTK 专用回退 |
| HTML Trusted/CSP 严重度与 SplitPane 浮层 | Auris 没有对应的 VMark 独立 HTML 预览信任模式或同构 SplitPane | 不新增虚构的警告状态或布局层 |
| 性能增长指数 `<1.35` | 倍增斜率比固定毫秒值更能暴露复杂度，但 JIT、GC、调度仍可改变有限样本的指数估计 | 保留确定性的病态输入回归和补丁应用门禁；未把单次计时斜率设为 CI 硬阈值 |

贴文的“2,000 个标记必然崩溃”“增长指数不会受机器负载影响”“单例锁文件能绝对保证运行时唯一”均不是 Auris 上已验证的结论。当前门禁能检测 npm lockfile 的物理副本，不能证明所有打包边界和动态加载行为。更新贴文所称 90 个提交也与本地 `12c98051e..241a25302` 范围的 142 个提交不同；两者的起点不同，不能直接比较。

## Auris 改动范围

- `src/features/notes/markdown/`：新增容器扫描与限制，`parseNotesMarkdownAst()` 在进入 remark 前调用。扫描识别同一行连续的列表/引用标记，并避开主题分隔线、代码围栏及嵌套容器内的代码围栏。
- `src/features/notes/editor/notes-rich-markdown.ts`：复用已有导入失败回退，严格模式给出 `EXCEEDS_NESTING`。
- `src/features/notes/rendering/remark-renderer.ts`：深度超限时把原始 Markdown 进行 HTML 转义并显示为源码，不执行原始 HTML。
- `src/features/notes/documents/markdown-link-navigation.ts`：来源行解析前应用同一限制，失败时保持原有 `null` 返回。
- `patches/`、`package.json`、`package-lock.json`：锁定 `patch-package@8.0.1` 并在完整安装时应用 micromark 修复。若安装使用 `--ignore-scripts`，补丁不会生效，这是构建前必须检查的边界。
- `scripts/verify-micromark-build.cjs`：生产构建后检查服务端和客户端 JS 是否都包含正向缓存。实机发现 `npm ci` 已修补依赖后，旧 Webpack 缓存仍曾产出补丁前的代码；因此已将此检查设为 `postbuild`，缺失时让构建失败。修正时将 `.next` 移出构建目录并重新编译。
- `scripts/check-singleton-deps.mjs` 与 `.github/workflows/notes.yml`：在 CI 安装后检查单例依赖路径，并对门禁本身做四种情形的单元验证。

这些 `src/features/notes/` 文件是 Notes 的共用层，会同时影响桌面端富文本编辑、阅读和 HTML 渲染；没有改动 Vault 文件读写、Electron 主进程/预加载、API routes、认证或用户笔记内容。上限超出时不会自动截短或改写磁盘中的 Markdown。

## 验证与余留边界

- 全新 `npm ci` 成功，`postinstall` 对 `micromark-extension-gfm-autolink-literal@2.1.0` 应用补丁；检查确认 `dev/lib` 与 `lib` 均含正向缓存。
- Notes 定向 Vitest：6 个文件、58 项通过；依赖门禁自测：4 项通过，12 个受检包各一份。
- `npm run lint` 为 0 error、20 项其他文件 warning；`npm run build` 成功并生成 `/notes` 路由；`git diff --check` 通过。
- `npx tsc --noEmit` 报告 142 项错误，均不在本轮修改的源码与测试路径；因此不能声称全仓类型检查通过。
- 已将版本递增至 `1.0.12`，完成 macOS arm64 辅助程序、Next 生产构建、桌面独立运行时装配与本地 `.app` 打包；包内隐私审计通过。新包经 ad-hoc 签名并通过 `codesign --verify --deep --strict`，安装后的客户端 chunk 与构建产物 SHA-256 一致，且含补丁标记。
- 本机 `/Applications/Auris.app` 已替换、启动；主进程、Renderer 与 Desktop Island Helper 均在运行，`GET /`、`GET /notes` 均返回 HTTP 200。旧版完整备份在 `/Applications/Auris.app.backup-1.0.11-before-vmark-0987`。本地没有 Developer ID 证书，因此这次是本机 ad-hoc 签名包，并未创建 GitHub Release。
- Windows 包与真实长文档交互尚未验收。`MAX_NOTES_MARKDOWN_CONTAINER_DEPTH=1000` 是明确的输入上限，不是 Markdown 规范要求；若真实文档触及该边界，应以样本复核扫描器和错误提示。

Git 提交与推送作为本次交付的最后一步执行；未创建发布标签或 GitHub Release。
