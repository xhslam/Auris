# Notes 笔记库侧栏导航：执行轨迹（2026-08-17）

## 任务解释
将“添加笔记库”从 Notes 工作台画布左侧的独立窄列移入应用主侧边栏。收起状态下，用户点击已激活的 Notes 图标即可在其下显示紧凑的添加入口；主侧边栏展开时，Notes 下方展示笔记库名称作为二级导航，并保留添加和切换能力。

## 实现路径
原实现由 `NotesWorkspaceRail` 在 `NotesWorkbench` 内渲染，因此会占用编辑画布的一列。此次将工作台中的该渲染移除，并新增 `DesktopNotesVaultNav`，复用既有 `useWorkspaceRail` 状态与原生目录授权流程。`DesktopAppSidebar` 负责 Notes 导航项的会话级展开状态：首次进入 Notes 时打开面板，再次点击活动 Notes 图标可切换；主侧边栏展开时始终展示当前 Notes 的笔记库二级导航。

## 修改文件
| 文�| 文�| 文�| 文�| 文�| 文�| 文�| ktop/desktop-app-sidebar.tsx` | 管理 Notes 子级展开状态，并在 Notes 项后挂载笔记库导航。 |
| `src/components/desktop/desktop-notes-vault-nav.tsx` | 提供收起态添加入口，以及展开态笔记库名称、切换和添加操作。 |
| `src/components/notes-v2/notes-workbench.tsx` | 移除画布左侧独立工作区轨道。 |
| `src/styles/auris-redesign.css` | 定义紧凑入口及展开态二级导航样式。 |
| `tests/component/desktop/desktop-notes-vault-nav.test.tsx` | 覆盖收起、展开、添加和切换行为。 |

## 验证
- 新增组件测试 3 项通过；侧边栏、工作台与旧工作区轨道相关测试合计 62 项通过。
- 相关 TypeScript/TSX 的 ESLint、Prettier 与差异空白检查通过。
- `npm run desktop:build:verify` 通过，涵盖生产构建、桌面装配、打包隐私审计和 MCP sidecar 烟雾验证。
- 最新构建已复制至 `/Applications/Auris.app`，签名验证通过并已启动。

## 保留项
未修改工作区中与本次任务无关的 `main.cjs` 未提交改动或根目录 `AGENTS.md`。
