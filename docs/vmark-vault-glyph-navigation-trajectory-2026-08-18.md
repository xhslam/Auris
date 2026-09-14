# VMark 风格笔记库首字方块：执行轨迹（2026-08-18）

## 任务解释
用户要求 Auris 的收起侧边栏不要只显示“添加笔记库”方块。每个已配置笔记库应显示为一个方形入口，内容为文件夹名称的首个可见字符；`+` 方块应继续保留，用于添加笔记库。展开侧边栏时应继续展示完整笔记库名称。

## 参考与实现路径
用户提供的 `https://xiaolai/vmark` 在当前环境中无法解析，已核对其公开仓库 [xiaolai/vmark](https://github.com/xiaolai/vmark)。VMark 的 `WorkspaceRail` 为每个工作区渲染稳定的名称派生 glyph，并将完整名称保留在 `aria-label` 与 `title` 中。Auris 已有从 VMark 适配的 `workspaceRailGlyphs` 工具，因此复用其字形簇安全的首字逻辑，而非以字符串索引重新实现。

`DesktopNotesVaultNav` 现在始终渲染已授权笔记库条目：收起态只显示首字方块，展开态显示同一首字图标和完整名称。添加笔记库使用独立的 `+` 方块，始终保留在已配置笔记库之后。活动库高亮、不可用库禁用、完整名称提示和原生目录选择流程均保持原有语义。

## 修改文件
| 文件 | 作用 |
|---|---|
| `src/components/desktop/desktop-notes-vault-nav.tsx` | 在收起态渲染笔记库首字方块，保留展开态的完整名称。 |
| `src/styles/auris-redesign.css` | 定义 32px 收起态方块、活动与不可用状态，以及展开态的图标/文字列表布局。 |
| `tests/component/desktop/desktop-notes-vault-nav.test.tsx` | 覆盖首字方块、`+` 方块、完整名称和方块切换行为。 |

## 验证
- 笔记库侧边栏组件测试 3 项通过。
- 针对变更文件的 ESLint、Prettier 和 `git diff --check` 通过。
- `npm run desktop:build:verify` 通过，包括生产构建、桌面装配、签名、隐私审计和 MCP sidecar 烟雾验证。
- 全量 lint 仍受仓库既有 CommonJS `require()` 规则冲突影响（90 errors、6 warnings）；全量 `tsc --noEmit` 仍有 118 个既有测试/接口错误。两项问题均不涉及本次 3 个修改文件。

## 安装状态
最新构建位于 `release/mac-arm64/Auris.app`。待当前运行的 Auris 安全退出后替换 `/Applications/Auris.app`。
