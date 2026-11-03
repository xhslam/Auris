# Auris 桌面自动发布与更新

普通合并只运行现有 Notes / Typecheck 检查；开发时使用 `npm run desktop:dev`，无需每次打包。正式发布使用不可变的 `vX.Y.Z` 标签，由 `.github/workflows/release-desktop.yml` 并行构建 macOS Apple Silicon 和 Windows x64。

## 当前默认：临时签名发布

无需购买或配置证书即可运行云端双平台构建。仓库变量 `MAC_SIGNING_MODE` 缺省为 `adhoc`：

- macOS Apple Silicon：明确以 `identity=-` 做 ad-hoc 签名，验证签名与产物后公开 DMG/ZIP。客户端可以发现更新，但只能打开 Release 页面手动下载安装，不能自动重启安装。
- Windows x64：生成 NSIS EXE、ZIP 和 `latest.yml`；使用 NSIS 安装的版本可继续验证自动下载/安装。没有 Windows 签名证书，系统可能显示安全提示。
- Release 说明会明确标注 Mac 手动更新限制，不宣称临时签名支持自动安装。

工作流用仓库临时 `GH_TOKEN` 上传产物，不向客户端写入 GitHub 凭据。临时签名不提供 Apple 开发者身份验证，网络分发可能被 macOS Gatekeeper 拦截。

## 以后切换正式签名

在 GitHub 仓库 Settings → Secrets and variables → Actions 配置两个 Secrets：

- `MAC_CSC_LINK`：Developer ID Application 证书的密码保护 P12 文件（Base64 编码）。
- `MAC_CSC_KEY_PASSWORD`：上述 P12 的导出密码。

然后将 Actions 的仓库变量 `MAC_SIGNING_MODE` 设为 `developer-id`。该模式强制签名并检查 Developer ID；凭据错误时直接失败，不会悄悄降级到 ad-hoc。其他变量值同样拒绝发布。

从当前 ad-hoc 安装版切换到签名版时，需要手动安装一次正式签名版本。后续保持相同 Apple 开发者身份。签名与 Apple 公证是不同环节，本工作流尚未新增公证；首次安装体验仍需在真实 Mac 上检查。

## 每次正式发布

1. 合并需要交付的代码，检查 main 的 CI 通过。
2. 在源码根目录运行 `npm version patch --no-git-tag-version`，同步递增 package.json 和 package-lock.json（本轮首次发版为 1.0.27）。
3. 提交这两个版本文件，将提交推送到当前分支。发布命令要求已跟踪的改动全部提交，HEAD 与远端分支一致。
4. 运行 `npm run desktop:release`，创建并推送对应版本标签。
5. 在 GitHub Actions 的 Release Desktop App 中查看结果。

发布工作流重新执行 lint、完整类型检查与 Vitest，随后创建草稿 Release；两个平台分别构建并上传产物。最终任务重新下载草稿产物，核对两个平台的更新元数据、版本号、文件大小和 SHA-512，确认 Mac DMG/ZIP 与 Windows NSIS 安装包完整后才公开 Release。失败时草稿不会成为客户端的正式更新。

如果标签推送失败，重新执行发布命令只会重试同一提交的本地标签。远端已有标签时，直接在 Actions 重跑失败的 workflow：已有草稿可以继续，已公开 Release 不允许覆盖。需要改代码才能修复的失败，应递增版本并使用新标签。

发布串行执行，避免两个版本同时争抢 latest 更新文件。日常 main push 不触发构建安装包。

## 客户端验收

保留现有 `electron-updater` 主进程与设置，不新增另一套更新器。它按用户偏好自动检查；发现高版本后可提示下载，下载后由用户选择重启安装；未签名 Mac 会降级为打开下载页。

首次上线后必须用两个真实版本验证：Windows 先安装 NSIS 版本 A，再发布高版本 B，检查发现版本、下载进度、重启后版本变化和数据保留；临时签名 Mac 验证发现更新、打开下载页与手动替换后的数据保留。正式签名后另行验证 Mac 自动升级。单元测试与工作流检查不能替代这次真实升级。

## 本次检查（2026-11-03）

- 开始时源码与安装版本均为 1.0.26；本轮准备首次云端发布 1.0.27。同步了远端新提交 `74c46ad`，保留其终端与 Windows 修复。
- 检查时 GitHub 没有 Release、Actions secrets 列表为空。按用户要求先采用默认 ad-hoc 模式发布，不以缺少 Apple 证书阻断双平台构建。
- 当前版本验收：全仓 Vitest 485 个文件 / 5294 项通过，完整 typecheck 通过，全仓 lint 0 errors / 18 项既有 warnings；actionlint 1.7.12 对全部工作流检查通过，git diff 检查通过。两项 socket 测试等待实际输出，保留上游新增 Windows 与连接回归。
- 修复仓库移到根目录后发布命令误拒绝根目录的问题，以及对应工作流测试仍读取上级目录的问题。
- 恢复迁移时删除的发布工作流，并改用当前根目录路径；没有修改应用页面、Notes/Vault 或主进程入口。

## 源码参考与差异

实现前复核 VMark 固定提交 `f2bf1b3fce06ca21fe7cd19382bef9c4774d0558` 的 `.github/workflows/release.yml`（ISC）：严格标签/源码版本对应、禁止旧版本或同版本覆盖、先草稿后并行构建再公开。Auris 工作流恢复自本仓库 `f227df4^` 的原实现，不复制 Tauri/Rust、Linux 或 updater 密钥机制；使用 Electron Builder 的 ZIP、NSIS 和 YAML/SHA-512 更新元数据，并保留现有 Electron 更新状态机。

- [固定 VMark 发布源码](https://github.com/xiaolai/vmark/blob/f2bf1b3fce06ca21fe7cd19382bef9c4774d0558/.github/workflows/release.yml)
- [Electron Builder v26 自动更新说明](https://www.electron.build/v26/docs/features/auto-update/)
- [GitHub 托管运行器](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
