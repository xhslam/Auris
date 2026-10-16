# Auris TypeScript 债务修复与门禁验收

日期：2026-10-16。版本保持 **1.0.18**。本轮按“排除备份误扫 → 修复关键声明和测试夹具 → 建立类型门禁”的顺序执行，ChatGPT 主导；`agy --dangerously-skip-permissions` 完成限定测试夹具组，主会话审查并独立复验。

## 结论

- 完整 TypeScript 诊断从 **241 → 133 → 0**，并非通过排除测试清零。
- 新增源码、测试、全仓三重门禁及独立 CI，移除 Next 的 `ignoreBuildErrors: true`。恢复类型检查后的生产构建通过。
- 未放松 `strict`，未增加通配模块 `any`、`@ts-ignore` 或 `@ts-nocheck`。Electron CJS/MJS 实现仍未全量启用 `checkJs`，不能将本轮结果解读为所有 JavaScript 实现都已获得静态类型检查。
- **全量运行测试尚未全绿**：最终 3,726 项通过、2 项失败。失败与复查结果见下文，未静默删除或跳过这些用例。

原始诊断报告保留为历史证据：[typescript-diagnosis-2026-10-16.md](./typescript-diagnosis-2026-10-16.md)。机器可读结果：[typescript-remediation-2026-10-16.json](./typescript-remediation-2026-10-16.json)。

## 1. 排除备份误扫

根 `tsconfig.json` 的 `exclude` 增加 `release`，其余原有镜像排除项保留。没有删除备份，没有排除当前 `tests/`。

| 检查阶段 | 诊断数 | 说明 |
|---|---:|---|
| 修复前 | 241 | 108 项旧 release 生成类型引用错误，133 项当前测试/声明问题 |
| 仅排除 release | 133 | 完整 tsc 实测，尚未修改夹具清零 |
| 声明/夹具修复后 | 0 | `npx tsc --noEmit --incremental false` 退出 0 |
| 最终三重门禁 | 0 | source、tests、all 分别通过，含 E2E 与 integration 类型检查 |

## 2. 关键声明与测试夹具

### 模块声明

- `electron/shared/browser-contract.d.cts`：补齐真实 schema 的 `.options`；为 `AMBIGUOUS_TARGET` 声明经过脱敏的 targets metadata 与序列化判别分支。保留 metadata 可缺失、其他错误不含 targets 的边界，没有修改运行时脱敏器。
- `electron/mcp/browser-tool-contract.d.mts`：为 ESM 工具契约、flat input、解析后的控制信息及 MCP 成功/失败结果补声明。
- `electron/menu-template.d.cts`：声明菜单树、可选回调、子菜单与 Electron role。
- `electron/vault/vault-file-walker.d.cts`：声明遍历依赖和文件/目录记录。
- `scripts/sync-personal-vocab.d.cts`：复用词库条目类型。
- `scripts/vmark-sync-report.d.cts`：声明 Git runner、锁、manifest、报告和 CLI 接口；未消费的复杂结果保留 `unknown`，不假造精确类型。

声明是 JavaScript 实现的静态契约，不等同于对实现本身的完整静态验证。现有 Browser 安全、脱敏、冻结、IPC 与负向测试继续运行。

### 测试修复

- 为 `vi.fn` 显式声明真实入参，避免零参数元组导致 `mock.calls[0][0]` 无效；未使用的实现参数通过泛型函数签名声明，避免新增 lint warning。
- 使用带类型的 holder 保存回调赋值，消除 TypeScript 将闭包外 nullable 状态收窄为 `never` 的问题。
- 补齐 DesktopBridge、VoiceEngine、音频删除、assessment history、session artifacts 等夹具字段，不将生产必填字段改为可选。
- 将过期的正常会话来源 `manual` 更新为当前支持的 `paste`，原有空用户/空标题/超长文本等非法输入断言保留。
- 修正字面量联合、`Awaited<function>` 误用、同名参数遮蔽、MediaQueryList mock 与 DOM 引用类型。
- 将 Notes 装饰器测试对私有字段的断言改为真实 EditorView DOM 类名断言，并在 finally 销毁；没有删除原有“存在/缺失 wikilink”断言。
- 为 intentionally malformed adapter/IPC 返回保留失效安全测试。仅损坏 runtimeState 的明确不可信返回边界使用带说明的 `unknown` 双重断言，不对整个测试组批量强转。
- 新增 `tests/fixtures/typecheck/desktop-bridge-fixture.ts`，集中提供符合当前必填契约的基础测试桥接，按需覆盖。

## 3. 类型门禁

### 本地命令

```bash
npm run typecheck          # 生成 Next 路由类型，然后依次检查源码、测试、全仓
npm run typecheck:source   # tsconfig.source.json
npm run typecheck:tests    # tsconfig.tests.json，包含 unit/component/integration/E2E/fixtures
npm run typecheck:all      # 根 tsconfig.json，另覆盖根配置等 TypeScript 输入
```

所有检查保持 `strict`、`noEmit`、原有库检查策略，不依赖增量缓存来判定通过。单独执行子命令前，必要时先运行 `npm run typecheck:routes`；干净 CI 使用聚合命令自动生成路由类型。

