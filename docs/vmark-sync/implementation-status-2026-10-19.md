# VMark v0.9.101 上游跟踪与 Auris 适用性复核

日期：2026-10-19（Asia/Shanghai）。Auris 当前版本保持 **1.0.18**；本轮不改运行时代码。

> 本文记录当日先完成的镜像更新阶段。用户随后要求实际适配，已实现并验收，详见[同日后续 Auris 实施报告](implementation-auris-2026-10-19.md)。下文“未改运行时代码”仅指本阶段历史状态。

## 上游与源码副本

- 官方仓库：[`xiaolai/vmark`](https://github.com/xiaolai/vmark)。本轮已 fetch 并固定 `main` 至 `449fbc3e0b25215b3e1e38079ca59999f7a06a2b`，正式发布 tag 为 [`v0.9.101`](https://github.com/xiaolai/vmark/releases/tag/v0.9.101)。
- 本轮审查增量：从 2026-10-16 基线 `8887701db097cef0dea00584b70a0ea1dac5ae05` 到 `449fbc3e0b25215b3e1e38079ca59999f7a06a2b`，5 个主线提交、87 个文件；主要新增是大型含图文档打开性能与编辑器状态安全修复。
- `/Users/apple/Desktop/xiaolai-source/vmark` 与 Auris 的 `vmark-upstream/` 均通过 `git merge --ff-only origin/main` 快进至同一 commit `449fbc3e0b25215b3e1e38079ca59999f7a06a2b`。原有 4 个本地删除 `src-tauri/icons/source/vmark-{16,24,32,48}.svg` 均保留，没有覆盖或清理。
- Auris 的累计对照报告已运行 `scripts/vmark-sync-report.cjs` 刷新：`docs/vmark-sync/latest.json` / `latest.md`。累计报告基线为 `7c409688dc510d87183bdc46308e1ee645c2579f`，终点为本轮 commit；显示 changed 2,646、added 3,392、deleted 566、renamed 116、mapped 232、stale mappings 12。该累计统计不是本轮 5 个提交的差异统计，也不是历史映射已全面复核的证明。

## 本轮上游增量与适用性

| 上游变化 | Auris 核查与决定 |
|---|---|
| VMark `v0.9.101` / [#1565](https://github.com/xiaolai/vmark/issues/1565)：大型含图文档打开时主线程负担过重。 | 关注点包括图片接近视口才赋予真实 `src`、窗口监听器完成注册后再挂载重型 surface、CJK/代码高亮降低打开期工作量，以及按线性代价映射 ProseMirror DecorationSet。Auris 当前架构是 Electron/Next.js，不照搬 Tauri window readiness 与 surface gate。源码检索见已有 CodeMirror 图片预览设置 `loading="lazy"`（`src/features/notes/editor/code-block-preview.ts`）；公式也已有 `IntersectionObserver` 调度。尚无 Auris 大型含图笔记的 profile/基准能证明秒级卡顿，故不扩成整套图片调度器或 CJK/highlight 重构。
| 上游对未完成初始内容加载的 Tiptap flush 加保护，避免保存空 placeholder 覆盖原文。 | 属于数据完整性高风险候选，但尚未找到 Auris 同构编辑器调用链会在尚未装载时 flush 的证据，也没有可复现覆盖用例；不盲目复制上游 `contentApplied` 标记机制。后续若出现复现，应先建立“加载中触发保存/切换”的失败回归，再决定实现。
| `prosemirror-view` DecorationSet 映射性能与五项定位错误修复。 | Auris 锁定版本同为 `prosemirror-view@1.42.6`，源码中的上游 patch 针对相同版本，这是值得单独评估的候选。当前没有 Auris 装饰层性能数据、映射错误记录或该 patch 的 Auris 兼容性/回归证据；不把 704 行第三方 patch 直接搬入产品依赖。
| 移除 Tauri updater zip feature、Tauri capability / 版本门禁与 tag-gate 说明。 | Auris 是 Electron；Tauri updater、安全策略配置和 VMark 自身 GitHub tag 门禁均无同构实现，不移植。

独立只读 agy 审查建议优先核查 flush 覆盖风险与图片懒加载，但也要求调用链、复现或性能指标；建议仅在相同依赖版本且实际 DecorationSet 风险有证据时评估上游 patch。主会话核对了 Auris 源码与锁文件后采纳其“候选不是缺陷证明”的边界。

## 五问简洁复盘

- **更新了什么：** 将 `xiaolai-source/vmark` 和 Auris 内置参考源码镜像都快进到 VMark `v0.9.101` / `449fbc3e0`；刷新 Auris 累计源代码差异报告；未改 Auris 运行时源码。
- **为什么更新、取舍是什么：** 跟踪上游最新发布与 main，确保后续对照基于当前源码。上游大含图文档修复与 Auris 同属编辑器领域，但框架、窗口生命周期和渲染链路不同；当前缺乏 Auris 性能/丢文复现证据，因此选择记录候选并保留架构边界，而非为了版本对齐引入第三方补丁。
- **解决什么问题：** 两个本地 VMark 源码副本不再停在 `2026-10-16` 的 `v0.9.99-7`，而与 GitHub 最新稳定 tag/main 同步；累计报告追到新 commit，可支撑后续源码审查。没有声称修复 Auris 运行时性能或保存缺陷。
- **学到了什么：** 上游报告的故障可用来形成可证伪假设，但不能直接证明下游也有缺陷；依赖相同版本只是补丁审查的前置条件，不是移植许可。性能修复应先锁定首屏成本与调用链，数据保护修复应先复现错误写回，再选择适配机制。
- **属于软件工程哪部分：** 上游依赖与源码供应链维护、架构适配评估、风险驱动的回归测试、性能工程与数据完整性防护、证据驱动的变更控制。

## 验证与边界

- 两个 VMark 仓库的 HEAD 均为 `449fbc3e0b25215b3e1e38079ca59999f7a06a2b`，与 `origin/main` 一致；4 个本地 SVG 删除仍在工作树中。
- `latest.json` 记录终点 commit，报告脚本成功完成。没有运行 Auris 构建或测试，因为本轮没有产品代码改动。
- 主仓库开始时用户已有的 `.github/workflows/notes.yml` 修改、`docs/icon-fix-2026-09-09/reference-vmark.png` 删除、`UI_DESIGN_SYSTEM_GUIDE.md` 未跟踪均未修改。
- 未递增 Auris 版本、打包、替换已安装 App、提交、推送、创建 tag 或发布。
