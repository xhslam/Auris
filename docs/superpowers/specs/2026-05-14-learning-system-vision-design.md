# Learning System Vision — 从跟读工具到训练系统

- Date: 2026-05-14
- Project: `english-shadowing-web`
- Status: Draft — 待用户审核
- Depends on: `2026-05-03-learning-memory-loop-design.md` (Learning Memory Loop)

## Summary

在 Learning Memory Loop 的基础上，增加三层新能力，把产品从"有记忆的跟读工具"升级为"有教学法的英语训练系统"：

1. **Skill Ladder（技能阶梯）** — 学习路径可视化，知道什么时候会卡、什么时候该坚持
2. **Spaced Repetition（间隔重复）** — 学习目的锚定，间隔提醒"你已经和上次不一样了"
3. **Difficulty Progression（难度递增）** — 每次训练突破舒适圈，不原地打转

这三层叠加在现有的 Recall Engine 之上，形成完整闭环：**知道自己在哪 → 知道要去哪 → 知道怎么去 → 知道什么时候该回去**。

## 用户愿景（直接引用）

> 学习流程非常清晰（在学一个系统知识时，我知道什么时候我会卡住，什么时候大家都会卡一下，什么时候我需要再坚持一下），学习目的非常明确（学完后我会得到什么，学完后我就和学之前不一样了，而且可以不断提醒，间隔提醒），学习难度逐步递增，不会原地打转，是有明确的每次训练都有突破自己舒适圈的效果，不是刻意重复，而是不断迭代，以及和之前的知识产生关联。

## 设计原则

- **透明优先**：所有算法决策都能用自然语言解释给用户，不引入黑盒
- **本地优先**：所有数据存本地，不依赖云端 AI 做决策
- **渐进增强**：用户可以只用 Skill Ladder 不用 SRS，可以只用 SRS 不用 Difficulty Progression
- **不替代现有层**：Recall Engine、Note Template、AI Context 保持不变，新层叠加其上

---

## Layer 1: Skill Ladder（技能阶梯）

### 要解决的问题

用户不知道自己在整个学习旅程中的位置。今天练了，明天练了，但感觉像在原地踏步。需要一个清晰的地图。

### 设计

定义 5 个英语跟读能力等级，每个等级包含：

| 属性                     | 说明                  | 示例                              |
| ---------------------- | ------------------- | ------------------------------- |
| `objective`            | 学完后你会得到什么           | "你能听清正常语速下的每个单词边界"              |
| `stuckPoints`          | 可预测的卡点（"大家都会在这卡一下"） | "连续弱读导致单词听起来像被吃掉了"              |
| `whyStuck`             | 为什么会卡（语言层面的原因）      | "中文是音节计时，英文是重音计时"               |
| `breakthroughHint`     | 什么时候该坚持一下           | "当你开始注意到说话者的换气点而不是每个词"          |
| `breakthroughCriteria` | 可测量的突破条件            | "120 WPM 材料连续 3 次 85%+ 词级时间轴对齐" |
| `prerequisiteLevel`    | 前置等级                | 1                               |
| `connectionsToPrior`   | 和之前知识的关联            | "你在 L1 学会的辅音连缀在这里会帮你更快识别词边界"    |
| `typicalDuration`      | 典型停留时间              | "通常需要 2-4 周"                    |

### 5 个等级

