# Notes 展示体验对照 VMark（2026-10-08）

本轮由用户要求先下载、通过 computer use 实际体验 VMark，再修改 Auris Notes。范围是终端侧栏、正文排版与 Markdown 表格；不替换编辑器、PTY、保存或 Vault 框架。

## 参考与实际体验

- 官方 [VMark v0.9.94 Release](https://github.com/xiaolai/vmark/releases/tag/v0.9.94)，固定提交 `00ad428592dc5e80aab5afc8878a3f8c3bd27930`（通过官方 tag ref 核验）。
- 下载官方 Apple Silicon App 与同版本源码至 `/tmp/auris-vmark-reference/`。App 签名为 `Developer ID Application: HANDO K.K. (Y53RSUA3SM)`，附有 notarization ticket。
- App archive SHA-256：`2f5705b2c069ec97e37c9c1f2d6728c6cdc53a264ef4b28be6a918fea5dc9474`；源码 archive SHA-256：`e59f4ab7421a8f83d38d5b95fdb657ba6a3d5ef52348bfbd3ef83147fa524ac9`。
- 使用 `cua_repl` 打开官方 VMark、临时中文 Markdown 样本、终端；实际运行 `tty`（输出 `/dev/ttys000`）和 ANSI 输出，观察长短列与表格横向滚动。运行临时 alternate-screen 程序，收起再打开终端后原屏幕仍在，继续回车可返回 shell。
- 使用 `cua_repl` 打开本机 Auris Notes，实际观察到三列表格等宽、过高行，以及恢复出的终端侧栏持续空白。没有编辑该真实用户笔记。
- [Shape of AI](https://www.shapeof.ai/) 的 Controls、Modes 和 [Astryx](https://astryx.atmeta.com/) 的组件组合、主题令牌与可访问性作为交互基准。用户指定的旧知识库 `UI_DESIGN_SYSTEM_GUIDE.md` 路径在本机不存在，因此不能声称读取；本轮使用现有 PRODUCT.md、主题与组件契约。

## 已确认的机制

1. `prosemirror-tables/style/tables.css` 引入 `table-layout: fixed`，Auris 原表格 CSS 未覆盖且没有独立滚动 NodeView。浏览器实测 950px 三列表格各列均为约 316px。
2. Notes minimal 模式的高优先级 CSS 强制富文本 `19px / 1.78`、阅读组件 `22px / 1.72`；设置变量为 `24px / 2` 时也未生效。标题、编辑器与正文还使用不同的固定宽度。
3. Auris 已接真实 PTY/xterm，Agent 执行记录默认关闭。问题不能归因为假终端。异步恢复会话后用旧的空 active session id 调用显示逻辑，可把刚创建的 xterm 容器隐藏。
4. 原侧栏收起会销毁 xterm，重开重放受限的原始输出；这无法保证全屏程序的完整屏幕恢复。显示层还包含 52px 顶部空白与重复右侧留白，未提供完整 ANSI palette 或活主题同步。
5. 真实长标题与右侧终端同时出现时，原来各自绝对定位的底栏簇没有共同宽度预算。生产包专项还检出旧终端偏移在新相对定位簇上重复生效；按照编译后实际 CSS 与按钮中心命中结果修正覆盖优先级，不能仅以源码 import 顺序判断。正常 1160px 窗口、展开侧栏且包含待复核提示时，底栏实测会换行到 98px。

## 复用与适配边界

VMark 使用 ISC License，完整版权与许可保留于 `docs/vmark-port/UPSTREAM-LICENSE.txt`，打包配置已将其纳入应用。

- `src/plugins/tableScroll/plugin.ts`：直接适配 `TableScrollNodeView`，换为 Auris 已有 ProseMirror imports 与 scoped class，保留 `contentDOM`、节点更新和 mutation 过滤。Auris 的表格命令、选择与 Markdown 序列化继续使用既有实现。
- `src/components/Editor/editor.css`：借鉴 `table-layout:auto`、`width:max-content`、独立横向滚动、紧凑 cell padding 与显式行高。保留 Auris 六主题语义令牌。
- `src/theme/buildXtermTheme.ts`、`src/theme/themes/*.ts`：复用完整 ANSI palette 与颜色映射逻辑，背景/文字消费 Auris 现有主题。
- `src/services/fonts/verifiedMonoStack.ts`：复用等宽字体实测与降级逻辑。
- `src/components/Terminal/terminalOptions.ts`、`terminal-panel.css`、`TerminalPanel.tsx`：对齐终端密度、bar cursor、4.5 对比度底线、紧凑底栏、首次显示后保留 xterm 的策略。Tauri 后端不移植，保留 Electron 会话、IPC 与 pending input。
- Notes 默认行高与设置页同步为 1.8；用户已显式保存的排版值继续使用。微信公众号预览保留自己的输出契约。
- 底栏使用共同 flex 空间、长标题省略和侧栏打开时的次要统计隐藏；保存状态、待复核与所有操作保留。保留用户自动隐藏状态栏的偏好；该设置在 1400ms 空闲后禁用底栏的 pointer events，与布局重叠属于不同机制。

保留屏幕的范围是当前 Notes 工作台中收起 / 重开终端、切换内置浏览器和终端会话。离开 Notes 导致整个工作台卸载或退出应用后，仍沿用既有会话恢复机制；没有声称能够跨应用重启完整持久化 TUI 屏幕。

## 验证与交付

- 终端恢复故障用同一回归测试核验：隔离引用 Git HEAD 的旧 hook 时，恢复出的 active xterm 为 `display:none`，测试失败；当前 hook 通过。没有为了制造失败修改工作副本。
- Notes 单元、组件与 Electron terminal manager 广泛回归运行了 147 文件、1537 项；首轮 1535 项通过，两个失败文件在当前稳定源码与单 worker 下复验共 60 项全部通过（一项为重负载下的既有 CJK 超时，一项为延迟 clipboard 测试需等待初始 focus 的前置状态）。最终终端定向组 3 文件 / 41 项通过，表格 / 排版定向组 11 文件 / 85 项通过，表格 mutation 测试再验 2 项通过。
- `npm run lint`：0 errors，18 项未修改路径上的 warnings；最终测试文件定向 ESLint、`git diff --check` 通过。
- 底栏、工作台与终端组件定向组 3 文件 / 73 项通过；保存冲突与待复核同时存在时，组件回归确认关键状态保留且复核回调正常。真实生产包几何使用隔离临时笔记另行验证。
- `npx tsc --noEmit`：全仓仍报告 247 项错误，分布在 `release/` 108 项与 `tests/` 139 项；`src/` 与本轮新增 / 修改路径均为 0 项。没有将未通过的全仓类型检查写成通过。
- `npm run build`、`npm run desktop:island:build`、`npm run desktop:assemble` 和打包隐私审计成功。`electron-builder --mac --publish never --config.mac.identity=-` 成功生成 macOS arm64 本地包，签名后的终端隐私权限检查通过。该本地包为 ad-hoc 签名，不是新 GitHub Release。
- 开发热更新可触发已有终端 cleanup 而保留 React running 状态，造成开发实例空白；完整冷启动后真实 xterm 行内容可见。未把这个开发 HMR 边界当成生产恢复故障已修复的证据，生产包另行验证。

- 完整生产包 smoke 使用隔离 user-data / 临时 Vault，通过真实 ANSI 渲染、stdin/stdout TTY、`stty` 41×73、光标擦除、alternate screen、隐藏 / 重开同一 xterm DOM、正常 buffer 恢复、中文输入与双会话。六主题终端 surface 与 xterm 背景一致；自定义排版计算为 24px / 48px / 960px。三列表实测约 57 / 561 / 75px；12列中文表宽 7095.6px，由自身 798px 横滚容器收纳，body 与 client 均为 1160px，没有撑大应用。
- 通过 OS 外部文件入口打开的文档，内部 `activePath` 为空时 source / split 模式切换仍存在既有 no-op 边界；可达的源码与公众号分屏在临时 Vault 内部笔记验证通过，本轮未扩大为外部模式状态修复。运行证据：`/tmp/auris-vmark-reference/packaged-presentation-smoke.json`。
- 本地包安装到 `/Applications/Auris.app`（1.0.17），原包完整保留于 `release/backups/Auris-1.0.17-before-notes-vmark-20261008.app`。单独运行已安装 App 后，`cua_repl` 实际看到真实 zsh 提示符；原生粘贴 Python alternate-screen 程序，绿色 READY 与中文输入提示可见，经命令面板收起 / 重开后仍保持原屏幕，回车后恢复 shell。没有只用后台 PTY 或 DOM 截图替代这一原生交互证据。
- 对真实用户 Markdown 文件进行只读 SHA-256 比较，核验的 66 文件内容均未变化；交付前再次比较仍为 0 个变化。

## 最终底栏与安装验收

- 最终新生产包直接运行 `--footer-only`，没有注入 CSS：1440 / 1160px 正常窗口、1000 / 900px 压力窗口的折叠与展开侧栏，以及内置浏览器侧栏，共 9 个场景通过。产品原生最小窗口是 1160px；低于此值的压力测试只在隔离测试窗口放宽限制，没有修改产品窗口配置。
- 长标题真实省略，保存状态与待复核提示保留，13 个底栏按钮的中心均命中各自按钮；最高底栏为 98px，正文实际预留为 104px。自动隐藏后唤醒、待复核弹窗、物理点击终端开关、同一 xterm / PTY 与继续输入通过。正文滚到末尾时，末行 bottom 628px，小于 footer top 696px，没有遮挡。
- 另以临时 DOM 文本 / 属性模拟“保存冲突”标签，在 1160 / 900px 展开侧栏及最大终端宽度下检验几何；这两项不代表触发了真实磁盘保存冲突。真实 conflict prop 与复核回调由组件测试覆盖。最终证据：`/tmp/auris-vmark-reference/footer-presentation-smoke.json`；renderer 无报错，隔离测试实例已关闭。
- 最终包已替换 `/Applications/Auris.app`。保留最初旧包备份，并额外保留底栏修正前的本轮包于 `release/backups/Auris-1.0.17-before-notes-footer-20261008.app`。安装前验证完整签名及 `app.asar` / 更新配置与构建包的 SHA-256 一致；安装后用原生 computer use 打开 `/notes` 与同一份临时展示样本，确认按内容分配的表格、正文和终端侧栏可达。
- 安装检查发现既有 Next 图片优化器在测试运行时向包内 `.next/cache/images/` 增加了一个未封装的 WebP 缓存。只清除了这一测试生成且不在签名资源列表内的文件，随后签名验证通过；没有改动签名资源或 Electron 缓存策略。这是独立的既有运行时缓存边界，没有将其列为本轮 Notes 已修复功能。

本轮复用与验证仅覆盖上述展示和交互范围，不作为 VMark 全功能或逐像素一致的声明。本地 App、备份与临时测试证据不纳入 Git；源码、回归测试与本对照记录一同交付。
