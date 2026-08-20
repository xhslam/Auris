# Auris 首页真实学习卡片设计规格

> **状态：设计已获用户批准，待实施计划。**  
> **日期：2026-08-20**  
> **范围：只改造首页的「今日复习」「学习进度」「当前学习」三类 Widget 数据与呈现；不建设新的长期学习计划系统。**

## 1. 目标与设计结论

首页当前的学习卡片混合了真实数据与硬编码展示：`今日复习` 已读取 Output Review 状态，但空态和每日新增提醒不符合用户需要；`学习进度` 固定展示数学、英语、自控时长；`当前学习` 固定展示数学一、线性代数和 42 分钟。这使首页看起来像学习仪表盘，却不能反映用户在 Auris 中实际做过什么。

本设计采用 **轻量学习摘要层**。Review、Reading、Video、Notes 继续拥有各自业务数据，首页通过稳定适配器读取一份经校验的摘要。只为恢复功能保存最少的指针和设置，不建立全局学习事件账本，不复制文章、视频、笔记或复习内容，也不引入长期考研计划模型。

三张独立卡片保留现有 Workspace Widget 契约，并允许根据真实数据重新设计内部布局：

1. `今日复习`：只读取 `/review` 中真实存在的项目、知识点和 1/2/4/7 复习周期；每天没有新建知识点时立即提醒用户去添加。
2. `学习进度`：只显示 Reading 中最近实际打开的一篇文章及其真实阅读完成度。
3. `当前学习` 重命名并重构为 `继续学习`：固定显示最近文章、最近视频、指定学习目录中的最近笔记三条真实恢复入口。

## 2. 已确认的产品决策

| 决策 | 结论 |
| --- | --- |
| 卡片结构 | 保留三张独立卡片，不合并成单一学习中心。 |
| 今日复习来源 | 只读取 `/review` 已有内容；不从笔记、单词、句子或陪练记录自动生成复习任务。 |
| 每日新增提醒 | 以知识点 `createdAt` 的本地日期判断。当天没有新建知识点就显示提醒，即使当天已完成旧复习。 |
| 学习进度来源 | Reading 最近实际打开的文章；进度读取现有 Reading progress map。 |
| 最近文章选择 | 自动使用 Reading 中最近打开的文章，不需要手动固定。 |
| 继续学习内容 | 同时固定展示文章、视频、学习笔记三条入口；缺少某类数据时保留该位置并显示空态。 |
| 学习笔记范围 | 用户选择一个或多个 Vault 学习目录；只从这些目录选择最近更新的笔记。 |
| 数据架构 | 新增轻量摘要 Hook 与模块适配器；不让 `HomePage` 直接理解所有来源存储格式。 |
| 主题 | 使用全局语义主题令牌；所有主题保证正文和关键操作具有强对比。 |

## 3. 现有能力与差距

### 3.1 Review

`home-page.tsx` 已通过 `readOutputReviewState`、`getReviewQueue` 和 `getDashboardMetrics` 读取真实 Review 数据，并订阅 `OUTPUT_REVIEW_STORAGE_EVENT`。现有模型包含知识点 `createdAt`、复习事件完成时间、逾期、今日到期和掌握状态，因此不需要新的 Review 数据库。

差距是首页没有计算“今天是否新建知识点”，且空队列只显示“暂时没有待复习条目”，不能满足每日添加提醒。Review 页面也需要支持从首页直接进入新建知识点流程。

### 3.2 Reading

Reading 已通过 `auris-reading-progress` 保存 `sourceId -> progress`，正文根据读到的最深段落更新，PDF 根据可见页更新，并遵守只增不减。Reading Workbench 当前只在 React 状态中持有 `selectedSourceId`、活动段落和 PDF 进度，离开页面后不能确定最近打开的文章或精确恢复位置。

差距是缺少最近文章指针、最后打开时间、活动段落或 PDF 页码，以及进度变化通知。首页不得把 Reading 内置示例文章误当成用户最近阅读。

### 3.3 Video

视频库提供真实视频 ID、标题、总时长和来源状态；视频详情页拥有当前播放时间和播放器状态，但没有跨页面持久化播放位置。因此首页目前不能显示真实的最近视频或继续播放位置。

