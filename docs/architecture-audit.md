# 架构审计报告：english-shadowing-web 平台解耦分析

> 生成日期：2026-06-11  
> 范围：`src/` + `electron/`（不含 `note-rehearse-app/`）  
> 原则：**只分析，不修改代码**

---

## 一、当前架构的核心问题总结

项目实际存在 **三个运行平台**（Web / Electron Desktop / Capacitor Mobile），但代码在以下四处出现了严重耦合：

1. **`features/`**** 层直接 import ****`platform/desktop/`**：业务逻辑层不应感知平台实现细节，但目前有 20+ 处直接穿透依赖。
2. **`features/workspace/use-workspace-session-runtime.ts`**** 中 desktop/web 双路分支**：同一个 hook 里用 `if (desktopBridge) else fetch(...)` 同时承担两个平台的数据获取逻辑，任何一端改动都会影响另一端。
3. **`components/`**** 层直接调用 ****`fetch()`**：`source-panel.tsx`、`note-picker-dialog.tsx`、`auth-form.tsx` 把 API 调用内联在组件里，UI 与网络层耦合。
4. **平台专属文件散落在 ****`features/`**** 层中**：`desktop-training-history.ts`、`desktop-pronunciation-assessment-store.ts`、`desktop-video-library-runtime.ts` 等文件名已带"desktop"前缀，却住在"平台无关"的 `features/` 目录下，命名意图与目录意图矛盾。

---

## 二、模块层归属表

