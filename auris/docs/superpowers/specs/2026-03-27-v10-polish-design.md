# V10 Product Polish Design

- Date: 2026-03-27
- Project: `english-shadowing-web`
- Status: Approved by user intent in chat, execution continues without pause unless a risky branch appears

## Summary

本次升级不把项目当成“再加几个功能”的开发任务，而是当成一次连续 10 轮的产品打磨实验。目标是把当前已经具备本地优先能力和训练闭环的应用，提升成一个在第一眼就能显得完整、克制、舒适，同时又有学习欲望和仪式感的桌面产品。

## Product Direction

保留现有核心价值：

- 本地优先
- 训练、笔记、纠音三工作区
- 训练生成、回放、录音、词句沉淀

重点强化以下四类体验：

1. `第一眼气质`
- 首页要更像真实产品首页，而不是功能列表
- 必须有明确的主张、进度感、继续学习的情绪牵引

2. `训练启动体验`
- 输入区不只是表单
- 用户要能快速理解“我现在练什么、怎么练、会得到什么”

3. `训练过程反馈`
- 播放、复读、参考音、当前句、节奏等状态要更可感知
- 练习过程要有沉浸感和轻微的仪式感

4. `成长与沉淀`
- 首页和工作区都要体现学习资产正在累积
- 词本、句本、最近记录、练习配置不应只是静态辅助，而应成为“成长证据”

## Non-Goals

- 不引入沉重的后端重构
- 不做与主路径无关的大型新模块
- 不为了炫技破坏现有测试和本地优先行为
- 不把界面做成夸张营销页

## Ten Iterations

### V1: Foundation For Continuous Iteration

- 建立设计、计划、发现、进度文件
- 记录基线验证与截图
- 明确升级评估维度

### V2: Home Hero Reframe

- 重做首页 hero 的内容结构
- 增加更清晰的产品主张、副标题、行动按钮层级
- 增加可感知的学习节奏信息

### V3: Home Evidence Layer

- 为首页增加成长指标、近期状态、轻量系统信息
- 让“继续今天的学习”有更强恢复感

### V4: Training Intake Upgrade

- 把训练输入区升级为“训练启动台”
- 强化输入方式、语音设置、训练收益和默认路径表达

### V5: Playback Experience Upgrade

- 强化播放岛信息层级
- 增加练习模式反馈、状态描述、节奏提示

### V6: Reader And Workspace Synergy

- 让文章区、输入区、播放区之间的关系更明确
- 用更好的标签、摘要和视觉节奏强化左右区域联动

### V7: Comfort And Polish Pass

- 统一关键文案
- 优化空状态、系统状态、提示语
- 调整按钮、分区和局部节奏，让界面更舒适

### V8: Micro-interaction Pass

- 增加少量有意义的悬浮、强调、渐变、层次变化
- 不走炫技路线，只增强“高级感”

### V9: Test Expansion And Regression Guard

- 更新组件测试与 E2E 选择器断言
- 确保升级后的关键路径可回归验证

### V10: Final Visual Sweep And Lessons

- 做最后一轮视觉收束
- 汇总 10 轮反思
- 抽取可复用经验

## Acceptance Criteria

本轮连续升级完成时，应满足：

1. 首页相比基线更有产品叙事和学习氛围
2. 训练输入区更像训练启动台而不是普通表单
3. 播放区的状态可感知性更强
4. 成长感、恢复感和沉淀感都比基线明显增强
5. `lint`、`test`、`build` 至少保持通过
6. 关键测试根据界面升级完成同步更新

## Review Notes

- 当前执行环境允许持续实现，不需要等待额外审批
- 外部 GitHub 直接同类参考有限，因此本次更强调围绕现有产品能力做高质量融合和抬升

