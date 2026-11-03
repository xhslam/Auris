# Auris

**本地优先的 AI 学习与知识工作台。**

Auris 将 Markdown 笔记、精读、影音跟读、间隔复习、AI 助手与终端放进同一个桌面工作空间，帮助你从阅读和聆听出发，完成理解、记录、练习与回顾。

它不再只是听力跟读工具，也不以聊天作为唯一入口：笔记保存在你选择的本地文件夹中，AI、浏览器与命令行围绕具体的学习和写作任务协作。

*A local-first AI learning and knowledge workspace combining Markdown notes, reading, listening & shadowing, spaced review, and controlled AI workflows.*

[下载与版本记录](https://github.com/xhslam/Auris/releases) · [本地开发](#本地开发) · [AI 与 MCP](#ai-与-mcp) · [文档索引](#文档索引)

## 主要功能

### Markdown 笔记与知识库

- **本地文件优先**：选择文件夹作为笔记库，也可以直接打开独立 Markdown 文件。
- **文件管理**：文件栏筛选、新建笔记与文件夹、重命名、拖动移动和确认后删除；删除沿用 Auris 回收站机制。
- **编辑与阅读**：富文本、源码和阅读相关视图，支持表格、代码块、数学公式和 Mermaid 图表。
- **知识组织**：多标签页、大纲、全文搜索、属性、标签、双向链接与关系图。
- **内容交付**：HTML / PDF 导出，以及微信公众号排版预览与复制。
- **写入保护**：保存冲突检查、恢复记录与版本校验，避免把旧内容静默覆盖到较新的笔记上。

Notes 当前直接进入文件栏与编辑器，不再以欢迎页或卡片文件夹浏览页作为主入口。文件栏主要显示 Markdown、图片和文件夹，不代表笔记库中的其他文件被删除。

### 阅读、词汇与影音练习

- **Markdown 精读**：导入学习材料，结合双语内容、词汇查询与生词收藏进行阅读，并保留阅读进度。
- **本地视频库**：选择素材目录、管理视频并恢复播放进度。
- **字幕驱动的英语陪练**：有可用字幕的素材支持逐句跟读、录音和发音评估；相关语音服务需另行配置。
- **材料与笔记关联**：将来源材料、摘录和词汇连接到学习笔记；来源变化时，相关学习笔记可以进入待复核状态。

> 阅读区当前的文件导入入口仅接受 Markdown。Word / PDF 需要先转换为 Markdown，不能将仓库中的历史解析模块理解为当前界面已支持直接导入。视频英语陪练需要可用字幕；语音生成、识别及评估不保证离线可用。

### 每日回顾与灵感闪念

- **Review**：按项目管理知识点，围绕 Day 1 / 2 / 4 / 7 复习周期查看安排、推进回顾并记录完成情况。
- **灵感闪念**：快速记录想法，按今日、收藏与搜索筛选，并将内容整理到笔记中。

### Nia AI 助手

- **学习与写作辅助**：围绕显式附加的笔记、选区、页面或工作流上下文开展对话与内容处理。
- **可配置提供商**：支持 REST 模型服务与固定 CLI 提供商；实际模型能力取决于你的配置。
- **可复用任务**：使用 Nia 定义保存提示词、输入范围和操作方式；支持 YAML 任务流水线与独立的 Browser Markdown 工作流。
- **独立工作区与桌面陪伴**：提供 Nia 对话入口及桌面陪伴交互；实时语音需要兼容的服务、凭据和麦克风权限。
- **受控笔记修改**：AI 生成的改写作为提案处理，应用时检查笔记版本与选区，不默认覆盖当前文档。

### 集成终端与浏览器

- **真实终端**：基于 PTY 与 xterm.js，提供 Notes 侧栏终端及独立终端模式，支持多会话和可调分屏。
- **CLI 协作**：可在终端中运行自行安装的工具；可选接入 Codex、Claude Code、Antigravity CLI 的 Agent 执行记录。工具安装、登录及钩子启用由用户管理。
- **多窗口浏览器**：支持窗口、标签页、书签，以及保留的 Human 标签恢复。
- **分离人工与 AI 会话**：Human 使用持久会话，AI Sandbox 使用隔离的临时会话；AI Shared 需要显式确认才能共享人工会话。
- **受控自动化**：浏览器操作绑定目标窗口、标签、控制租约及审批；用户可收回控制，模型不会因页面内容而自动获得权限。

> 终端运行的是本机命令，不是安全沙箱。浏览器自动化也不是默认开启的无限权限代理：必须通过安全检查并在设置中启用，敏感操作仍受审批约束。

## 一个典型的使用流程

1. 在 Notes 中连接自己的 Markdown 文件夹，建立课程、项目或主题笔记。
2. 在阅读区导入 Markdown 材料，或打开本地视频进行字幕跟读。
3. 将摘录、词汇和理解整理进笔记，按需请 Nia 总结或提出修改建议。
4. 在 Review 中添加知识点，按复习周期检验掌握情况。
5. 需要进一步检索或处理文件时，使用集成浏览器、终端或经授权的 MCP 工具。

## 桌面端与下载

当前项目**仅维护 Electron 桌面端**。Next.js 是桌面界面的本地运行时，不是另行维护的 Web 产品；登录、注册、计费及移动端不属于当前交付范围。

正式安装包请查看 [GitHub Releases](https://github.com/xhslam/Auris/releases)，以实际发布资产为准：

| 平台 | 构建与分发目标 | 更新说明 |
| --- | --- | --- |
| macOS Apple Silicon | DMG、ZIP | 默认 ad-hoc 临时签名模式下，发现新版本后前往 Release 页面手动下载安装 |
| Windows x64 | NSIS 安装包、ZIP | NSIS 安装版提供自动更新链路，实际可用性取决于发布产物与安装方式 |

macOS 临时签名不等同于 Developer ID 签名或 Apple 公证，Windows 当前也未配置代码签名证书，系统可能显示安全提示。不要将 Linux、Intel Mac 或其他架构视为已提供正式安装包的承诺。

更新签名模式、发布门禁和跨版本验收要求见[桌面发布与更新说明](./docs/desktop-auto-update.md)。

## 本地开发

### 环境要求

- 推荐 **Node.js 22**，与当前发布 CI 保持一致，并使用 npm 安装依赖。
- 需要包含开发依赖的完整安装，Electron 位于开发依赖中。
- macOS 源码启动会编译 Swift 桌面辅助程序，需要 Xcode Command Line Tools；非 macOS 会跳过此辅助程序构建。
- AI、云端语音及外部 CLI 是按需配置的能力，不包含在基础环境安装中。

### 安装与启动

```bash
git clone https://github.com/xhslam/Auris.git
cd Auris
npm ci
```

按需复制配置模板，并在本机填写实际使用的服务参数：

```bash
cp .env.example .env.local
```

Windows 可使用 PowerShell 的 `Copy-Item .env.example .env.local`。

启动桌面开发模式：

```bash
npm run desktop:dev
```

桌面启动器会启动或复用本地 Next.js 服务，无需先单独运行 `npm run dev`。仅运行 `npm run dev` 不会启动完整的 Electron 桌面能力。

如需用生产构建启动源码工作副本：

```bash
npm run build
npm run desktop:start
```

这不等于生成安装包。安装包构建和正式发布流程见[桌面发布与更新说明](./docs/desktop-auto-update.md)；其中的发布命令会创建或推送版本标签，不应当作普通启动命令执行。

### 配置说明

环境变量以 [`.env.example`](./.env.example) 为模板，按实际调用的服务配置，不必把历史变量都视为本地笔记功能的前置条件。

| 配置项 | 用途与边界 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY` | 仍保留的 Supabase 相关接口配置；不是恢复 Web 登录的要求 |
| `SUPABASE_SERVICE_ROLE_KEY` | 需要高权限 Supabase 服务端访问的接口使用，只能留在服务端 |
| `OPENAI_API_KEY` | 使用该变量的 OpenAI 服务端接口；不替代 Nia 设置中的独立提供商配置 |
| `AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION` | Azure 语音相关服务 |
| `SHADOWING_VOXCPM_URL`、`SHADOWING_VOXCPM_MODEL_VERSION` | 可选本地 VoxCPM 语音引擎 |

模板中的 `CAPACITOR_SERVER_URL` 是历史移动端配置，不属于当前桌面端启动流程。

Nia 的提供商、模型与凭据应通过应用设置管理，不要写进笔记、工作流或公开的 MCP 配置。REST 密钥默认仅驻留内存；macOS 的“记住”选项通过 Keychain 保存引用。不同平台和提供商的可用能力并不完全相同。

## AI 与 MCP

Auris 提供本地标准 MCP 服务 `auris-notes`，供外部 Agent 在明确的权限边界内连接正在运行的桌面应用。

| 能力 | 范围 |
| --- | --- |
| Notes | 查询工作区、管理笔记标签页、读取文档与选区，按版本安全写入已打开的 Markdown |
| Review | 查询项目与知识点，新增项目和知识点；当前 MCP 接口不提供编辑、删除或代替用户完成复习 |
| Browser | 只读观察，以及另行启用后的受控浏览器操作 |
| Workflow | 管理 Nia YAML 和 Browser Markdown 工作流运行 |

基本步骤：

1. 启动 Auris，在设置中启用 MCP 服务并配置客户端集成。
2. 操作 Notes 时，先打开 Notes 并选择笔记库；Review 工具不要求笔记库。
3. 浏览器自动化需要单独启用，不能仅凭 MCP 服务已开启就控制浏览器。
4. 外部 Agent 应先读取当前状态与版本，再请求写入；遇到 `STALE` 应重新读取，不应盲目重放旧修改。

完整连接方式、工具参数和故障排查见 [MCP 接入指南](./docs/notes/mcp-agent-setup.md)。配置 stdio 客户端时请直接使用 `node` 启动服务脚本，不要使用可能向 stdout 写日志的 `npm run` 包装命令。

Nia 的应用内浏览器工具循环需要兼容的 REST 提供商及显式授权。CLI 提供商自己的工具能力不等于 Auris 标签页控制权。生产能力快照中的 cookie / localStorage 重放和命名 profile 重放保持关闭，详见[浏览器安全模型](./docs/browser/security-model.md)。

## 数据与安全

- **本地优先不等于完全离线**：笔记库使用本地文件，Review 和其他工作区还使用各自的本地存储；它们并非全部自动保存到 Markdown 文件夹中。请同时备份笔记库与所需的应用数据。
- **按需连接外部服务**：调用 AI、语音或联网工作流时，相关输入会发送到你配置的服务；请先确认提供商和附加上下文。
- **权限分别管理**：文件夹授权、终端命令、MCP 客户端与浏览器自动化不是同一种权限，不能相互替代。
- **密钥不进入仓库**：真实配置只放在本地环境或安全凭据存储中，不要提交填有密钥的 `.env*` 文件，也不要粘贴到 Issue、截图和日志。
- **内容不是指令授权**：网页、导入工作流与笔记正文不能自行扩大 Agent 的工具权限。

涉及环境变量的改动，提交前运行 `npm run security:secrets`。更多说明见[密钥管理](./docs/security/secrets-management.md)与[浏览器安全模型](./docs/browser/security-model.md)。

## 开发检查

```bash
npm run security:secrets
npm run lint
npm run typecheck
npm test
npm run build
```

按修改范围补充检查：

```bash
npm run test:integration
npm run test:mcp-browser
npm run playwright:test
npm run quality:desktop-ipc
npm run quality:feature-ledger
```

部分集成、浏览器与端到端测试需要相应的运行环境。单元测试或构建成功不能替代真实桌面验收；修改页面、文件读写、PTY 或更新链路后，应在对应平台实际验证。以上是检查入口，不是对任意工作副本测试状态的通过声明。

## 技术结构

| 目录 | 职责 |
| --- | --- |
| `electron/` | Electron 主进程、IPC、本地文件、终端、浏览器、Nia 与 MCP 服务 |
| `src/app/` | Next.js 页面与桌面本地运行时使用的 API routes |
| `src/components/` | Notes、Review、阅读、视频、Nia 及桌面界面 |
| `src/features/` | 编辑器、学习、存储、AI 与工作流等领域逻辑 |
| `src/platform/` | 桌面平台桥接与文件 / 笔记适配 |
| `native/` | 原生桌面辅助程序 |
| `scripts/` | 开发启动、构建、校验和发布脚本 |
| `tests/` | 单元、组件、集成及桌面回归测试 |
| `docs/` | 功能说明、安全边界、发布与实现记录 |

核心技术包括 Electron、Next.js / React / TypeScript、ProseMirror / CodeMirror、xterm.js / PTY，以及 MCP SDK。数学公式和图表分别使用 KaTeX 与 Mermaid。

## 文档索引

- [产品定位与设计原则](./PRODUCT.md)
- [Notes 文件栏与当前交互](./docs/notes/notes-explorer-2026-10-31.md)
- [Notes 编辑器对齐说明](./docs/notes/vmark-note-editor-alignment-report.md)
- [MCP 接入：Notes、Review、Browser 与 Workflow](./docs/notes/mcp-agent-setup.md)
- [浏览器概览](./docs/browser/README.md)
- [浏览器安全模型](./docs/browser/security-model.md)
- [浏览器 MCP 协议](./docs/browser/mcp-tools.md)
- [Nia 定义与工作流](./docs/browser/nia-and-workflows.md)
- [桌面发布与更新](./docs/desktop-auto-update.md)
- [Windows 本地更新](./docs/windows-local-update.md)
- [密钥管理](./docs/security/secrets-management.md)

历史设计稿和实现记录反映各自时间点的状态；如果与当前入口或源码冲突，以当前实现和对应的新文档为准。

## 致谢与许可说明

Auris 的部分编辑器、终端与交互实现参考或适配了 [VMark](https://github.com/xiaolai/vmark)，相关版权及 ISC 许可保留于 [VMark 上游许可](./docs/vmark-port/UPSTREAM-LICENSE.txt)。

Nia 桌面陪伴的部分行为与协议参考了 [Mochi](https://github.com/xiaolai/mochi) 的特定版本；来源、适配范围及许可差异见 [Mochi 来源说明](./docs/third-party/mochi.md)。这些许可只适用于相应的上游代码或素材，不代表对 Auris 整个仓库统一授予 MIT 或 ISC 许可。