```
Level 1 — Sound Recognition（听清）
  目标：能在慢速英语中识别每个单词的边界
  卡点：连读让单词听起来像新词（"going to" → "gonna"）
  突破：120 WPM 材料 >90% 词级识别准确率
  关联：这是所有后续能力的基础，没有例外

Level 2 — Sound Reproduction（读准）
  目标：能准确发出英语的 44 个音素
  卡点：中文里不存在的音素（/θ/, /ð/, /æ/, /ɪ/ vs /i:/）
  突破：100 个高频词发音评估 >85% 准确率
  关联：L1 的听清能力直接决定了 L2 能听出自己的发音错误

Level 3 — Rhythm & Intonation（节奏语调）
  目标：能匹配母语者的节奏和语调模式
  卡点：中文音节计时 vs 英文重音计时的根本冲突
  突破：在 150 WPM 材料中，重音位置准确率 >80%
  关联：L2 的单音素准确是 L3 整句节奏的基础，单音不准节奏一定乱

Level 4 — Chunking（意群处理）
  目标：能以意群（4-6 词）为单位输入和输出
  卡点：大脑仍在逐词处理，无法并行
  突破：在 160 WPM 材料中，意群对齐率 >80%
  关联：L3 的节奏感让你自然感知意群边界，而不是死记语法规则

Level 5 — Expressive Shadowing（表达跟读）
  目标：能根据内容添加适当的情感和强调
  卡点：准确但不自然——每个词都对但整体像机器人
  突破：在 180 WPM 材料中，情感一致性评估 >85%
  关联：L4 的意群能力释放了认知资源，让你有余力关注表达
```

### 数据结构

```typescript
type SkillLevel = 1 | 2 | 3 | 4 | 5;

type SkillLevelDefinition = {
  level: SkillLevel;
  name: string;
  tagline: string;           // 一句话描述，给用户看的
  objective: string;         // 学完后你会得到什么
  stuckPoints: string[];     // 可预测的卡点
  whyStuck: string;          // 为什么会卡（语言层面）
  breakthroughHint: string;  // 什么时候该坚持
  breakthroughCriteria: string; // 可测量的突破条件
  prerequisiteLevel: SkillLevel | null;
  connectionsToPrior: string;   // 和之前知识的关联
  typicalDuration: string;      // 典型停留时间
};

type UserSkillProgress = {
  currentLevel: SkillLevel;
  levelProgress: Record<SkillLevel, {
    startedAt: string;
    sessionsCompleted: number;
    breakthroughMetrics: Record<string, number>; // 各项指标的当前值
    isBreakthrough: boolean;
    breakthroughAt?: string;
  }>;
};
```

### 用户可见的 UI 文案示例

当用户在 L2 卡了 3 天时：

> "你在 L2 Sound Reproduction 已经练了 3 天。这个阶段大家都会在 /θ/ 和 /ð/ 这两个音上卡住——中文里没有把舌尖放在牙齿间的发音方式。当你发现自己开始不自觉地注意到母语者的舌尖位置时，就是突破的信号。"

---

## Layer 2: Spaced Repetition（间隔重复）

### 要解决的问题

用户学完后没有"我和之前不一样了"的体感。知识会遗忘，没有系统性的复习提醒，学习成果随时间蒸发。

### 设计

基于 SM-2 算法（SuperMemo），为每个学习项维护复习时间表。这里的"学习项"不是单词卡片，而是：

| 学习项类型            | 示例                    | 复习方式           |
| ---------------- | --------------------- | -------------- |
| `skill-level`    | L2 Sound Reproduction | 间隔提醒当前水平的突破标准  |
| `saved-word`     | 已收藏单词                 | 间隔提醒复习该词及其原始语境 |
| `saved-sentence` | 已收藏句子                 | 间隔提醒重新跟读该句     |
| `learning-note`  | 学习笔记                  | 间隔提醒回顾笔记内容     |

### 算法

```
quality: 0-5 (用户自评复习质量)
  0 = 完全忘了
  1 = 有印象但说不出来
  2 = 能回忆起一部分
  3 = 能正确回忆但有困难
  4 = 能正确回忆，略有犹豫
  5 = 完美回忆

interval: 初始 1 天
easeFactor: 初始 2.5

如果 quality >= 3:
  interval = interval * easeFactor
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
否则:
  interval = 1 天
  easeFactor = max(1.3, easeFactor - 0.2)

easeFactor 不低于 1.3
```

### 数据结构

