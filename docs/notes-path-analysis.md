# Notes 路径与实现关系分析

## 1. 当前 /notes 页面实际使用的实现

**路由入口**：`src/app/notes/page.tsx`

```ts
import { NotesPageClient } from "@/components/notes-v2/notes-page-client";
```

完整调用链：
```
src/app/notes/page.tsx
  → @/components/notes-v2/notes-page-client.tsx  (NotesPageClient)
    → @/components/notes-v2/notes-workbench.tsx  (NotesWorkbench)
    → @/components/notes-v2/use-notes-workbench.ts
      → @/features/notes/workbench/notes-workbench.facade.ts  (useNotesWorkbenchFacade)
```

**结论**：`/notes` 页面 100% 使用 `notes-v2`，与 `src/components/notes/` 无任何关联。

---

## 2. src/components/notes/ 的作用

该目录共 8 个文件，均为旧版 Notes 实现：

| 文件 | 用途 | 是否被产品代码引用 |
|------|------|------------------|
| `notes-shell.tsx` | 旧版主容器，管理所有状态（useState），含完整 UI 骨架 | ❌ 无外部引用 |
| `notes-editor.tsx` | 基于原生 `<textarea>` 的 markdown 编辑器，含预览/折叠 | ❌ 无外部引用 |
| `notes-sidebar.tsx` | 文件列表侧边栏（简单列表形式） | ❌ 无外部引用 |
| `notes-tabs.tsx` | 多标签页组件 | ❌ 无外部引用 |
| `notes-command-palette.tsx` | 命令面板（内部引用 `use-notes-workbench.ts` 的类型） | ❌ 无外部引用 |
| `notes-library-panel.tsx` | 词本/句本侧栏（拖拽插入 snippet） | ❌ 无外部引用 |
| `notes-plugin-panel.tsx` | 桌面端本地插件面板 | ❌ 无外部引用 |
| `use-notes-workbench.ts` | 旧版 workbench hook（管理 tab 历史、命令、插件） | ❌ 无外部引用 |

**外部引用情况**：整个 `src/components/notes/` 目录内部各文件互相引用，但**不被任何产品页面、路由、feature 或其他组件引用**。

**仍被引用的只有 2 处测试文件**：
- `tests/component/notes/notes-shell.test.tsx` — 测试旧版 `NotesShell`
- `tests/component/notes/notes-editor.test.tsx` — 测试旧版 `NotesEditor`

另有一个专门的边界守护测试：
- `tests/unit/notes/legacy-notes-ui-boundary.test.ts` — 自动扫描 `src/app/`、`src/components/`、`src/features/` 下所有文件，**断言没有任何产品代码从 `@/components/notes/`（非 v2）导入**。该测试的存在明确证明迁移是有意识进行的，且团队已设置防止误引用的机制。

---

## 3. notes-v2 的作用

**入口文件**：`src/components/notes-v2/notes-page-client.tsx`

核心文件及功能：

