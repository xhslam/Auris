# Windows 本地源码同步、打包与安装

从仓库根目录手动执行：

```powershell
npm run desktop:update:local:win -- --check
npm run desktop:update:local:win
```

第一条只读检查 GitHub `xhslam/Auris` 的 `main`、当前源码、已安装版本及该提交的 Notes CI；第二条在检查通过后执行完整更新。**不要设置定时自动安装。**更新前保存工作并正常退出 Auris；脚本检测到正在运行会停止，不会强制结束进程。要求 Windows x64、Node 22、npm、Git、已登录的 GitHub CLI（`gh auth status`）、已注册的 NSIS Auris 安装，以及足够的磁盘空间容纳构建和应用／数据双份备份。脚本从卸载注册表唯一定位安装路径；无法定位或有多个安装时不猜测默认路径。Git `main` 的已跟踪文件必须干净；如本地分支含未推送或分叉提交，连只读 `--check` 都会说明阻断，不能误报可更新。脚本不处理、不清理未跟踪文件，不提交、推送、发布或修改系统防护。

## 自动化的门禁与节省时间点

1. 核对仓库 `origin`、`main`、GitHub SHA 和 **同一 SHA 的 Notes CI 完成且成功**。若最新提交仅改 `AGENTS.md` 和 `docs/**/*.md`，且该提交没有 CI，则核对其最近的已验收 main push 祖先：通过 GitHub compare 确认中间每个文件都只在上述文档白名单内，最近一次 Notes CI 必须成功；任何源码、workflow、构建资源变化，或比较不完整，都停止。已有失败/运行中的同 SHA CI 不允许回退到更早绿灯。只执行 `git fetch` + `merge --ff-only`，远端变化或分叉立即停止。
2. 对每个新提交从 `package-lock.json` 重装依赖，**不复用无法证明完整性的 `node_modules`**。Windows `npm ci` 若仅因补丁文件 CRLF 触发**特定**校验失败，必须先确认规范化 LF 后的 SHA-256 与仓库钉死的散列完全一致，才修正 `node_modules` 后继续；其他错误不豁免。每次新提交也重新生产编译，防止旧 `.next` 通过松散标记误判为最新构建。
3. 完整 Notes/VMark 回归由已成功的 GitHub Ubuntu CI 提供；每个新提交 SHA 在本机运行一次 Windows 定向编辑器、Markdown 解析和终端回归（当前 4 文件、49 项），成功状态仅按提交 SHA、依赖锁文件与 Node 版本复用。Windows 全仓单测现有 POSIX 符号链接、权限与路径假设，不能为了表面绿灯静默跳过 CI；定向回归失败也停止。增量构建若唯一失败是旧 `.next` 的 Markdown 标记缺失，只重建一次生成的 `.next`。运行 `desktop:assemble:win`、隐私审计，再以唯一目录运行 `electron-builder --win --config.npmRebuild=false --publish never`。文件锁重试器只作用于本次生成的 `electron/.runtime-node-modules-*` 和本次打包输出；重命名被锁时只复制到**不存在的目标**，不会覆盖任意目录，也不会关闭杀毒软件。
4. 安装前检查 `app.asar` 版本、Next 资源、MCP sidecar 健康，并以隔离 userData 启动，验证 `/`、`/notes`、`/video` 均返回 200；安装包和 ZIP 经哈希核对保存到 `release/local-artifacts/<SHA>/<构建批次>/`，同版本不同提交不会覆盖旧包。本地版本号相同**不**代表可跳过：只有之前生成的收据同时匹配提交 SHA、版本和已安装的 exe/asar/Next 关键文件哈希才直接退出。
5. 无运行实例时备份整个安装目录和 `%APPDATA%\Auris` 到 `release/backups/windows-before-<version>-<timestamp>/`，比对备份文件清单与关键二进制哈希后，静默运行 NSIS 安装。安装后再次检查版本、二进制/Next BUILD_ID 哈希、sidecar、隔离启动与三个路由，并在 `release/.local-update-install-state.json` 写入校验收据。成功后用户可正常打开 App。

失败时停在当前阶段；安装前失败不会修改旧 App。**安装开始后若验证失败，脚本保留完整备份并报错，不会在用户数据可能变化时擅自覆盖数据或自动删除旧目录**。先检查进程和日志，再从备份恢复；不要盲目重复安装。包和备份均在本地 `release/`（已被 Git 忽略）。`latest.yml` 是本地构建元数据，**不等于已发布 GitHub Release**；本地 Windows 安装包未代码签名，不能声称自动更新或生产签名可用。

## 集成状态（2026-10-05）

`7d1aee1` 的终端测试 CI 失败已由远端 `50f518f` 修复，Ubuntu Notes Actions #37281656064 成功；其后 `b208cd1` 仅记录文档验收，没有单独触发 CI。本机全仓 Vitest 在 2026-10-05 仍有 100/3593 项 Windows 环境相关失败（符号链接 EPERM、Unix 权限及路径断言等），故一键流程明确依赖 Ubuntu 的完整绿灯，并在 Windows 单独运行可验证的定向回归与打包后实际启动。脚本采用上述受限文档后缀规则，不会拿更早的绿灯掩盖后来的源码失败。本地更新器的修改须先进入版本控制，并由包含 `package.json` 或更新器文件的新提交触发且通过 CI；在未推送或已跟踪文件仍有改动时，应用命令按设计拒绝执行。CI 未成功时不要用“构建成功”代替质量门禁。

当同一提交的安装收据与实际文件一致时，核验后即可跳过重复打包；有新源码时会重装依赖，依赖 GitHub 完整 Notes/VMark 绿灯、运行 Windows 定向回归、生产编译并打包，耗时仍受编译、Windows 文件锁及备份速度影响，不能保证固定分钟数。首次运行因没有本脚本的缓存收据，会重新执行完整验证。需要调整或复核门禁时运行 `npm run quality:local-update-win`。
