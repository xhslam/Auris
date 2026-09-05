# Mochi (v0.1.17 ➔ v0.1.19) 版本更新详细分析报告

> **生成时间**：2026-09-05  
> **报告范围**：`v0.1.17` (`faa3340`) ➔ `v0.1.19` (`97ddef3`)  
> **项目源码**：[xiaolai/mochi](https://github.com/xiaolai/mochi)  
> **本地应用**：`/Applications/Mochi.app`

---

## 一、版本更新概览

在从 `0.1.17` 到 `0.1.19` 的演进中，Mochi 进行了两次版本发布（`v0.1.18` 与 `v0.1.19`）。这两次更新主要聚焦于**两大核心维度的重构与缺陷修复**：

1. **运行时环境修复（v0.1.19）**：彻底解决 macOS GUI 应用因继承精简 `launchd PATH`，导致无法识别通过 `mise`、`nvm`、`asdf`、`pnpm` 等安装的 Codex CLI 的系统级问题。
2. **IPC 类型通信契约重构（v0.1.18）**：彻底重构主进程与渲染进程之间的 IPC 通信层，引入统一的 `Answers` 契约表与强类型 `answer()` 封装，消除跨进程数据“类型漂移（Type Drift）”与运行时静默失效风险。

---

## 二、关键更新深度解析

### 1. Codex CLI 路径探测根本修复 (`v0.1.19`)

* **相关提交**：`80bf695` (*codex: the app looked for it on a PATH nobody installs anything onto*)
* **涉及核心文件**：
  * `src/main/shell-path.ts`（新增）
  * `src/main/shell-path.test.ts`（新增）
  * `src/main/index.ts`

#### (1) 真实场景与缺陷表现
在 macOS 上，从 Dock、Spotlight 或 Finder 启动的 GUI 桌面应用不会继承用户在终端配置的 Shell 环境变量，而是直接继承系统 `launchd` 分配的基础 PATH（通常仅为 `/usr/bin:/bin:/usr/sbin:/sbin`）。

在旧版中：
* 如果用户通过现代开发环境管理工具（如 `mise`、`asdf`、`fnm`、`volta` 等）安装了 Node.js 和 Codex CLI（例如路径为 `~/.local/share/mise/installs/node/lts/bin/codex`）；
* 终端中运行 `which codex` 完全正常，但 Mochi 设置面板始终提示：  
  > *"The Codex CLI could not be found on this machine"*

#### (2) 为什么不能仅“在白名单中添加路径”？
笑来老师在源码注释与架构设计中深入阐述了工程取舍：
1. **版本管理器无法穷举**：`nvm` 之后有 `mise`，后面还有 `asdf`、`fnm`、`pnpm`、`bun` 等，写死路径列表在架构上注定是不完整的。
2. **即使找到了二进制，也无法执行**：通过版本管理器安装的 CLI 通常是 npm 垫片脚本（以 `#!/usr/bin/env node` 开头）。如果在应用的原生 `launchd` 环境中执行它，由于找不到同目录下的 `node`，会直接报错 `unusable — it could not be run`。这比提示“未安装”更糟，会误导用户去重新安装原本完好的工具。

#### (3) 架构解决方案：`shell-path.ts`
* **交互式登录 Shell 探测**：在应用启动时，通过 `$SHELL -ilc 'printf %s "$PATH"'` 查询真实 Shell。
  * **必须为 `-ilc`**：因为很多工具（如 `mise activate`、`nvm.sh`）仅在 `.zshrc` / `.bashrc`（交互式 Shell）中初始化，单纯登录 Shell (`-lc`) 依然会漏掉。
  * **容错与超时**：设置 4 秒超时门限（`SHELL_PATH_TIMEOUT_MS = 4000`）；提取标准输出最后一行非空文本，自动过滤终端 Banner。
* **安全路径拓宽 (`widenPath`)**：
  * 原有 launchd 路径**保持在前**，Shell 环境变量**追加在后**且去重。
  * 确保不会因为用户的外部 Profile 意外覆盖系统原生二进制的解析，保障应用核心进程安全性。
* **时序保障**：在 `app.whenReady()` 后作为唯一同步等待项执行，确保后续的 Codex 探测能够立即可见。

---

### 2. IPC 通信总线与类型契约重构 (`v0.1.18`)

* **相关提交**：
  * `7af24c8` (*wire: three channels sent a shape nothing checked against the one read*)
  * `e7fc41b` (*gate: handler-shapes could not have caught its own bug*)
  * `4c1d6f0` (*wire: what each channel answers with, in one table both ends read*)
* **涉及核心文件**：
  * `src/shared/answers.ts`（新增）
  * `src/main/ipc/answer.ts`（新增）
  * `src/preload/index.ts`
  * `src/main/index.ts`
  * `src/shared/ipc.ts`

#### (1) 真实风险：Electron 弱类型 IPC 的隐患
Electron 官方的 `ipcMain.handle` 签名是 `(...args: any[]) => any`，而渲染端 `preload` 中的 `invoke` 也默认返回 `unknown`，必须通过手动类型断言（如 `as readonly HistoryProblem[]`）转换为强类型。

**潜在隐患**：
主进程与渲染进程各自维护类型，一旦后端修改或遗漏了某个返回字段，TypeScript 编译器在两端都能顺利通过，但在运行时前端读取字段时会产生 `undefined`，出现静默 UI 异常。在此前审计中，发现有 3 个通道完全没有返回类型标注：
* `history:problems`
* `history:turns`
* `history:search`

#### (2) 从“外部测试检测”到“类型系统约束”的认知迭代
* **阶段一（缺陷规则测试）**：起初作者编写了 `handler-shapes.test.ts`，用正则扫描 `index.ts` 代码，检查是否每个 handler 都有类型标注。然而，该测试正则表达式漏掉了空白符处理，导致 28 个通道中有 4 个通道被跳过，测试本身未能发现自身的漏洞。
* **阶段二（彻底重构为强类型系统）**：摒弃通过正则表达式解析源码的脆弱测试，直接把规则下沉到 TypeScript 编译期约束中。

#### (3) 最终架构设计
1. **单一真实源 `Answers` 接口 (`src/shared/answers.ts`)**：
   * 将所有 28 个请求-响应通道的返回值严格定义在一张表上（如 `'voice:open': VoiceOpened`, `'history:list': HistoryList` 等）。
   * 独立为底层模块，规避了 `history-window.ts` 和 `ipc.ts` 之间的循环依赖。
2. **强类型注册器 `answer()` (`src/main/ipc/answer.ts`)**：
   ```typescript
   export function answer<C extends keyof Answers>(
     channel: C,
     handler: (
       event: IpcMainInvokeEvent,
       ...args: readonly unknown[]
     ) => Answers[C] | Promise<Answers[C]>,
   ): void
   ```
   * 整个项目中只有这一个函数内部存在向下转型为 Electron 兼容类型的断言。
   * 主进程在注册通道时，若返回值不符合 `Answers[C]`，编译器直接报错，无法通过构建。
3. **输入与输出的职责分离**：
   * `Answers` 仅约束主进程**发出（输出）**的数据结构；
   * 来自渲染端的参数保持为 `unknown`，强制后端必须进行显式运行时验证（如 `typeof token !== 'string'`），保证安全性。

---

## 三、提交历史与文件变更统计

### 1. 提交清单
```text
97ddef3 chore(release): v0.1.19
80bf695 codex: the app looked for it on a PATH nobody installs anything onto
265af57 chore(release): v0.1.18
4c1d6f0 wire: what each channel answers with, in one table both ends read
e7fc41b gate: handler-shapes could not have caught its own bug
7af24c8 wire: three channels sent a shape nothing checked against the one read
```

### 2. 代码变更明细 (Diff Stat)
```text
15 files changed, 684 insertions(+), 103 deletions(-)

新增文件：
 + src/main/shell-path.ts               (108 行：Shell PATH 探测与环境合并)
 + src/main/shell-path.test.ts          (118 行：针对多平台、超时、Banner 的单测)
 + src/shared/answers.ts                (104 行：所有 28 个 IPC 通道返回值核心契约)
 + src/main/ipc/answer.ts               (69 行：强类型 answer() 封装器)
 + src/main/ipc/answer.test.ts          (102 行：IPC 绑定与通道覆盖率验证)

关键重构文件：
 ~ src/preload/index.ts                 (121 行改动：统一改用 Answers[C] 自动推导)
 ~ src/main/index.ts                    (96 行改动：所有通道迁移至 answer() 注册)
 ~ src/shared/ipc.ts                    (35 行改动：抽取共享类型结构)
 ~ src/shared/history-window.ts         (23 行改动：解耦并导出对应 Wire 结构)
```

---

## 四、本地应用部署与验证

已完成本地源码的最新编译与 macOS 应用的更新部署：

1. **版本验证**：
   * `/Applications/Mochi.app` 版本号已成功升级至 **`0.1.19`**（`CFBundleShortVersionString: 0.1.19`）。
2. **代码签名**：
   * 已完成本地 Ad-hoc 代码重签名（`codesign --force --deep --sign -`）。
3. **隔离属性**：
   * 已清除 macOS Gatekeeper 隔离标记（`xattr -cr`），可直接双击启动无拦截。
4. **运行建议**：
   * 若您本地通过 `mise`、`nvm` 等环境管理 Node/Codex，现在启动 Mochi 后即可自动识别终端中的 `codex` 命令，无需手动做软链接或修改全局环境。
