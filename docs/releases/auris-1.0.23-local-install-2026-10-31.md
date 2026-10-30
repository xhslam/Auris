# Auris 1.0.23 本地集成与安装（2026-10-31）

工作区原本就在 `main`，fetch 后没有尚未合入的本地/远端开发分支。将待提交的 Notes 文件栏、连续输入同步修复、终端会话侧栏与命名、Windows Notes CI 及图标更新整合为 `6ebacf3ae6a1bec16886ef55f182311fc6f50763`。版本由 1.0.22 升至 1.0.23。

原有设计参考文档、历史参考图片的本地删除，以及与 `electron/auris-notes-mcp-server.mjs` 内容完全一致的根目录临时副本未纳入代码提交；不删除用户现场文件。

## 验证

- 12 个定向测试文件、178 项通过。
- `npm run typecheck` 的 routes / source / tests / all 全部通过。终端测试 mock 的 fit 类型已收窄，消除了原有 TS2348。
- 全仓 ESLint：0 errors、18 warnings；IPC 合约：130 invokes / 133 handlers。
- native helper、Next 生产构建与 postbuild、runtime/standalone 组装和隐私审计通过。
- macOS arm64 DMG / ZIP 打包完成，publish never。没有 Developer ID，使用 ad-hoc 签名；深度严格签名和麦克风/摄像头/自动化 entitlements 检查通过。
- 打包 App 的终端实机 18 组检查通过，含 8 个真实 PTY、侧栏分组/重命名、六主题、目录权限、页面往返和重启恢复；没有 renderer error。
- 打包 MCP sidecar 的模块健康、Notes 文档读写与工作流调用通过。
- 安装位置的隔离 Electron Notes 测试通过：打开现有 Markdown、零间隔连续输入、Mod+S 后核对磁盘、新建 Markdown、右键重命名、确认删除、收起后点击 Notes 展开；确认底部说明文字不存在。测试只使用临时 profile / Vault。

## 安装与回退

- 安装时间：2026-10-31T01:17:13.137304+08:00
- 安装位置：`/Applications/Auris.app`
- 旧 1.0.22 备份：`/Users/apple/Desktop/大学markdown/release/backups/Auris-1.0.22-before-1.0.23-20261031-011713.app`
- 构建与安装 `app.asar` 的 SHA-256 均为 `23c1f417838fc687c6073fc4e630ba7cd1bd213755b4557bacb1b4a1bcc8a1b6`。
- 本地安装证据：`release/verification-1.0.23/installation.json`；Notes 截图/日志与 terminal evidence 位于同目录。
- 未清空或迁移用户数据；本轮没有推送 GitHub、打标签或发布 Release。
