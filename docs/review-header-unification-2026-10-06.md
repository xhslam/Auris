# Review 日历移除与顶部统一（2026-10-06）

用户要求删除 Review 日历界面，并保留复盘热力图的顶部设计用于其他 Review 界面。

## 变更与依据

原界面已经共用 `output-review-navigation`，差异来自 CSS：热力图通过 `:has(.review-heatmap-view)` 给整个容器设置 64px 左侧留白，其他界面用最多 32px 的对称间距；今天视图还重复声明自己的容器与导航布局。运行中的旧包在 1440×900 Chromium 测量中，热力图导航 x=64，其他三个视图 x=32，顶部 y=10、高度 52px 相同。

- 从视图类型、标签与渲染分支移除日历，删除 `CalendarView`、日期标题辅助函数及全部日历专属 CSS。
- 将热力图原有 64px 左留白纳入 Review 共用容器；删除今天视图重复的容器/导航规则与热力图条件覆盖。窄窗口也共用同一留白。
- 保留原顶部标签、活动下划线、逾期数、底部分隔线及右侧添加按钮；补全添加按钮的可访问名称，窄窗口隐藏文字时仍可识别。
- 保留今天、全部、项目、复盘热力图及项目详情；不修改 Review 数据模型、存储、1/2/4/7 复习计划或热力图统计。

## 源码与设计参考

对照 VMark 固定提交 `2d3903cb2887a7c6a7a8df7b814f14b745bc2415` 的 `src/App.tsx`、`src/shell/AppShell.tsx`（ISC）：外壳集中管理顶部 chrome 的空间，业务内容放在 primary slot，避免多个局部布局重复计算顶部。VMark 没有 Auris 的 Review 业务，不能直接复制其 Tauri 外壳；本次复用 Auris 既有共用导航并收敛样式，未引入第二套组件。改后再次复核两套外壳的布局边界。

参阅 [Shape of AI](https://www.shapeof.ai/) 与 [Astryx](https://astryx.atmeta.com/) 的引导、主题和组件原则；视觉以用户截图中已有热力图为基准。用户指定的本地 UI_DESIGN_SYSTEM_GUIDE.md 路径及桌面文件搜索均未找到文件，沿用用户消息中的设计令牌与交互规范。

## 验证

- Review 页面/模型/指标 Vitest：3 文件、25 项通过。覆盖项目/知识点创建、完成复习、深链接、项目详情、热力图日期明细及四视图共用导航；日历不存在。
- Playwright：5 项通过。六主题 × 两种尺寸（1440×900、1280×720）× 四视图验证顶部位置、尺寸、添加按钮配色/圆角、分隔线和唯一活动入口，添加表单均能正常打开；旧路由参数仍可用。
- 真实 Electron、独立临时 profile：四视图导航矩形均为 x=116、y=10、1292×52；添加表单均可打开关闭。截图保留在忽略的 `release/review-header-*.png`。测试 profile 已删除。
- 全仓 ESLint：0 errors、18 项既有 warnings。定向 ESLint 和 diff 检查通过。
- TypeScript 改前/改后均 248 项既有错误；诊断集合无新增。全仓类型检查未通过。

## 本地安装

生产构建、Markdown 产物门禁、standalone 组装及隐私审计通过；生成 arm64 本地目录包（ad-hoc 签名，publish never），版本保持 1.0.17。旧包备份到 `release/backups/Auris-1.0.17-before-review-header-20261006-165545.app`，备份 app.asar 哈希与原包一致。正常退出旧主窗口后，暂存并验证新包，通过目录交换替换 `/Applications/Auris.app`；安装前后深度 strict codesign 验证通过。

第一次退出检查错误地将已有 MCP node 子进程也当作主应用，安装安全停止并保留原目录；随后按进程参数排除 sidecar，仅检查主窗口进程后完成替换。提前启动的一次安装验收实际读取旧包，返回 5 个入口，因此不计作新包证据；新包完成替换后重新执行验收。

- 已安装 CSS 文件集合与本次生产构建的内容哈希完全一致，编译产物中不存在日历或热力图专属容器覆盖，包含共用 64px 左留白。
- 从 `/Applications/Auris.app/Contents/MacOS/Auris` 启动真实 Electron，使用独立临时 profile 和包内 standalone 服务：只有四个入口，无日历；四个导航矩形均为 x=116、y=10、1252×52；四个界面的添加表单均可打开关闭。测试实例及 profile 已清理。
- 安装记录见 `docs/review-header-installation-2026-10-06.json`。未清空真实用户数据，未递增版本、提交、推送或发布 Release。

最后重新启动正常用户应用；启动日志确认主窗口 ready-to-show 并加载根路由。应用保留运行。