差距是缺少最近视频指针和节流保存的播放秒数。标题、总时长、可用状态必须继续以视频库为权威，不能复制到首页快照中。

### 3.4 Notes

NotesStorage 能列出笔记摘要，包含 `relativePath`、标题和 `updatedAt`，桌面 Vault 还支持变更订阅。现有数据足以按目录前缀过滤并找到最近更新的笔记。

差距是用户尚未选择哪些目录属于学习目录。系统不得使用标题关键词或 AI 猜测笔记类型。

## 4. 轻量学习摘要架构

### 4.1 边界

新增 `useHomeLearningSummary()` 作为首页唯一入口。它组合四个独立适配器，每个适配器只理解一个来源，并返回统一的加载状态。首页卡片不读取原始 localStorage 键、视频桥接实现或 Vault 文件结构。

```ts
type LearningSourceStatus = "loading" | "ready" | "empty" | "unavailable";

type HomeLearningSummary = {
  review: HomeReviewSummary;
  reading: HomeReadingSummary;
  continueLearning: {
    article: HomeReadingSummary;
    video: HomeVideoSummary;
    note: HomeLearningNoteSummary;
  };
};
```

建议拆分：

| 单元 | 职责 | 依赖 |
| --- | --- | --- |
| `home-review-summary.ts` | 读取 Review、计算今日队列、完成数和今日新增数。 | Output Review model/storage。 |
| `reading-resume-store.ts` | 校验并保存最近文章及恢复位置；不保存文章内容或权威百分比。 | localStorage。 |
| `home-reading-summary.ts` | 合并 Reading source、progress map 与 resume 指针。 | Reading source loader、progress store、resume store。 |
| `video-resume-store.ts` | 校验并节流保存最近视频和播放秒数。 | localStorage 或既有桌面 runtime 存储。 |
| `home-video-summary.ts` | 用 resume 视频 ID 查询视频库，返回标题、时长和恢复位置。 | Desktop video library bridge。 |
| `learning-note-folders-store.ts` | 保存用户选择的 Vault 相对目录路径。 | localStorage。 |
| `home-learning-note-summary.ts` | 从已选目录中过滤笔记并选取最近更新项。 | NotesStorage。 |
| `use-home-learning-summary.ts` | 独立加载、订阅、错误隔离和聚合。 | 上述适配器。 |

`HomePage` 只接收 `HomeLearningSummary` 并将相应部分传给三张卡片。适配器保持无 UI 或尽量纯函数化，以便使用假存储和假时间测试。

### 4.2 不建立第二份业务数据

恢复存储只保存定位信息：

```ts
type ReadingResumeState = {
  version: 1;
  sourceId: string;
  lastOpenedAt: string;
  position:
    | { kind: "paragraph"; paragraphId: string }
    | { kind: "pdf"; page: number }
    | { kind: "unknown" };
};

type VideoResumeState = {
  version: 1;
  videoId: string;
  currentTimeSeconds: number;
  lastOpenedAt: string;
};

type LearningNoteFoldersState = {
  version: 1;
  relativePaths: string[];
};
```

建议存储键：

- `auris.reading.resume.v1`
- `auris.video.resume.v1`
- `auris.home.learning-note-folders.v1`

Reading 百分比继续读取 `auris-reading-progress`；Video 标题与总时长继续读取视频库；Notes 标题和更新时间继续读取 Vault；Review 完全读取现有 Output Review 状态。任何适配器不得用恢复存储中的旧展示字段兜底。

## 5. 卡片设计

### 5.1 今日复习

卡片同时表达“执行情况”和“今日是否新增”。两者互不覆盖。

正常内容：

- 待复习总数：逾期 + 今日到期。
- 今日完成数。
- 执行进度：`completedToday / (completedToday + overdue + dueToday)`。
- 下一项真实知识点标题。
- 主动作：有待办时为“继续复习”；无待办时为“打开 Review”。

每日新增提醒：