| 模块路径                                                                | 当前归属       | 应归属层                             | 说明                                         |
| ------------------------------------------------------------------- | ---------- | -------------------------------- | ------------------------------------------ |
| `src/platform/runtime.ts`                                           | platform   | **Shared**                       | 运行时检测，无副作用，各层可用 ✅                          |
| `src/platform/desktop/desktop-bridge.ts`                            | platform   | **Desktop Adapter**              | IPC 类型契约，正确 ✅                              |
| `src/platform/desktop/desktop-runtime.ts`                           | platform   | **Desktop Adapter**              | 读取 `window.__desktopBridge`，正确 ✅           |
| `src/platform/desktop/use-hydrated-desktop-bridge.ts`               | platform   | **Desktop Adapter**              | React hook，仅 desktop 用，正确 ✅                |
| `src/platform/desktop/desktop-request.ts`                           | platform   | **Desktop Adapter**              | 给 fetch 加 desktop 头，正确 ✅                   |
| `src/platform/desktop/vault-service.ts`                             | platform   | **Desktop Adapter**              | IPC vault 适配，正确 ✅                          |
| `src/platform/files/`                                               | platform   | **Shared Adapter**               | 有 desktop/web 两个实现 + 接口，正确 ✅               |
| `src/platform/notifications/`                                       | platform   | **Shared Adapter**               | 通知服务，正确 ✅                                  |
| `src/platform/notes/desktop-notes-storage.ts`                       | platform   | **Desktop Adapter**              | 正确 ✅                                       |
| `src/platform/services.ts`                                          | platform   | **Shared**                       | 服务工厂，正确 ✅                                  |
| `src/features/text/`                                                | features   | **Core**                         | 纯文本处理，无平台依赖 ✅                              |
| `src/features/sessions/session.types.ts`                            | features   | **Core**                         | 类型定义，无依赖 ✅                                 |
| `src/features/assessment/pronunciation-assessment.types.ts`         | features   | **Core**                         | 类型，无依赖 ✅                                   |
| `src/features/assessment/azure-pronunciation-assessment.ts`         | features   | **Core**                         | Azure SDK 调用，无平台感知 ✅                       |
| `src/features/assessment/wav-recorder.ts`                           | features   | **Core**                         | Web Audio API，浏览器通用 ✅                      |
| `src/features/assessment/local-pronunciation-assessment-store.ts`   | features   | **Core**                         | localStorage，浏览器通用 ✅                       |
| `src/features/assessment/desktop-pronunciation-assessment-store.ts` | features   | ⚠️ **Desktop Adapter**           | 名字已带 desktop，住错了层                          |
| `src/features/sessions/desktop-training-history.ts`                 | features   | ⚠️ **Desktop Adapter**           | 直接操作 DesktopBridge，住错了层                    |
| `src/features/video-library/desktop-video-library-runtime.ts`       | features   | ⚠️ **Desktop Adapter**           | 仅 `getDesktopBridge()` 封装，住错了层             |
| `src/features/navigation/use-desktop-route-prefetch.ts`             | features   | ⚠️ **Desktop Layer**             | 硬编码 desktop 路由，住错了层                        |
| `src/features/workspace/use-workspace-session-runtime.ts`           | features   | ⚠️ **Core（需拆分）**                 | 混入 desktop/web 双路逻辑，26 处分支                 |
| `src/features/workspace/use-workspace-library-runtime.ts`           | features   | ⚠️ **Core（有 platform 泄漏）**       | import `getFileExportService`              |
| `src/features/notes/local-notes-store.ts`                           | features   | ⚠️ **Core（充当 platform factory）** | 直接调用 `getDesktopBridge`、`detectRuntime`    |
| `src/features/notes/vault/desktop-vault-client.ts`                  | features   | ⚠️ **Desktop Adapter**           | 名字已带 desktop，住错了层                          |
| `src/features/notes/workbench/use-notes-runtime.ts`                 | features   | ⚠️ **Core（有 platform 泄漏）**       | 直接 import platform 层 4 处                   |
| `src/features/ai-dock/ai-dock-types.ts`                             | features   | ⚠️ **Core（类型泄漏）**                | 类型文件 import DesktopBridge                  |
| `src/features/ai-dock/use-ai-dock-history.ts`                       | features   | ⚠️ **Core（有 platform 泄漏）**       | import DesktopBridge                       |
| `src/features/ai-dock/use-ai-dock-layout-sync.ts`                   | features   | ⚠️ **Core（有 platform 泄漏）**       | import DesktopBridge                       |
| `src/features/ai-dock/use-ai-dock-prompts.ts`                       | features   | ⚠️ **Core（有 platform 泄漏）**       | import DesktopBridge                       |
| `src/features/app-runtime/app-runtime-storage.ts`                   | features   | ⚠️ **Core（有 platform 泄漏）**       | import DesktopBridge，内部做平台分支               |
| `src/features/app-runtime/home-resume.ts`                           | features   | ⚠️ **Core（有 platform 泄漏）**       | import DesktopBridge                       |
| `src/features/billing/billing.types.ts`                             | features   | ⚠️ **Core（轻微泄漏）**                | import AppPlatform（可接受，但可精简）               |
| `src/features/billing/billing-service.ts`                           | features   | **Core**                         | 工厂函数，只有 web 实现，缺 desktop no-op             |
| `src/features/billing/web-billing-service.ts`                       | features   | **Web Layer**                    | web 专属 billing，命名正确但层不对                    |
| `src/features/settings/training-settings-store.ts`                  | features   | **Core**                         | Zustand store，无平台感知 ✅                      |
| `src/features/audio/`                                               | features   | **Core**                         | TTS 提供商抽象，无平台感知 ✅                          |
| `src/features/learning-memory/use-workspace-learning-memory.ts`     | features   | ⚠️ **Core（有 platform 泄漏）**       | import DesktopBridge                       |
| `src/features/plugins/plugin-host.ts`                               | features   | ⚠️ **Desktop Layer**             | import DesktopBridge，桌面插件宿主                |
| `src/features/notes/documents/`                                     | features   | **Core**                         | 纯文档解析，无平台依赖 ✅                              |
| `src/features/notes/editor/`                                        | features   | **Core**                         | CodeMirror 扩展，无平台依赖 ✅                      |
| `src/features/notes/vault/vault-types.ts`                           | features   | **Core**                         | 接口定义，无依赖 ✅                                 |
| `src/features/notes/vault/browser-vault-client.ts`                  | features   | **Web Layer**                    | File System Access API，浏览器专属 ✅             |
| `src/features/notes/workspace/`                                     | features   | **Core**                         | Zustand workspace state，无平台依赖 ✅            |
| `src/features/notes/workbench/notes-workbench.facade.ts`            | features   | ⚠️ **Core（有 platform 泄漏）**       | import platform/services                   |
| `src/components/runtime/`                                           | components | **Desktop Layer**                | desktop-app-frame、sidebar，命名正确但目录名误导       |
| `src/components/platform/`                                          | components | **Desktop Layer**                | desktop-wordbook/collection shell，目录名严重误导  |
| `src/components/home/desktop-home-shell.tsx`                        | components | **Desktop Layer**                | 文件命名正确，但和 web home 混在同一目录                  |
| `src/components/video/desktop-*.tsx`                                | components | **Desktop Layer**                | 文件命名正确，但和其他 video 组件混放                     |
| `src/components/workspace/workspace-shell.tsx`                      | components | ⚠️ **Desktop Layer（但无平台标识）**     | 实际是 desktop workspace，直接用 getDesktopBridge |
| `src/components/workspace/source-panel.tsx`                         | components | ⚠️ **UI（混入网络层）**                 | 直接 `fetch()` API                           |
| `src/components/workspace/note-picker-dialog.tsx`                   | components | ⚠️ **UI（混入网络层）**                 | 直接 `fetch()` API                           |
| `src/components/auth/auth-form.tsx`                                 | components | ⚠️ **UI（混入网络层）**                 | 直接 `fetch()` API                           |
| `src/components/notes/`                                             | components | **暂时无法判断**                       | 旧版 notes UI，与 notes-v2 并存，生命周期不明           |
| `src/components/notes-v2/`                                          | components | **Desktop Layer（主要）**            | 完整 workbench，依赖 terminal/vault/platform    |
| `src/app/api/`                                                      | app        | **Web Server Layer**             | Next.js Route Handlers，Web 专属 ✅            |
| `src/app/workspace/page.tsx`                                        | app        | **Web/Desktop 混用页**              | 同一页面文件服务 desktop 和 web 两种模式                |
| `src/server/repositories/`                                          | server     | **Core Server**                  | 数据库 Repository，正确 ✅                        |
| `src/services/`                                                     | services   | **Core**                         | DI 容器 + 服务接口，正确 ✅                          |
| `src/lib/di/`                                                       | lib        | **Shared**                       | 轻量 DI，无平台依赖 ✅                              |
| `src/lib/supabase/`                                                 | lib        | **Web Server**                   | Supabase 客户端，Web 专属 ✅                      |
| `src/stores/app-store.ts`                                           | stores     | **Core**                         | 全局 Zustand store，无平台感知 ✅                   |
| `electron/`                                                         | electron   | **Desktop Main**                 | 正确隔离，不需要迁移 ✅                               |

