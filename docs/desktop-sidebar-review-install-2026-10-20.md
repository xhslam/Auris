# 2026-10-20 侧栏与 Review MCP 合入及本地安装验收

## 交付范围

- `e00cfdb`：固定 30px 直角常显侧栏，低对比主题背景，主题像素标志，Notes 工作区展开修复及渐入渐出；Notes 状态栏采用 3 秒闲置隐藏。
- `a43dc48`：Review MCP 查询/创建工具、凭据边界、Notes/Review 请求隔离、主工作区就绪状态、Review 页面实时同步和防覆盖写入。
- 工作副本原本就在 main；两项提交已推送 origin/main。用户后续明确要求将原有 Review/MCP 改动一起处理，因此纳入第二项提交。
- 未纳入无关的 Windows CI 工作流、本地参考图片删除、UI 参考手册和根目录重复 MCP 脚本；它们仍保留在工作副本。

## 验证

- 在 Git 提交 a43dc48 的干净源码快照中完成生产构建（含 Next TypeScript 检查）、桌面原生 helper 构建与 standalone 组装。
- 11 个定向 Vitest 文件，159 项通过。
- 全仓 ESLint：0 errors，18 项既有 warnings。
- IPC 合约：127 invokes / 130 handlers；敏感信息检查和 CJS/MJS 语法检查通过。
- 签名深度验证、麦克风/摄像头/Apple Events 权限声明与打包隐私审计通过。
- 打包态 MCP 冒烟：Notes facade、模块闭包、Nia workflow 与 Browser workflow 通过。
- 额外打包态 Review 协议验证在隔离 profile 和临时 Vault 中执行：项目创建与复用、知识点创建、四阶段排程、查询、Notes 请求隔离通过，原始 Vault fixture 未改动。
- 使用 computer use 打开安装后的首页、Notes、视频库和设置页；侧栏新样式及 Notes 工作区入口存在。未向真实用户 Review/Vault 写入测试数据。

## 本地安装与回滚

- 应用：`/Applications/Auris.app`，版本仍为 1.0.19，本轮未创建发布标签或 GitHub Release。
- 旧包：`/Applications/Auris.app.backup-2026-10-20-before-sidebar-review`。
- 新包从干净提交源码构建；替换采用正常退出、旧包重命名备份、新包换入，再启动。安装后 app.asar SHA-256 与待安装包一致。
- 本机无 Developer ID，初次默认签名未包含所需权限声明，因此改用 `electron-builder --mac --dir --publish never --config.mac.identity=-` 生成与原本地包一致的 ad-hoc 签名；重新校验通过。没有修改正式发布配置，未做公证。
- 日志与本地安装截图：`/tmp/auris-sidebar-publish-20261020/`。不将真实用户运行截图或临时发现凭据上传仓库。
