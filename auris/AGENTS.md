# AGENTS.md — 桌面端专属维护规则

本项目自 2026-06 起仅维护桌面端（Electron）。  
Web 端（登录、注册、计费等）已于 2026-06 移除，请勿恢复。

---

## Agent 修改范围

### 允许修改

- `electron/` — Electron 主进程
- `src/platform/desktop/` — 桌面平台适配层
- `src/components/desktop/` — 桌面专属 UI 组件
- `src/features/ai-dock/` — AI Dock（纯桌面功能）
- `src/features/app-runtime/` — 桌面运行时状态
- `src/app/video/`、`src/app/notes/`、`src/app/` 根页面
- `src/components/workspace/word-definition-popover.tsx`、`src/components/notes-v2/`

### 可以读取，修改前需声明影响范围（共用层）

- `src/platform/runtime.ts`、`src/platform/files/`、`src/platform/notes/`
- `src/features/notes/`（文档/编辑器/vault 核心逻辑）
- `src/features/sessions/`
- `src/app/api/` — API routes（桌面端本地 HTTP 调用依赖这些 routes，修改需说明双边影响）

### 禁止修改（保护桌面端依赖）

- `src/features/auth/session-actor.ts` — 桌面端本地用户绕过逻辑的核心
- `src/lib/supabase/` — API routes 运行时依赖，桌面端间接依赖
- `electron/preload.cjs`、`electron/main.cjs` — 除非任务明确是 Electron 主进程改动

### 不存在、请勿新建

- `src/app/login/`、`src/app/register/` — 已删除，不再维护
- `src/features/billing/` — 已删除，不再维护
- `src/components/auth/` — 已删除，不再维护

---

## 桌面端路由清单

桌面端侧边栏实际使用的路由（来源：`desktop-shell-fixtures.ts`）：

| 路由 | 组件 | 说明 |
|---|---|---|
| `/` | `DesktopHomeShell` | 首页 |
| `/video` | `DesktopVideoLibraryShell` | 视频库 |
| `/notes` | `NotesPageClient` | 笔记工作台 |

**修改任何上述路由对应的页面或组件时，必须同时验证桌面端可正常打开该页面。**

---

## 验证命令

```bash
npm run lint          # ESLint，预期 0 errors
npx tsc --noEmit      # TypeScript，预期 src/ 下 0 new errors
npm run desktop:dev   # 桌面端开发模式启动
npm run build         # Next.js 构建（桌面端生产依赖）
```

> `npm run start` 已删除（Web 独立部署命令，桌面端不使用）。

---

## 共用层修改规则

修改 `src/platform/` 下的工厂文件（files/notes/notifications）后，必须验证：

1. 桌面端打开 `/notes` 页面，vault 正常加载
2. 运行 `npx vitest run tests/unit/notes/`

修改 `src/app/api/` 下的 API routes 后，必须说明：

- 该 route 被哪些桌面端功能调用
- 修改是否影响 `isDesktopLocalRequest()` 的处理路径


## Engineering trajectory: VMark 差异补齐——PDF 交付与学习依赖复核（2026-08-20）

本轮根据 VMark 对齐报告先做源码复核，再仅实现已确认的缺口。复核发现 Auris 原本已有 `printToPDF` 与安全受管浏览器，因此没有重做 PDF 或浏览器框架，也没有碰用户未提交的浏览器 UI 改动。用户明确授权后，在 `electron/main.cjs` 与 `electron/preload.cjs` 最小扩展既有 PDF IPC：新增 `electron/pdf-export-options.cjs`，默认请求 A4、背景、CSS 页面规格、页码页脚、Tagged PDF 与 Document Outline；渲染端只允许传入受限纸张、方向及两项布尔选项。`src/platform/files/`、`desktop-bridge.ts` 和笔记 HTML 导出保持桌面/网页回退兼容，HTML 增加语义主区域、分页控制与 A4 页面规则。

学习产物新增 `learning-dependency-review.ts`、`learning-dependency-sync.ts` 和 `learning-dependency-note-update.ts`：新建学习笔记会将材料与来源笔记的标准化指纹写入 `aurisDependencySnapshot` frontmatter 和可读审计区块；来源材料保存、摘录追加、词汇追加后会扫描相关学习笔记并标记 `needs-review`；`NotesWorkbench` 底部在待复核时提供“确认已复核”，确认后以当前来源刷新指纹并写入 `reviewed` 决策。对应实现还扩展了 `learning-note-template.ts`、`use-workspace-learning-memory.ts`、`source-material-note.ts`、`notes-workbench.tsx`、`notes-workbench-bottom-right.tsx` 及定向测试。

验证：11 个定向 Vitest 文件、61 项通过；定向 ESLint 无 error；`node --check` 覆盖主进程、预加载与新 CJS 模块；`git diff --check` 通过；`npm run build` 完成；本地服务 `GET /notes` 返回 HTTP 200。新启动桌面开发命令因已有 Electron 单实例锁未创建第二个窗口，但现有本地服务与 `/notes` 路由可达。全仓 `tsc --noEmit` 仍有 118 项既有错误；筛查确认本轮源码和新增测试均不在错误清单。实现细节与余留边界见 `docs/vmark-sync/implementation-status-2026-08-20.md`。未提交或推送改动。