---

## 三、迁移表格（高优先级问题文件）

| #  | 当前文件路径                                                          | 现在的问题                                                                                                           | 应迁移到                                                                              | 是否可直接移动    | 移动前注意事项                                      |
| -- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------- | -------------------------------------------- |
| 1  | `features/assessment/desktop-pronunciation-assessment-store.ts` | 名字带 desktop 却在 features 层，直接 import DesktopBridge                                                               | `platform/desktop/assessment-adapter.ts`                                          | ✅ 是        | 检查所有 import 路径，仅 workspace-shell 引用          |
| 2  | `features/sessions/desktop-training-history.ts`                 | 核心业务（session 历史）与 desktop 存储实现混合                                                                                | `platform/desktop/training-history-adapter.ts`                                    | ✅ 是        | 先确认 `use-workspace-session-runtime.ts` 的调用姿势 |
| 3  | `features/video-library/desktop-video-library-runtime.ts`       | 仅是 `getDesktopBridge()?.videoLibrary` 的单行封装                                                                     | `platform/desktop/video-library-adapter.ts`                                       | ✅ 是        | 只有 desktop-video-library-shell 引用            |
| 4  | `features/navigation/use-desktop-route-prefetch.ts`             | 硬编码 desktop 路由列表，是 desktop 专属行为而非通用导航逻辑                                                                         | `platform/desktop/use-desktop-route-prefetch.ts`                                  | ✅ 是        | desktop-app-frame 依赖它，一起移动                   |
| 5  | `features/notes/vault/desktop-vault-client.ts`                  | 名字带 desktop，直接依赖 `DesktopVaultService`（platform 层类型）                                                            | `platform/desktop/vault-client.ts`                                                | ✅ 是        | 检查 `use-notes-runtime.ts` 的 import 路径        |
| 6  | `features/plugins/plugin-host.ts`                               | 直接 import DesktopBridge，插件宿主是 desktop 专属功能                                                                      | `platform/desktop/plugin-host.ts`                                                 | ✅ 是        | 确认 plugin-api.ts 是否也需跟着移动                    |
| 7  | `components/runtime/` 整目录                                       | 全是 desktop 专属组件，但目录名"runtime"掩盖了这一点                                                                             | `components/desktop/`（改目录名）                                                       | ✅ 是（仅改路径）  | 全局 grep import 路径，统一修改                       |
| 8  | `components/platform/` 整目录                                      | 目录名"platform"实际全是 desktop 专属组件，命名严重误导                                                                           | 合并到 `components/desktop/`                                                         | ✅ 是（仅改路径）  | 同上                                           |
| 9  | `features/notes/local-notes-store.ts`                           | 充当 platform factory，内部调用 `getDesktopBridge()`、`detectRuntime()`，混合 web/desktop 两条路径                             | 拆分：保留 web 实现；platform 分发逻辑上移到 DI 注册处                                              | ❌ 否        | **需要重构**：factory 应由 DI 容器处理；先建接口再替换实现        |
| 10 | `features/workspace/use-workspace-session-runtime.ts`           | 同一 hook 里有 26 处 `if (desktopBridge) else fetch(...)` 双路分支                                                       | 保留为纯 web 版；提取 `platform/desktop/desktop-session-adapter.ts` 供 desktop 使用          | ❌ 否        | **需要重构**；参考已有 `.refactored.ts` 草稿；先写单元测试     |
| 11 | `features/ai-dock/ai-dock-types.ts`                             | 类型文件直接 import `DesktopBridge`，导致 ai-dock 整模块依赖 platform                                                         | 将 DesktopBridge 相关类型提取为 `ai-dock-desktop.types.ts`；主类型只保留平台无关定义                   | ❌ 否        | ai-dock 的 4 个文件都受影响，需一起调整                    |
| 12 | `features/notes/workbench/use-notes-runtime.ts`                 | 直接 import platform 层 4 处（`getDesktopBridge`、`createDesktopVaultService`、`detectRuntime`、`getFileExportService`） | 将 platform 依赖通过 DI 或参数注入                                                          | ❌ 否        | notes workbench facade 也需同步调整                |
| 13 | `features/app-runtime/app-runtime-storage.ts`                   | 核心 runtime 状态存储直接 import DesktopBridge 并做平台分支                                                                   | 将 desktop 相关存储逻辑提取为 desktop adapter；主 store 只保留接口调用                               | ❌ 否        | `home-resume.ts` 同样有此问题，需一起处理                |
| 14 | `components/workspace/source-panel.tsx`                         | 直接内联 `fetch("/api/sessions")` 和 `fetch("/api/import-url")`，UI 层混入网络逻辑                                           | 提取到 `features/sessions/create-session.ts`（文件已存在，可扩展）                              | ❌ 否        | 需先建对应 feature hook，再替换；行为不能变                 |
| 15 | `components/workspace/note-picker-dialog.tsx`                   | 直接内联 API fetch，逻辑与 source-panel 重复                                                                              | 同上，复用同一个 feature hook                                                             | ❌ 否        | 与 source-panel 一起处理，避免重复抽取                   |
| 16 | `components/auth/auth-form.tsx`                                 | 直接 `fetch("/api/auth/profile")` 和 demo-session API                                                              | 提取到 `features/auth/` 的 service/hook 中                                             | ❌ 否        | auth 逻辑分散在 features/auth/ 和组件，需先梳理边界         |
| 17 | `components/notes/` 旧版                                          | 与 `components/notes-v2/` 并存，生命周期不明，维护重复                                                                         | 确认是否废弃；若废弃则归档或删除                                                                  | **⚠️ 暂不动** | 先确认 `app/notes/page.tsx` 使用的是哪个版本            |
| 18 | `features/billing/web-billing-service.ts`                       | billing 只有 web 实现，desktop 运行时隐性使用 web 版（可能有隐患）                                                                  | 增加 `platform/desktop/desktop-billing-service.ts`（no-op），由 platform factory 按运行时选择 | ❌ 否        | 先确认 desktop 是否真的不需要 billing                  |

