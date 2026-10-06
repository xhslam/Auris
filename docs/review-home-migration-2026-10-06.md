# Review 默认首页（2026-10-06）

用户要求删除原首页，将 Review 放到首页的位置。

## 实现边界

- `/` 直接复用现有 `ReviewPageClient`，保留原 Review 的知识点参数解析和添加意图。
- 侧边栏第一项改为 Review（保留中文名称「每日回顾」和原复习图标），地址为 `/`；移除原「首页」项和重复 Review 项。
- `/review` 成为服务器重定向入口，原查询参数（包括重复参数与编码值）原样保留。现有 Electron 提醒仍能使用旧地址，不需要修改受保护的主进程。
- 灵感闪念中的复习按钮直接指向 `/`。
- 删除旧首页 shell、整个 `src/components/home/`、首页专属个人操作系统界面和旧界面测试；保留已有 Markdown 与 localStorage 数据。
- 已将仍在使用的功能拆分到所属目录，删除 `src/features/home/`、`src/features/home-learning/` 及未再使用的个人操作系统 Markdown 解析器。没有修改 Review 数据模型、存储键或复习算法。
- 按用户后续要求删除 `docs/homepage-backups/` 的 14 个历史备份文件，并移除已经不再需要的 TypeScript 排除项。
- 清理 `globals.css` 和 `auris-redesign.css` 中的 224 个旧首页选择器，删除 163 条专属规则，并从 10 条混合规则中仅去除旧首页选择器。PostCSS 解析前后比较确认其余 2,635 条规则的选择器、声明及顺序保持一致。
- 更新布局与首页 smoke 测试，移除对已删除首页 CSS、旧首页结构和登录后首页流程的依赖。

## 共享功能拆分

- 阅读恢复逻辑归入 `src/features/reading/reading-resume-store.ts`，视频恢复逻辑归入 `src/features/video/video-resume-store.ts`；各自导出恢复状态类型。保留 `auris.reading.resume.v1`、`auris.video.resume.v1` 和原广播事件。与 Git HEAD 的旧实现比较，从存储常量开始的实现文本完全一致，无需用户进度迁移。
- Nia 改用 `src/features/output-review/use-output-review-metrics.ts`，直接读取既有 Review 模型与存储；显示今天到期加逾期的待复习数量，已完成项不计入待办。订阅复习变化、跨窗口存储、窗口焦点、可见性和本地午夜刷新，不再为这个计数加载笔记、阅读材料或视频详情。
- 灵动岛新增 `desktop-island-task-store.ts`，独立使用 `auris.desktop-island.tasks.v1`。只有新键不存在时，验证旧 `auris:home:v1` 的 `plans` 并复制任务；保留原 ID、标题、完成状态与时间戳。已有新状态（包括空任务）优先，不反复导入旧任务。
- 旧键的完整原文保留，代码不再读取其人生阶段或每日一句。损坏/不兼容的新数据不被旧任务覆盖；迁移写入失败时仍可读取旧任务，并在下一次读取重试。任务完成写入失败会抛出，灵动岛意图保持未确认，允许相同 actionId 重试。
- 全源码、测试、脚本和工作流中已无旧模块导入；旧存储键仅保留在迁移兼容逻辑和回归测试中。内部 `home` workspace ID 是 Review 根入口与桌面运行时的兼容标识，仍被应用壳使用，不代表旧首页工作台仍存在。

## 源码与设计参考

实际阅读 VMark 固定提交 `2d3903cb2887a7c6a7a8df7b814f14b745bc2415` 的 `src/App.tsx`（ISC）：根路由直接呈现主工作界面；其 React Router/Tauri 路由不能直接复制到 Auris 的 Next.js/Electron，且没有 Auris 的输出复习业务。本次直接复用 Auris 既有 Review，不新增第二套复习界面或框架；改后复核根路由、Review 外壳和导航的关系。

参阅 Shape of AI 的启动与引导模式、Astryx 的组件与主题原则，保留 Review 已有主操作、空状态和应用主题机制。用户指定的本地 `UI_DESIGN_SYSTEM_GUIDE.md` 路径及所在知识库目录不存在，本次按用户消息中的设计规范执行，未引入新的视觉系统。

## 首阶段入口验证

