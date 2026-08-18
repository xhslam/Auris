# Auris 首页独立改造范围

来源：用户提供的《Auris 首页改造》规格（2026-08-18）。

本轮仅改造首页路由 `/` 所渲染的首页专属组件与首页专属样式。首页定位为每日信息入口，而不是 Workspace 的复制品。首页展示 Today / Continue、真实复习摘要、今日 Focus、最近笔记、Nia briefing 与既有模块的导航入口。

严格约束：不修改 Reading、输出复习、Workspace、Nia、设置、文件系统及其数据/交互逻辑；首页仅读取现有 Home localStorage、Output Review 状态和最近笔记摘要，并复用既有路由 `/notes`、`/reading`、`/review`、`/flash`。

实现隔离：保留旧首页组件与样式备份于本目录；仅重写 `src/components/home/home-page.tsx` 并新增 `src/components/home/home-entry.css`。`src/app/page.tsx`、`src/components/desktop/desktop-home-shell.tsx` 及其余模块不改动。
