# Auris 的 VMark Browser / Nia / Workflow 使用与交付指南

> 适用范围：Auris macOS Electron 桌面端
>
> VMark 迁移基线：`caa90e6b8`
>
> 文档核对日期：2026-07-22

## 1. 这份文档是做什么的

这份文档用于把已完成的 Phase 1-6 从“开发计划”转换成团队可以直接执行的使用、验收、发布和维护流程。

它主要回答五个问题：

1. 开发者如何在本地启动 Auris 并使用 Browser、Nia 和 Workflow。
2. 如何验证迁移功能没有破坏 Notes 等原有功能。
3. 如何构建、安装和验证 macOS 应用。
4. 如何推送、合并和继续跟进 VMark 上游变化。
5. 当前哪些能力已闭环，哪些仍需要在对外交付前补齐。

## 2. 先理解两个提交基线

### 2.1 VMark 迁移基线

`caa90e6b8 feat: complete VMark-compatible Auris browser and Nia` 是 Browser / Nia / Workflow Phase 1-6 的迁移交付点。其验收记录见 [phase-6-handoff.md](./phase-6-handoff.md)。

在该提交上，针对 VMark 迁移范围的测试已通过，但全仓库仍有 7 个旧测试文件不通过。这些问题与 Browser / Nia 迁移无关。

### 2.2 旧测试对齐提交

当前本地历史在 `caa90e6b8` 之后还有：

```text
60d5afd19 test: align legacy suites with desktop runtime
```

该提交删除了已不存在的 Billing / Mobile 测试，并对齐了 Notes、文件导出、通知和桌面视频界面的旧断言。因此，如果本次交付也要包含“修复 7 个旧测试”，应将 `60d5afd19` 一起作为候选交付点。

### 2.3 当前本地 Git 状态

核对时的本地状态是：

- `codex/vmark-phase-5` 和本地 `main` 都指向 `60d5afd19`，所以本地暂时没有可再执行的分支合并。
- 仓库没有配置 Git remote，因此现在不能直接 `push`。
- 工作区有大量未提交修改和未跟踪文件，包括构建产物与部分测试文件。不应直接在这个脏工作区里进行发布打包或推送。

所以，交付前必须先在干净 clone 或新 worktree 中重新验证目标提交。

## 3. 最快的本地启动方式

### 3.1 环境要求

Phase 6 已验证的环境是：

- macOS arm64
- Node.js `24.15.0`
- npm `11.12.1`
- Electron `41.2.0`

建议首先在干净工作区确认：

```sh
node --version
npm --version
git status --short
```

### 3.2 安装依赖

```sh
cd /path/to/auris
npm ci
```

使用 `npm ci` 而不是 `npm install`，以保持 `package-lock.json` 对应的可重复依赖树。

### 3.3 开发模式

```sh
npm run desktop:dev
```

这条命令会启动 Next.js 本地服务和 Electron 桌面壳。不要使用已删除的 Web 部署流程。

如果终端继承了 `ELECTRON_RUN_AS_NODE`，GUI 测试可能无法正常启动。可在当前 shell 中先执行：

```sh
unset ELECTRON_RUN_AS_NODE
npm run desktop:dev
```

## 4. 在 Auris 中使用 Browser

### 4.1 打开浏览器

启动 Auris 后，使用应用菜单的 **File > Nia 浏览器**，或按：

```text
Command + Shift + B
```

如果菜单项不存在，先检查当前构建的 Browser security capability 是否已通过。

### 4.2 开启自动化

在 Auris 设置中进入：

```text
设置 > 集成 > 浏览器自动化
```

开启 **启用 MCP 浏览器自动化**。该开关只有在编译时安全门通过后才可用。命名配置、cookie 回放和 localStorage 回放在当前生产能力快照中仍为关闭状态。

### 4.3 三种浏览器模式

| 模式 | 数据隔离 | 用途 | 注意事项 |
|---|---|---|---|
| Human | 持久化用户分区 | 用户手动浏览和登录 | AI 不会因为页面已登录就自动获得控制权 |
| AI Sandbox | 临时、非持久化分区 | 默认 MCP 自动化 | 与 Human cookie / localStorage 隔离，是推荐的自动化模式 |
| AI Shared | 与 Human 共享分区 | 确实需要用户会话的特殊任务 | 创建时需显式确认，之后仍需 lease、origin 和 approval 检查 |

