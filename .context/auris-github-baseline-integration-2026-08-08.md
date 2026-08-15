# Auris GitHub 基线整合结果（2026-08-08）

## 分支与边界

- GitHub 基线：`origin/main` (`6ab235d8f`)
- 隔离分支：`integrate/mac-capabilities`
- 隔离 worktree：`/Users/apple/.config/superpowers/worktrees/大学markdown/integrate/mac-capabilities`
- 分支相对 `origin/main` ahead 7，工作区干净。
- 未合并无共同祖先的 Mac `main`，未修改原始脏工作区，未推送 GitHub，未修改 GitHub `main`。
- 保留 GitHub Notes 欢迎页、Flash workspace、Windows 打包、视频数据隔离与根 `.gitignore`。

## 已提交能力

1. `af2d8ccd5` — 发布包隐私隔离与包体审计。
2. `86d052d59` — Notes recovery、Hot Exit、历史版本、lazy loading、安全 Vault copy/move/trash/restore、sender/origin 验证。
3. `b16c638a6` — MCP 客户端 principal、凭据注册表、跨进程锁、原子配置写入、读写工具风险拆分。
4. `6e382c38b` — Notes 命令总线、可自定义快捷键、原生菜单桥、Markdown 分屏、富文本/源码查找替换、只读/聚焦/打字机模式。
5. `7d47a9f3f` — JSON/JSONL/YAML/TOML/纯文本识别、lazy loading、原始文本编辑、有界结构/schema 预览、结构化文件字节安全保存、Notes Workbench 局部中英文。
6. `c823940b5` — 打包 MCP runtime 闭包补入 `proper-lockfile` 与 `smol-toml`，更新带 principal 的 packaged sidecar smoke。
7. `4caac1e9e` — Notes hook lint 基线对齐。

全部提交均含 `Made-with: Proma` trailer。

## 验证结果

- 最终工作区：clean；`git diff --check origin/main..HEAD` 通过。
- `npm run security:secrets`：通过。
- `npm run build`：通过。
- 结构化格式/编辑/保存/locale 聚焦验证：15 files / 77 tests 通过。
- 最终 MCP/打包聚焦验证：8 files / 114 tests 通过。
- 全测试：288 files passed / 10 failed；2211 tests passed / 26 failed。与初始 GitHub 基线的 26 个失败数一致，失败文件从 11 降为 10；剩余是既有测试债务（旧 Notes page-client 欢迎页假设、移动端 mock、词库/视频/排版/browser approval 等）。
- 全 lint：79 errors / 8 warnings，与初始 GitHub 基线的 79 errors / 8 warnings 一致；改动文件定向 ESLint 通过。
- `tsc --noEmit` 仍有 GitHub 基线测试类型债务；本次改动路径过滤后无新增错误，生产 Next build TypeScript 阶段通过。
- macOS unpacked App 构建成功。
- `.next/standalone` 与 `release/mac-arm64/Auris.app` 隐私审计通过。
- Packaged MCP sidecar smoke 通过：client principal、Notes state、browser read/mutation 分离、Nia workflow、browser workflow、fail-closed session replay 均验证。

## 审查与风险处理

- Notes/Vault 与 MCP 安全移植分别获得 fresh APPROVE。
- 命令/阅读增强审查发现并修复：富文本/源码只读程序化绕过、图片粘贴附件副作用、Unicode case-fold 替换偏移。
- 结构化格式的协作审查因模型额度不可用；父会话完成当前 diff 自审，并额外发现/修复 CRLF 在 CodeMirror 编辑回写时被归一化的问题，增加 CRLF 回归测试。
- Threat model 仍不覆盖具有同用户直接文件系统权限的恶意本机进程。

## 后续

- 尚未 push。需要用户明确批准后，可推送 `integrate/mac-capabilities` 远端分支；不要直接推 `main`。
- 建议后续单独清理 GitHub 基线 lint/type/test 债务，不与本次功能整合混在一起。

## 推送与合并（2026-08-08 21:43 GMT+8）

- 用户批准后推送分支 `integrate/mac-capabilities` 到 `origin`，并设置 upstream 跟踪。
- 推送前校验：fetch 后远端 `main` 无新提交；7 个提交全部含 `Made-with: Proma` trailer；diff 105 文件 / +9372 −554；敏感文件名仅命中 `client-credential-store` 实现与其测试（非凭据本体）；新增行 secret 模式扫描无命中；worktree clean。
- 创建 PR #1：https://github.com/xhslam/auris/pull/1
- 以 fast-forward 方式合并进 GitHub `main`：`6ab235d8f` → `4caac1e9e`，无 merge 提交、无冲突、SHA 不变。
- PR #1 状态 MERGED（`mergedAt` 2026-08-08T13:43:18Z）。
- 远端 `main` 与 `integrate/mac-capabilities` 现同为 `4caac1e9e`。
- 本地 `/Users/apple/Desktop/大学markdown` 的 `main`（`1ccf54523`，含未提交改动）未触碰，仍与 `origin/main` 分叉（ahead 166 / behind 8）。
