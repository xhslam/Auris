# Auris：Mac 本地版与 GitHub 版差异取舍报告

> 日期：2026-08-08  
> GitHub：`xhslam/auris`，`origin/main = 6ab235d8f`  
> Mac 本地：`main = 1ccf54523`，另有未提交工作区改动  
> 本报告只分析；未提交、未合并、未推送任何代码。

## 一、先说结论

最稳妥的路线不是把 Mac 本地 `main` 整体推到 GitHub，也不是完全抛弃本地成果，而是：

**以 GitHub 当前版本作为 UI、发布配置和产品体验基线，再把 Mac 本地真正有价值的底层能力按功能包移植进去。**

推荐保留 GitHub 版的：

1. 完整 Flash 工作区；
2. Notes 欢迎页与首次进入体验；
3. Windows NSIS 安装与跨平台打包规则；
4. 视频库元数据与用户原视频目录隔离；
5. 根级 `.gitignore`。

推荐从 Mac 本地移植到 GitHub 的：

1. Notes 防丢、Hot Exit、历史版本、按需加载；
2. Vault 安全删除、恢复、复制与 Finder 操作；
3. Notes 命令系统、快捷键、查找替换、阅读模式；
4. JSON/YAML/TOML 等结构化文件支持；
5. MCP 身份认证、配置原子写入、工具风险分级；
6. Notes 局部中英文界面。

建议暂缓或单独试验的：

1. 学习链路 lineage；
2. 移动端/计费接口占位；
3. 外部插件完全禁用策略；
4. 个人词库大快照；
5. VMark 大型生成报告与外部研究仓库。

## 二、关键 Git 事实：两边不是普通分叉

- GitHub `origin/main` 是 2026-08-08 创建的单一根提交：`6ab235d8f chore: initial clean commit of Auris workspace`。
- Mac 本地 `main` 有 166 个独立提交，HEAD 为 `1ccf54523`。
- `git merge-base origin/main main` 没有结果：**两边没有共同祖先**。
- 因此 `ahead 166, behind 1` 不能按普通分支理解，也不能直接 `git pull` / merge。
- 直接树比较规模：全仓库 562 个文件；其中 `auris/` 213 个文件，约 `+33,421/-11,873`。

### 安全处理

已经添加：

```text
origin = https://github.com/xhslam/auris.git
```

但没有让本地 `main` 继续追踪 `origin/main`，避免误执行 force push 或 unrelated-history merge。后续应从 `origin/main` 新建干净整合分支，再手工移植或 cherry-pick 可复用提交。

## 三、功能取舍表

| 功能包 | 本地价值 | 与 GitHub 体验冲突 | 建议 |
|---|---|---|---|
| Notes 防丢 / Hot Exit / 历史版本 | 高 | 低 | 第一批移植 |
| Vault 删除恢复 / 复制 / Finder | 高 | 低 | 第一批移植 |
| MCP 身份与原子配置写入 | 很高 | 需迁移旧配置 | 第一批单独安全版本 |
| Notes 命令、快捷键、查找替换 | 高 | 中等，涉及多个编辑 surface | 第二批拆分移植 |
| 结构化文件与 schema 预览 | 高 | 低 | 第二批独立功能 |
| Notes 中英文 | 中高 | 只是局部 i18n | 可移植，但准确命名 |
| 学习链路 lineage | 中高 | 新产品模型，UI 认知不足 | feature flag / 暂缓 |
| 插件默认阻断外部代码 | 安全价值高 | 会让 GitHub 可用插件失效 | 单独产品决策 |
| 移动端、通知、billing 接口 | 低到中 | 当前多为占位 | 不纳入桌面版发布 |
| 本地简化 Flash | 低 | 会覆盖 GitHub 完整 Flash | 不提交 |
| 本地直接进入 Notes Workbench | 中 | GitHub 欢迎页更完整 | 不覆盖 GitHub 入口 |

## 四、最值得移植的本地功能

### 1. Notes 数据可靠性

关键提交：