日常自动化应优先使用 AI Sandbox。

### 4.4 多窗口和状态中心

主窗口的 **Browser status center** 会显示脱敏后的窗口、标签页、运行状态、工作流和审批状态。

需要注意：

- 聚焦某一行只会改变可见窗口，不会转移自动化权限。
- 有多个候选目标时，外部客户端必须显式提供 `windowId` 和 `tabId`。
- 返回 `AMBIGUOUS_TARGET` 时应刷新状态并重新选择目标，不要让客户端猜测。

### 4.5 人工接管和崩溃恢复

用户在被 AI 控制的页面上进行手动操作时，Auris 会进行 human reclaim，旧 lease 和 approval 不再有效。

页面导航、休眠、关闭、崩溃或人工接管后，自动化客户端应：

1. 重新调用 `get_state`。
2. 重新获取控制权。
3. 通过新的 `read` 或 `query` 重建页面引用。
4. 不得重用旧的 lease token、approval ID 或页面引用。

更完整的调用顺序见 [MCP browser tools](../browser/mcp-tools.md)。

## 5. 在 Auris 中使用 Nia

### 5.1 使用 Nia 面板

Nia 面板位于 Browser 窗口或 Notes 工作台中。基本使用流程是：

1. 在 **Provider settings** 中选择 Provider 和 Model。
2. 如有需要，显式点击 **Attach selection**、**Attach document** 或 **Attach browser**。
3. 输入提示词并发送。
4. 运行中可点击 Stop；取消后的迟到 Provider 结果不会被应用。
5. Notes 修改先以 proposal 显示，用户审阅后才会按预期 revision 应用。

Nia 不会隐式读取当前笔记、选区或 Browser 内容。本地会话历史也是选择开启，默认不保存。

### 5.2 Nia 与旧 Genie 的兼容规则

- 新定义和导出使用 `nia: v1`。
- 可以导入 `genie: v1`、旧 Genie v0 定义和 `uses: genie/<name>` 引用。
- 导入后会归一化到 Nia 身份；Auris 不会新写 Genie 品牌的定义。
- 兼容是导入兼容，不表示会恢复所有 VMark 或 Tauri 平台机制。

可以从以下已验证 fixture 开始修改：

- `tests/fixtures/nia/nia-v1.md`
- `tests/fixtures/nia/genie-v1.md`
- `tests/fixtures/nia/genie-v0.md`

### 5.3 Provider 和密钥规则

当前安全存储层支持：

- REST：Anthropic、OpenAI、OpenAI-compatible、Google AI 和 Ollama。
- CLI：只允许固定、已审计的 `claude`、`codex` 和 `gemini` adapter。
- 远程 REST endpoint 必须使用 HTTPS；只有本地 loopback Ollama 可使用 HTTP。
- API key 默认只保存在当前进程内存中。
- 只有用户显式选择 **remember on this Mac** 时，才保存 Keychain 引用。
- Provider 配置、Workflow YAML、URL、日志和 MCP 参数中都不得出现明文 key。

### 5.4 当前 Provider 配置界面的边界

代码核对显示，Electron main 中已有 Provider 创建/更新、内存密钥和 Keychain 持久化能力；但当前受信任的 Nia renderer IPC 只公开：

```text
start, cancel, getRun, subscribe, unsubscribe,
listProviders, discoverModels, testConnection
```

它还没有公开 Provider 新建/修改、会话 key 写入和 `rememberOnThisMac` 命令。因此：

- 已存在的 Provider 可在 Nia 面板中列出、选择、测试和调用。
- 一个全新用户配置目录还不能仅通过当前 UI 完成 REST Provider 和 API key 的首次录入。
- 不应把 key 手工写入 `providers.json` 来绕过这个问题。

如果目标是向普通用户交付，这是发布前需要闭环的配置界面问题。如果团队在仓库外已有受信任的预配置工具，应将该工具及安全边界补充到本文档。

## 6. 创建和运行 Workflow

### 6.1 Nia YAML Workflow

Nia YAML 适用于有步骤依赖的 AI 管道。最小示例：

```yaml
name: Local summary
nia: v1
inputs:
  text:
    type: text
steps:
  - id: render
    uses: nia/template
    with:
      template: "Summarize: {text}"
```