| 文件 | 用途 |
|------|------|
| `notes-page-client.tsx` | 页面级入口，组合 workbench hook 和 UI |
| `notes-workbench.tsx` | 主 UI 容器（`notes-v2` / `notes-v2--minimal` 布局） |
| `use-notes-workbench.ts` | 从 `notes-workbench.facade` re-export 的 hook 入口 |
| `use-notes-dialog.ts` | 对话框（prompt/confirm）管理 |
| `notes-workbench-center.tsx` | 编辑器主区域（CodeMirror 6 / 富文本 / 阅读模式） |
| `notes-workbench-bottom-left.tsx` | 左下角 popover（文件树、目录选择） |
| `notes-workbench-bottom-right.tsx` | 右下角控件（模式切换、搜索、反链、属性、学习面板） |
| `notes-workbench-right-sidebar.tsx` | 右侧边栏 |
| `notes-workbench-header.tsx` | 标题栏 |
| `notes-workbench-popover.tsx` | 弹出层容器 |
| `notes-file-tree.tsx` | 文件树（Obsidian 风格目录结构） |
| `notes-file-tree-context-menu.tsx` | 文件树右键菜单 |
| `notes-tabs.tsx` | 多标签页（与旧版同名但全新实现） |
| `notes-editor-pane.tsx` | 编辑器面板（CodeMirror 6 source 模式） |
| `notes-rich-editor-pane.tsx` | 富文本编辑器面板（ProseMirror WYSIWYG 模式） |
| `notes-reading-pane.tsx` | 阅读模式面板 |
| `notes-editor-context-menu.tsx` | 编辑器右键菜单 |
| `notes-rich-table-toolbar.tsx` | 富文本表格工具栏 |
| `notes-command-palette.tsx` | 命令面板（与旧版同名但接口不同，接受 `items` 数组） |
| `notes-search-panel.tsx` | 全文搜索面板 |
| `notes-backlinks-panel.tsx` | 反链面板 |
| `notes-outline-panel.tsx` | 文档大纲面板 |
| `notes-properties-panel.tsx` | 文档属性面板（frontmatter） |
| `notes-learning-panel.tsx` | 词本/句本学习面板 |
| `notes-library-navigator-panel.tsx` | 词本/句本浏览器 |
| `notes-tag-filter.tsx` | 标签过滤器 |
| `notes-terminal-panel.tsx` | 终端面板（桌面端 node-pty 终端分屏） |
| `notes-write-conflict-dialog.tsx` | 写入冲突对话框（外部文件变更检测） |
| `notes-input-dialog.tsx` | 通用输入/重命名对话框 |
| `notes-layout.tsx` / `notes-layout-resize.ts` | 布局与 splitter 尺寸计算 |
| `use-workspace-persistence.ts` | 工作区状态持久化（localStorage） |
| `terminal/use-notes-terminal-sessions.ts` | 终端会话管理 |
| `notes-ui-copy.ts` | UI 文案常量 |

**与旧版的核心区别**：

| 维度 | 旧版 `notes/` | 新版 `notes-v2/` |
|------|--------------|-----------------|
| 编辑器内核 | 原生 `<textarea>` | CodeMirror 6 + ProseMirror 富文本 |
| 状态管理 | `notes-shell.tsx` 中的 `useState` 大组件 | `notes-workbench.facade.ts` 分层 facade |
| 文件存储 | `NotesStorage` 接口（简单 page 读写） | Vault 架构（`VaultClient`，支持任意文件树） |
| 文件展示 | 简单列表侧边栏 | 树形文件结构（Obsidian 风格） |
| 特性广度 | 标签页、搜索、词本/句本插入、插件 | 上述 + 反链、属性、大纲、全文搜索、终端分屏、wiki-link、导出 PDF/HTML、写入冲突检测 |
| 组件数量 | 8 个 | 33 个 |

---

## 4. 两套路由/组件产生的可能原因

基于代码结构和迁移痕迹判断：

1. **旧版是初代简单实现**：`notes-shell.tsx` 的架构是"所有状态放在一个大组件里 + 简单 textarea 编辑器"，典型的 MVP 风格。它基于 `NotesStorage` 接口，只支持 page 级别的读写，没有 vault/文件树概念。

2. **新版是 Obsidian 风格重构**：`notes-v2/` 配合 `src/features/notes/` 中的分层架构（vault、documents、editor、workbench）完全重建，引入了 CodeMirror 6、ProseMirror、反链索引、wiki-link 等。

3. **迁移时只切了路由，未删除旧目录**：`src/app/notes/page.tsx` 已切换到 `notes-v2`，但 `src/components/notes/` 目录未随之删除，其测试文件也保留着。

4. **已有守护机制**：`legacy-notes-ui-boundary.test.ts` 的存在证明迁移是有意为之的，且团队已意识到风险并做了边界测试。这个测试已经在保护新的状态，旧目录被明确标记为 "legacy"。

---