- 定向 Vitest：12 个文件、145 项通过，覆盖首页参数、旧路由、侧栏、外壳、Review 操作/模型、主题、Nia、灵动岛、共享布局与 Folder Browser 样式。
- Playwright：12 项通过，验证首页与刷新、唯一首项、旧知识点链接、完成复习、创建意图、导航和 30px/28px 轨道几何，以及 `/`、`/review`、`/notes`、`/flash` 的六主题切换。
- 全仓 lint：0 errors、18 warnings；最终修改文件定向 ESLint 通过。
- `npm run build` 和 Markdown 产物门禁通过。
- TypeScript：改前 248 项，改后 248 项；按错误位置及错误码比较，没有新增诊断。全仓并未通过类型检查。
- 实际 Electron 主进程 `--dev` 使用生产服务和独立临时 profile：默认加载 `/`，预加载桥可用，Review 可见，旧首页 DOM 不存在，唯一首项高亮，添加知识点、进入 Notes 后返回 Review 均通过。测试应用已关闭，临时 profile 已删除。
- `git diff --check` 通过。

未替换 `/Applications/Auris.app`，未递增版本、提交、推送或发布 Release。

## 拆分完成后的验证

- 阅读、视频、Review、灵动岛、Nia 与首页参数定向回归：24 文件、192 项通过。覆盖真实组件恢复段落/播放秒数、旧任务迁移、原数据保留、空新状态优先、坏数据/写入失败、失败完成意图重试、同窗口/跨窗口复习更新及午夜刷新。
- 外壳、主题、布局回归：6 文件、96 项通过；首页入口与侧栏 Playwright：6 项通过。
- 全仓 lint：0 errors、18 warnings；修改文件定向 ESLint 和 diff 检查通过。
- 生产构建及 Markdown 产物门禁通过。TypeScript 改前、改后均 248 项既有错误，按文件与错误码比较没有新增诊断。
- 独立临时 profile 的真实 Electron：旧任务自动复制，旧存储原文、阅读/PDF 位置和视频秒数保持不变；Nia 待复习数在完成事件后从 1 更新为 0；`/reading`、`/video`、`/notes`、`/` 均 HTTP 200 且正常显示应用壳。测试应用与临时 profile 已清理。
- 另复核 VMark 固定 `2d3903cb2887a7c6a7a8df7b814f14b745bc2415` 的 `src/stores/settingsStore/migrations.ts`、`src/stores/persistedListMerge.ts`（ISC）：先验证原始对象形状、已有新字段优先、保护持久化数据。未复制上游 Zustand 实现；Auris 用现有同步 localStorage 与 Electron 意图确认机制，本次采用保留源数据的复制迁移。

未改 Electron 主进程、预加载、Vault 工厂、Notes 核心或真实用户数据；未替换已安装包、递增版本、提交、推送或发布 Release。

## 用户授权后的本地安装

2026-10-06 按用户“替换本地app”要求，构建原生灵动岛 helper、组装 standalone/runtime，再用 electron-builder 生成 arm64 本地目录包（`--publish never`，ad-hoc 签名），将 `/Applications/Auris.app` 替换并正常启动。版本保持 1.0.17；没有递增版本、提交、推送或发布 Release。

旧安装包已用 ditto 完整备份到 `release/backups/Auris-1.0.17-before-review-home-20261006-162131.app`。替换前确认备份 app.asar 与原安装包一致，新包先在 Applications 临时位置验证签名，再交换安装目录；安装后确认 app.asar 与构建产物 SHA-256 相同。没有清空真实用户 profile、Vault 或学习进度。

- 构建包及安装包均通过 `codesign --verify --deep --strict` 和打包隐私审计；打包时终端权限 entitlements 检查通过。
- 原 packaged MCP smoke 未进入 Notes，停在 Review 时请求 Notes session 超时；代码确认 Notes facade 的订阅仅在 Notes 工作区挂载。使用临时测试副本增加进入 `/notes` 的步骤后，打包的 Notes MCP、Browser 状态、Nia workflow 和 Browser workflow 均通过。临时脚本已删除，没有修改受保护主进程或预加载。
- 从真正安装位置 `/Applications/Auris.app/Contents/MacOS/Auris` 启动独立临时 profile，使用包内 standalone 服务，Review 默认首页、阅读/视频/Notes 访问、旧任务复制和旧存储原文保留全部通过，Nia 待复习数完成后从 1 更新为 0；旧首页 DOM 不存在。测试 profile 已删除。
- 最后使用 macOS `open` 启动正常用户应用；启动日志确认窗口 ready-to-show 并加载 `http://127.0.0.1:3000/`，应用保留运行。

可复核安装路径、版本、备份、校验值与结果见 `docs/review-home-installation-2026-10-06.json`。
