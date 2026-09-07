# VMark (v0.9.59 ➔ v0.9.65) 版本更新详细分析报告

> **生成时间**：2026-09-07  
> **报告范围**：`v0.9.59` (`4716129`) ➔ `v0.9.65` / `main` (`75e4c5d`)  
> **项目源码**：[xiaolai/vmark](https://github.com/xiaolai/vmark)  
> **本地仓库**：
> - `research/vmark-upstream`（已更新至最新 commit `75e4c5d`）
> - `~/Desktop/xiaolai-source/vmark`（已同步克隆最新代码）  
> **本地应用**：`/Applications/VMark.app`（当前为 `0.9.61`，官方已发布 `0.9.65`）

---

## 一、版本演进总览

从 `v0.9.59` 到最新的 `v0.9.65`（累计 58 次提交），笑来老师在 VMark 项目中进行了一场极其严苛、深入系统底层的**代码质量与架构安全审计**（特别是 `2026-09-06 Audit`）。此次更新涵盖了从底层操作系统文件原子操作、会话恢复抢救、编辑器 Markdown 语法树，到 MCP 知识库服务器与 CI/CD 自动化门禁的全链路加固。

| 版本 | 关键节点与发布日期 | 核心主题 |
| :--- | :--- | :--- |
| **v0.9.60** | 2026-09-01 | UI 设计审计落地：去除 10px 孤立圆角、活动 Tab 负向反衬设计、MCP Badge 收敛 |
| **v0.9.61** | 2026-09-02 | 黄金分割率（$\Phi$）曲率梯度统一；修复 Windows 剪贴板热键冲突 |
| **v0.9.62** | 2026-09-03 | 嵌入式浏览器 AI 审计加固；修复文件目录树自循环刷新（Rescan Loop）缺陷 |
| **v0.9.63** | 2026-09-04 | 采用全新三棱标（Three-wedge Mark）分层 macOS 26 现代图标体系 |
| **v0.9.64** | 2026-09-05 | CC-Switch 客户端配置 Base64 规范化导入支持；SVG/PNG 图标生成确定性修复 |
| **v0.9.65** | 2026-09-06 | **重磅审计修复（Audit 20260906）**：彻底解决 4 种文件保存数据丢失漏洞、Hot-Exit 会话丢弃缺陷、Markdown/Fuzz 隐藏 Bug、MCP 知识库崩溃与 CI 虚假通过问题 |
| **Latest** | 2026-09-06 | 修复 Homebrew 自动化脚本中 curl 参数冲突问题 (`--fail` 与 `--fail-with-body`) |

---

## 二、核心架构与关键缺陷修复深度解析

### 1. 文档持久化安全（防止文件丢失的 4 种极端场景修复）

* **相关提交**：`049b872` (*fix(persistence): stop four ways a save could lose the user's document*)
* **涉及核心文件**：
  * `src/services/persistence/saveTargetClaim.ts`
  * `src/services/persistence/applyPostSaveState.ts`
  * `src-tauri/src/fs/exclusive_create.rs`（新增排他性文件创建指令）

#### (1) 真实场景与缺陷表现
* **F1（批量保存同名文件静默覆盖）**：在执行「Batch Save All」时，如果目标文件夹中已存在同名未命名文件（如 `Untitled-1.md`），旧逻辑直接使用普通覆盖写入，导致未打开该文件的用户磁盘数据被静默冲毁。
  * **修复方案**：引入 `create_file_exclusive` 内核级排他调用（利用底层文件系统的 `O_EXCL` 标识），使占位与检测原子化，彻底杜绝并发竞态。
* **F2（快照持久化失败时的错误重启）**：用户选择“重启并恢复未保存文档”后，若临时快照写入失败，旧逻辑依然会继续退出重启，导致未保存的内容无法恢复。修复后错误向上传播，阻止非安全退出。
* **F3（延迟自动保存覆盖另存为）**：因为每个文件路径是独立保存队列，若在自动保存 `old.md` 尚未完成时执行「另存为 `new.md`」，后结束的写入可能将文档状态改回旧文件名。修复后按「文档（Document）」维度对身份变更建立严格时序锁，无论写入何时完成，用户最新的决定始终胜出。
* **B1（Windows 替换原文件失败导致原文件被删）**：在 Windows 上，由于杀毒软件或文件句柄占用引发 persist 异常时，旧的 fallback 会直接删除原目标文件再重命名，一旦重命名再次失败，用户原文件彻底丢失。修复后移除了错误的删除回退逻辑。
* **B2（符号链接保存会覆写链接本身）**：将重命名写入软链接会把软链接转化为普通文件，导致真实目标文档未被修改。修复后在进入保存边界前显式解析软链接目标。
* **B3（macOS 扩展属性与 Finder 标签丢失）**：替换新 inode 时保留了文件权限位，但丢掉了扩展属性（extended attributes），导致带标签的文件在保存后标签消失。修复后对 xattr 进行完整迁移。

---

### 2. Hot-Exit 与会话崩溃抢救机制（Session Salvage）

* **相关提交**：`1ec3c2c9e` (*fix(hot-exit): preserve unsaved buffers that session repair used to discard*)
* **涉及核心模块**：
  * `src-tauri/src/session/repair.rs`
  * `src-tauri/src/session/salvage.rs`

#### (1) 从“全部废弃”到“单项抢救”
在旧版本中，会话恢复文件只要遇到一处反序列化失败（例如某个 tab 出现了 `null`，或者一个仅用于排版的浮点数 `sidebar_width: 260.5` 与 `u32` 类型不符），Rust 后端就会将整个会话判定为 `None`（即“没有会话”），导致所有健康的未保存内容全部被丢弃。

#### (2) 修复机制
1. **降级抢救模式（Session Salvage）**：当严格的反序列化失败时，自动转入底层原始 JSON 扫描，逐项剔除或修复损坏项，尽可能保留所有携带有效内容的 Tab。
2. **重复 Tab ID 保全（Safe-duplicate）**：旧修复步骤遇到重复 ID 会无条件丢弃后序 Tab；修复后，为具有未保存内容的幸存 Tab 分配全新身份，坚决不丢弃任何内容。
3. **主窗口关闭后的多窗口恢复**：修复了关闭主窗口后多窗口恢复导致窗口计数多出 1 个的问题。

---

### 3. 编辑器引擎与 Markdown 序列化边缘缺陷

* **相关提交**：`25a926d7e` (*fix(editor): repair three markdown/history defects the fuzz was masking*)
* **涉及核心模块**：
  * `src/services/history/unifiedUndoRedo.ts`
  * `src/plugins/safeBlockSplit/tiptap.ts`
  * `src/utils/markdownPipeline/serializerStrikethrough.ts`

1. **Checkpoint Redo 脏分支覆盖（F4）**：在利用 Checkpoint 回退到历史状态并键入新内容后，由于旧 Redo 栈未察觉新分支的存在，执行 Redo 会粗暴抹杀刚刚键入的新内容。修复后 Redo 记录了分支点指纹，废弃的分支会被自动清理。
2. **跨空段落选区回车报错（F5）**：选区横跨两个空段落时按下 Enter，Tiptap 会抛出 `TransformError: Inserted content deeper than insertion position`。VMark 实现了专门的覆写，将跨块情况委托给 ProseMirror 的原生 `splitBlock`。
3. **GFM 删除线标点侧向转义**：修复了紧贴标点符号的删除线（如 `plain~~* word~~tail`）在重新解析时被当作文字的标记错误。
4. **UTF-16 代理对 Emoji 乱码切分**：修复了 Markdown AST 序列化工具按 UTF-16 代码单元切分时导致 Emoji 被截成两半、重新解析变成 `U+FFFD`（乱码菱形问号）的顽疾。

---

### 4. MCP 知识库服务器安全性（Content Server）

* **相关提交**：`3c4098e` (*fix(content-server): stop a bad deck killing the KB, and serve local media*)
* **涉及核心模块**：
  * `src/services/mcpBridge/`
  * `src-tauri/src/mcp/`

* **MCP-C01**：修复了单个错误的 Slidev 幻灯片启动崩溃导致整个知识库（KB）服务瘫痪的严重问题。统一收敛为单一 Await Promise 观察模型，不再产生未捕获的 Unhandled Rejection。
* **MCP-C02**：修复了普通 Markdown 相对链接（如 `[Next](B.md)`）在内嵌 iframe 中丢失鉴权 Token 的问题。
* **MCP-C03**：新增本地媒体资源专属路由与服务端 URL 改写，彻底解决 `![pic](picture.png)` 无法被知识库预览呈现的问题。
* **MCP-C05**：在 `127.0.0.1` 下根据工作区根目录对 Cookie 命名空间进行严格隔离，防止打开第二个工作区时把第一个工作区踢出登录。

---

### 5. UI 视觉规范与多平台交互统一

1. **统一圆角梯度（Phi Curvature Ladder）**：以黄金分割比例全面规范 UI 容器、卡片、浮层的圆角弧度。
2. **macOS 26 专属三棱新图标**：重绘高分辨率、分层透明度的全新应用 Logo 图标。
3. **Windows 快捷键防吞**：移除了菜单中的剪贴板加速器，解决 Windows 环境下按下 `Ctrl+C` 后后续按键被拦截的 Bug。

---

## 三、本地环境操作与交付清单

1. **本地上游源码库更新**：
   - 路径：[research/vmark-upstream](file:///Users/apple/Desktop/%E5%A4%A7%E5%AD%A6markdown/research/vmark-upstream)
   - 状态：已执行 `git pull origin main`，已无缝快进至最新 Commit `75e4c5d`（版本号已升至 `0.9.65`）。
2. **中心化源码库克隆**：
   - 路径：`~/Desktop/xiaolai-source/vmark`
   - 状态：已将 `xiaolai/vmark` 同步克隆至用户的笑来老师源码集中目录，与 `mochi`、`paper-one` 保持一致。
3. **桌面端 GUI 应用状态**：
   - 当前已安装版本：`/Applications/VMark.app`（版本为 `0.9.61`）。
   - GitHub Releases 官方构建：`v0.9.65` 的 Apple Silicon 安装包 `VMark_0.9.65_aarch64.dmg` 已在 GitHub 发布。如有需要，可随时下载覆盖安装。