## 5. 当前是否存在风险

| 风险类型 | 是否存在 | 说明 |
|---------|---------|------|
| 运行时错误 | ❌ 无 | 旧代码不被任何运行路径引用 |
| 页面误渲染旧 UI | ❌ 无 | 路由已完全切换 |
| 组件名重叠导致误引用 | ⚠️ 低风险 | `notes-tabs.tsx`、`notes-command-palette.tsx` 新旧同名；`legacy-notes-ui-boundary.test.ts` 已作守护 |
| 状态/hook 混用 | ❌ 无 | 两套 hook 完全独立，无交叉 import |
| 类型定义混用 | ❌ 无 | 旧版 `NotesWorkbenchCommand` 类型只在旧版内部使用 |
| 废弃 CSS 被打包 | ⚠️ 存在 | `globals.css` 中约 367 行 `.notes-shell` 样式仍存在，Next.js 不做 CSS tree-shaking，会被打包进产物（但不影响渲染） |
| 废弃测试增加噪音 | ⚠️ 存在 | `notes-shell.test.tsx`（12个用例）、`notes-editor.test.tsx` 仍在跑，测试的是废弃组件，会增加CI时间和维护成本 |
| 历史迁移不完整 | ⚠️ 轻度 | 旧目录未清理，但已有守护测试阻止蔓延 |

---

## 6. 是否可以删除旧的 src/components/notes/

**结论：可以安全删除，但需同步处理 3 处关联**。

### 必须同步删除/修改的文件

1. **`tests/component/notes/notes-shell.test.tsx`** — 整个文件删除（测试废弃组件）
2. **`tests/component/notes/notes-editor.test.tsx`** — 整个文件删除（测试废弃组件）
3. **`tests/unit/notes/legacy-notes-ui-boundary.test.ts`** — 此测试存在的前提是"旧目录存在且需要守护"；删除旧目录后，这个测试本身失去意义，**应同步删除**（否则测试代码会对不存在的 `LEGACY_COMPONENT_DIR` 做扫描，虽然不会出错，但语义已过时）

4. **`src/app/globals.css` 中的 `.notes-shell` 相关 CSS**（约 367 行）— 可选清理，不影响功能，但会减小 bundle 体积。涉及的 CSS 集中在约 2272–8968 行（含桌面端 media query 重写），搜索 `.notes-shell` 定位即可。

### 验证旧目录确实无外部引用的命令

```bash
cd english-shadowing-web
grep -r "components/notes[^-]" src/ --include="*.tsx" --include="*.ts"
# 预期结果：只在 src/components/notes/ 内部有输出
```

### 建议的安全删除步骤

```bash
# 1. 删除旧组件目录
rm -rf src/components/notes/

# 2. 删除废弃测试
rm tests/component/notes/notes-shell.test.tsx
rm tests/component/notes/notes-editor.test.tsx
rm tests/unit/notes/legacy-notes-ui-boundary.test.ts

# 3. 运行测试，确认通过
npm run test

# 4. 运行构建，确认无类型/编译错误
npm run build

# 5. 可选：清理 globals.css 中的 .notes-shell 系 CSS
```

---

## 7. 建议下一步

**最小风险方案（推荐）**：

1. 删除 `src/components/notes/` 目录（8 个文件，全部废弃）
2. 同步删除 3 个对应测试文件
3. 运行 `npm run test && npm run build` 验证
4. 可选但建议：清理 `globals.css` 中约 367 行 `.notes-shell` 样式（需要仔细搜索边界，避免误删 desktop responsive 块中偶尔嵌套引用）

**不建议做的事**：
- 不需要修改路由
- 不需要修改任何 notes-v2 文件
- CSS 清理可作为独立 PR，风险隔离

**风险评估**：删除旧目录的风险极低。守护测试 (`legacy-notes-ui-boundary.test.ts`) 已经证明没有任何产品代码引用旧目录；唯一的外部引用是测试文件本身，一并删除即可。
