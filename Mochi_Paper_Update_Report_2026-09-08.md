# Mochi 与 Paper 更新报告

核查与执行时间：2026-09-08，Asia/Shanghai。

## 结果

| 项目 | 更新前 | 更新后 | 本次处理 |
| --- | --- | --- | --- |
| Mochi 桌面 App | 0.1.20 | 0.1.20 | 已是最后桌面发行版，无需替换 |
| Mochi main 源码 | cbc4eb2 | f15c22d | 快进同步 15 个提交，当前为 mochi-avatar 1.1.0 |
| Paper 桌面 App | 0.2.3 | 0.2.4 | 本地原生构建、备份、安装并启动 |
| Paper main 源码 | 87819df | 2efa461 | 快进同步 5 个提交 |

两份仓库更新前均无未提交改动；更新后工作区仍干净，HEAD 与本次 fetch 得到的 origin/main 完全一致（ahead/behind 均为 0）。未提交或推送 Git 改动，未修改 Auris。

## 上游识别及变化

### Mochi

仓库：[xiaolai/mochi](https://github.com/xiaolai/mochi)。

[上游 README](https://github.com/xiaolai/mochi#the-desktop-app-has-been-retired) 明确桌面应用停止开发，保留于 archive/app；[最后桌面版本 v0.1.20](https://github.com/xiaolai/mochi/releases/tag/v0.1.20) 发布于 2026-09-06。远程 archive/app 仍为 `441b6e6fea3fd9e1524b8106f30f80c4053c052e`，与本地存档分支一致。

main 当前已转为角色动画组件库，不能用库版本 1.1.0 覆盖桌面 App 0.1.20。本次新增主要包含生气表情嘴部、可停止摇摆、默认 Mochi 角色、六种 Codex 宠物示例，以及网站和展示资源修复。详见[提交差异](https://github.com/xiaolai/mochi/compare/cbc4eb24ce6fca0efb10b8484dab617314177d74...f15c22d4b2e2f0e953d7e8ec1a727ae2fd273a0f)。

本地源码：`/Users/apple/Desktop/xiaolai-source/mochi`。
本地应用：`/Applications/Mochi.app`。

### Paper

根据现有 App、仓库 remote 和历史安装报告，实际项目为 [xiaolai/paper-one](https://github.com/xiaolai/paper-one)，不是不存在的 xiaolai/paper。GitHub latest release API 返回 404，本次依据 main 源码和 v0.2.4 Git 标签更新，而非下载官方发布的安装包。

[本次差异](https://github.com/xiaolai/paper-one/compare/87819df036b845f21d9af456586b695692bc9796...2efa46179e83ae6a94e3912022fae6d130cc3674)主要包括：

- 配对邀请显示二维码，提供复制反馈、剩余有效时间和过期说明。
- 等待对方确认时明确显示状态，并允许主动取消加入。
- 身份页面优先说明当前设备角色，单独标注身份指纹。
- 恢复词按编号展示，先显示保管说明。
- 复用二维码处理工具，并修复网页阅读器测试 mock 的竞态。

本地源码：`/Users/apple/Desktop/xiaolai-source/paper-one`。
当前提交：`2efa46179e83ae6a94e3912022fae6d130cc3674`。
安装位置：`/Applications/Paper.app`。

## 执行与验证

1. 用 Info.plist 核实已安装版本；用 git status、remote、fetch、log 核实来源和更新范围。
2. 两份源码均执行 `git merge --ff-only origin/main`，无冲突，不覆盖本地修改。
3. Mochi：`pnpm test`，11 个文件、216 项通过；`pnpm build` 成功。
4. Paper：针对 CirclePane、devicesModel、Web Reader 执行测试，3 个文件、137 项通过。测试环境打印两条 canvas getContext 未实现提示，不影响通过。
5. Paper：`pnpm tauri build --bundles app` 成功，包含 TypeScript 检查、桌面/Web 前端及 Rust release 构建；产物版本为 0.2.4。
6. 备份旧 App 和用户数据后，通过临时 App 路径完成安装替换。
7. 首次完整签名检查发现构建只有链接器 ad-hoc 签名，未封装资源。执行 `codesign --force --deep --sign - /Applications/Paper.app` 后，`codesign --verify --deep --strict --verbose=2` 返回 valid on disk 和 satisfies its Designated Requirement。此为本地临时签名，不是官方 Developer ID 签名或公证。
8. 重新启动后确认 `/Applications/Paper.app/Contents/MacOS/app` 进程运行；再次读取安装版本为 0.2.4。未进行真实双设备配对或逐项阅读交互验证；一次辅助 AppleScript 窗口属性查询失败，因此不以其作为 UI 验证证据。

## 备份与回退

- 原 App 原位保留：`/Applications/Paper.app.pre-update-20260908`。
- 独立旧版备份：`/Users/apple/Desktop/xiaolai-source/update-backups/2026-09-08/Paper-0.2.3.app`。
- 更新前用户数据备份：`/Users/apple/Desktop/xiaolai-source/update-backups/2026-09-08/paper-user-data`。

需要回退时先退出 Paper，再用旧版备份恢复 `/Applications/Paper.app`。数据备份单独保留，正常回退不应直接覆盖更新后产生的数据。

## 验证日志

日志保存在本报告旁的 `update-reports/2026-09-08/`：

- `paper-update-20260908-build.log`
- `paper-update-20260908-tests.log`
- `mochi-update-20260908-build.log`
- `mochi-update-20260908-tests.log`

本报告同时记录本次任务的工程轨迹：核对上游和本地版本、区分桌面发行与组件库、快进更新、构建验证、备份安装及签名修复。结论仅对应本次获取到的远程状态。
