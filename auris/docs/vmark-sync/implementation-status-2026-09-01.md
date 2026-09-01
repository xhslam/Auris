# VMark v0.9.51–v0.9.59 选择性同步实施状态（2026-09-01）

> 执行依据：`feature-gap-report-2026-09-01.md`
> 上游核对点：`xiaolai/vmark` `v0.9.59` @ `47161298299a887a349003843b938f2c19dca261`
> 策略：只实施报告中经验证、与 Electron/Next.js 架构无关的 P0/P1 行为保证。

## 已实施

### 1. Markdown 媒体源安全与刷新（P0）

- 图片解析仅放行 `http:` / `https:`、明确的栅格图 base64 `data:image/*` 与 Vault 内安全相对路径。
- 拒绝 `javascript:`、`file:`、`blob:`、未知协议、protocol-relative URL、绝对路径与 `..` 越界路径。
- Vault 变化会推进单调 media reload key，仅给 `shadowing-media://vault/` 追加版本参数；CodeMirror decoration 会在文档内容未变时主动重建。

### 2. 外部文件变更顺序与冲突二次校验（P1）

- Vault refresh 统一进入 Promise chain，后发刷新不会越过先发刷新发布旧 snapshot；单次失败不会阻断后续队列。
- Keep/Reload 执行前会立即重读目标文件，重新核对 dirty、文档 path 与最新磁盘内容。
- 若对话框打开后磁盘再次变化，旧决策不会执行，对话框改为展示最新远端版本。

### 3. Workspace 终端会话与隐藏不终止（P1）

- renderer、desktop bridge、Electron session manager 与 recovery descriptor 共同持有 `workspaceInstanceId`。
- 可见 session、自动创建、编号与 5 会话上限按当前 Workspace 计算；旧的无 owner session 作为 window-scoped 兼容会话。
- 记住每个 Workspace 最后活跃 session。收起 Terminal pane 只 dispose xterm view，不 kill PTY；显式关闭/重启 session 仍会 kill。
- 主进程为每个存活 session 保留最近 200,000 字符，重新打开面板时回放；recovery 持久化 owner，不持久化输出内容。

## 验证

- 定向 Vitest：13 个文件、125 项通过（媒体解析/刷新、Vault 串行刷新、冲突完整性、Terminal policy/manager/recovery/scope/panel、Notes Workbench）。
- 相关 TypeScript/TSX 定向 ESLint：通过，无 warning。
- `node --check`：三个 Terminal Electron CJS 文件通过。
- `npm run build`：Next.js 生产构建与 TypeScript 检查通过，22 个静态页面生成成功。
- `git diff --check`：通过。

## 边界与未扩大项

- Workspace Rail 的「关闭」当前只是从 rail 临时移除，不是真实销毁 Workspace，且 refresh 后会恢复；因此本轮没有把它错误解释为「kill 该 Workspace 全部 shell」。
- 没有移植 Tauri/WebKitGTK/Linux print/StrictMode ready/browser chrome 几何等平台专属代码，没有启动 P2 全局 UI primitive 重构。
- 未创建 commit，未推送远端，未改写用户词库与笔记数据。