- `createdTodayCount === 0` 时始终显示“今天还没有添加新知识点”。
- 提供独立“去添加”动作，进入 `/review` 并直接打开新建知识点流程。
- 当天已完成全部旧复习时，卡片可同时显示“今日复习已完成”和新增提醒。

状态：

| 状态 | 呈现 | 动作 |
| --- | --- | --- |
| 有待复习 | 数量、完成数、进度、下一项标题。 | 继续复习。 |
| 已完成当日复习 | 明确完成状态，不显示 0% 进度。 | 查看 Review。 |
| 当日未新增 | 独立提醒，不覆盖完成状态。 | 去添加。 |
| Review 资料库为空 | “还没有复习内容”。 | 创建第一个知识点。 |
| 读取失败 | “暂时无法读取复习状态”。 | 打开 Review。 |

### 5.2 学习进度（Reading）

卡片只展示最近实际打开的 Reading 文章：

- 标题与可选作者/类型。
- 真实完成百分比。
- 文本内容显示“第 N / M 段”；PDF 显示“第 N 页”与百分比。
- 最后打开时间。
- 主动作：进行中为“继续阅读”，100% 为“重新打开”。

当没有 resume 指针时显示“还没有开始阅读”与“浏览 Reading”；最近来源已删除时清除失效指针并显示“最近阅读内容已不可用”。不得回退到 `READING_SOURCES[0]` 作为用户进度。

### 5.3 继续学习

卡片固定显示三行，顺序为文章、视频、学习笔记。三行不会因为没有数据而消失，以便用户知道还可配置什么。

1. 文章：复用 `HomeReadingSummary`，显示标题、百分比和继续动作。
2. 视频：显示真实标题、`currentTime / duration` 和继续动作；播放结束后显示“已看完”，仍可重新打开，直到用户播放另一视频。
3. 学习笔记：显示选定目录中 `updatedAt` 最新的笔记、相对目录和更新时间；点击打开笔记。

学习目录配置通过卡片菜单或空态动作打开。目录选择器支持多选 Vault 目录，保存相对路径；目录被移动或删除后显示“学习目录已不可用”，允许重新选择。未配置目录时显示“选择学习目录”，不回退到整个 Vault 的最近笔记。

## 6. 数据流与更新机制

### 6.1 Review

继续订阅 `OUTPUT_REVIEW_STORAGE_EVENT` 与浏览器 `storage` 事件。摘要计算使用本地日期键，避免 UTC 跨日错误。首页挂载、窗口重新获得焦点以及本地零点跨日时重新计算，保证“今日新增”不会停留在前一天。

### 6.2 Reading

- 用户从 Reading 内容库打开文章时立即更新 `sourceId` 与 `lastOpenedAt`。
- 正文活动段落变化或 PDF 页码变化时更新 resume position。
- 现有 `saveReadingProgressFor` 成功提高百分比后派发 Reading progress 变更事件。
- 首页同时订阅 resume 与 progress 事件。
- 从首页返回 Reading 时，Reading Screen 接受稳定的 source/position 参数或等价恢复输入，等待内容加载后再滚动到段落或页码。

### 6.3 Video

- 视频详情加载成功后把当前视频设为最近视频。
- 播放中每 10–15 秒节流保存；暂停、结束、页面隐藏和卸载时立即刷新一次。
- `currentTime` 必须限制在 `[0, duration]`；损坏 JSON、非有限数值和负数恢复为无记录。
- 首页订阅 resume 事件，并用视频库确认视频仍存在且可播放。
- 返回视频详情后在媒体 metadata 就绪时应用恢复时间，不能在 duration 未知时盲目 seek。

### 6.4 Notes

- 目录设置变化时立即重新查询。
- NotesStorage 提供变更订阅时使用订阅；不支持时在首页重新获得焦点时刷新。
- 使用目录边界感知的相对路径判断，避免 `math` 错误匹配 `mathematics`。
- 多目录结果统一按 `updatedAt` 降序，选择最新一项。

### 6.5 独立错误隔离

`useHomeLearningSummary()` 使用独立状态或 `Promise.allSettled` 等等价方式加载来源。Video bridge 不存在、Vault 未配置或某个 localStorage JSON 损坏时，只将对应摘要标记为 `empty` 或 `unavailable`，不清空其他来源，也不让三张卡片一起进入错误状态。

