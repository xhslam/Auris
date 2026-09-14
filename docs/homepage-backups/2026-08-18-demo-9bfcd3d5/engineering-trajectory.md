# Demo 9bfcd3d5 迁入 Auris 首页：工程轨迹

## 目标与范围
用户要求将已确认的「Auris 自由画布首页 Demo」版本 `9bfcd3d5` 替换本地桌面 App 首页。改造范围严格限制在首页组件、首页专属样式、首页静态资源与备份文档；不修改 Reading、Review、Notes、Flash、Nia、浏览器桥接或 Electron 主进程。

## 实现路径
首页采用 Demo 的深石墨 / 暖金、窄右侧导航、三栏卡片工作台、显式编辑模式、标题抓手拖拽、卡片菜单、聚焦查看和恢复默认布局。原 Demo 的静态内容被替换为 Auris 的真实现有能力：`CalendarHeatmap`、`useNotesWorkbench + NotesFileTree`、`DailyQuote`、`LifeRoad`、`PlanList`、`BrowserStatusCenter`、Output Review 指标及既有路由导航。

## 文件
- `src/components/home/home-page.tsx`：首页工作台编排、真实状态读取、组件交互与导航。
- `src/components/home/home-demo-workbench.css`：迁入的 Demo 视觉系统，仅作用于 `.auris-demo-home`。
- `public/auris-home-demo/life-road.webp`、`auris-mark.webp`：从指定 Demo 复制的本地化生命路径与品牌图形。
- `docs/homepage-backups/2026-08-18-demo-9bfcd3d5/`：改造前首页源码 / 样式备份、迁移映射与本记录。

## 验证
- 首页定向 ESLint：无 error（`img` 性能建议为非阻塞 warning）。
- `npm run build`：Next.js 编译、TypeScript、静态页面和路由生成全部通过。
- 运行中的开发服务：`/`、`/notes`、`/reading`、`/review`、`/flash`、`/nia` 均返回 HTTP 200。
- Playwright 真实浏览器：首页加载 Demo 根节点，进入编辑模式后将“今日复习”从中栏拖动到右栏成功，右侧导航存在。

## 取舍与风险
首页仍复用原模块的存储和回调，没有建立副本。卡片布局仅保存首页布局状态；生命周期图与品牌图形已复制到本地 public，避免依赖预览站点。现有 `main.cjs` 的改动为工作区预存内容，本轮未触碰。
