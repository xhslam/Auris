# VMark v0.9.45–v0.9.50 选择性同步实施状态（2026-08-24）

> 上游来源：`xiaolai/vmark` `main` @ `6f1e1d9777d4ef62eed03cebe1c69b3c9013941d`
> Auris 实施基线：`bcf0e02d138a6367a4f4bb333b55ad122f457868`（1.0.2）
> 策略：只移植与 Electron/Next.js 架构兼容的产品能力与纯 TypeScript 修复，不整仓同步。

## 已同步

### 1. CJK formatter 数据安全（VMark v0.9.49）

- 支持 TOML `+++` frontmatter，并让未闭合 fenced code block 保护文档剩余部分。
- 合并重叠保护区，按 segment 的真实行边界处理 trailing spaces，保留 protected span 前后空格。
- 保留 Markdown 两空格 hard break、LF/CRLF 文末换行和 inline math。
- 同步标点邻接、CJK 引号、路径斜杠、脚本相关省略号与固定点幂等修复。
- 完整性检查升级为 NFKC 内容骨架序列 + Markdown 结构计数，可发现正文复制、删除和重排。
- 新增 `formatMarkdownChecked()`；安全拒绝时保留原文，一键中文排版通过现有错误 banner 明确提示。
- 自动保存的 spacing-only 规范化改为复用同一安全 Markdown parser，不再改写 inline code、frontmatter、URL 或 fenced code。
- 保留 Auris 的 `CJKFormattingSettings`、Vault 写入边界及 `formatSelection`/`formatFile` 兼容 API；未复制 Tiptap/MCP/Tauri 接线。

### 2. 大纲可见文本（VMark v0.9.47）

- heading label 去除 emphasis、code span、链接、wiki-link、strike/highlight 等行内 Markdown 标记。
- 未闭合标记、数学和 HTML 字面内容保持可见。
- slug 继续使用原始 heading 内容及 Auris 既有算法，避免现有锚点迁移。

### 3. Last Used Tab（VMark v0.9.50）

- 新增 `Ctrl+Tab` 最近使用 Tab 切换。
- 直接复用 Auris `recentFiles` MRU：跳过当前、已关闭或陈旧路径；连续两次切换可返回原 Tab。
- 不引入 VMark 的多窗口 tab/MRU store。

### 4. Notes Tab 溢出导航（VMark v0.9.50）

- Tab 条改为单行横向滚动，按实际 overflow 显示左右箭头。
- 处理零宽首帧、macOS rubber-band 负值和分数像素末端误差。
- 激活 Tab 自动滚入可视区；Tab 支持 Left/Right/Home/End 键盘导航。
- observer 同时跟踪容器、内容宽度、标题 DOM 变化与滚动，并在卸载时清理。

## 明确延后或不适用

- **双文档 Split View / Open to the Side：延后。**Auris 的 `notes.split` 已表示 source-preview；Browser SidePane 与 Terminal split 还存在互斥和宽度约束，需要单独定义双文档 pane 状态和快捷键。
- **Quick Open 打开项前置、Next/Previous positional Tab：未纳入。**当前 Last Used 与溢出导航已能独立交付，剩余行为后续按实际需求评估。
- **Tauri/Rust/traffic lights/Windows 主线程、Cargo 与 GitHub Actions：不适用。**Auris 使用 Electron/Next.js，不复制平台专属实现。

## 验证

- 定向 Vitest：**12 个测试文件、415 项通过**。
  - CJK formatter、内容安全、Vault 保存
  - Markdown index
  - workspace store、shortcut settings/catalog
  - Tab overflow、NotesTabs、NotesWorkbench
  - VMark manifest 与同步报告
- 定向 ESLint：通过。
- `npm run build`：Next.js 生产构建、TypeScript、22 个静态页面生成全部通过。
- `node --check scripts/vmark-sync-report.cjs`：通过。
- `git diff --check`：通过（仅 Git 的 LF→CRLF 工作区提示）。
- NotesWorkbench 测试仍输出 React `act(...)` 警告，但测试全部通过，不构成回归失败。
- 额外尝试全量 `npm test`：2,735 项通过、51 项失败。失败集中在未修改的 Electron MCP shebang 转换、Windows symlink/POSIX mode、发布 fixture 路径、CRLF 精确 CSS selector 与并发超时；本轮定向测试均通过，生产构建也通过。并发中超时的 VMark sync 文件随后单独重跑为 25/25 通过。全量测试遗留的 `.runtime-deps-test-*` 临时目录已清理。

## 同步基线策略

本轮没有推进 `docs/vmark-port/manifest.json` 的 `lastComparedCommit`。该 manifest 的 mapping 覆盖面大于本次选择性移植范围；抓取、实现和局部测试通过不等于所有 mapping 已完成人工复核。

未创建 commit，未推送远端。