```typescript
type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

type SpacedRepetitionItem = {
  id: string;
  type: "skill-level" | "saved-word" | "saved-sentence" | "learning-note";
  targetId: string;        // 关联的学习项 ID
  title: string;
  interval: number;        // 当前间隔（天）
  easeFactor: number;      // 2.5 基准
  repetitions: number;     // 成功复习次数
  nextReviewAt: string;    // ISO 时间戳
  lastReviewAt?: string;
  lastQuality?: ReviewQuality;
  createdAt: string;
};

type SpacedRepetitionSchedule = {
  items: SpacedRepetitionItem[];
  dueToday: SpacedRepetitionItem[];
  dueThisWeek: SpacedRepetitionItem[];
};
```

### 用户可见的 UI 文案示例

当用户登录时：

> "Welcome back. Today you have 3 items to review:
>
> - L2 Sound Reproduction: check your /θ/ progress (due)
> - 'rhythm' — saved word from 'TED: How stress changes your brain' (due)
> - Your learning note '2026-05-10 Meeting Rehearsal' (due)"

---

## Layer 3: Difficulty Progression（难度递增）

### 要解决的问题

用户感觉在"刻意重复"——同样的材料、同样的速度、同样的方式。没有突破舒适圈的体感。

### 设计

为每次训练会话计算难度分数，并追踪用户的历史表现，确保下一次训练的难度 ≥ 上一次。难度由材料本身决定（输入难度）和用户表现决定（输出难度）。

### 输入难度（Material Difficulty）

```typescript
type MaterialDifficultyProfile = {
  wpm: number;                    // 语速（词/分钟）
  uniqueWordRatio: number;        // 独特词比例
  avgWordFrequencyRank: number;   // 平均词频排名（越低越罕见）
  avgSentenceLength: number;      // 平均句长
  connectedSpeechDensity: number; // 连读密度（0-1，连读次数/总词数）
  accentVariant: string;          // 口音变体（"General American" | "BBC English" | ...）
  overallScore: number;           // 综合难度 0-100
};
```

### 输出难度（User Performance）

```typescript
type SessionPerformance = {
  wpmMatchRate: number;         // 跟读 WPM 匹配率
  phonemeAccuracy: number;      // 音素准确率（如有发音评估）
  chunkAlignmentRate: number;   // 意群对齐率
  userReportedDifficulty: number; // 用户自评 1-5
  overallScore: number;         // 综合表现 0-100
};
```

### 难度递增策略

```
如果最近 3 次 overallScore > 80:
  提升难度：推荐 WPM +10, 或 uniqueWordRatio +0.05
如果最近 3 次 overallScore 在 50-80:
  保持当前难度
如果最近 3 次 overallScore < 50:
  降低难度或保持，提示用户可能回到了 L2/L3 的基础问题

永远不要让难度跳跃超过 15%
每次训练后明确告诉用户：这次比上次难在哪里
```

### 用户可见的 UI 文案示例

训练结束后：

> "Session complete.
> This session: 145 WPM | difficulty 62/100
> Last session: 138 WPM | difficulty 55/100
> You just handled 7 WPM faster and 12% more connected speech than last time.
> Next session target: 150 WPM with BBC English accent variation."

### 迭代而非重复

关键机制：当用户需要"再练一次"时，不是重复同样材料，而是：

```
Same vocabulary + different context
  → 这次练的是"negotiation"相关词汇，但上次是商务会议，这次是日常讨价还价

Same grammar + different topic
  → 这次练的被动语态，但上次是科技文章，这次是新闻报导

Same topic + increased complexity  
  → 这次还是讨论气候变化，但上次是 2 分钟独白，这次是 4 分钟对话

Same speed + added distraction
  → 这次语速一样，但加了背景噪音/不同口音
```

---

## Architecture

### 新增文件

```
src/features/learning-memory/
  skill-ladder-types.ts          # 技能等级类型定义
  skill-ladder-engine.ts         # 技能等级逻辑
  spaced-repetition-types.ts     # 间隔重复类型
  spaced-repetition-engine.ts    # SM-2 算法实现
  difficulty-progression-types.ts # 难度递增类型
  difficulty-progression-engine.ts # 难度标定和推荐
  iteration-engine.ts            # 迭代变异引擎
  learning-path-coordinator.ts   # 三者协调器
  use-learning-path.ts           # React Hook
```

### 修改文件