---

## 四、推荐的新目录结构

```
src/
├── platform/                        # 【平台适配层 - 唯一允许感知平台的层】
│   ├── runtime.ts                   # 运行时检测（不变）
│   ├── services.ts                  # 服务工厂（不变）
│   ├── desktop/                     # Desktop Electron 适配器
│   │   ├── desktop-bridge.ts        # IPC 类型契约（不变）
│   │   ├── desktop-runtime.ts       # window.__desktopBridge 访问（不变）
│   │   ├── desktop-request.ts       # fetch 头注入（不变）
│   │   ├── use-hydrated-desktop-bridge.ts
│   │   ├── vault-service.ts
│   │   ├── vault-client.ts          # ← Step 1: 从 features/notes/vault/ 迁入
│   │   ├── assessment-adapter.ts    # ← Step 1: 从 features/assessment/ 迁入
│   │   ├── training-history-adapter.ts  # ← Step 1: 从 features/sessions/ 迁入
│   │   ├── video-library-adapter.ts # ← Step 1: 从 features/video-library/ 迁入
│   │   ├── plugin-host.ts           # ← Step 1: 从 features/plugins/ 迁入
│   │   └── use-desktop-route-prefetch.ts # ← Step 1: 从 features/navigation/ 迁入
│   ├── web/                         # Web Browser 适配器（逐步归拢）
│   │   └── web-billing-service.ts   # ← Step 5: 从 features/billing/ 迁入
│   ├── files/                       # 跨平台文件导出（不变）
│   └── notifications/               # 跨平台通知（不变）
│
├── features/                        # 【Core 业务层 - 平台无关，可被所有端复用】
│   ├── assessment/                  # 只保留平台无关部分
│   │   ├── azure-pronunciation-assessment.ts
│   │   ├── local-pronunciation-assessment-store.ts  # web 默认实现
│   │   ├── pronunciation-assessment.types.ts
│   │   └── wav-recorder.ts
│   ├── audio/                       # TTS 抽象（不变）
│   ├── auth/                        # 认证（不变，补充 auth service）
│   ├── billing/
│   │   ├── billing.types.ts         # 接口定义（精简）
│   │   └── billing-service.ts       # 工厂（由 platform 层注入实现）
│   ├── notes/
│   │   ├── documents/               # 纯文档解析（不变）
│   │   ├── editor/                  # CodeMirror 扩展（不变）
│   │   ├── vault/
│   │   │   ├── vault-types.ts       # 接口（不变）
│   │   │   ├── browser-vault-client.ts  # web 实现（不变）
│   │   │   └── vault-store.ts       # 内存快照（不变）
│   │   ├── workbench/               # 业务 facade（Step 4: 去除 platform import，改为注入）
│   │   └── workspace/               # Zustand state（不变）
│   ├── sessions/
│   │   ├── session.types.ts
│   │   ├── create-session.ts        # Step 3: 补充 web 版 API 调用
│   │   └── use-session-query.ts
│   ├── settings/                    # Zustand store（不变）
│   ├── text/                        # 纯工具函数（不变）
│   ├── workspace/
│   │   ├── use-workspace-session-runtime.ts  # Step 4: 精简为纯 web 版
│   │   ├── use-workspace-library-runtime.ts  # Step 4: 去除 platform import
│   │   └── ...
│   └── ...
│
├── components/
│   ├── desktop/                     # 【Desktop 展示层】（Step 2 新建，合并以下）
│   │   ├── desktop-app-frame.tsx    # ← 从 components/runtime/ 迁入
│   │   ├── desktop-app-sidebar.tsx  # ← 从 components/runtime/ 迁入
│   │   ├── desktop-module-loading-shell.tsx
│   │   ├── desktop-home-shell.tsx   # ← 从 components/home/ 提取
│   │   ├── desktop-video-library-shell.tsx  # ← 从 components/video/ 提取
│   │   ├── desktop-collection-shell.tsx     # ← 从 components/platform/ 迁入
│   │   ├── desktop-wordbook-shell.tsx       # ← 从 components/platform/ 迁入
│   │   └── ...
│   ├── workspace/                   # 保留（Step 3: 去除直接 fetch）
│   ├── notes-v2/                    # 保留（主要为 desktop notes workbench）
│   ├── player/                      # 跨平台播放器（不变）
│   ├── assessment/                  # 跨平台（不变）
│   ├── auth/                        # Step 3: 去除直接 fetch
│   ├── meeting-drill/               # 跨平台（不变）
│   └── ...
│
├── app/                             # 【Web Next.js 路由层 - Web 专属】
│   ├── api/                         # Route Handlers（不变）
│   └── ...
│
├── server/                          # 【Web Server 层】（不变）
├── services/                        # 【DI 容器层】（不变）
├── stores/                          # 【全局状态层】（不变）
└── lib/                             # 【共享工具层】（不变）
```