- `1e3ea68ef` durable recovery store
- `87feb1aa3` Electron 持久化恢复
- `3452e7f07` Hot Exit
- `3931b0f52` Vault 按需加载
- `47db8fb11` MCP 写入持久化

关键路径：

- `auris/electron/notes/notes-recovery-store.cjs`
- `auris/electron/notes/notes-recovery-ipc.cjs`
- `auris/src/features/notes/persistence/notes-recovery-store.ts`
- `auris/src/features/notes/workbench/use-notes-documents.ts`

用户价值：异常退出后恢复草稿、标签页与工作区；每篇文档保留历史版本；大 Vault 不再启动时读取全部正文。

注意：renderer、preload、IPC、Electron store 是一个完整协议，不能只复制单个文件。

### 2. Notes 编辑基础设施

关键提交：`db007568c`、`4684f61f4`、`f99a9d821`。

包括：

- 统一命令总线；
- 快捷键搜索、重设、导入导出与冲突检测；
- 富文本查找替换；
- 只读、专注、打字机模式；
- 12–32 px 字号；
- macOS 菜单触发 Notes 命令。

建议拆成三个 PR：命令基础设施、快捷键设置、阅读模式。

### 3. 结构化文件支持

关键路径：

- `auris/src/features/notes/formats/format-registry.ts`
- `structured-data.ts`
- `structured-schema.ts`
- `auris/src/components/notes-v2/structured-data-preview.tsx`

支持 JSON、JSONL、YAML、TOML 等，并识别 `package.json`、GitHub Actions、Docker Compose、OpenAPI、Cargo、PyProject 等语义结构。

建议独立发布；不要和 Notes UI 大改混在一起。

### 4. MCP 安全与可靠性

关键提交：`47db8fb11`、`35566184d`、`dde8388b7`、`ba66b10f4`。

包括：

- 每个 MCP 客户端独立 ID/token；
- token 只保存 hash，并支持轮换；
- 配置 compare-and-swap、0600、备份与原子替换；
- 浏览器读操作与变更操作分工具；
- SSRF 主机限制增强。

建议作为最高优先级安全迁移，但必须准备旧配置迁移说明。

## 五、应保留 GitHub 版，不要被本地覆盖的内容

### 1. Flash 完整工作区

GitHub 版有：收藏、今日/全部筛选、搜索、98 天热力图、活跃天数、存储失败提示、Zod 数据校验。

Mac 本地已提交版只剩新增、删除、转笔记的简化卡片页。**不要用本地版覆盖 GitHub Flash。**

### 2. Notes 欢迎页

GitHub 已有 `notes-welcome-screen.tsx`，包含新建文件、打开文件、打开 Vault、最近文件，并且视觉和信息层级更完整。

Mac 未提交的 `notes-start-screen.tsx` 与它高度重叠，但更简洁。建议保留 GitHub UI，只借鉴本地底层文件 API 中安全、正确的部分。

### 3. 视频库目录卫生

GitHub 把 SQLite、分析、缩略图、转码缓存放到 `userData/video-libraries/<hash>/`；本地已提交版会把它们放进用户原视频目录。

建议保留 GitHub 隔离设计，避免污染只读盘、同步盘和用户素材目录。

### 4. Windows 与仓库卫生

GitHub 有 NSIS、快捷方式、跨平台 node-pty 过滤、根 `.gitignore`。这些都应保留。

## 六、Mac 当前未提交工作区

### A. Notes 起始页与打开/新建单文件

代码链路基本完整：

- 起始页 UI；
- `pick-file` / `create-file` Electron IPC；
- desktop bridge/service/client；
- `deferAutoOpen`；
- 最近文件入口；
- 组件测试。

本机验证：

- 4 个定向测试文件通过；
- 共 22 个测试通过；
- `npm run security:secrets` 通过。

但有两个 P1 问题：

1. 文件选择器允许 All files；不支持文件可能仍让起始页关闭，进入没有活动文档的 Workbench。
2. “打开单文件”实际上把文件父目录改为整个 Vault，还会创建插件目录、刷新 watcher、加载插件 runtime。这不只是临时打开一个文件，存在目录写入和信任边界副作用。

