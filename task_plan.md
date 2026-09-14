# V10 Polish Task Plan

## Goal

在 `english-shadowing-web` 上完成 10 轮连续升级迭代，把当前本地优先的英语 shadowing 产品打磨成更完整、更舒适、更有惊艳感的桌面学习工作台。

## Current Baseline

- `npm run lint` 通过
- `npm run test` 通过
- `npm run build` 通过
- 已抓取基线截图：
  - `test-results/baseline-home.png`
  - `test-results/baseline-workspace.png`

## Iteration Track

| Phase | Status | Focus |
|-------|--------|-------|
| 1 | complete | 建立 10 轮设计、计划、沉淀文件 |
| 2 | complete | 首页叙事与惊艳感重构 |
| 3 | complete | 训练输入面板的信息层级与引导优化 |
| 4 | complete | 播放控制与训练反馈强化 |
| 5 | complete | 首页成长感与节奏感增强 |
| 6 | complete | 训练区即时洞察与练习策略可视化 |
| 7 | complete | 文案统一、状态反馈与舒适度优化 |
| 8 | complete | 可发现性与微交互优化 |
| 9 | complete | 测试补强与回归验证 |
| 10 | complete | 视觉收尾、复盘沉淀、版本总结 |

## Follow-up Iteration Track

| Phase | Status | Focus |
|-------|--------|-------|
| 11 | complete | 复查 Codex skills 与 MCP 能力，确认本轮升级边界 |
| 12 | complete | 定位桌面侧栏按钮失效的真实根因 |
| 13 | complete | 修正桌面侧栏弹层定位与遮罩层级 |
| 14 | complete | 为桌面侧栏可见性补 E2E 回归断言 |
| 15 | complete | 给“最近记录”加入恢复摘要与主恢复入口 |
| 16 | complete | 给当前训练增加状态标识与更友好的状态文案 |
| 17 | complete | 给“模板”加入描述、词数和快速开始摘要 |
| 18 | complete | 统一侧栏信息层级、CTA 和视觉舒适度 |
| 19 | complete | 补强组件测试与桌面侧栏冒烟验证 |
| 20 | complete | 记录经验沉淀，形成可继续迭代的侧栏工作台方向 |

## Desktop Platform Iteration Track

| Phase | Status | Focus |
|-------|--------|-------|
| 21 | complete | 复查 Codex skills、MCP 与现有文档，确认本轮对标桌面页面升级 |
| 22 | complete | 重构桌面框架与分组式导航，建立更像产品化桌面端的壳层 |
| 23 | complete | 让首页贴近课程 / 音频 / 视频总览页，重排为桌面学习中枢 |
| 24 | complete | 新增社区、课程、音频、视频、文档、生词本、设置等桌面页面 |
| 25 | complete | 先补首页、社区、设置桌面 E2E 断言，再驱动实现转绿 |
| 26 | complete | 强化聊天页，补双栏结构、快速操作与更完整的对话工作区 |
| 27 | complete | 强化资源库，补“资源概览”摘要层和更完整的工具条工作流 |
| 28 | complete | 继续统一评测、设置、社区页面的桌面层级与语气 |
| 29 | complete | 补聊天页 / 音频页冒烟回归，确认升级不只是静态美化 |
| 30 | complete | 回写本轮 10 版经验、风险和 GitHub 灵感映射，形成下一阶段基线 |

## Desktop Platform Deepening Track

| Phase | Status | Focus |
|-------|--------|-------|
| 31 | complete | 回读当前桌面页与沉淀文档，锁定本轮只深化课程、社区、聊天三块 |
| 32 | complete | 先把课程 / 社区 / 聊天的新产品层目标写成冒烟断言 |
| 33 | complete | 为课程页新增独立 shell，建立更像 LMS 的课程工作台 |
| 34 | complete | 为课程页加入“本周训练节奏”和主续练入口 |
| 35 | complete | 为社区页加入“发帖前先搜一搜”和热榜信息层 |
| 36 | complete | 为社区页加入发布入口与更像论坛首页的结构感 |
| 37 | complete | 为聊天页加入“会话资产”区，让对话真正沉淀成训练材料 |
| 38 | complete | 统一课程 / 社区 / 聊天新增模块的样式语气和卡片语言 |
| 39 | complete | 跑通新增桌面冒烟与相关组件回归，验证增强层成立 |
| 40 | complete | 更新计划、发现、进度文档并作为下一轮继续扩张的基线 |

## Risks

- 当前工作区外层不是 git 根目录，不能依赖提交点作为阶段边界。
- 页面现有视觉已经成型，重构时需要避免破坏既有测试选择器和桌面本地能力。
- 由于任务跨度大，需要把“惊艳感”聚焦在主路径，而不是盲目加功能。
- 侧栏弹层作为 `workspace-shell` 的同级节点渲染，桌面布局下很容易因为定位上下文变化再次偏移。
- 新增桌面页面变多后，导航命名和已有工作区路由容易出现重复，测试需要防止可访问名称冲突。
- GitHub 搜索在“shadowing / learning desktop”方向召回并不稳定，外部灵感要谨慎筛选，避免引入错误对标。

## Commands

- `npm run lint`
- `npm run test`
- `npm run build`
- `npx playwright test tests/e2e/app-smoke.spec.ts`

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| `rg.exe` 无法执行 `Access is denied` | 1 | 改用 PowerShell `Get-ChildItem` / `Get-Content` |
| `next build` 因 `.next/dev/types` 路由类型生成缺失而失败 | 1 | 修复损坏的 `.next/dev/types/routes.d.ts`，补上缺失的 `playback` / `prepare` 路由类型后重新构建 |