---

## 五、分 5 步的迁移计划

> **原则**：每步只处理一个目标；步骤间可独立提交和回归测试；不修改任何业务逻辑。

---

### Step 1：把 `features/` 层中"误住"的 Desktop Adapter 文件迁回 `platform/desktop/`

**目标**：将文件名已有"desktop"前缀的文件从 `features/` 移入 `platform/desktop/`，不涉及任何逻辑修改。

**涉及文件**（可直接移动）：

| 源路径                                                             | 目标路径                                             |
| --------------------------------------------------------------- | ------------------------------------------------ |
| `features/assessment/desktop-pronunciation-assessment-store.ts` | `platform/desktop/assessment-adapter.ts`         |
| `features/sessions/desktop-training-history.ts`                 | `platform/desktop/training-history-adapter.ts`   |
| `features/video-library/desktop-video-library-runtime.ts`       | `platform/desktop/video-library-adapter.ts`      |
| `features/notes/vault/desktop-vault-client.ts`                  | `platform/desktop/vault-client.ts`               |
| `features/navigation/use-desktop-route-prefetch.ts`             | `platform/desktop/use-desktop-route-prefetch.ts` |
| `features/plugins/plugin-host.ts`                               | `platform/desktop/plugin-host.ts`                |

**验证方式**：`npm run lint` + `npm run test` 全绿即可。

