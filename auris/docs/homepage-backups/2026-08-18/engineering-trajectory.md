# 首页改造工程轨迹

## 任务解释
将路由 `/` 的 Auris 首页改造成每日信息入口；不复制 Workspace，不触碰 Reading、Review、Nia、设置、文件系统或其他路由的内部实现。

## 实现路径
保留当前首页源码与样式备份。仅重写 `src/components/home/home-page.tsx`，并新增 scoped 样式 `src/components/home/home-entry.css`。新首页复用既有 `HomeData` 的计划、既有 Output Review 的只读摘要及其状态事件、DesktopHomeShell 已加载的 `recentNotes`，并只通过既有 `/notes`、`/reading`、`/review`、`/flash`、`/nia` 路由跳转。

## 页面结构
Today / Continue Hero 由真实到期复习或最近笔记决定；随后展示真实 Review 摘要、现有 Home plans 的 Focus、近期笔记、复用 `getNiaReviewMessage` 的 Nia briefing，以及快捷导航。没有数据时使用空状态，不伪造学习时长、复习数量或最近文件。

## 改动文件
- `src/components/home/home-page.tsx`：首页专属 UI、只读数据摘要及导航。
- `src/components/home/home-entry.css`：首页作用域内的视觉样式。
- `docs/homepage-backups/2026-08-18/*`：原首页备份、范围说明与本记录。

## 验证
- `npx eslint src/components/home/home-page.tsx --no-warn-ignored`：通过。
- `npm run build`：通过，Next.js 成功编译、类型检查并生成全部路由。
- 临时 `next dev --port 3011`：首页返回新版 Continue 内容。
- 现有 3000 服务路由探测：`/notes`、`/reading`、`/review`、`/flash`、`/nia` 均为 HTTP 200。

## 风险与后续
本地现有 `main.cjs` 和部分 docs 文件处于未提交改动状态，本轮未修改。由于首页仅读取已有本地状态，真实数据的丰富度取决于现有计划、复习和笔记记录是否已存在；空状态会在数据缺失时显示。
