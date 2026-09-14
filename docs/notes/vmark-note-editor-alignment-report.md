# Auris Note × vmark Markdown 编辑器对齐报告

> 目标：让 Auris Note 的 Markdown 编辑体验向开源项目 [vmark](https://github.com/xiaolai/vmark) 对齐，补齐缺失能力，提升稳定性与专业感，同时不破坏现有桌面端功能。
>
> 日期：2026-06-20

---

## 0. 一句话结论

Auris 和 vmark 的技术栈高度一致（**CodeMirror 6 源码模式 + ProseMirror/Tiptap 所见即所得**），所以**不需要换架构、不需要新建编辑器**。Auris 的**源码模式（CodeMirror）已经非常完整且本身就标注了 "vmark-style"**；真正的短板集中在**默认的 WYSIWYG 模式**——它原本只挂了 `baseKeymap + history`，既没有"边打字边变格式"的输入规则，也没有 `Cmd+B/I` 这类格式快捷键。本轮工作就是把这块缺口补齐。

---

## 1. 当前 Auris Note 真实链路（已确认，无新旧并存风险）

只有一套生效的编辑器（`notes-v2`），不存在旧 notes / 多套编辑器并存：

```
notes-workbench.tsx
  └─ notes-workbench-center.tsx
       └─ notes-editor-pane.tsx            ← 模式开关：wysiwyg / source
            ├─ notes-rich-editor-pane.tsx  ← 默认：WYSIWYG（ProseMirror）
            │     schema: notes-rich-markdown.ts
            └─ (source) CodeMirror 6        ← editor-state-bridge.ts + editor-keymap.ts
```

- 默认模式：`editorMode = "wysiwyg"`。
- 状态栏：`notes-workbench-bottom-right.tsx`（右下角角标）。
- 切换源码/富文本：右下角 "T" 按钮；F5 = Source Peek（局部看源码）。

---

## 2. 功能差异对比清单

### 2.1 Auris 已有（且做得不错）

| 能力 | 源码模式 (CodeMirror) | WYSIWYG (ProseMirror) |
|---|---|---|
| 撤销/重做 | ✅ historyKeymap | ✅ history() |
| 粗体/斜体/代码/删除线/链接快捷键 | ✅ 完整 | ❌（本轮补齐） |
| 标题 H1–H6 快捷键 | ✅ Mod-1..6 | ❌（本轮补齐） |
| 列表/引用/代码块/HR 快捷键 | ✅ | ❌（本轮补齐） |
| 边打字边格式化（输入规则） | 列表/引用续行 ✅ | ❌（本轮补齐） |
| Tab escape（跳出成对符号） | ✅ | — |
| 多光标 / 选下一处 (Mod-D) | ✅ | —（PM 暂不做） |
| 查找替换 | ✅ | —（用 source 模式） |
| 表格编辑 + 工具栏 | — | ✅ |
| Wiki 链接 `[[..]]` 渲染/跳转/着色 | ✅ | ✅ |
| Source Peek (F5) 局部看源码 | — | ✅ |
| 代码块语法高亮预览 | ✅ | ✅ NodeView |
| CJK 拼音输入法兼容处理 | ✅ | ✅ |
| 字数/字符/反链统计 | ✅ 状态栏 | ✅ 状态栏 |
| 图片附件/粘贴 | ✅ | 部分 |

### 2.2 vmark 有、Auris 缺（按价值排序）

| vmark 能力 | 价值 | Auris 处理建议 |
|---|---|---|
| **WYSIWYG 输入规则**（`# ` 变标题、`**x**` 变粗体、`- ` 变列表…）| ⭐⭐⭐ | **本轮补齐**，且照搬 vmark 的 CJK-aware 正则 |
| **WYSIWYG 格式快捷键**（Cmd+B/I/E、Mod-1..6、列表/引用）| ⭐⭐⭐ | **本轮补齐**，与源码模式语义一致 |
| **列表回车/Tab 智能处理**（拆分列表项、缩进/反缩进）| ⭐⭐⭐ | **本轮补齐**（splitListItem/sink/lift） |
| 状态栏更丰富（光标行列、选区长度、保存状态）| ⭐⭐ | 本轮补齐光标行；保存状态列入二期 |
| Source Mode (F6) 整文件源码切换快捷键 | ⭐ | 已有 "T" 按钮可切，二期补 F6 键 |
| 6 主题 / 10 语言 / Typewriter 模式 | ⭐ | 暂不引入（与本任务无关，避免扩面） |
| 多格式预览（YAML/TOML/Mermaid/工作流图）| ⭐ | 暂不引入（超出"Markdown 编辑"范围） |
| 122 个可自定义快捷键 + 设置面板 | ⭐ | 暂不引入（重构风险高） |
| 内置终端 / AI Genies / MCP | — | Auris 已有自己的终端与 AI dock，不照搬 |

### 2.3 Auris 已有但体验不完善

- **WYSIWYG 与源码模式快捷键不一致**：源码里 `Cmd+B` 能用，切到默认 WYSIWYG 就失效——用户会觉得"时灵时不灵"。← 本轮统一。
- **状态栏 `selectionState` 已传入却没使用**：光标/选区信息算出来了但没显示。← 本轮接上。

---

## 3. 不引入 / 需谨慎的部分（控制风险）

- ❌ 不重构整个 notes 系统、不动路由/数据结构。
- ❌ 不引入多主题、多语言、多格式预览、设置面板——超出"Markdown 编辑体验"，且面铺太大。
- ⚠️ WYSIWYG 不强行加多光标/查找替换：ProseMirror 实现成本高且与现有 source 模式重复，用户切 source 即可。
- ⚠️ 链接 `Cmd+K` 在 WYSIWYG 需要 href 输入框，先不做弹窗，避免桌面端 prompt 体验问题；保留右键加 Wiki 链接。

---

## 4. 分阶段实现计划

### 第一阶段（本轮，核心编辑体验）✅
1. 新增 `notes-rich-input-rules.ts`：WYSIWYG 输入规则（标题/引用/列表/有序列表/粗体/斜体/行内代码），**CJK-aware**。
2. 新增 `notes-rich-keymap.ts`：WYSIWYG 格式快捷键（Mod-b/i/e、Mod-1..6 标题、Mod-0 段落、列表/引用、列表回车与缩进）。
3. 把两者接入 `notes-rich-markdown.ts` 的 `createNotesRichEditorState`。

### 第二阶段（Markdown 语法 / 快捷键增强）
- 代码块输入规则（``` ```）与 WYSIWYG 代码块快捷键。
- F6 整文件源码切换快捷键；与 F5 Source Peek 协同。
- 链接编辑（轻量内联输入框，替代弹窗）。

### 第三阶段（体验优化）
- 状态栏：保存状态（已保存/未保存/保存中）、光标行列、选区长度。**本轮先补光标行**。
- 滚动同步 / Typewriter 模式（可选）。

### 第四阶段（测试与回归）
- typecheck / lint / test / build；
- 创建/打开/编辑/保存/切换不串内容/标题列表代码块/快捷键/撤销重做/复制粘贴/长文本不卡 全量回归。

---

## 5. 本轮实际改动（详见最终总结）

- 新增 `src/features/notes/editor/notes-rich-input-rules.ts`
- 新增 `src/features/notes/editor/notes-rich-keymap.ts`
- 修改 `src/features/notes/editor/notes-rich-markdown.ts`（接入插件）
- 修改 `src/components/notes-v2/notes-workbench-bottom-right.tsx`（状态栏显示光标行）
- 新增单元测试 `tests/unit/notes/notes-rich-input-rules.test.ts`

---

## 6. 风险与回滚

- 全部为**新增插件**接入，未删除任何现有能力；如需回滚，从 `createNotesRichEditorState` 的 plugins 数组移除两个插件即可。
- 输入规则使用 CJK-aware 正则，避免中文场景下 `**粗体**` 不触发。
- WYSIWYG 与源码模式快捷键语义保持一致，减少用户认知负担。