**风险**：低。纯路径变更，没有逻辑修改。

---

### Step 2：统一 Desktop 展示组件目录

**目标**：将散落在多处的 desktop 专属 UI 组件统一迁移到 `components/desktop/`，消除 `components/runtime/` 和 `components/platform/` 这两个误导性的目录名。

**涉及文件**：

| 源路径                                                | 目标路径                                                 |
| -------------------------------------------------- | ---------------------------------------------------- |
| `components/runtime/` 整目录                          | `components/desktop/`                                |
| `components/platform/` 整目录                         | `components/desktop/`                                |
| `components/home/desktop-home-shell.tsx`           | `components/desktop/desktop-home-shell.tsx`          |
| `components/video/desktop-video-card.tsx`          | `components/desktop/desktop-video-card.tsx`          |
| `components/video/desktop-video-detail-shell.tsx`  | `components/desktop/desktop-video-detail-shell.tsx`  |
| `components/video/desktop-video-library-shell.tsx` | `components/desktop/desktop-video-library-shell.tsx` |

**注意**：`components/home/` 里同时有 `home-dashboard-v2.tsx`（非 desktop），不要误移。`components/video/` 里的非 desktop 文件同理。

**验证方式**：`npm run build` 确保无编译错误；检查 `app/workspace/page.tsx`、`app/video/` 等路由引用是否正确。

**风险**：低。纯路径变更。

---

### Step 3：把 `components/` 层的直接 `fetch()` 调用下沉到 `features/` 层

**目标**：让 UI 组件只调用业务 hook，不直接调用 `fetch()`，切断 UI 与 API 的直接绑定。

**涉及文件**：

