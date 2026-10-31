# Auris 1.0.25 文件栏打磨与本地交付

## 范围

2026-10-31，在既有 main 上整合 Notes 文件栏打磨：当前笔记库标题层级、统一图标和 32px 文件行、局部浅色圆角选中态、低频更多操作、轻量搜索与清空、筛选展开匹配路径及清空后恢复原展开状态、长标题截断与目录路径提示。使用现有六主题令牌，仅在 Explorer 打开文件图标和筛选展开参数，其他文件选择器默认行为不变。

未改 Vault、编辑器保存、Electron 主进程/预加载、Review 或终端逻辑。截图中的“项目”标题入口没有定位，未臆造或修改该部分。参考 VMark 固定提交 `449fbc3e0b25215b3e1e38079ca59999f7a06a2b` 的 Sidebar.css 与 fileTreeFilters.ts，仅参考布局与过滤边界，没有复制上游源代码。

版本由 1.0.24 递增为 1.0.25。当前 main 在本轮前已有四个未推送提交（1.0.23、1.0.24 的实现与安装记录）；用户本轮明确要求推送，因此连同本轮提交一起推送，不包含无关的历史参考图片删除、设计手册和根目录临时 MCP 副本。

## 验证（截至 2026-10-31 11:39 GMT+8）

- 5 个定向 Vitest 文件、79 项通过。
- 全仓 ESLint：0 errors / 18 warnings。
- `npm run typecheck` 的 routes/source/tests/all 全部通过。修正本轮测试中 Testing Library 不支持的 `ByRoleOptions.exact`（字符串 name 默认精确匹配）。
- 原生 helper、Next 生产构建、Markdown postbuild 门禁、runtime/standalone 装配及隐私审计通过。
- macOS arm64 DMG / ZIP 已生成；publish never，不发布 GitHub Release。使用本地 ad-hoc 签名，无 Developer ID 公证；严格深度签名与隐私 entitlements 检查通过。
- 打包 MCP sidecar smoke：模块健康、Notes 读写与工作流调用通过。
- 新增 `tests/electron/notes-explorer-polish-smoke.cjs` 支持 renderer URL 或 `--app`。真实打包 App 使用隔离 profile/Vault，六主题 × 1440/1160 窗口宽度的文件栏几何、长标题、筛选、菜单、Escape、减少动画及笔记原文不变断言均通过，`functionalChecksPassed=true`。
- **严格 UI smoke 最后仍失败**：捕获 React #418 水合告警，不能声称无 renderer error。开发模式堆栈指向未修改的 `DesktopNotesVaultNav`：服务端生成笔记库占位分组，客户端初始桥接分支移除该分组。该组件不在本轮 diff；未扩张本轮范围修复它。生产版同样记录一次告警，已知限制随本地交付保留。

原始构建、测试、UI smoke 日志与截图归档于忽略的 `release/verification-1.0.25/`。本地替换须先备份旧 App，核对安装与构建 app.asar 一致，具体结果将在安装后补充；不清空或迁移用户数据。


## 安装与推送结果（2026-10-31 11:42 GMT+8）

- 产品提交 `1c2e08e` 已推送 GitHub `origin/main`，之前四个本地提交同步到达远端。没有打标签或发布 Release。
- `/Applications/Auris.app` 已替换并启动为 1.0.25。旧 1.0.24 备份：`/Users/apple/Desktop/大学markdown/release/backups/Auris-1.0.24-before-1.0.25-20261031-114134.app`。
- 构建与安装 app.asar SHA-256 均为 `8e0b2baa5ad304e52eee8b51641f0a9f20589edd834185bb6371e5f03ab9292a`；安装位置严格深度签名和隐私 entitlements 检查通过。
- 正常用户实例 PID 41328 保持运行，Renderer、GPU、网络及原生灵动岛进程启动。Review `/` 与 `/notes` 的本地服务均返回 HTTP 200。
- 安装位置再以独立 profile/Vault 运行同一 UI smoke：六主题、两档宽度及全部功能断言通过；最后仍因 React #418 告警严格退出失败，未屏蔽或放宽断言。测试实例已退出，正常用户实例保留。
- 首次安装尝试的脚本误用了 macOS pgrep 不支持的非捕获组正则，导致启动检测误判并自动回退旧包；修正为兼容正则后，重新正常退出、备份、替换和启动成功。首轮回退记录与最终安装证据都保存在 `release/verification-1.0.25/`，没有强制终止应用或清空用户数据。