完整可运行 fixture：

```text
tests/fixtures/workflows/nia-pipeline-v1.yaml
```

旧 Genie Workflow 兼容示例：

```text
tests/fixtures/workflows/genie-pipeline-v1.yaml
```

### 6.2 Browser Markdown Workflow

Browser Markdown 适用于和站点绑定的浏览器流程。最小示例：

```markdown
---
site: example.com
inputs: {}
trigger: manual
---

1. extract: title
2. confirm: Continue with the reviewed page?
```

更完整的示例见：

```text
tests/fixtures/workflows/browser-research.md
```

### 6.3 UI 操作流程

1. 在 Nia 面板的 **Workflows** 区域选择 `Nia YAML` 或 `Browser Markdown`。
2. 将原始 Workflow 源文本粘贴到 **Source**。
3. 点击 **Validate · 校验**。
4. 校验通过后点击 **Start · 开始**。
5. Browser Markdown 必须绑定明确的 Browser window/tab。
6. 在运行面板中观察步骤、事件、审批状态和错误。
7. 遇到 `confirm` / `goal` / 浏览器审批暂停时，点击 **Confirm · 确认继续** 或 **Deny · 拒绝**。
8. 需要中止时点击 **Cancel workflow**。

Workflow 源文本会在 Electron main 中重新解析，不信任 renderer 传入的 AST 或 action registry。

### 6.4 确认和恢复

Browser Markdown 工作流支持公开 `resume`：

```text
list, inspect, validate, start, get_state, cancel, resume
```

- UI：运行面板在 `awaiting_confirmation` / `awaiting_approval` 时提供 Confirm / Deny。
- IPC：`auris-workflow:command` 的 `resume`，payload 含 `family`、`runId`、`approved`、可选 `approvalId`。
- MCP：`auris_workflow` 的 `action: "resume"`（仅 `browser_markdown`），需 `run_id` + `approved`；`browser_approval` 暂停时附带 `approval_id`。
- `goal:` 步骤通过 main 注入的 `niaPropose` 生成受限文本提案，人工确认后继续；不会自动执行模型产出的 AST。

`nia_yaml` 不支持 resume。过期或不匹配的 `approvalId` 会被拒绝。

## 7. MCP 客户端使用方式

1. 先启动 Auris 桌面应用。
2. 进入 **设置 > 集成 > MCP 服务器**。
3. 开启 MCP 服务器，确认本地端口和连接状态。
4. **另外**进入 **设置 > 集成 > 浏览器自动化**，开启 **启用 MCP 浏览器自动化**。  
   MCP 服务器开启 ≠ 浏览器自动化开启；后者还要求编译时安全门通过，且命名配置 / cookie / localStorage 回放在当前生产能力中仍关闭。
5. 在 **安装 MCP 配置** 中为 Claude Desktop、Claude Code、Codex CLI 或 Gemini CLI 安装对应配置。
6. 用 `auris_browser` 的 `get_state` 查看 Browser 状态，再按 acquire/read-or-query/act/release 顺序操作。详见 `docs/browser/mcp-tools.md`。

任何 MCP 客户端都不能绕过 Electron main 中的 lease、origin policy、approval、资源限制和 Notes revision 检查。

## 8. 测试和验收

### 8.1 快速静态门

```sh
npm run lint
npx tsc --noEmit
npm run security:secrets
git diff --check
```

### 8.2 Browser / Nia / Workflow 聚焦测试

```sh
npx vitest run \
  tests/unit/browser \
  tests/unit/electron/browser \
  tests/unit/electron/nia \
  tests/unit/electron/workflows \
  tests/unit/nia \
  tests/unit/workflows \
  tests/unit/vmark \
  tests/unit/electron/auris-notes-mcp-server.test.ts \
  tests/unit/electron/notes-mcp-bridge.test.ts \
  tests/unit/electron/desktop-packaging.test.ts \
  tests/unit/electron/electron-runtime-deps.test.ts \
  tests/unit/electron/find-open-port.test.ts \
  tests/unit/notes/browser-vault-client.test.ts \
  tests/component/browser-window \
  tests/component/desktop/browser-status-center.test.tsx \
  tests/component/nia \
  tests/component/notes/notes-nia-apply.test.tsx \
  tests/component/settings/auris-settings-browser-grants.test.tsx \
  tests/component/settings/auris-settings-browser-security.test.tsx
```

