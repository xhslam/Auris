# Auris

> 一个围绕**聆听、跟读与复习**构建的桌面优先语言学习工作台。

Auris 将音频与视频学习、精读、词汇复习、笔记整理以及 AI 辅助整合在同一工作流中。主应用位于 [`auris/`](auris)，采用 Next.js 构建界面，并以 Electron 提供桌面端能力。项目尤其适用于希望通过反复聆听、影子跟读（shadowing）和主动回忆来形成稳定学习闭环的学习者。

## 目录

| 章节 | 内容 |
|---|---|
| [核心能力](#核心能力) | 产品模块与学习闭环 |
| [技术架构](#技术架构) | 项目实现与运行边界 |
| [快速开始](#快速开始) | 本地安装、配置与启动 |
| [环境变量](#环境变量) | 可选服务的配置项 |
| [验证与打包](#验证与打包) | 测试、检查与 Windows 打包 |
| [项目结构](#项目结构) | 主要目录说明 |
| [安全与贡献](#安全与贡献) | 密钥、问题反馈和提交约定 |

## 核心能力

Auris 的应用路由覆盖浏览器、跟读、阅读、闪卡、AI 助手、笔记、复习、设置和视频资料库等模块。[1] 这些模块可组合为“输入内容 → 精读与理解 → 跟读练习 → 间隔复习 → 复盘沉淀”的学习流程，而不是彼此孤立的工具集合。

| 模块 | 用途 |
|---|---|
| **视频与音频学习** | 管理学习素材、播放学习会话，并围绕听辨和跟读组织练习。 |
| **阅读与词典** | 支持在阅读流程中查询词义并沉淀个人词汇。 |
| **闪卡与复习** | 将需要记忆的内容进入闪卡与复习模块，帮助建立主动回忆习惯。 |
| **笔记工作台** | 在学习过程中记录、编辑和归档笔记，便于后续回顾。 |
| **Nia AI 助手** | 提供 AI 对话、提示词库与工作流能力，可作为学习、整理和任务执行的辅助入口。 |
| **桌面浏览器与工作流** | Electron 端包含多窗口、隔离会话、浏览器状态管理与工作流运行能力。[2] |

> **设计原则：** 学习内容、练习记录和复习任务应尽量在同一上下文中完成，从而减少在播放器、词典、笔记软件和浏览器之间切换的摩擦。

## 技术架构

主应用使用 Next.js、React 和 TypeScript；Electron 负责桌面壳、原生窗口、预加载桥接及桌面侧服务。依赖和可执行脚本以 [`auris/package.json`](auris/package.json) 为准。[3]

| 层级 | 主要技术 | 职责 |
|---|---|---|
| 界面层 | Next.js、React、TypeScript | 提供学习、阅读、笔记、复习和设置等页面与组件。 |
| 桌面层 | Electron | 管理原生窗口、IPC、系统能力与桌面运行时。 |
| 数据与鉴权 | Supabase（可选） | 为登录、个人资料、云端数据与音频服务提供配置入口。 |
| AI 与语音 | OpenAI、Azure Speech、VoxCPM（可选） | 为 Nia、语音相关能力与跟读场景提供服务接入。 |
| 质量保障 | Vitest、Playwright、ESLint | 覆盖单元测试、端到端测试、静态检查及桌面端专项校验。 |

## 快速开始

以下命令以 Windows PowerShell 为例。克隆仓库后，先进入实际应用目录 `auris/`。

```powershell
git clone https://github.com/xhslam/auris.git
cd auris\auris
npm ci
Copy-Item .env.example .env.local
```

根据所需功能填写 `.env.local` 后，可使用浏览器模式启动开发服务器：

```powershell
npm run dev
```

然后访问终端显示的本地地址。若需要以桌面应用方式开发和调试，请运行：

```powershell
npm run desktop:dev
```

在已构建的应用上启动桌面壳时，使用：

```powershell
npm run build
npm run desktop:start
```

## 环境变量

仓库提供了 [`auris/.env.example`](auris/.env.example) 作为配置模板。并非所有变量都是本地开发的必填项；请仅配置当前要启用的服务。

| 变量 | 适用场景 | 处理要求 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址 | 可在客户端使用，但必须指向正确的项目。 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名访问 | 应配合 Supabase 的行级安全策略使用。 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端管理操作 | **仅限服务端**；严禁暴露给浏览器或提交到仓库。 |
| `OPENAI_API_KEY` | Nia 与 AI 能力 | 仅放入本地或受控的服务端环境。 |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | 语音服务 | 使用对应 Azure 资源的密钥与区域。 |
| `SHADOWING_VOXCPM_URL` / `SHADOWING_VOXCPM_MODEL_VERSION` | 跟读语音模型服务 | 填写已部署服务的地址与模型版本。 |
| `CAPACITOR_SERVER_URL` | 移动端壳调试 | 填写可供原生壳访问的 HTTPS 或本地开发地址。 |

`.env`、`.env.local` 和生产环境本地变量已纳入忽略规则；仍请在提交前确认没有把真实密钥、服务角色密钥或私密服务地址写入源码和测试夹具中。[4]

## 验证与打包

完成开发后，建议按改动范围运行对应检查。所有命令均在 `auris/` 目录执行。

| 目标 | 命令 |
|---|---|
| 静态检查 | `npm run lint` |
| 单元测试 | `npm test` |
| 浏览器端到端测试 | `npm run playwright:test` |
| 桌面浏览器冒烟测试 | `npm run browser:smoke` |
| 桌面 IPC 合约检查 | `npm run quality:desktop-ipc` |
| 功能台账一致性检查 | `npm run quality:feature-ledger` |
| 打包隐私审计 | `npm run desktop:privacy:audit` |
| Windows 桌面包组装 | `npm run desktop:assemble:win` |
| 桌面构建产物校验 | `npm run desktop:build:verify` |

桌面端需要在目标系统上完成最终验证，尤其应覆盖窗口隔离、登录状态、音视频播放、文件访问、自动更新和安装/卸载流程。

## 项目结构

```text
.
├── auris/                     # 主应用：Next.js + Electron
│   ├── src/app/               # 页面路由与服务端接口
│   ├── src/components/        # 学习、AI、笔记、浏览器与桌面组件
│   ├── electron/              # 主进程、IPC、原生服务与桌面运行时
│   ├── scripts/               # 构建、审计、迁移与校验脚本
│   ├── tests/                 # Electron 与浏览器自动化测试
│   ├── docs/                  # 浏览器模块及迁移相关说明
│   └── supabase/              # Supabase 迁移与数据库相关文件
├── docs/                      # 仓库级文档
├── research/                  # 研究材料与参考实现
└── package.json               # 工作区级工具配置
```

更细的模块说明可参阅 [Auris 内部文档](auris/docs/)；浏览器模块的运行与设计说明位于 [`auris/docs/browser/README.md`](auris/docs/browser/README.md)。

## 安全与贡献

请不要提交 `.env*` 文件、访问令牌、真实用户数据、构建产物或本地数据库。提交前应至少运行与改动相关的检查，并用清晰的提交信息说明“做了什么、为什么做、如何验证”。如需报告漏洞或处理敏感问题，请通过私下渠道联系维护者，不要在公开 issue 中粘贴密钥、日志或可复现的用户数据。

本仓库当前未在主应用目录提供单独的开源许可证。使用、复制或分发代码前，请先与仓库维护者确认授权范围。

## 参考

[1] [Auris 应用路由](auris/src/app/)
[2] [Electron 桌面端实现](auris/electron/)
[3] [应用依赖与脚本](auris/package.json)
[4] [环境文件忽略规则](auris/.gitignore)