## 7. 路由与动作契约

| 动作 | 目标 |
| --- | --- |
| 继续复习 | `/review`，队列按现有优先级打开。 |
| 去添加复习 | `/review` 携带明确 create intent，Review Client 挂载后打开新建知识点流程。 |
| 继续阅读 | `/reading` 携带 source ID 与位置；Reading Screen 恢复文章。 |
| 继续播放 | `/video/[videoId]`，播放器根据 resume store 恢复时间。 |
| 打开笔记 | `/notes?resumeNoteId=<id>`，复用现有笔记恢复契约。 |
| 选择学习目录 | 打开只列出当前 Vault 目录的多选配置界面。 |

路由参数只表达目标，不复制业务展示字段。无效目标进入对应模块的正常空态或内容库，不显示 404。

## 8. 主题、对比与响应式

三张卡片继续使用现有 `demo-widget` 外壳、拖动、大小预设、隐藏、布局保存和响应式规则。内部视觉不写死深色背景或金色前景，直接消费全局应用语义令牌：

- 容器：`--app-surface`
- 高强调标题：`--app-ink`
- 正文：`--app-text`
- 次级文字：`--app-muted`
- 边界与轨道：`--app-line`、`--app-fill-strong`
- 强调与按钮：`--accent-strong`、`--accent-ink`

Night、Paper、Mint、Sepia、Solarized、White 各主题下正文和关键操作至少满足 WCAG AA 4.5:1；大号数值仍应尽量达到该标准。逾期、完成、未新增和错误状态必须同时有文字或图标，不能只改变颜色。

窄卡片中标题使用省略号但保留 `title`/可访问名称；进度条、百分比和动作不横向溢出。`继续学习` 三行在 Small 高度下允许内部纵向滚动或紧凑呈现，但不得隐藏某一类来源。

## 9. 水合、性能与隐私

- 服务端和客户端首个渲染统一使用确定性的 loading/empty shell；localStorage、Vault 和 desktop bridge 只在挂载后读取。
- 不在 render 初始化器中直接读取浏览器状态，避免重现首页和视频详情的 Recoverable Error。
- Reading 和 Video 写入均节流；不在 scroll、IntersectionObserver 或 `timeupdate` 的每次回调中写盘。
- 首页只加载摘要，不读取完整视频文件、PDF bytes 或笔记正文。
- 所有恢复元数据保持本地，不新增云同步、遥测、网页行为追踪或第三方服务。

## 10. 推荐文件职责

建议按以下边界实施，最终命名可在计划阶段与仓库惯例对齐：

| 文件 | 作用 |
| --- | --- |
| `src/features/home-learning/home-learning.types.ts` | 摘要、状态和恢复类型。 |
| `src/features/home-learning/home-review-summary.ts` | Review 纯摘要计算。 |
| `src/features/home-learning/reading-resume-store.ts` | Reading 指针读写、校验和事件。 |
| `src/features/home-learning/home-reading-summary.ts` | Reading 来源与进度合并。 |
| `src/features/home-learning/video-resume-store.ts` | Video 指针读写、节流友好 API 和事件。 |
| `src/features/home-learning/home-video-summary.ts` | Video bridge 查询与摘要。 |
| `src/features/home-learning/learning-note-folders-store.ts` | 学习目录设置。 |
| `src/features/home-learning/home-learning-note-summary.ts` | Vault 目录过滤与最近笔记。 |
| `src/features/home-learning/use-home-learning-summary.ts` | 加载、订阅、跨日与错误隔离。 |
| `src/components/home/learning/*` | 三张卡片的可测试展示组件与目录选择界面。 |
| `src/components/home/home-page.tsx` | 注册卡片并消费摘要；移除硬编码学习数据。 |
| Reading、Video、Review 现有入口 | 写入恢复指针、派发更新事件、支持深链接恢复。 |

不在本需求中重构其他无关 Home Widget，也不迁移现有业务存储。

## 11. 测试设计

### 11.1 单元测试

