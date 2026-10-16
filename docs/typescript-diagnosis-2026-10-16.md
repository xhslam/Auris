# Auris TypeScript 241 项诊断：根因与修复优先级

日期：2026-10-16，Asia/Shanghai。范围为本轮 VMark 同步后的工作副本；本次只诊断，未修改业务源码、测试、tsconfig、Next 配置或 CI。

## 结论

**241 项诊断不等于 241 个业务缺陷。** 实测其中 108 项来自旧构建备份被误纳入检查，其余 133 项位于 43 个测试文件。当前 `src/` 与当前 Next 生成类型独立检查为 0 项诊断。

但不能据此说整个 App 已类型安全：Electron 的 `.cjs/.mjs` 未被这份配置检查；生产构建启用了 `ignoreBuildErrors: true`，Notes CI 没有独立 `tsc` 门禁；Vitest 运行测试不会替代 TypeScript 语义检查。

## 一、隔离实验：先确定错误来自哪里

使用项目已安装的 TypeScript、读取同一份 tsconfig，通过编译器 API 在内存中修改实验范围；保持 strict 等选项不变、关闭增量缓存，不调用 emit。没有改项目配置，也没有删除备份。

| 实验 | 根文件数 | 诊断数 | 分布 |
| --- | ---: | ---: | --- |
| 当前完整 tsconfig | 1,127 | **241** | release 108；tests 133；src 0 |
| 仅追加排除 `release` | 1,090 | **133** | 全部在 tests |
| `src/**/*.ts(x)`、next-env 与当前 `.next/types` / `.next/dev/types` | 600 | **0** | 无诊断 |

三种实验均没有项目 JavaScript 实现文件受检，原因是 `allowJs: false`。独立源码实验的 0 诊断包括其导入依赖和当前 Next 路由类型，不包括未纳入的测试与 Electron JS 实现。`skipLibCheck: true` 也不能作为外部声明与运行时一致的保证。

## 二、108 项：旧构建备份污染检查范围

- 文件全部位于 `release/pre-micromark-rebuild-20260929/` 的 `types/` 和 `dev/types/`，30 个报错文件，均为 **TS2307**。
- 根因是 `tsconfig.json` 的 `**/*.ts` / `**/*.tsx` 收入整个工作区，而 exclude 只有 node_modules、vmark-upstream、auris，没有 release。
- 旧 Next 类型引用的是原构建目录布局；目录迁入 release 后，其相对 `src/app/...` 引用不再指向当前真实文件。
- **修复方向：** 排除 release 历史产物，不删除备份，不给旧生成文件补空模块，也不修改现行业务路由。仅这个范围调整已经实测可消除 108 项，而非猜测。

## 三、133 项：测试及声明的六类根因

以下分类用于解释机制，不作互斥计数；一段 mock 或一项声明错误可能产生多条连锁诊断。

### 1. Mock 没声明入参，却检查调用参数

例：`tests/component/notes/notes-editor-image-paste.test.tsx` 的 `saveFile = vi.fn(async () => undefined)`，随后读取 `mock.calls[0][0]` / `[1]`；Browser MCP router 也有同类写法。

TypeScript 按实现推断调用元组为 `[]`，访问索引就产生 TS2493，并伴随 undefined 诊断。运行时 mock 仍能接收参数，因此测试可能通过。建议从实际接口提取函数类型，或显式声明 mock 入参，再检验调用次数和参数；不要把 `mock.calls` 整体转 any。

### 2. 旧夹具不再满足当前业务接口

- `tests/unit/notes/desktop-vault-service.test.ts` 的 runtimeState 缺少现有 DesktopRuntimeState 所需的 aiDock、lastRoute、windowBounds 等字段。
- AI Dock / voice 夹具把字面量推断成宽泛 string，不能赋给 provider、状态等联合类型。
- `tests/unit/services/session-service.test.ts` 使用 `sourceType: "manual"`，而当前类型仅允许 paste / file / url / template。若不是故意测试非法输入，应使用现有有效值；若是非法输入测试，则需明确表达该边界，不能随意放宽生产枚举。
- `tests/unit/storage/audio-storage.test.ts` 注入的 backend 缺少现在要求的 deleteAudioAsset。
- 多处强行声明完整 DesktopBridge，却只提供少量局部实现，造成接口扩展后的重复报错。

建议建立少量共享、完整且有类型的默认夹具，按场景覆盖字段；刻意不完整的边界测试应单独表达。不要为了让测试通过而把业务必填字段全改成可选。

### 3. 回调赋值与控制流分析不一致，出现 never

例：`tests/component/notes/notes-rich-editor-sync.test.tsx` 先声明 `let bridge: NotesEditorBridge | null = null`，只在 JSX 回调中赋值，之后直接 `bridge?.getSource()`。TypeScript 不会假定 render 一定同步执行该回调，局部控制流仍认为值是 null，于是可选链的非空分支成为 never。

建议使用有类型的可变 holder / ref，并在读取时显式断言“bridge 已就绪”；异步初始化则等待该条件。不要给生产接口额外添加无关可选字段。