源码配置显式纳入本轮 Electron/scripts 声明和 Next 配置；测试配置纳入测试入口、测试配置与夹具。测试导入的生产代码仍随依赖接受检查，“独立”不表示隔离掉生产依赖。

### CI 与构建

- 新增 `.github/workflows/typecheck.yml`：PR、main/master push、手动触发；依赖安装后执行聚合门禁与 4 项配置契约测试，不使用窄 paths 过滤，不忽略检查失败。
- 相比原计划将门禁放入 Notes 工作流，最终采用独立工作流，避免扩大 Windows smoke 的触发范围，并保持用户已有 `.github/workflows/notes.yml` **相对本轮开始时逐字不变**。
- 新增 `tests/unit/quality/typecheck-contract.test.ts`：检查严格性、备份排除、当前所有源码/测试根文件覆盖、integration/E2E 未漏扫、npm/CI 调用与构建不再忽略类型错误。
- 移除 Next `ignoreBuildErrors: true`，`npm run build` 实际输出 `Running TypeScript ...` 并退出 0，Markdown bundle postbuild 检查通过。

CI 配置仅在本地解析与契约验证，未推送、未触发远程 GitHub Actions。仓库分支保护是否要求该检查，需要仓库管理员另行配置；本轮没有声称已设为强制合并条件。

### 反向验证

临时向 `src/`、`tests/fixtures/typecheck/` 各注入一个 `string = 42` 类型错误，同时在 `release` 写入错误探针：

| 门禁 | 预期/实际退出码 | 命中当前代码错误 | release 错误 |
|---|---:|---:|---|
| source | 2 / 2 | 1 | 正确排除 |
| tests | 2 / 2 | 1 | 正确排除 |
| all | 2 / 2 | 2 | 正确排除 |

源/测试探针在 finally 中移除，随后完整聚合门禁恢复退出 0。release 探针仅作为忽略目录中的验收材料保留。不是通过删除真实测试或改变断言清零。

## 4. 实际验证结果

| 验证 | 结果 |
|---|---|
| 完整 tsc | 0 诊断，退出 0 |
| source/tests/all 聚合检查 | 全部通过，退出 0 |
| 类型门禁配置契约 | 1 文件 / 4 项通过 |
| 主修 Browser/Notes/声明相关运行回归 | 219 文件 / 2,345 项通过 |
| 独立复验协作夹具范围 | 24 文件 / 120 项通过 |
| Browser authority 对抗集成 | 1 文件 / 6 项通过 |
| ESLint 最终检查 | 0 errors / 18 既有 warnings，退出 0，无新增 warning |
| 生产构建及 Markdown bundle 门禁 | 通过，退出 0，已恢复 TypeScript 构建检查 |
| 全量单元/组件最终运行 | 454 文件；3,726 项通过、2 项失败；退出 1 |
| 视频详情失败用例定向复验 | 整文件连续 3 次均 11 项通过 |
| diff 空白检查 | 通过 |
| 原 Notes/Windows smoke 工作流保护 | 与本轮开始时保存文件逐字一致 |

各定向通过数与全量通过数有重叠，**不可相加**。E2E 文件只完成类型验收，未重新执行整套 Playwright 或真实 Windows smoke。本轮是类型/测试夹具与构建配置修复，没有新增 UI 业务行为。

### 全量运行的未通过项

1. **`tests/unit/release-workflow.test.ts`**：测试原有根路径多退一级，读取 `/Users/apple/Desktop/.github/workflows/release-desktop.yml` 失败。尝试仅修正根路径后，当前项目 `.github/workflows/` 中也没有目标 `release-desktop.yml`，故已撤销该尝试并保持原测试不变。本轮不擅自重建发布流程，不通过 skip/删除用例掩盖失败。
2. **`tests/component/video/desktop-video-detail-shell.test.tsx`**：最终全量运行的播放控件隐藏计时断言一次失败；首次全量运行该用例曾通过，最终失败后整个文件连续三次定向重跑各 11 项通过。该文件及对应生产实现未在本轮修改，表现为全量环境下的非稳定结果；尚未定位根因，不能声称已修复或保证稳定。

首次全量运行是 3,723 通过 / 1 失败；新增 4 项门禁测试后，最终全量为上表结果。完整日志保留，未将定向重试通过替代全量结果。

## 5. 保护范围与证据

- 未提交、推送、发布、递增版本、安装或替换本地 App，未修改真实用户数据。
- 所有 AGENTS.md 只读；本轮未修改 main/preload、认证绕过或 Supabase 依赖。
- 保留本轮之前的 VMark 阅读/导航改动、原 Windows smoke 改动、图标删除和未跟踪设计文档，不以根 Git diff 全部作为本轮新增改动。
- 本轮原始日志位于 `release/typescript-remediation-20261016/`（本地忽略目录），包括 phase1/phase2 类型结果、最终 typecheck/lint/build、两次全量运行、定向回归、3 次视频重试及反向探针。
- 协作过程和最终结果位于当前会话工作台 `agy-type-fixtures/`。协作 CLI 已结束，其结果由主会话读取并复核。

**剩余边界：** 两项运行测试问题、远程 CI 首次运行、分支保护必需检查、完整 E2E/Windows 实机回归及 Electron JS 实现逐步类型化，均不应被本次 TypeScript 清零结果覆盖或误报为完成。