```
src/features/learning-memory/
  learning-memory-types.ts       # 增加新类型引用
  use-workspace-learning-memory.ts # 集成协调器

src/components/workspace/
  workspace-shell.tsx            # 集成新面板
  learning-path-panel.tsx        # 新增：学习路径面板
  session-review-panel.tsx       # 新增：训练后回顾面板
```

### 数据存储

所有新状态使用 `localStorage`（浏览器）或 Electron SQLite（桌面端），与现有存储模式一致：

- `skill-progress` → localStorage key
- `spaced-repetition-items` → localStorage key
- `session-history` → localStorage key (difficulty + performance records)

### 与现有层的协作

```
用户导入材料
  → Recall Engine 找关联记忆（现有）
  → Difficulty Engine 计算材料难度（新增）
  → Skill Ladder 匹配当前等级（新增）
  → 推荐材料给用户（现有 import flow）

用户完成训练
  → Performance 记录（新增）
  → SRS 更新复习时间表（新增）
  → Skill Ladder 检查是否突破（新增）
  → Note Template 生成学习笔记（现有）

用户下次登录
  → SRS 推送今日待复习（新增）
  → Skill Ladder 显示当前位置和卡点提示（新增）
  → 首页 Resume 推荐合适难度（新增 + 现有首页改进）
```

---

## Implementation Slices

### Slice 1: Skill Ladder Domain（纯逻辑，无 UI）

- `skill-ladder-types.ts`
- `skill-ladder-engine.ts`
- 单元测试

### Slice 2: Spaced Repetition Domain（纯逻辑，无 UI）

- `spaced-repetition-types.ts`
- `spaced-repetition-engine.ts`
- 单元测试

### Slice 3: Difficulty Progression Domain（纯逻辑，无 UI）

- `difficulty-progression-types.ts`
- `difficulty-progression-engine.ts`
- `iteration-engine.ts`
- 单元测试

### Slice 4: Coordinator + Hook

- `learning-path-coordinator.ts`
- `use-learning-path.ts`
- 集成测试

### Slice 5: UI Panels

- `learning-path-panel.tsx`（首页学习路径面板）
- `session-review-panel.tsx`（训练后回顾面板）
- 修改 `workspace-shell.tsx` 集成

### Slice 6: Home Page Integration

- 修改首页 `DesktopHomeShell` 展示学习路径和今日待复习
- 修改 resume 逻辑推荐合适难度

---

## Success Criteria

- [ ] 用户打开首页能看到自己在技能阶梯上的位置
- [ ] 用户能看到可预测的卡点和坚持信号
- [ ] 每次训练后显示难度对比："这次比上次难在哪里"
- [ ] 间隔复习在首页推送今日待复习项
- [ ] 连续训练不重复相同难度的材料（迭代而非重复）
- [ ] 现有 Recall Engine 和 Note Template 功能不受影响
- [ ] 所有新引擎都是纯函数，可单元测试
- [ ] 不引入新的外部依赖

---

## Risks and Mitigations

### Risk: 技能等级定义过于武断

**Mitigation**: 等级定义基于语言学文献（音系学、二语习得），并保留扩展性。用户可以反馈"这个卡点描述不准"来调整。

### Risk: SM-2 对非卡片类学习项效果不佳

**Mitigation**: 只对明确的"可复习项"（单词、句子、笔记）使用完整 SM-2，对"技能等级提醒"使用固定间隔（7 天）。

### Risk: 难度递增让用户感到压力

**Mitigation**: 难度递增是默认开启但可关闭的。用户始终可以手动选择材料。难度提示是鼓励性的，不是评判性的。

### Risk: 范围膨胀

**Mitigation**: Slice 1-3 是纯逻辑层，不涉及 UI。Slice 4-6 才涉及集成。每个 Slice 可以独立交付和验证。

---

## Open Questions

- 首页 Resume 卡片应该优先展示"今日复习"还是"继续训练"？
- 技能等级的视觉隐喻：阶梯？山？树？圆圈？
- 间隔提醒是否需要桌面通知（Electron notification）？

