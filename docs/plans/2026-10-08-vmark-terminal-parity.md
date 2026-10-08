# VMark Windows 终端体验对齐实施计划

**Goal:** 将 Auris Windows 终端的默认 Shell、首屏启动和日常阅读/操作对齐到 VMark v0.9.94；不以颜色相似替代真实本地 PTY 与交互验收。

**Architecture:** 保留 Electron、node-pty/ConPTY、可信 IPC、Vault cwd 限定和既有输入队列。在 `fix/vmark-terminal-parity-20261008` 独立工作树上，适配 VMark 的默认 shell、系统等宽字体与面板生命周期/控制行为。每个行为先写回归，再实施最小修复；不移植 Tauri Rust 宿主，不变更用户 shell profile 或 CLI 钩子。

**Tech Stack:** Electron / Next.js / React / xterm.js 6 / node-pty / Vitest / Playwright Electron。

**Upstream:** `xiaolai/vmark` tag v0.9.94，SHA `00ad428592dc5e80aab5afc8878a3f8c3bd27930`，ISC；许可全文已在 `docs/vmark-port/UPSTREAM-LICENSE.txt` 并纳入打包。

**Execution:** 用户已明确要求开始修改，由当前 Agent 连续执行，不另开审批或安装流程。独立调研子会话只读，不写源码。

---

## Task 1：默认本地 Shell 与启动基线

Files:
- Modify: `electron/terminal-session-manager.cjs`
- Test: `tests/unit/electron/terminal-session-manager.test.ts`
- Reference: VMark `src-tauri/src/shell_env*`、`src-tauri/src/pty/spawn_policy.rs`

1. 将当前“强制 PowerShell”的测试改为 Windows 尊重有效绝对 `COMSPEC/ComSpec`，否则回退 `SystemRoot/System32/cmd.exe`；明确 shell override 保持不变。
2. 单独运行该文件，确认新默认测试在旧代码上失败。
3. 实施 cmd 默认值；继续保留中文 UTF-8 startup 和真实 PTY 优先级，不用 pipe 伪装成功。
4. 回归默认/显式 Shell、无效路径、Unicode、PTY 候选失败、退出及重启。
5. 在隔离临时 cwd 使用真实 node-pty 测量 first data / 首个 prompt / 执行标记；原始输出不保存为个人数据。2026-10-08 本机旧默认 PowerShell prompt 为约 3747ms，cmd 约 94ms，此数字仅是后端 Shell 单次基线。

## Task 2：首屏加载与输出生命周期

Files:
- Modify: `electron/main.cjs`、`electron/terminal-session-manager.cjs`、`src/platform/desktop/desktop-bridge.ts`
- Create: `electron/terminal-session-catalog.cjs`
- Test: `tests/unit/electron/terminal-session-catalog.test.ts`
- Modify: `src/components/notes-v2/terminal/use-notes-terminal-sessions.ts`
- Create if needed: `src/components/notes-v2/terminal/notes-terminal-runtime.ts`
- Test: `tests/component/notes/notes-terminal-panel.test.tsx`
- Test: `tests/component/notes/notes-terminal-visibility.test.tsx`
- Reference: VMark `src/hooks/useTerminalSessions*`、`src/components/Terminal/createTerminalInstance.ts`

1. 对并行预加载、输出在 resume 前到达、隐藏时完成 import、先后切换会话等情况补回归。
2. 提前准备 xterm 模块；恢复目录与激活过程分离，不启动其他工作区的 dormant Shell，不抢编辑器/查找焦点。自然退出保留只读结束快照，不为显示结果重启进程。
3. 核对 resume 快照与 live output 的交界；新创建 session 在 renderer ready 前的输出不得丢失或重放两次。保持 backend/session 身份、取消和输入排队语义。
4. 将 fit/resize 按帧合并，只有活动且可见、有效尺寸变化时请求后端 resize；显示旧屏幕不能重新创建 PTY。
5. 定向组件回归通过；保持跨 workspace 隔离与最多五个 session 约束。

## Task 3：阅读密度与 VMark 日常控制

Files:
- Modify: `src/components/notes-v2/notes-terminal-panel.tsx`
- Modify: `src/components/notes-v2/terminal/use-notes-terminal-sessions.ts`
- Modify: `src/components/notes-v2/terminal/notes-terminal-presentation.css`
- Create if needed: `src/components/notes-v2/terminal/notes-terminal-options.ts`
- Test: `tests/unit/notes/notes-terminal-presentation.test.ts`
- Test: `tests/component/notes/notes-terminal-panel.test.tsx`
- Reference: VMark `terminalOptions.ts`、`terminalKeyHandler.ts`、`TerminalTabBar.tsx`、`terminal-panel.css`、平台字体栈。

1. 根据已核对源码恢复 VMark Windows 系统等宽字体降级，保留用户显式等宽设置、六主题、13px/1.2/bar 光标与对比度。
2. 会话标签使用程序标题短标签而不是重复数字；底栏对齐清屏/重启/关闭，不添加卡片或多余顶部留白。完整复制六主题的终端阅读底色和前景，而非只对齐 ANSI 槽；不以编辑器强文字色替代终端阅读色。
3. 紧凑模式也可使用终端局部查找、字号缩放与滚动到底部；快捷键只在终端焦点内生效，Ctrl+C 无选择仍交给 PTY，中文 IME 不吞键。
4. 保留 OSC clipboard 等安全边界；不复制上游不适合 Electron 的宿主实现。
5. 原有面板/可见性/clipboard/主题测试与新增行为测试通过。

## Task 4：实际验证与交付证据

Files:
- Create: `tests/electron/notes-terminal-windows-smoke.cjs`（如需要独立 Windows 实测入口）
- Create: `docs/notes-vmark-terminal-windows-2026-10-08.md`

1. `npx vitest run tests/unit/electron/terminal-session-manager.test.ts tests/unit/electron/terminal-session-policy.test.ts tests/unit/notes/notes-terminal-presentation.test.ts tests/component/notes/notes-terminal-panel.test.tsx tests/component/notes/notes-terminal-visibility.test.tsx --maxWorkers=1`。
2. 运行终端/workspace/recovery/IPC 相关组；定向 ESLint、`git diff --check`、`npx tsc --noEmit`（已有全仓问题需如实区分）。
3. `npm run build`，使用隔离 userData / 临时 Vault 启动工作树 Electron，验证 ConPTY、cmd、中文、ANSI、resize、alternate screen、粘贴、切换与隐藏重开同一屏幕；记录 first prompt 和模块加载阶段，不能把 Shell 单次速度写成整个 App 提速。
4. 文档记录固定上游来源、已复用机制、适配边界、实测结果、未验证部分和差异。
5. 不自动推送、发布、安装或修改用户真实笔记。源码修改不等于当前已安装 App 生效；真实升级需用户授权合并/推送并通过同提交 CI 后按 Windows 更新流程执行。