### 8.3 集成测试

```sh
npm run test:integration
npm run test:mcp-browser
```

### 8.4 Electron smoke 矩阵

GUI smoke 建议按顺序执行：

```sh
npm run browser:smoke
npm run browser:isolation
npm run browser:partition-isolation
npm run browser:human-reclaim
npm run browser:session
npm run browser:dialog-feasibility
npm run browser:ux-policy
npm run browser:crash-recovery
npm run browser:security
npm run browser:multiwindow
npm run browser:resource-budget
npm run nia:workflow-smoke
```

### 8.5 全仓库测试

```sh
npm run test
```

判定方法：

- 在干净的 `caa90e6b8` 上，预期会看到历史记录中的 7 个迁移范围外失败。
- 在包含 `60d5afd19` 的干净交付分支上，应重新运行全量测试，不应仅根据提交名宣布已修复。
- 当前脏工作区里又出现了部分旧测试文件，其测试结果不能代表任一干净提交。

## 9. 打包、安装和运行验证

### 9.1 发布阻断级验证

```sh
npm run desktop:build:verify
```

该命令会：

1. 执行 Next.js 生产构建。
2. 装配 Electron 运行时依赖闭包。
3. 构建 unpacked macOS `.app`。
4. 将应用复制到 workspace 外的临时路径。
5. 验证打包后的 MCP sidecar、Notes、Nia 和 Workflow 闭环不会偷用工作区 `node_modules`。

成功后的 app 通常位于：

```text
release/mac-arm64/Auris.app
```

### 9.2 生成 DMG

`desktop:build:verify` 使用 `--dir` 验证 unpacked app，不会强制生成 DMG。生成可安装镜像可执行：

```sh
npm run build
npm run desktop:assemble
npx electron-builder --mac --publish never
```

当前 arm64 产物名称为：

```text
release/Auris-1.0.0-arm64.dmg
```

### 9.3 本地安装验证

1. 退出正在运行的 Auris。
2. 打开 DMG。
3. 将 `Auris.app` 拖入 `/Applications`。
4. 从 `/Applications` 启动，不要只在 `release/` 中运行。
5. 检查 Home、Notes、Nia 浏览器、Browser status center 和 MCP 连接。
6. 至少完成一次 Nia YAML 运行、一次 Browser Workflow 确认点和一次取消。
7. 退出并重启 App，检查 Human 标签恢复，并确认 AI lease / approval 未被恢复。

### 9.4 签名和公证边界

当前 `electron-builder.yml` 中的 macOS 配置是：

```yaml
identity: null
hardenedRuntime: false
gatekeeperAssess: false
```

这适合内部开发和本机安装验证，不是已签名、已公证的对外 macOS 发行包。如果要分发给普通用户，必须另行完成 Developer ID 签名、hardened runtime、entitlements、notarization 和 Gatekeeper 验证。

## 10. 数据迁移和备份

### 10.1 用户数据位置

Nia 数据使用 Electron `app.getPath("userData")/nia` 作为根目录，其中包括：

- Provider 非密钥配置。
- Nia definitions。
- Browser Workflow 导入审阅记录。
- 由 `safeStorage` 加密的密钥持久化辅助数据。

在常规 macOS 安装中，用户数据通常位于 `~/Library/Application Support/Auris`，但迁移工具应以 Electron 运行时返回的 `userData` 路径为准，不应仅依赖硬编码路径。

### 10.2 迁移原则

- 备份前必须完全退出 Auris，避免复制半写入数据。
- 优先导入旧 Genie / Nia 原始定义，让 Auris 解析器进行兼容归一化。
- 不要将 VMark 或旧配置中的明文密钥复制进 Auris Workflow 或 `providers.json`。
- 不迁移旧 lease、approval、页面引用和 AI 控制权。
- 恢复后第一次运行 Browser Workflow 时，应重新审阅来源、操作和声明的 secret 需求。

## 11. 推送和合并流程

### 11.1 决定交付点

有两种可选范围：

| 交付范围 | 目标提交 | 含义 |
|---|---|---|
| 只交付 VMark Phase 1-6 | `caa90e6b8` | 保留 7 个旧测试为已知基线 |
| 迁移加旧测试对齐 | `60d5afd19` | 包含后续旧测试处理，需在干净环境全量复验 |

