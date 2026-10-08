# Auris Windows 终端：VMark 默认体验对齐

日期：2026-10-08。分支：`fix/vmark-terminal-parity-20261008`，基线：`f14252311ae14981acd81f2a04d97e101c7e239b`。

## 目标与来源

本次针对用户提供的两张 Windows 截图，修改终端启动、阅读与交互，而不是只替换颜色。上游固定为 [xiaolai/vmark](https://github.com/xiaolai/vmark/tree/00ad428592dc5e80aab5afc8878a3f8c3bd27930) v0.9.94，提交 `00ad428592dc5e80aab5afc8878a3f8c3bd27930`。

参考与适配范围：

- `src/components/Terminal/terminalOptions.ts`、`terminalKeyHandler.ts`：终端密度、局部快捷键与缩放。
- `src/components/Terminal/createTerminalInstance.ts`、相关生命周期模块：保留屏幕、输入与显示/尺寸管理。
- `src/utils/fontStacks.ts`：Windows 系统等宽字体降级。
- `src/components/Terminal/TerminalTabBar.tsx`、终端 CSS：程序标题标签、20px tab、24px 操作目标、40px 会话栏。
- `src/theme/buildXtermTheme.ts`、`src/theme/themes/*.ts`：六主题 ANSI、选择/滚动条，以及实际阅读底色和正文色。
- Tauri PTY/Shell 策略：Windows 有效绝对 COMSPEC 优先，否则系统 cmd。

上游为 ISC。许可全文保留在 [`docs/vmark-port/UPSTREAM-LICENSE.txt`](vmark-port/UPSTREAM-LICENSE.txt)；适配的 options/CSS/主题代码标注固定来源。保留 Auris 的 Electron/可信 IPC 与 node-pty，不复制 Tauri 宿主来制造一个不可运行的混合实现。

## 已修改的启动与会话链路

### 1. 默认 cmd，而非强制加载 PowerShell profile

Windows 默认使用有效、绝对的 `COMSPEC/ComSpec`，环境变量名大小写不敏感；不满足条件时使用 `SystemRoot/windir` 下的 `System32/cmd.exe`。保留 UTF-8 初始化。底层 manager 的显式 PowerShell override 仍可用，但公众 App 的原有 IPC 并没有自定义 Shell 设置。

不修改用户的 PowerShell profile、conda、CLI 钩子或系统默认终端。正在运行的旧 PowerShell 不被强制替换。恢复文件中的旧 Shell 字段来自先前的隐式默认值；选中一个 dormant tab 时，会按当前可信创建策略重新建立 cmd，不执行恢复文件里的任意可执行路径。

### 2. 恢复目录与进程分离

以前首次 `list()` 会同步启动所有恢复 Shell，再由 renderer 加载 xterm。现在：

1. `terminal-session-catalog.cjs` 只枚举恢复描述符和已有 live 会话，不启动 dormant Shell。
2. dormant record 的 `backend` 为 `null`，不能把它当作已经验证的 PTY。
3. 当前选中的 tab 才激活；其他工作区的恢复描述符继续保留。
4. PTY 包在真正创建会话时才加载。
5. Notes 挂载后预热 xterm/addon 代码；不预建隐藏进程，也不抢编辑器焦点。首次 list 与代码加载并行。

保留 workspace 隔离、每个工作区最多五个 tab、可信 cwd 策略，以及隐藏后重开同一个屏幕/PTY 的行为。关闭最后一个 tab 会隐藏面板，重开时建立一个新会话，不在关闭时立刻反弹创建。

### 3. 输出和退出交界

数据事件带单调 `sequence`，快照带 `outputSequence`。renderer 先写快照，再写未覆盖的 tail；边界在 attach 完成后仍保留，避免晚送达通知重复写入。

attach 期间尚不知道快照边界，因此不裁剪该段待接入输出，防止丢失 ANSI/alternate-screen/bracketed-paste 前缀。未附着后台 tab 的普通恢复历史继续沿用 200,000 字符上限，不能将它描述为完整终端状态序列化。

main/manager 为自然退出保留最多 50 个只读结束快照，不把结束进程存成 running 恢复会话。未附着 tab 退出后仍能阅读最后结果；显示结果不自动启动 Shell，按键/显式重启才创建新会话。晚到 resume 不将退出状态复活。

## 阅读与日常操作

| 项目 | 本次行为 |
| --- | --- |
| 默认字体 | Windows `ui-monospace, monospace`；非默认的显式等宽字体栈保留 |
| 密度 | 13px，行高 1.2，normal/bold；8–32px 的终端独立缩放，步长 2px |
| 光标与历史 | bar 光标，5,000 行回滚，最小对比度 4.5 |
| 颜色 | 六主题 96 个 ANSI 槽保留；底色、阅读前景、光标与选择/滚动条对照上游 |
| 夜间阅读 | `#23262b` 底色、`#d6d9de` 前景，不继续使用更黑的 App 底色和编辑器强文字色 |
| 控制栏 | 20px/11px tab、24px 操作目标、2px 间距；OSC 程序标题首个 grapheme 标签 |
| 查找 | 紧凑面板也支持终端局部查找；Escape 关闭并回到当前终端 |
| 缩放 | Windows Ctrl++ / Ctrl+- / Ctrl+0；仅缩放终端，不改变笔记字号 |
| 复制与中断 | 有选择时 Ctrl+C 复制，无选择时交给真实 Shell/前台程序 |
| 粘贴 | 通过 `terminal.paste()`，保留程序开启的 bracketed-paste 包装 |
| 焦点 | 重开定位到活动 textarea；异步 attach 不抢走已打开查找框的焦点 |
| 尺寸 | RAF 合并 fit；100ms 防抖，只发送活动、可见且变化后的几何，处理 resize 拒绝 |

IME composing/229 事件不触发自定义 UI 快捷键，由 xterm 原生 composition 路径处理。此项有键策略回归，但没有自动化实际 Windows 输入法候选窗验收。

## 验证与证据

### 已完成的行为验证

- 初轮旧实现的 Windows 默认 Shell 测试和新 snapshot/退出/标题/查找测试，分别在修改前失败，之后转绿。
- 独立只读审查发现的未附着退出、close-last/reopen、异步抢查找焦点与待接入输出裁剪问题，已补针对性回归并修复。
- 最终定向回归：**13 个文件、143 项通过**，包含六主题阅读底色、前景优先级与本轮全部生命周期改动。
- source Electron 的隔离 Windows smoke 最终完成 **14 个检查组，exit 0**：真实 node-pty/ConPTY、cmd、stdin/stdout TTY、Unicode/ANSI、OSC 标题、光标/擦除/alternate-screen、隐藏重开同一屏幕/PTY、中文多行括号粘贴、原生子进程几何、Ctrl+C 中断、查找/缩放、双会话焦点、六主题实际 xterm 背景/前景、close-last/reopen、其他工作区 dormant 与笔记不变。
- IPC 合约通过：126 invokes、129 handlers。定向 ESLint、CJS 语法及 `git diff --check` 通过。生产构建及三个 Markdown 补丁后验通过。

最终证据保存在本机会话工作台 `terminal-reading-win-complete/evidence.json` 与 `notes-terminal-windows.png`。六主题逐一切换并断言真实 DOM renderer 的 RGB 值；夜间最终截图为 `rgb(35, 38, 43)` / `rgb(214, 217, 222)`，与上游阅读 tokens 一致。

测试工具额外修正了退出标记与下一 CMD 输入之间的 readiness 竞态：按真实 backend 输出确认新 prompt，避免将命令发给正在清理 stdin 的子进程；查找滚动位置不作为 Shell readiness。Windows OSC 标题先独立去除，避免 Node VT-strip 对盘符标题的解析残留被误作正文。

### 性能测量的口径

本机 2026-10-08 单次真实 Shell 后端基线：旧 PowerShell 首提示符约 **3747ms**，cmd 约 **94ms**。这不是完整 App 启动测量，也不是 VMark App 的冷启动对照。

阅读色校准前一次成功 source-Electron smoke：点击到已渲染 cmd 提示符 **546ms**，首次数据约 **385ms**。最终包含六主题校准的成功 smoke 为 **1631ms** / **1471ms**，重复运行存在波动，不能承诺固定 0.5 秒启动。这些都是隔离 profile、已构建资源和当前机器状态下的单次观察，既不是整 App 冷启动对照，也不能与 Shell 后端口径混算提速倍数。

VMark Windows 首次 login PATH 探测也可能运行 PowerShell profile 并缓存结果。因此不能泛称“VMark 从不加载 PowerShell”；本次明确修掉的是 Auris 强制默认 PowerShell和枚举时启动全部旧 Shell 的路径。

### 不能写成全仓绿色的检查

- `npx tsc --noEmit`：原 main 基线 139 个诊断，本分支当前 133 个。按文件/TS 错误码计数无新增，修正了被修改的终端 manager 测试的 6 个 mock 类型问题；其他测试 fixture 类型问题没有在本任务里整体修补。
- `terminal-transcript-service.test.ts`：Windows 符号链接权限测试失败，原 main 可复现；worktree 还出现已有异步 forget/read fixture 的失败。服务与测试文件均未改，和 main 的 SHA-256 相同。该组不能冒充通过，也没有通过启用开发者模式/提升权限改变安全边界。

## 可复跑入口

先完成生产构建，再运行 Windows smoke。默认 smoke 自己启动并关闭本地 Next 服务；`--dev-url` 可复用一个已经启动的测试服务。

```bash
npm run build
node tests/electron/notes-terminal-windows-smoke.cjs --out release/terminal-windows-smoke
```

测试仅使用新建隔离 userData 和临时 Vault。Clipboard read 使用该测试 App 内的 IPC fixture，不读取或覆盖用户系统剪贴板。结果包含 `evidence.json`、原生窗口/viewport/TTY 尺寸和截图。失败也保留证据；它不更改真实笔记、个人 Shell 配置、已安装 App 或 CLI 钩子。

异步 IPC 等待使用 Playwright `expect.poll`，而非将 async predicate 传给 `waitForFunction` 后误把 Promise 的 truthiness 当成验收成功。协议单测首次 dynamic-addon 导入的等待预算为 5 秒，它测试序列正确性，不用测试机器瞬时负载定义 1 秒性能 SLA。生产构建和全仓 tsc 顺序执行，避免重建 `.next/types` 时的缺文件竞态。

## 实现边界与交付状态

- 保留 Electron 和 xterm DOM 渲染路径。没有声称复制了 Tauri/WebView 宿主、上游 WebGL/atlas 补丁或逐像素 GPU 光栅化。
- 没有移植 VMark 的全部终端设置页面、文件链接 addon、tab 改名/拖拽排序、OSC 52 clipboard 权限选项。默认阅读、启动和本次验收的日常终端链路有明确对照；不能把上述未移植功能说成已经拥有。
- 运行中的 xterm 保留完整交互状态；跨 renderer/进程重建的 raw ANSI 恢复尾部仍有既有截断限制，不是持久化整个 TUI 状态。
- 本记录生成于独立分支的源码验收阶段，当时尚未合并、提交、推送或替换本机 Auris。后续集成状态以 GitHub `main` 和同提交 CI 为准；本机安装状态以维护 updater 的报告、收据和实际文件哈希为准，不能用本记录代替安装验收。
- 真正安装需按 [`windows-local-update.md`](windows-local-update.md) 完成合入远端与同提交 CI，随后维护 updater 备份、安装和验收；不能因本次 source-Electron smoke 通过就跳过这些步骤。
