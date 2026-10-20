# Auris 1.0.20：Review 更新与 Nia 分支整合

## 范围与合并依据

- Review：优先处理任务横向滑动、前后切换、有限时长的分层入场、摩天轮轮辐同步旋转、按钮/弹窗/数值/进度/完成提示动效，以及减少动态效果支持；保留排程、确认与数据规则。
- 用户明确确认将 `codex/nia-mochi-companion` 一并整合。`git cherry main codex/nia-mochi-companion` 核验：14 个实现提交均已有等价补丁进入主线；仅 `a6310e4` 的历史计划文档缺失。
- 恢复该历史计划到迁移后的 `docs/superpowers/plans/`，标明原 `auris/` 前缀与步骤仅供归档。采用 `ours` 策略合并已纳入实现的分支历史，保留主线后续菜单、拖动、类型协议和语音 transport 增强，不以旧版覆盖现有源码。
- 旧分支源码复核与独立审查同时定位了 Nia 停止会话边界问题：停止使 generation 立即失效；只允许旧会话在 3 秒宽限期内归档末句；立即重开等待旧 closed/超时完成；再次停止取消排队唤醒；过期或旧报告不得恢复监听状态。
- 关闭保存时不再落库工具记录；空会话结束也清理待归档工具；SDP 随机句柄使用前校验过期并一次性消费，阻止并发重放。凭据仍留在主进程，未读取或更改真实 Codex 登录凭据。
- 版本由 1.0.19 递增为 1.0.20。未更改正式发布配置，不创建标签或 GitHub Release。

## 已完成验证

- 扩大回归：221 个 Vitest 文件、3,356 项测试通过，包含 Notes、Nia、Review 与新会话时序回归。
- 全仓 ESLint：0 errors，18 项既有 warnings；`npm run typecheck:source` 通过。
- 桌面 IPC 合约：127 invokes / 130 handlers；修改的 CJS 语法检查通过。
- 对 Git 跟踪文件执行既有敏感字面量规则检查，通过；日志隐藏匹配值，不上传临时凭据或用户 profile。
- 原生 helper、Next 生产构建、Markdown 产物门禁、runtime 组装及隐私审计通过。
- macOS arm64 本地包：`release/mac-arm64/Auris.app`，版本 1.0.20，ad-hoc 签名；深度 strict codesign 与麦克风/摄像头/Apple Events 用途及签名权限检查通过。无 Developer ID/公证，不将本地签名描述为正式分发签名。
- 打包态真实 Electron Review 验证通过：有限入场结束、轮辐转动而中心不位移、非活动面板 inert、左右滑动与按钮切换、所选任务确认完成和进度/提示反馈、六主题、减少动态效果、重载持久化，无 renderer 错误。
- 打包态 Notes 验证通过：公式、Mermaid、围栏内快捷键安全、真实 PTY 中文输入、历史视口与跳转、六主题，临时笔记原文不变。
- 打包态 sidecar 模块闭包、Notes/Browser MCP、Nia workflow 与 Browser workflow 通过。

## 本地安装与后续记录

以上验证针对待安装包；本地替换采用单个可回退进程完成预检、暂存校验、正常退出、备份、换入及启动。安装位置的最终结果会在下方补录。所有测试使用隔离 profile，不清空真实 Vault、Review 或应用配置。

真实 Codex OAuth / OpenAI Realtime 语音连接、自动提醒音频交互及 Windows 实机未在本轮调用或验证；不据单元测试声称这些外部链路已实测。

原有 Windows CI 工作流改动、参考图片删除、未跟踪 UI 手册和根目录重复 MCP 脚本均不纳入本次提交，保留原样。