| 文件                                            | 问题 API 调用                                                       | 目标 feature 文件                                 |
| --------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| `components/auth/auth-form.tsx`               | `fetch("/api/auth/profile")`, `fetch("/api/auth/demo-session")` | `features/auth/auth-service.ts`（新建）           |
| `components/workspace/source-panel.tsx`       | `fetch("/api/import-url")`, `fetch("/api/sessions")`            | `features/sessions/create-session.ts`（扩展已有文件） |
| `components/workspace/note-picker-dialog.tsx` | `fetch("/api/sessions")`, prepare API                           | 复用 source-panel 提取的同一个 hook                   |

**操作方式**：先在 `features/` 层建对应函数，组件改为调用该函数，确保行为一致 → 运行 `npm run playwright:test`。

**风险**：中。涉及运行时行为，需要 E2E 测试覆盖。每个组件独立提交，不要一次提交三个。

---

### Step 4：重构 `use-workspace-session-runtime.ts`——按平台拆分双路逻辑

**目标**：消除 hook 内部 26 处 `if (desktopBridge) else fetch(...)` 分支，改为两个平台独立的实现，由上层注入。

**方案**：

1. 提取公共接口类型 `SessionDataPort`（listRecent、getPlayback、deleteSession 的抽象方法）。
2. `features/sessions/web-session-port.ts` → 实现 fetch API 版本。
3. `platform/desktop/desktop-session-port.ts` → 实现 desktopBridge 版本。
4. `features/workspace/use-workspace-session-runtime.ts` → 改为接受注入的 `SessionDataPort` 参数，内部不再感知平台。
5. `components/workspace/workspace-shell.tsx` → 根据 `detectRuntime()` 选择注入哪个实现。

**参考**：项目中已有 `use-session-query.refactored.ts` 和 `use-workspace-session-runtime.refactored.example.ts` 草稿，可作为模式参考。

**验证方式**：先补充 `tests/unit/workspace/` 单元测试，测试通过后才提交；再运行 `npm run playwright:test` 在 web 和 desktop 分别验证。

**风险**：高。这是最核心的数据流。必须先写测试，再重构。

---

### Step 5：解耦 `features/notes/local-notes-store.ts` 的 Platform Factory 角色

**目标**：让 `local-notes-store.ts` 只保留 web 实现和接口定义，不再内部分发 desktop/web 两套路径。利用已有的 DI 容器（`src/services/register-services.ts`）做平台选择。

**方案**：

1. 将 `local-notes-store.ts` 内部的 desktop 分支逻辑（`getDesktopBridge`、`createDesktopVaultService`、`createDesktopNotesStorage`）提取到 `platform/desktop/notes-storage-factory.ts`。
2. `local-notes-store.ts` 只保留 web（浏览器 File System Access API）实现。
3. 在 `src/services/register-services.ts` 中，根据 `detectRuntime()` 注册对应实现（DI 容器已就绪，直接利用）。
4. `features/notes/workbench/use-notes-runtime.ts` 的 4 处 platform import 在此步一并修复，改为从 DI 容器获取实现。

**验证方式**：`npm run playwright:test` 在 web 和 desktop 两个平台分别验证 notes 功能完整性。

**风险**：高。Notes 系统是最复杂的子系统，改动涉及 vault 初始化流程。必须配合全量回归。建议在 Step 4 模式验证后再启动此步。

---

## 六、优先级建议

| 优先级            | 步骤     | 理由                                           |
| -------------- | ------ | -------------------------------------------- |
| P0（立即可做）       | Step 1 | 零逻辑修改，只改路径，修复最明显的命名混乱，收益/风险比最高               |
| P0（立即可做）       | Step 2 | 同上，纯目录整理，消除 `components/platform/` 这个严重误导性命名 |
| P1（下一个 sprint） | Step 3 | 切断 UI 对 API 的直接调用，改善可测性，风险可控                 |
| P2（规划中）        | Step 4 | 核心双路逻辑拆分，风险高但长期收益最大                          |
| P2（依赖 Step 4）  | Step 5 | Notes 系统重构，依赖 Step 4 的接口模式作为参考，放最后           |

---

*本报告不包含任何代码修改。实际重构前请逐步确认影响范围。*
