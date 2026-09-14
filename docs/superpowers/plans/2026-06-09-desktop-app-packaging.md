# 桌面 App 打包实施方案（english-shadowing-web）

> 日期：2026-06-09
> 目标：把 `english-shadowing-web` 打包成可双击运行的 macOS 桌面 App（`.dmg`/`.app`），**先自用、免代码签名**。
> 范围：仅桌面 Electron 形态。Web 部署、移动端不在本方案内。
> 状态：方案待评审，尚未动手实现。

---

## 0. 现状结论（已实测）

- ✅ `npm run build` 生产构建**已通过**（修掉 `src/.../use-notes-terminal-sessions.ts` 里非法的 `copyOnSelect` 选项后，exit 0，路由表正常生成）。
- ✅ `src/` 业务代码 TypeScript 类型干净。
- ⚠️ `tsc --noEmit` 全量报 83 个错误，**全部集中在 9 个 `tests/` 文件**，不影响打包，但属于测试类型债（见 §7）。
- ❌ 没有任何 Electron 打包工具（无 electron-builder / forge）。
- ❌ Electron 当前以 `spawn("next start")` 跑 `PROJECT_ROOT` 的 `node_modules`，不适合打包。
- ❌ 没有应用图标（用户将提供 logo）。

### 当前 Electron 启动链路（`electron/main.cjs`）

| 位置 | 现状 | 打包后的问题 |
|------|------|--------------|
| `PROJECT_ROOT = path.resolve(__dirname, "..")`（L48） | 指向项目根 | 打包后 `__dirname` 在 asar 内，路径错 |
| `getNodeCommand()` 返回 `"node"`（L251） | 依赖系统 PATH 的 node | **用户机器没装 node 必崩**，要改用 Electron 内置 node |
| `startNextServer()` spawn `next/dist/bin/next start`（L1627） | 跑项目 node_modules | asar 内跑不起来；node_modules 几百兆 |
| `public/` | **空目录** | 好消息，standalone 拷贝少一项 |
| `wordpos` + `wordnet-db`（`src/features/dictionary`） | 词典 API 真依赖，带数据文件 | standalone 文件追踪可能漏掉数据文件 |
| `node-pty` 预编译二进制 | 只有 `linux-*`，**无 darwin** | **Mac 打包必须 electron-rebuild**，否则终端崩 |

---

## 1. 总体方案：Next standalone + Electron 内置 node 拉起

核心思路：用 Next.js 的 **standalone 输出**（`output: "standalone"`），build 后产出一个自包含的 `.next/standalone/server.js`（含精简 node_modules）。Electron 打包态下不再跑 `next start`，而是用 **Electron 内置的 node**（`process.execPath` + `ELECTRON_RUN_AS_NODE=1`）直接拉起这个 `server.js`。

```
[Electron 主进程 main.cjs]
   ├─ dev 态  → spawn next dev（保持现状不变）
   └─ 打包态  → spawn(process.execPath, [standalone/server.js])
                  env: ELECTRON_RUN_AS_NODE=1, PORT, HOSTNAME=127.0.0.1
                  cwd: resources/standalone
                  ↓
              http://127.0.0.1:<port> → mainWindow.loadURL
```

为什么不用静态导出（`output: export`）：项目有大量 `/api/*` 路由 + middleware（登录代理），必须有 Node 服务端，静态导出不可行。

---

## 2. 分步实现 + 每步验证检查点

> 按顺序做，每步通过验证检查点再进下一步。

### 步骤 1：`next.config.ts` 开启 standalone

改动：
```ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",                          // 新增
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["wordpos", "wordnet-db"],
  outputFileTracingIncludes: {                   // 新增：兜底 wordnet 数据文件
    "/api/dictionary/lookup": ["./node_modules/wordnet-db/**"],
  },
};
```

**验证检查点**：`npm run build` 后存在 `.next/standalone/server.js` 与 `.next/standalone/node_modules/`。

