# Demo `9bfcd3d5` → Auris 首页迁移映射

- **外壳与工作台布局**：迁入 Demo 的深色三栏、窄侧栏、可编辑布局、卡片菜单、拖拽、尺寸调整和焦点查看；实现限定在首页专属组件与样式。
- **记录日历**：继续使用 `CalendarHeatmap`，不改闪念记录存储。
- **工作区**：继续使用 `useNotesWorkbench` 与 `NotesFileTree`，所有文件操作保持原回调和 vault 实现。
- **每日格言 / 人生阶段 / 今日任务**：继续使用 `HomeData`、`DailyQuote`、`LifeRoad`、`PlanList` 及原有持久化回调。
- **今日复习**：首页只读 `output-review` 的既有指标与队列，并跳转 `/review`。
- **快速记录**：使用现有 `/flash` 导航；不新增第二套闪念存储。
- **Browser status**：继续使用 `BrowserStatusCenter`。
- **侧栏 / 快捷入口**：只调用既有 `/notes`、`/flash`、`/review`、`/reading` 路由，不改目标模块。