建议：不直接提交这套 UI；从中抽取安全的单文件能力，先明确“临时文件”与“切换 Vault”的产品语义，再接回 GitHub 欢迎页。

### B. macOS ad-hoc 签名

`electron-builder.yml` 将 `identity: null` 改为 `identity: "-"`，便于无 Developer ID 的本机 ARM64 构建。

它适合本地测试，不适合无条件进入正式配置，否则可能压过 CI 的 Developer ID 自动签名。应改为环境变量或本地 build profile。

### C. 个人词库

`word-index.json` 从 4301 增至 4565 条；新增 264 个物理条目，并修改 131 个既有 key。

问题：

- 有 6 个重复 lookup key：`blend`、`depict`、`embrace`、`heritage`、`mandatory`、`proficiency`；
- 同步脚本依赖个人绝对路径 `/Users/apple/Documents/文件区/05-word`；
- Git 仓库里没有可复现源数据。

建议：先去重并明确这是产品内置词库还是个人数据，再独立提交。

### D. VMark 报告

`latest.*` 更新到 v0.9.29，同时显示 12 个 stale mapping 和 2372 个未映射上游变化。可以作为调研快照，但不能称为“完成对齐”。

建议报告和生成快照单独提交；去掉对 `.tmp-vmark-explore` 临时绝对路径的证据依赖。

### E. 设计稿

`auris/reading区设计稿/` 有 5 张 PNG，约 4.3 MiB。它们是设计参考，不是运行依赖。只有确认长期版本化时才独立放进 docs/assets，否则移到项目资料区。

## 七、最紧急风险：当前 DMG/App 含本地学习数据

检查发现：

```text
auris/release/mac-arm64/Auris.app/Contents/Resources/standalone/.shadowing-data
```

其中有：

- 360 个文件；
- 约 9.1 MiB；
- 大量音频 WAV、JSON 和 session 数据。

源数据来自本地 `auris/.shadowing-data`。Git 忽略它并不能阻止 Next standalone / electron-builder 把它装入 App。

**当前生成的 App/DMG 不应上传 GitHub Release、发给别人或公开发布。**

在下次打包前必须：

1. 从 Next standalone trace 或 electron-builder resources 中显式排除 `.shadowing-data`；
2. 删除旧 `release/`；
3. 重新 build/assemble/package；
4. 解包复查没有 `.shadowing-data`、`.env*`、私有音频和 session；
5. 再做签名与发布。

## 八、不应提交的文件

- `.DS_Store`
- `._tmp_cli_code_search_20260707_all/`
- `.tmp-vmark-explore/`
- `auris/release/`
- 根目录与 release 中的 `.dmg`、blockmap、builder debug 文件
- 外部完整 clone；应提炼结论或用独立仓库/submodule

GitHub 的根 `.gitignore` 已覆盖大部分上述项目，应以它为准。

## 九、推荐整合顺序

1. 从 `origin/main` 建新的 `integrate/mac-capabilities` 分支。
2. 先修复打包隐私泄漏，并建立包体内容审计。
3. 移植 MCP 身份、原子写入与 Notes recovery。
4. 移植 Vault 安全文件操作。
5. 移植 Notes 命令、快捷键、查找替换和阅读模式。
6. 移植结构化文件支持。
7. 决定是否启用 Notes 局部中英文。
8. 学习链路放 feature flag。
9. 单独决定插件安全策略。
10. 最后处理词库、VMark 报告和设计资产。

每个功能包都应保留 GitHub 的 Flash、欢迎页和发布配置，并单独跑 lint、类型检查、定向测试、完整测试、桌面 smoke、打包审计。

## 十、GitHub CLI 状态

Mac 当前已成功登录：

```text
active account: xhslam
repo: https://github.com/xhslam/auris
permission: ADMIN
protocol: HTTPS
```

旧账号 `phandung2ea5d4-oss` 仍保存在 gh keyring 中，但不是 active account；未删除。

本地已添加 `origin`，只执行过 fetch，没有 push。由于两边历史无共同祖先，本地 `main` 未设置 upstream，以降低误推风险。
