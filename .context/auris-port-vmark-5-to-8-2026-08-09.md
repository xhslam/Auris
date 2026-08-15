# Auris 移植 vmark 差异矩阵 #5–#8 并推送（2026-08-09）

## 结果

- 分支：`port/vmark-5-to-8`（基线 `origin/main` = `032b9ba51`）
- PR #3：https://github.com/xhslam/auris/pull/3 —— state=OPEN, mergeable=MERGEABLE
- 规模：73 文件 / +10308 −113 / 2 提交
- 隔离 worktree：`~/.config/superpowers/worktrees/大学markdown/port/vmark-5-to-8`
- 未推本地 `main`，未修改远端 `main`，未触碰原始脏工作区中除两处缺陷修复外的内容

## 提交

1. `a74257cd0` fix: send Nia definition bodies to the provider
2. `685c4acb5` feat: add workspace rail, relationship graph, Nia picker, and updates

两个提交均含 `Made-with: Proma` trailer。

## 为什么不能直接推本地 main（每次都会重新踩到）

本地 `main` 与 `origin/main` **没有共同祖先**（`git merge-base` 退出码 1）：

- 远端根提交 `6ab235d8f`「initial clean commit」，2026-08-08 09:27
- 本地根提交 `d7c12c9fa`，2026-05-22 15:52
- 方向：**166 ahead / 12 behind**

所以既定工作流（PR #1、#2、#3 一致）是：从 `origin/main` 开隔离 worktree，把能力作为**新提交**手工移植，开 PR，绝不推 `main`。

`git rev-list --count --left-right A...B` 的左右顺序极易读反。用 `--count HEAD ^origin/main` 与反向各算一次，不要靠单条命令的方向记忆。

## 范围裁剪（用户选定：只推 #5–#8 + 两个缺陷修复）

未提交改动原本 43 文件 / +36292 行，但 **93% 的行是机器生成的**，全部排除：

| 文件 | 行数 | 生成方式 |
|---|---|---|
| `docs/vmark-sync/latest.json` | +17890 | `npm run vmark:diff` |
| `src/features/dictionary/personal-vocab/word-index.json` | +13493 | `npm run dictionary:sync` |
| `docs/vmark-sync/latest.md` | +2431 | `npm run vmark:diff` |

另外剔除了**开始屏（start screen）**这一整条无关能力，因为它触发了真实语义冲突：

- `origin/main` 已有一整套接线完整的 `pickFile`（main.cjs → preload → bridge → service → client → use-notes-actions → use-notes-runtime），契约 `{directoryInfo, selectedFilePath}`
- 本地是**平行的第二套**实现，契约 `{directory, relativePath}`（因为本地分支从不含那 12 个远端提交）
- 判定依据：#5 的 rail 只需要 `listRoots` / `setRoot` / `pickDirectory`；#6/#7/#8 完全不碰 vault。所以 `pickFile`/`createFile`/开始屏不是 #5–#8 的必需件

被剔除的文件：`notes-start-screen.tsx` 及其测试、`vault-service.ts`、`vault-client.ts`、`use-notes-actions.ts`、`use-notes-runtime.ts`、`notes-workbench.facade.ts`、`use-notes-documents.ts`、`notes-page-client.tsx` 及其测试。

也只保留了 4 份 gap report 中本 PR 真正依据的那一份（`feature-gap-report-v0.9.31.md`）。

## 移植方法（40 个改动文件里 24 个基线已分叉）

按成本递增的阶梯，不要一上来就手抄：

1. **基线相同的文件**（16 个）：整份 `cp` 即等于 `origin/main` + 我的 diff
2. **`git apply --3way`**：10 个落地
3. **降低上下文 `-C1`**：又 2 个落地（含 `globals.css` +631、`runtime-dependencies.json` +130）
4. **`-C0`（零上下文）**：又 5 个落地，但**必须逐个做语法自检**——它在 3 个文件里落错位置（`main.cjs` 语法错误、`desktop-bridge.ts` 与 `auris-settings.tsx` 把 import 插进了另一个 import 块内部）
5. **逐 hunk 应用**：`main.cjs` 拆成 18 个 hunk，正常上下文下 15 个落地，只对 3 个人工处理
6. **手工 Edit**：剩余的锚点在 `origin/main` 上根本不存在的 hunk

`git apply --3way` 失败后**不要**用 `git checkout -- <file>` 清理：它从**索引**恢复，而 `--3way` 已经把结果暂存进索引，所以冲突标记会留下。要用 `git checkout HEAD -- <file>`。我误用后又 `git rm --cached`，把 14 个文件标成了已删除。

## 验证结果

在隔离 worktree 中（`node_modules` 软链自主 checkout，经校验为有效超集，仅 `next-env.d.ts` 需补——它被 gitignore 且由 Next 生成）：

- `tsc --noEmit`：src/electron **0 错误**
- `npm run lint`：**79 errors / 8 warnings**，与记录的 `origin/main` 基线完全一致；我的文件零命中
- `npx vitest run`：313 文件，6 失败 / 23 用例失败 —— 与 clean `origin/main` **逐条同一组用例**（在 `/tmp/auris-gh-base` 实测比对），**零回归**
- `npm run build`：EXIT=0
- `npm run security:secrets`：通过
- 四项能力的 15 个测试文件全部通过（catalog 23、rail 组件 13、identity 29、instances 18、graph 25、picker 17+6、updater 29、update-settings 18、vault-roots 18、composition 12、IPC 11）

## 移植中发现并修掉的两个我自己引入的缺陷

1. **picker 的 CSS 类名错位**：我写的规则是 `.notes-v2__nia-picker-section-label`，但组件用的是 `-group-title`（6 处）。收藏/最近/分类三个标题完全没有样式。已改名并补 `-group` 容器规则。
2. **React Compiler deps 告警**：`handleOpenNiaPicker` 的 deps 少了 `setNiaPickerContent`，在 `origin/main` 的 eslint 下报错（本地 checkout 因该文件已分叉 +123/−48 而未触发）。已补。

两处**同样存在于本地 checkout**，已一并修复并验证（tsc 0 / lint 干净 / 46 用例通过）。

## 遗留

- PR #3 未合并，等待用户决定
- 机器生成数据（vmark-sync 报告、word-index）与开始屏能力仍只在本地，未推送
- `origin/main` 的既有债务未动：79 lint errors、6 个失败测试文件、tests/ 的类型噪音