### 步骤 2：build 后拼装 standalone 目录（拷贝脚本）

standalone **不含** `.next/static` 和 `public/`，需手动补齐。新增 `scripts/assemble-standalone.cjs`：
- 把 `.next/static` → `.next/standalone/.next/static`
- `public/` 为空，可跳过（若以后有内容则一并拷）
- 校验 `wordnet-db` 数据文件是否在 standalone 内，缺则从源拷入

**验证检查点**：在 `.next/standalone/` 下手动 `node server.js`（设 PORT=3999）能起服务，浏览器开 `http://127.0.0.1:3999` 首页正常、`/api/dictionary/lookup?word=test` 返回正常（验证 wordnet 数据没漏）。

### 步骤 3：改 `electron/main.cjs` 启动逻辑（核心）

1. 引入 `const isPackaged = app.isPackaged;`，区分 dev / 打包态（不再只看 `--dev`）。
2. 打包态下：
   - `RESOURCES = process.resourcesPath`；standalone 路径 = `path.join(RESOURCES, "standalone")`。
   - `startNextServer()` 改为：
     ```js
     nextProcess = spawn(process.execPath, [path.join(standaloneDir, "server.js")], {
       cwd: standaloneDir,
       env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PORT: String(port), HOSTNAME: "127.0.0.1" },
       stdio: ["ignore", "pipe", "pipe"],
     });
     ```
   - 删除对 `getNodeCommand()`（系统 node）的依赖——改用 `process.execPath`。
3. dev 态保持现状（`next dev --webpack`）完全不动。

**验证检查点**：`npm run desktop:dev` 仍正常（不回归）；打包态逻辑先用环境变量手动模拟跑通。

### 步骤 4：装配 electron-builder

1. `npm i -D electron-builder`
2. `package.json` 新增 `build` 字段（要点）：
   ```jsonc
   "build": {
     "appId": "com.shadowingstudio.desktop",
     "productName": "Shadowing Studio",
     "files": ["electron/**", "node_modules/**", "package.json"],
     "extraResources": [
       { "from": ".next/standalone", "to": "standalone" }
     ],
     "asarUnpack": ["**/node_modules/node-pty/**", "**/*.node"],
     "mac": { "target": "dmg", "icon": "build/icon.icns", "category": "public.app-category.education" },
     "directories": { "output": "release", "buildResources": "build" }
   }
   ```
3. 新增 scripts：
   ```jsonc
   "desktop:build": "next build && node scripts/assemble-standalone.cjs && electron-builder --mac"
   ```

**验证检查点**：`npm run desktop:build` 在 `release/` 产出 `.dmg`。

### 步骤 5：node-pty 原生模块 rebuild（Mac 必做）

- node-pty prebuilt 只有 linux，Mac 需针对 Electron 的 ABI 重新编译。
- electron-builder 默认会触发 `npmRebuild`；若不生效，显式装 `@electron/rebuild` 并在 build 前跑一次。
- `asarUnpack` 已覆盖 `node-pty`（原生 `.node` 不能在 asar 内加载）。

**验证检查点**：装好的 App 里打开终端面板，能正常起 shell、输入输出正常（验证 node-pty 在 Electron ABI 下可用）。

### 步骤 6：应用图标

- 你提供 1024×1024 PNG → 放 `build/icon.png`。
- electron-builder 可直接吃 `build/icon.png` 自动生成 mac 图标；或预生成 `build/icon.icns`（`iconutil` 或在线工具）。

**验证检查点**：Dock 与 `.app` 显示正确图标，非默认灰图。

### 步骤 7：密钥 / 环境变量注入（自用方案）