- Review：本地日期边界、当天新建计数、完成旧复习但未新增、资料库为空。
- Reading resume：非法 JSON、失效 source ID、段落/PDF position 校验、100% 完成状态。
- Reading summary：progress map 为权威，不读取示例 progress 冒充用户数据。
- Video resume：负数、超出 duration、非有限数、节流边界和完成状态。
- Notes：多目录、路径边界、无配置、目录删除、`updatedAt` 排序。
- 聚合 Hook：单来源失败不影响其他来源、跨日刷新和事件更新。

### 11.2 组件与集成测试

- 三张卡片的 ready、empty、completed、unavailable 状态。
- Review 同时显示“今日完成”和“当天未新增”提醒。
- “去添加”直接打开 Review 新建流程。
- Reading 打开文章、推进段落/PDF 后首页百分比更新，并可恢复位置。
- Video 播放、暂停、离开后首页显示真实位置，并可继续播放。
- 学习目录配置、Vault 笔记更新与点击恢复。
- SSR/客户端首帧一致，不产生水合警告。
- 现有 Widget 拖动、尺寸预设、布局持久化和窄屏堆叠继续通过。

### 11.3 主题与可访问性

- 在 Night、Paper、Mint、Sepia、Solarized、White 检查正文、按钮和状态对比度。
- 键盘可到达所有主动作与目录配置；焦点环清晰。
- 进度条具有 `role="progressbar"`、范围和值；状态文本可被屏幕阅读器理解。
- 320px 卡片内容宽度与 480px 页面视口无横向溢出。

## 12. 验收标准

| 编号 | 可观察标准 |
| --- | --- |
| AC-01 | 首页不再出现硬编码的“数学 2h10m、英语 1h20m、自控 1h05m”或固定“线性代数 42 min”。 |
| AC-02 | 今日复习的数量、完成、逾期和下一项与 `/review` 当前状态一致。 |
| AC-03 | 当天未新建知识点时立即显示添加提醒；即使已完成旧复习也不隐藏提醒。 |
| AC-04 | 学习进度显示最近实际打开的 Reading 文章和现有 progress map 的真实百分比。 |
| AC-05 | 点击继续阅读能回到对应文章和段落/PDF 页；删除来源后不继续显示旧内容。 |
| AC-06 | 继续学习固定显示文章、视频、学习笔记三行，缺失项显示明确空态。 |
| AC-07 | 视频进度来自真实播放器位置，点击后恢复到合理时间点。 |
| AC-08 | 学习笔记只来自用户选择的 Vault 目录，且显示最近更新项。 |
| AC-09 | 任一来源不可用时，其他卡片仍显示自身真实状态；错误不伪装为 0。 |
| AC-10 | 全部全局主题中内容与背景对比清晰，卡片窄栏无横向溢出。 |
| AC-11 | 刷新应用后恢复元数据仍有效，并且首屏没有水合错误。 |
| AC-12 | 原首页布局、拖拽、尺寸、隐藏和命名布局行为不回退。 |

## 13. 非目标与后续可能性

本期不实现长期考研计划、科目进度、学习时长分析、自动复习生成、跨模块学习事件账本、AI 学习诊断、云同步或第三方数据采集。首页只忠实汇总现有页面的真实状态，并补齐必要的恢复指针。

如果未来需要按科目统计、跨模块时间线或 Nia 学习建议，应在这些摘要适配器之上另立规格，而不是把推断逻辑继续塞入三张卡片。

## 14. 工程轨迹

本设计先审计首页与 Review、Reading、Video、Notes 的现有数据契约，再通过逐项确认收敛为三张真实卡片。早期曾探索长期计划守护与统一事件账本，用户明确纠正范围后撤回该方向；最终选择轻量摘要层，原因是它能消除硬编码、复用现有真实数据，并避免制造第二份易过期业务快照。

设计阶段只新增本规格文档和被 `.gitignore` 排除的可视化 brainstorming 资料，未修改产品源码、运行配置或既有未提交改动。实施阶段的主要风险是 Reading/Video 恢复深链接、跨日刷新和主题覆盖优先级，需要按本规格的集成与水合测试验证。
