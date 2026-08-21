# VMark App 更新管理参考（2026-08-21）

## 已确认的公开线索

VMark 公开仓库中存在完整的更新管理分层：`src/hooks/useUpdateChecker.ts`、`useUpdateOperations.ts`、`useUpdateStall.ts`、`useUpdateSync.ts`，并分别有普通与 comprehensive 测试。这表明其更新流程不是单一按钮，而是将“检查”“下载/安装操作”“卡死恢复”“多窗口状态同步”拆分为可测试模块。

仓库首页当前显示最新 Release 为 `VMark v0.9.48`，源码目录同时更新 `server` 与 `src-tauri` 的版本号，说明版本号是发布物与源码共同维护的发行边界，而非仅显示在 UI 中的字符串。

## 对 Auris 的初步意义

Auris 已有 Electron 主进程唯一更新状态机、检查/下载/安装桥接和停滞恢复；需要借鉴 VMark 的部分主要是将“源码同步”和“构建发布”明确区分于“已安装 App 更新”，并将发布前检查、版本一致性和失败恢复做成独立、可测试的服务。后续将继续读取上述 VMark hooks、Tauri 配置和 Release workflow，确认其具体触发、版本校验和产物策略。

## 来源

1. <https://github.com/xiaolai/vmark>
2. <https://github.com/xiaolai/vmark/tree/main/src/hooks>

## 更新检查与操作的具体做法

VMark 的 `useUpdateChecker` 将启动检查、手动检查、自动下载和重启安装区分开来。自动检查遵循用户设置的启动/每天/每周频率，并延迟启动；后台检查失败时使用 5 秒、10 秒、20 秒的指数退避，耗尽后只显示一次最终错误。手动检查才显示“已是最新”与失败提示，避免网络波动造成后台通知轰炸。跳过版本会在发现对应版本时自动收起，自动下载会排除跳过版本。

VMark 的 `useUpdateOperations` 将检查、下载和安装封装为共享无 React 依赖的流程。下载前若当前窗口没有待下载对象会先重新检查；重启安装经由主窗口协调，以保护未保存的文档。它还提供 `recoverFromStall`：清理单飞行保护、丢弃旧待下载对象、复位状态机，再以新的更新对象重新检查，避免 `.finally()` 无法执行时永久卡住。

Auris 已实现主进程唯一状态机、手动检查、下载、未签名 macOS 的手动下载降级与卡死恢复。可进一步借鉴的不是复制 Tauri 的多窗口状态广播，而是把 App 发布前的源码同步、版本一致性、发布凭据和产物元数据检查作为独立、可测试的发布服务，并保证用户点击发布不会绕过已推送源码的边界。

新增来源：

3. <https://raw.githubusercontent.com/xiaolai/vmark/main/src/hooks/useUpdateChecker.ts>
4. <https://raw.githubusercontent.com/xiaolai/vmark/main/src/hooks/useUpdateOperations.ts>

## 发布工作流与可信更新产物

VMark 的 Release workflow 以 `v*` 标签触发，也允许手动指定版本。工作流先对手动版本做严格的 `vX.Y.Z` 校验，并在正式发布前读取最新已发布 Release：相同或更低版本都会失败，避免覆盖已被客户端下载的同版本资产或造成版本回退。随后先创建草稿 Release，再在 macOS ARM、macOS Intel、Windows、Linux 的构建任务中上传产物；草稿在所有平台产物完成后才提升为正式发行。

VMark 的 Tauri 配置声明 `createUpdaterArtifacts: true`，并且 updater 同时配置受控服务端端点与 GitHub Releases `latest.json` 回退端点；更新包由公开密钥校验。这使“发现新版本”和“下载可信资产”都不依赖仅凭版本号的 UI 判断。

Auris 使用 Electron Builder，其等价物是每个平台的 `latest*.yml` 更新元数据与安装包/压缩包。当前 `electron-builder.yml` 已将 GitHub `xhslam/auris` 设为首要发布源，且 macOS 打包会生成自动更新必需的 ZIP。应借鉴 VMark 增加以下发布约束：只发布已推送的提交、拒绝同版本/版本回退发布、先执行完整构建与组装、核验产生的 `latest-mac.yml`（或 Windows `latest.yml`）版本号后才将发布视为成功；多平台构建应以 CI 方式分别运行，而非跨平台本地伪构建。

新增来源：

5. <https://raw.githubusercontent.com/xiaolai/vmark/main/.github/workflows/release.yml>
6. <https://raw.githubusercontent.com/xiaolai/vmark/main/src-tauri/tauri.conf.json>