### 4. CommonJS / ESM 的类型声明缺失或落后

共 **5 项 TS7016** 涉及：
- `electron/mcp/browser-tool-contract.mjs`
- `electron/menu-template.cjs`
- `electron/vault/vault-file-walker.cjs`
- `scripts/sync-personal-vocab.cjs`
- `scripts/vmark-sync-report.cjs`

同时，现有 `electron/shared/browser-contract.d.cts` 并非完全准确：
- `browserActionRequestSchema` 声明为通用 `z.ZodType`，测试读取运行时存在的 `.options` 时类型信息不足。
- BrowserPublicErrorMetadata / SerializedBrowserError 缺少 AMBIGUOUS_TARGET 的 targets 分支；相应运行时序列化和脱敏测试实际通过。

这里不只是“测试写得不好”，还包括公共声明与真实实现的漂移。应按模块类型补精确 `.d.cts` / `.d.mts`，并为安全相关元数据建正确的判别联合；不得使用全局 `declare module "*.cjs"` 将所有导入降为 any，也不能为类型报错绕开运行时脱敏约束。

### 5. 工具类型使用错误或过于模糊

例：`tests/unit/platform/note-export-service.test.ts` 使用：

```ts
Awaited<DesktopBridge["runtimeState"]["get"]>
```

这里取到的是函数类型，不是 Promise 的返回对象类型。应先提取返回值：

```ts
Awaited<ReturnType<DesktopBridge["runtimeState"]["get"]>>
```

另有测试局部 `snapshot: ReturnType<typeof snapshot>` 参数名遮蔽外部函数，形成 TS2502 自引用；以及过于宽泛的 Mock<Procedure | Constructable> 导致调用/构造类型不匹配。这些应修测试声明，通常不需要改生产逻辑。

### 6. 非空性、unknown 与测试替身覆盖不全

包括可选 metadata 未收窄、Map/捕获异常得到 unknown、FakeWebContents 缺少 stop 方法、MediaQueryList 替身签名不兼容等。应根据真实控制流增加存在性检查、精确事件参数和完整 fake 方法；其中有意注入畸形数据的测试，要与普通有效夹具区分。

## 四、为什么运行测试和生产构建仍能通过

本次选取上述错误文件中的 **12 个文件，191 项运行测试全部通过**。包含 Browser MCP / 序列化脱敏、富文本同步、图片粘贴、Vault、导出、session service 与 audio storage。

这只能证明现有断言覆盖的运行路径通过，不能证明夹具满足完整接口。例如 note-export 测试只调用导出方法，坏掉的 runtimeState 夹具没有被执行，不能拿该测试通过证明运行时状态契约正确。

- Vitest 运行时转译与断言，不自动执行全量 `tsc` 语义检查。
- Next 配置显式设置 `typescript.ignoreBuildErrors: true`，所以 build 通过不能作为类型检查通过的证据。
- Notes CI 有 lint、MCP、测试及构建步骤，但没有独立源码/测试类型门禁。
- Electron JS 不受当前 TS 配置检查，因此“src 没报错”不涵盖主进程实现。

## 五、建议修复顺序

| 优先级 | 动作 | 验收标准 |
| --- | --- | --- |
| **P0：检查边界** | 排除 release 历史产物；建立独立源码类型命令。 | 同样工作副本全量诊断由 241 降至 133，源码检查 0；不删备份、不忽略真实源码。 |
| **P1：关键声明契约** | 修 Browser 的声明漂移、补必要模块声明，并跑运行时契约/脱敏回归。 | TS 声明与实际返回一致，不用 any 掩盖边界。 |
| **P1：测试夹具** | 修 mock 入参、never、旧 runtime/voice/session 夹具和 ReturnType 用法。 | 保持原断言含义，逐批减少剩余诊断，相关测试仍通过。 |
| **P2：持续门禁** | 将源码类型检查纳入 CI；测试债务清零前可设明确基线防增长，清零后强制全量。 | 类型错误不再靠人工发现；基线不能永久替代修复。 |
| **P2：构建与 JS 覆盖** | 类型门禁稳定后，再评估取消 ignoreBuildErrors；Electron JS 采用重点模块 JSDoc/checkJs 或声明契约逐步覆盖。 | 不因“一次全开 checkJs”引入失控迁移，也不长期把 CJS/MJS 当作已检查。 |

**不推荐：** 删除 tests 的检查范围后宣称全仓清零、全局放宽 strict、批量 `@ts-ignore`、`as any` 或把业务接口全部可选化。分离源码和测试配置是合理工程边界，但测试本身仍需有独立类型验收。

## 证据与执行边界

实验摘要见 [typescript-diagnosis-2026-10-16.json](typescript-diagnosis-2026-10-16.json)。原始诊断、编译器 API 实验脚本与代表性测试日志位于忽略的 `release/typescript-diagnosis-20261016/`。

本次没有修改源码、测试、tsconfig、Next 配置、CI 或 AGENTS.md，没有安装依赖、删除备份、替换 App、提交或推送。此前 VMark 同步与用户既有修改保持。