standalone server 运行需要 `OPENAI_API_KEY` / `AZURE_SPEECH_KEY` / Supabase 等。自用最简：
- 方案 A（推荐自用）：首次启动时 main.cjs 从 `app.getPath("userData")/desktop.env` 读取，注入到 standalone 子进程 env。App 内不内置任何 key，安全且可换。
- 方案 B（图快）：打包时把 `.env.production` 作为 extraResources 带入——**注意 key 会明文进安装包，仅限自己机器**。

**验证检查点**：装好的 App 里，依赖云端的功能（音频生成 / 发音评分 / 登录）能正常工作。

---

## 3. 确认的风险点（不是猜测，已实测）

| 风险 | 来源 | 对策 |
|------|------|------|
| 用户机器无系统 node → 启动崩 | `getNodeCommand()` 返回 `"node"` | 步骤 3 改 `process.execPath` |
| Mac 终端崩 | node-pty 无 darwin prebuilt | 步骤 5 electron-rebuild + asarUnpack |
| 词典 API 500 | wordnet-db 数据文件被 standalone 漏追踪 | 步骤 1 `outputFileTracingIncludes` + 步骤 2 校验 |
| 白屏 / 404 静态资源 | standalone 不含 `.next/static` | 步骤 2 拷贝脚本 |
| `PROJECT_ROOT` 路径错 | 打包后 `__dirname` 在 asar 内 | 步骤 3 用 `process.resourcesPath` 分支 |
| 自用 key 泄露 | 方案 B 明文打包 | 优先方案 A（userData 读取） |

---

## 4. 不做 / 暂缓（本次范围外）

- ❌ 代码签名 / Apple 公证（自用免；要分发给别人时再做，需 Apple 开发者账号 $99/年）。
- ❌ Windows / Linux 打包（先专注 Mac；electron-builder 配置已为多平台预留）。
- ❌ 自动更新（electron-updater）。
- ❌ 移动端、Web 部署。

---

## 5. 工作量预估

| 步骤 | 预估 | 难度 |
|------|------|------|
| 1 next.config | 10 分钟 | 低 |
| 2 拷贝脚本 | 30 分钟 | 低 |
| 3 main.cjs 改造 | 1–2 小时 | **中（核心，易出坑）** |
| 4 electron-builder | 1 小时 | 中 |
| 5 node-pty rebuild | 0.5–2 小时 | **中（原生编译常踩坑）** |
| 6 图标 | 15 分钟 | 低 |
| 7 密钥注入 | 30 分钟 | 低 |
| **合计** | **约半天到一天** | — |

最大不确定性在步骤 3（standalone 启动链路）和步骤 5（node-pty 原生编译）。建议按步骤推进，每步过验证检查点，不要一把梭。

---

## 6. 建议的"完成"判定标准

桌面 App MVP 算完成，当且仅当：
1. `npm run desktop:build` 一条命令产出 `release/*.dmg`。
2. 双击 `.dmg` 安装、Dock 图标正确、App 能启动到主界面。
3. 核心功能可用：笔记编辑、终端面板（node-pty）、词典查询（wordnet）、依赖云端的音频/评分功能。
4. 不依赖用户机器预装 node。

---

## 7. 附：测试类型债（可选清理，不阻断打包）

83 个 TS 错误分布在 9 个测试文件，主要是 mock 对象缺字段 / 类型不匹配：
- `tests/component/assessment/assessment-shell.test.tsx`（DesktopBridge 缺 `voiceEngine`、记录缺 `wordAssessments`）
- `tests/component/home/desktop-home-shell.test.tsx`
- `tests/component/notes/{notes-editor-image-paste,notes-editor,notes-page-client,notes-shell}.test.tsx`
- `tests/component/player/{reader-stage,reader-stage-sentencebook}.test.tsx`（`session.status` 用 string 而非 `SessionStatus`）
- `tests/component/runtime/desktop-ai-dock.test.tsx`（mock 返回值类型过宽）

成因：业务类型（DesktopBridge / DesktopRuntimeState / SessionPlayback 等）演进后，测试 mock 未同步。建议打包流程跑通后单独一轮修复。
