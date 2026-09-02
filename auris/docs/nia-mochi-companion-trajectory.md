# Nia Mochi-style desktop companion trajectory

## Interpretation

将需求拆为五条边界：Codex 登录凭据与 Realtime SDP 只在 Electron 主进程处理；独立透明悬浮窗在 macOS 所有工作区显示；渲染层持有唯一 WebRTC 音频会话；会话按 Mochi 方式惰性落盘；复习提醒由应用内调度器触发，不在应用退出后唤醒系统。

## Implementation path

- `electron/nia/companion/codex-credential.cjs` 读取 Codex CLI `auth.json`，用私有句柄交换短期 Realtime session，并代理 SDP；渲染层只接收随机会话句柄。
- `electron/nia/companion/realtime-coordinator.cjs` 统一 wake/rest/rotation、代际仲裁、文本/提醒队列和报告入库。
- `electron/nia/companion/conversation-db.cjs` 与 `conversation-lifecycle.cjs` 提供 SQLite 会话、turn、tool-use 记录和惰性会话生命周期。
- `companion-window.cjs`、`companion-position.cjs`、`companion-ipc.cjs`、`companion-preload.cjs` 提供透明、置顶、跨工作区、点击穿透/拖动与可信 IPC。
- `src/app/nia/companion/page.tsx` 与 `src/components/nia/companion/*` 提供黑色 Nia 人物、眼睛/身体动作、WebRTC 音频、拖动和进入完整会话入口。
- `reminder-scheduler.cjs` 接入复习快照，默认 09:00 / 14:00 / 20:00，23:00–07:30 DND，保存 operational dedupe state，并在应用重开时单次 catch-up。
- `/nia` 的 Live hook 改为调用主进程 companion coordinator；旧 API-key Realtime route 改为明确的 desktop-only 410，不再走 `OPENAI_API_KEY`。

## Checks

- Nia companion 定向：37 tests passed。
- 全量 Vitest：396 files / 2914 tests passed。
- `node --check`：Electron main/preload 与 companion CommonJS 文件通过。
- `npm run build`：Next 生产构建成功，包含 `/nia/companion`。
- Electron `desktop:dev` 启停：启动日志出现 `nia-companion:renderer-ready`，未出现启动错误。

## Risks and assumptions

- Realtime 上游、麦克风授权和 Codex 登录有效性仍依赖用户机器与网络；失败只进入静默诊断/重试路径，不会切换 API key 或 REST/CLI 代理。
- 提醒内容取自已同步到桌面岛的复习快照；若应用刚启动且快照尚未刷新，下一次调度会重试。
- 当前提醒时间与 DND 使用安全的本地配置默认值，设置 UI 仍可继续补齐；应用退出时不创建系统级唤醒任务。
- 本次未删除用户既有词汇、Markdown 或其他未提交文件。

