# Notes 文件栏与直接编辑（2026-10-31）

Notes 路由直接呈现文件栏和现有编辑器，移除欢迎页 / Grid / List 的运行时入口。再次点击应用 Notes 入口展开文件栏，保持当前编辑内容；文件栏支持筛选、新建 Markdown / 文件夹、右键重命名与删除、拖动移动、打开文件夹与独立 Markdown。底部文档名改为切换文件栏，不再重复弹出第二份文件树。

复用 Auris `NotesFileTree`、`use-notes-actions`、Vault 和编辑器保存链路；未修改笔记文件格式、磁盘内容、Electron IPC 或共享 Vault 核心。删除仍走已有确认与 Auris 回收站。打开独立 Markdown 后新建库内笔记会切回库内编辑器。

## 固定上游对照

对照本地 VMark 提交 `449fbc3e0b25215b3e1e38079ca59999f7a06a2b`：

- `src/components/Sidebar/FileExplorer/FileExplorer.tsx`：工作区文件树、顶部创建入口、上下文菜单和拖动操作。
- `src/components/Sidebar/FileExplorer/useExplorerCreateFlow.ts`：异步创建与当前工作区之间的边界。
- `src/components/Sidebar/FileExplorer/useExplorerActionWiring.ts`：布局与文件操作回调分离。
- 许可：上游根目录 `LICENSE` 为 ISC（Copyright 2026 Xiaolai Li）。本轮参考交互与边界，没有复制上游源代码。

差异：保留 Auris Electron Vault、原有新建命名及标题联动重命名、回收站与冲突保存机制，不引入 Tauri IPC 或 react-arborist。

UI 参考：本地 `UI_DESIGN_SYSTEM_GUIDE.md`，以及 https://astryx.atmeta.com/ 的可组合、可访问、主题令牌原则；https://www.shapeof.ai/ 的操作可控与状态清晰原则。颜色复用六主题 Notes 令牌，文件行保持紧凑、长名称截断并显示路径提示。

## 验证

- 六个组件测试文件，91 项通过（Notes 页面、工作台、文件树、应用侧栏、富文本同步及表格工具栏）。
- 修改文件定向 ESLint 与 `git diff --check` 通过。
- Next 生产构建及 postbuild Markdown 校验通过。
- `tsc --noEmit` 仅报告本轮未修改的 `tests/component/notes/terminal-focus-workspace.test.tsx:31` 的 TS2348；Notes 修改文件没有类型错误。

## 写入时序补充

Electron 零间隔逐键输入暴露出富文本同步的时序问题：父级已提交的 source 若在 passive effect 才回填，可能覆盖更晚到达的输入事务。`notes-rich-editor-pane.tsx` 将这次对账改为 layout effect，在下一次浏览器输入前完成；没有改动存储格式或 Vault。

新增 `keeps input that arrives immediately after a source commit`：以父组件布局阶段注入新输入来复现两个时点交错。将实现临时恢复为原 passive effect 时该测试失败，恢复修复后通过；外部文件更新与光标/滚动保持的既有测试仍通过。

最终 Electron 生产构建验证使用临时 profile 和临时 Vault：打开现有 Markdown、零间隔逐键输入、Mod+S 保存后逐字检查磁盘、新建根目录 Markdown、右键重命名、确认删除、收起文件栏后点击 Notes 重新展开均通过。没有读取或改写用户笔记。全仓 ESLint 完成，0 errors；修改文件定向 ESLint 无 warning。初次验收时仅修改源码。随后按用户要求整合至 main 并安装为 1.0.23，见 `../releases/auris-1.0.23-local-install-2026-10-31.md`。


## 折叠全部与类型过滤（1.0.24）

用户确认仅显示 Markdown 和图片。文件栏复用格式注册表识别 Markdown，并对图片后缀做大小写不敏感的完整扩展名匹配；保留文件夹（含空文件夹），隐藏 JSON、文本、音频、PDF 等其他文件，不修改磁盘内容或 Vault 扫描能力。

工具栏新增“折叠全部文件夹”图标按钮。复核同一固定 VMark 提交的 `FileExplorer/useFileExplorerOpenState.ts` 批量折叠行为后，沿用 Auris 自有树结构，以 ref 暴露批量折叠操作，同时覆盖默认展开及活动笔记自动展开；搜索中未呈现的目录也会保持折叠。手动展开及再次折叠仍正常，当前编辑文档不关闭。没有复制上游代码。

新增 3 项交互回归覆盖类型白名单、大小写/多重后缀、空文件夹、嵌套/活动目录、重复折叠与搜索隐藏目录；结合文件树、页面、工作台回归 4 文件 / 63 项通过。源码类型检查与定向 ESLint 通过。
