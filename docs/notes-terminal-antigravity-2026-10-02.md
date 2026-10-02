# 终端执行记录增加 Antigravity CLI（2026-10-02）

本轮把 Antigravity CLI（本机命令 `agy`）接入既有 Notes 终端执行记录。设置页原本已识别该 CLI 和 MCP 配置，本轮修改执行记录服务、钩子与 Notes 终端面板，复用现有 PTY、IPC、会话随机 token、受限文件读取和 Markdown 预览。

## 接口依据与实现

- [Antigravity 官方生命周期钩子文档](https://www.antigravity.google/docs/hooks/)及本机 CLI 随附的 `~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/hooks.md` 确认：全局配置位于 `~/.gemini/config/hooks.json`，顶层以钩子名称组织事件，`PreInvocation` / `PostInvocation` 直接包含处理器数组；stdin 使用 `conversationId` / `transcriptPath`，stdout 接受中性 JSON 响应。
- 新增 `auris-terminal-transcript` 命名钩子，同时注册两个 invocation 事件。保持其他钩子与已有设置，重复开启不重复添加；所有 CLI 配置先验证，再写入。真实配置仍由用户点击开启或“更新 CLI 钩子”时写入。
- 真实 `agy --print` 验证发现 `transcriptPath` 指向 `transcript_full.jsonl`，与文档中的 `transcript.jsonl` 不同。读取仅允许 `~/.gemini/antigravity-cli/brain/<UUID>/.system_generated/logs/` 下这两种文件，不扫描最近会话，不读取其他 JSONL 或 IDE/App 会话。
- 实际记录为 `type: PLANNER_RESPONSE`、`source: MODEL`、`status: DONE` 的 trajectory 行。只提取字符串 `content`，忽略 `thinking`、`tool_calls`、用户、系统、工具和未完成记录；继续保持 2MiB 尾部、100 条历史和单条 100,000 字符上限。
- 面板使用“Agent 执行记录”，说明按 Codex、Antigravity CLI、Claude Code 的顺序列出；已有用户可点击“更新 CLI 钩子”，随后重新启动 CLI。

## VMark 对照

固定对照 VMark v0.9.90，提交 `662d73d46d2ed6294d087ad1ced30223384de170`：`src/utils/terminalTranscript.ts` 和 `src-tauri/resources/terminal-transcript-hook.cjs`。上游只识别 Claude/Codex 的消息与 SessionStart，未提供 Antigravity 适配。Auris 保留其完整 JSONL 行、助手文本筛选、历史上限和每终端独立绑定行为；新增 provider 格式和 Electron 内的受限目录检查。许可为 ISC，完整上游声明见 `docs/vmark-port/UPSTREAM-LICENSE.txt`。

UI 继续复用原有按钮、焦点与主题令牌，参考 [Shape of AI Controls](https://www.shapeof.ai/) 与 [Astryx](https://astryx.atmeta.com/) 的可控性、可访问性和组件组合。指定的本地 `UI_DESIGN_SYSTEM_GUIDE.md` 路径未找到，未声称读取该手册。

## 验证

- 4 个定向 Vitest 文件、53 项通过：执行记录服务、预览组件、终端面板与会话管理。覆盖 Antigravity 配置保留、幂等、无效配置不写入、实际字段绑定、两种路径、正文筛选、停用与显式升级。
- 在临时 workspace 的 `.agents/hooks.json` 注册同一生成钩子，运行本机真实 `agy --print`，不修改真实 CLI 配置。最终进程退出 0；钩子成功绑定；服务成功读出一条包含受控标记的模型正文。第一次实测被路径门禁拒绝，查明 `_full` 文件名后补齐限定路径并重跑成功。
- 定向 ESLint、CJS 语法和 `git diff --check` 通过；Next 生产构建及 Markdown 产物门禁通过。
- 隔离 userData、临时 Vault 与临时 CLI 配置的实际 Electron 验证通过：`/notes` 正常打开，打开测试笔记和终端后可看到三个 Agent 的说明，点击开启成功生成 Antigravity 钩子，“更新 CLI 钩子”入口可用。验证实例显式设置临时 home，未写入真实 CLI 配置。
- 独立 `tsc --noEmit` 有 25 项仓库其他路径错误，本轮执行记录和终端面板文件不在错误列表；构建沿用项目已有忽略类型错误设置，不能代替独立类型检查。

首次完成时只修改源码；用户随后授权合并 main、推送 GitHub 和更新本机应用，交付结果如下。

## 用户授权后的 1.0.16 本机交付

工作副本原本就在 main，且与 origin/main 同步。本次提交同时包含此前尚未提交的 VMark v0.9.90 终端基础链路、Markdown/公式/权限适配、笔记重命名与草稿完整性修复，以及本轮 Antigravity 接入，避免本地安装包与 GitHub 源码分离。

版本递增为 1.0.16。Notes、Electron Notes/终端/权限和 VMark 回归共 140 文件、1,228 项通过；全仓 ESLint 0 errors、20 项既有 warning，桌面 IPC 合约 126 invokes / 129 handlers 通过。原生辅助程序、Next 生产构建、Markdown 产物门禁、桌面装配隐私审计和打包 MCP sidecar smoke 均通过。

完整 electron-builder 流程生成 DMG/ZIP；本地 ad-hoc 签名、deep/strict codesign 和真实隐私 entitlement 核验通过。已安装 `/Applications/Auris.app` 1.0.16，旧 1.0.15 保留于忽略的 `release/backups/Auris-1.0.15-before-antigravity-20261002.app`。真实安装版 `/notes` 返回 200，打开已有笔记与终端后，Agent 执行记录面板显示 Codex、Antigravity CLI 和 Claude Code；没有点击实际用户的 CLI 配置写入按钮。安装前后 28 个 Markdown 文件的内容哈希一致，私有验证摘要和截图留在忽略的 `release/antigravity-1.0.16/`。

安装包为本机开发签名；本次没有创建发布标签或发布 GitHub Release。