推荐将 `60d5afd19` 作为候选交付点，但前提是完成全量测试和安装包复验。

### 11.2 配置远程仓库

当前本地仓库没有 remote。由仓库管理者提供真实 URL 后，在干净 clone 中执行：

```sh
git remote add origin <repository-url>
git fetch origin
```

不要在文档、聊天或命令历史中填入带明文 token 的 URL。

### 11.3 推送功能分支

```sh
git switch codex/vmark-phase-5
git status --short
git push -u origin codex/vmark-phase-5
```

`git status --short` 必须为空。如果不为空，先判断未提交内容的归属，不要把 `release/`、临时认证目录或无关的用户改动带入迁移 PR。

### 11.4 通过 PR 合并

推荐从 `codex/vmark-phase-5` 向远程默认分支创建 PR，PR 中至少包含：

- 目标提交 SHA。
- Phase 6 聚焦测试结果。
- 全仓库测试结果及旧基线处理。
- `desktop:build:verify` 结果。
- DMG 从 `/Applications` 启动的实机验证结果。
- 签名/公证状态。
- Provider 首次配置。

当前本地 `main` 已和功能分支指向同一提交，所以不必在本地再做一次无效 merge。真正的合并对象应以远程默认分支为准。

## 12. 继续跟进 VMark 上游

Auris 使用 VMark 作为行为和源码结构参考，不会自动把上游改动复制进产品。

对新的已审阅 VMark commit 执行：

```sh
npm run vmark:diff -- --upstream <reviewed-vmark-commit>
```

然后人工审阅：

```text
docs/vmark-sync/latest.md
docs/vmark-sync/latest.json
docs/vmark-port/manifest.json
```

维护规则：

- `manifest.json` 是审计辅助，不是运行时权威。
- 只有人工审阅完成后才更新 `lastComparedCommit`。
- 上游 Tauri 机制必须按 Electron `BrowserWindow` / `WebContentsView` 边界重新设计，不能机械复制。
- 每次改动都要重新验证窗口隔离、人工接管、崩溃恢复、审批失效、资源限制和 Notes revision 安全。

## 13. 对外交付前检查表

### Git 和范围

- [ ] 已确定交付 `caa90e6b8` 还是 `60d5afd19`。
- [ ] 已在干净 clone/worktree 中复验。
- [ ] 已配置正确 remote，且没有使用明文 token URL。
- [ ] PR 中没有混入无关改动、临时目录或构建产物。

### 功能

- [ ] Home、Notes 和原有桌面路由可正常打开。
- [ ] Human、AI Sandbox 和 AI Shared 隔离策略符合预期。
- [ ] 多窗口显示和显式目标选择正常。
- [ ] 人工接管会使旧 lease / approval 失效。
- [ ] 崩溃恢复不会恢复 AI 控制权。
- [ ] Nia 取消后不应用迟到 Provider 结果。
- [ ] Notes 应用会检查 revision 并显示审阅。
- [ ] 旧 Genie 定义和 Workflow 可导入，新导出使用 Nia。

### 当前需补齐的发布闭环

- [ ] 全新用户可通过受信 UI 完成 Provider 和 API key 首次配置。
- [x] Workflow 的用户确认能通过 IPC/UI/MCP 调用 `resume` 并继续运行。
- [ ] 面向外部分发时已完成 macOS 签名、公证和 Gatekeeper 验证。

### 测试和安装

- [ ] lint、TypeScript、secret scan 和 `git diff --check` 通过。
- [ ] Browser / Nia / Workflow 聚焦测试通过。
- [ ] 全仓库测试结果已记录。
- [ ] 12 个 Electron smoke 命令通过。
- [ ] `npm run desktop:build:verify` 通过。
- [ ] DMG 从 `/Applications` 进行过冷启动和重启验证。

## 14. 相关文档

- [Phase 6 交接记录](./phase-6-handoff.md)
- [VMark 来源与 manifest](./README.md)
- [Browser 总览](../browser/README.md)
- [Browser 安全模型](../browser/security-model.md)
- [MCP Browser 工具](../browser/mcp-tools.md)
- [Nia 与 Workflows](../browser/nia-and-workflows.md)
- [Secrets Management](../security/secrets-management.md)
