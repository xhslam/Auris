# Notes CI：终端启动边界输入丢失修复

日期：2026-10-05。基础提交：`7d1aee146237e4c9f0cbe3438f22e4d64c397a88`。

用户提供的失败任务：[Notes #19](https://github.com/xhslam/Auris/actions/runs/37274124097/job/111647266755)。通过 computer use 查看已登录 Chrome 的 Actions 注解，随后使用 `gh run view --log-failed` 核查完整日志：checkout、npm ci、依赖身份、lint 与 MCP health 均成功；20 文件 / 228 测试中唯一失败是终端 pipe 换行测试，实际调用只有启动用 `write(id, "\n")`，没有 `echo READY`。因此不是 pull/推送失败。

## 根因与反例验证

`markSession()` 原来在 React `setSessions()` updater 内更新 `sessionsRef.current`。该 updater 可以延后执行。后端 resume 返回后，启动流程先请求 running 状态再消费 pendingInput；消费之后、React 提交之前到达的 xterm 输入仍读到 starting，从而再次入队。启动流程已经消费过队列，后续没有新的消费者，命令不会落到后端。

本机原始单用例与整文件都可通过，说明不能把一次绿灯当作时序已验证。新增受控回归让真实组件的输入订阅在启动 prime write 和恢复队列 write 期间立即收到新命令：旧源码稳定失败 3 项，症状与远端一致；没有通过删掉断言、固定 sleep 或跳过测试消除失败。pipe 与 PTY 均会受影响，换行转换本身不是根因。

## 最小修复

`src/components/notes-v2/terminal/use-notes-terminal-sessions.ts` 在同步代码中先 patch 现有 ref，再请求 React 状态更新；React updater 只计算状态，不再承担输入路由所需的即时 ref 修改。既有启动输入队列、重启、关闭与 backend normalization 保留。

既有换行测试等待实际异步 write 完成，而不把 resume mock 被调用当成恢复完成。新增 3 项检查命令不会丢失或重复：prime 之后的输入、pipe 恢复队列期间的新输入、PTY 恢复队列期间的新输入。

对照固定 VMark `2d3903cb2887a7c6a7a8df7b814f14b745bc2415` 的 `src/components/Terminal/terminalSessionInputWiring.ts` 与 `useTerminalShellLifecycle.ts`：上游回调读取即时 session entry，spawn 后直接发布 PTY 引用。Auris 保留 Electron IPC、pipe fallback 及已有启动输入缓冲，不复制 Tauri PTY API 或上游丢弃启动输入的产品行为。

`.github/workflows/notes.yml` 改为执行全部 Notes unit/component 与 VMark 回归，并保留原先 5 个 Electron/MCP 测试文件；pull_request/push 触发路径新增 `tests/unit/vmark/**`。这样 CJK、Markdown fidelity、BOM、math 与 MCP 保存回归也进入远端门禁。

## 验证

- `npx vitest run tests/component/notes/notes-terminal-panel.test.tsx`：24 项通过；旧源码的 3 项新回归失败，修复后通过。
- 新工作流同命令：150 文件 / 1620 项全部通过。
- `npm run lint`：0 errors / 20 项原有 warnings；定向 ESLint 和 diff check 通过。
- MCP health 成功，依赖单例门禁 4 个自测和 12 个核心依赖检查通过。
- `npm run build` 及所有三个 Markdown patch 产物检查通过。
- `npx tsc --noEmit`：仍有 248 项错误，修改的 hook/test 没有报错；未修改全仓类型错误基线。
- 通过源码桌面 launcher、当前生产构建和隔离临时用户目录打开 `/notes`；computer use 打开实际终端，精确粘贴 `printf 'AURIS_TERMINAL_%s\n' CI_OK` 并执行，截图确认独立输出 `AURIS_TERMINAL_CI_OK`。临时笔记正文不变，测试实例关闭且临时目录清理。

本轮未修改 Electron main/preload、用户真实笔记、安装包版本或 GitHub Release。远端 Ubuntu 验收以修复提交触发的新 Notes Actions 运行结果为准；原失败运行是不可变历史记录。

## 远端验收结果

修复提交 `50f518fb181b82f7d73e34d445cf94b4c9f1b498` 已推送 main。Ubuntu Notes [运行 #20](https://github.com/xhslam/Auris/actions/runs/37281656064/job/111670894748) 完成且结论为 success；computer use 刷新 GitHub 页面确认 completed successfully，全部步骤通过。150 个文件 / 1620 项测试全部通过，终端组件 24 项通过。原失败运行无需重跑或删除，作为修复前证据保留。
