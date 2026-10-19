# Auris 同步 VMark v0.9.101：已实施功能与验收

日期：2026-10-19（Asia/Shanghai）。固定上游 `449fbc3e0b25215b3e1e38079ca59999f7a06a2b`（v0.9.101），核心功能提交 [`50191c4ec`](https://github.com/xiaolai/vmark/commit/50191c4ec79d73072cb3d70bfabc47c6cfc52c37)。这是[此前仅更新参考镜像的记录](implementation-status-2026-10-19.md)之后的独立实现阶段，不能用此前“没有运行时代码改动”的结论描述当前工作树。

**本轮交付为源码实现、生产构建与隔离桌面验收。Auris 版本仍为 1.0.18；未打包安装、提交或推送。当前已安装应用不会自动获得本轮改动。**

## 迭代后的不同

| 场景 | 迭代前 | 迭代后与证据 |
|---|---|---|
| 富文本打开多图笔记 | ProseMirror 默认 image 节点挂载时立即赋 src，无显式视口调度。 | 图片接近实际编辑器视口（上下 1,200px 预加载区）才赋 src，使用异步解码；图片与公式共用每帧最多八项、同步工作预算 6ms 的调度队列。真实 Electron 的 120 图夹具初开只请求 **7 张**；最后一张滚入视口后加载成功。该数据是本轮夹具结果，不是所有笔记的固定请求数或耗时提升比例。 |
| 连续图片 | 原节点没有延迟占位策略。 | 未加载图片保留最小 120px 高度，避免未加载盒子全部压缩到首屏。连续 80 图夹具在跨文档的底部/顶部两处视口后请求 **22 张**，未一次请求全部图片；末图可加载。切换可能短暂保留旧滚动位置，不能将此 22 张误称为纯粹的单次首屏指标。 |
| 相同相对图片地址属于不同笔记目录 | 富文本使用默认 src；没有与现有 Vault 图片解析器和媒体版本联动的自定义 NodeView。 | 富文本复用既有安全 URL 解析器，图片解析绑定笔记所属目录；目录切换或本地媒体版本变化会取消旧任务并重新解析。单元/组件测试验证；未声称所有 Vault 外绝对路径图片均可用。 |
| 无关 Vault 刷新 | 不适用新增 NodeView。 | 独立审查发现初稿会重置远程图片，已先补失败回归再修复。身份以解析后的 URL 为准，仅本地协议 URL 包含媒体版本，HTTP(S)/data 图片保持稳定。 |
| 富文本装饰层 | 安装的 `prosemirror-view@1.42.6` 尚无 VMark 补丁：装饰树构建/添加/子节点查找存在反复扫描；部分复杂映射遗漏或误定位。 | ESM、CJS 两入口都应用上游同版本补丁，覆盖构建、添加、子节点查找与五类 mapping 修复；不改变 Markdown 文档格式。移入上游差分、DOM 渲染与增长基准，补丁前 **126 失败 / 1,323 项**，补丁后 **1,323 项通过**。 |
| 完整源码模式 | 纯文本 CodeMirror，不挂混合图片预览。 | 保持原语义，不为通过图片测试启用混合模式。底层 `ImagePreviewWidget` 也接入共享调度和销毁清理，但不把此组件级改进说成完整源码界面新增图片预览。 |
| 导出与保存 | HTML/PDF 从 Markdown 重建；编辑器同步解析后才发布 bridge。 | 导出仍使用完整 src，不受屏幕延迟加载队列影响。初次发布 source/wysiwyg bridge 时已有真实内容，无挂载空正文回调；隔离桌面验证切换/滚动不改原文，并实际编辑、保存一篇临时笔记，另一篇原文字节不变。 |

## 实现范围与来源

### 装饰层补丁：直接复用

- 新增 `patches/prosemirror-view+1.42.6.patch`。算法来自上游 `patches/prosemirror-view@1.42.6.patch`，路径转换为项目既有 patch-package 格式；额外添加静态 `aurisDecorationPatch1565` 标识，验证实际生产客户端 bundle，不修改算法。
- 扩展 `scripts/markdown-patch-contract.json`，固定版本和 ESM/CJS 文件 SHA256；既有 postinstall/prebuild 自动校验。加入丢失任一入口补丁时失败的负向用例。
- `scripts/verify-micromark-build.cjs` 增加客户端产物门禁，防止安装目录已补丁而 Next 缓存仍打包旧实现。本轮门禁确实拒绝第一次旧缓存构建；保留旧缓存至忽略的验证目录后干净重建通过，没有绕过门禁。
- `tests/unit/notes/vmark-decoration/` 复用上游 differential/render/growth/parity、夹具、未优化参照与 CPU 时钟。将 `@tiptap/pm/*` 改为 Auris 直接使用的 `prosemirror-*`，测试沿用本项目 jsdom 环境。初次直接保留上游 node 环境时被项目 setup 中的 Range 假设阻断；改正测试环境后取得真实算法失败，不把环境错误算作产品缺陷。
- 增长基准中未修复 create/add/forChild 的指数约为 **1.95 / 1.99 / 1.94**；补丁后相关用例均满足上游 **<1.35** 的门槛。数据只表示这些装饰层操作的规模增长，不代表整篇笔记打开耗时等比例下降。

### 图片加载：行为适配，不复制 Tauri 框架

- `notes-viewport-render-scheduler.ts` 从 Auris 既有公式调度提取共享实现，继续复用已移植的上游 `math-render-queue.ts`。
- `notes-image-loading.ts` 适配上游 `loadImageNearViewport.ts` / `BlockImageNodeView.ts` 的按需赋 src、节点销毁取消、异步解码及占位策略。
- `notes-rich-image-node-view.ts` 与 `notes-rich-editor-pane.tsx` 注册原生 ProseMirror image NodeView，保留 schema、image 属性、mark 和 Markdown 序列化；协议 URL 与占位尺寸不写回正文。
- `code-block-preview.ts` 的 `ImagePreviewWidget` 使用 CodeMirror 实际 scrollDOM，并按每个 DOM 实例清理 observer、排队任务与 error handler。
- Auris 的 URL 解析是纯同步字符串运算，无逐图 Tauri IPC。没有复制上游异步路径 IPC 等待、busy store、live-DOM print flush；本产品导出重新渲染完整 HTML，不消费上游这些状态。未声称完成图片尺寸变化下 settled-scroll 的全部等价策略。

ISC 来源许可保留于 `docs/vmark-port/UPSTREAM-LICENSE.txt`；移入的测试目录另保留 `VMark-LICENSE.txt`。精确文件/哈希见 [provenance-2026-10-19.json](provenance-2026-10-19.json)。

## 没有照搬的上游改动

1. **contentApplied/初始 placeholder flush**：VMark 异步加载真实内容，可能先 flush 空 placeholder；Auris 在 `createNotesRichEditorState()` 同步完成解析后才创建 view 和发布 bridge，拒绝解析时不发布可写 bridge。保存读取 live document/save queue，而非挂载前捕获空文档。本轮添加首次 bridge 和卸载不空写的行为回归，不引入无使用者 WeakSet。
2. **windowListening surface gate**：Auris 的 Electron 菜单和 close handler 在窗口加载前注册，没有同构 Tauri 菜单握手，故不新增 gate/store。
3. **CJK spacing 与 Lowlight 重复插件**：Auris 使用容器 CSS spacing、原生 ProseMirror/CodeMirror，不含上游 CJK spacing decoration plugin 或 Lowlight 多层 extend 链。没有宣称已移植其专属优化；富文本普通代码语法高亮仍为功能差异。
4. **Tauri updater zip feature、Tauri capabilities、上游 tag-gate**：不适用于现有 Electron 更新和发布链。
5. **微信 Split 预览、独立 reading 组件**：未改成延迟 data-src，避免扩大到微信复制 DOM 协议；本轮按需加载面向实际富文本编辑器以及底层 CM widget。

## 验收结果

| 检查 | 结果 |
|---|---|
| 补丁前真实失败 | 装饰层 126/1,323 失败；图片组件 3/4 失败；远程图片重置新增回归先失败。 |
| 最终 Notes + VMark 回归 | **161 文件 / 3,004 项通过**，包含图片/初始 bridge 边界和 1,323 项装饰层测试。 |
| ESLint | **0 errors / 18 项既有 warnings**。 |
| TypeScript | 独立 `tsc --noEmit --incremental false` 改前与最终均 **exit 0**；中途新测试的 Element 类型错误已修复。不能沿用旧日期文档中的 241 项诊断作为本轮基线。 |
| 生产构建 | Next 生产构建通过；Markdown 与客户端 ProseMirror bundle 门禁通过。 |
| 依赖/IPC | singleton 门禁通过；IPC 合约 **126 invokes / 129 handlers** 通过。 |
| 干净依赖复现 | 临时目录安装原始 `prosemirror-view@1.42.6`（禁用安装脚本），应用仓库 patch；ESM/CJS 字节均匹配固定 SHA256，临时目录随后清理。不是声称执行了整个 Auris 的 npm ci。 |
| 真实 macOS Electron | 生产 renderer + 隔离 profile + 临时 Vault；多图请求、末图滚动、连续图占位、模式切换、原文字节保护、实际编辑保存均通过；renderer pageerror 为 0。 |
| 原有工作区修改 | 初始 `.github/workflows/notes.yml`、设计手册和根 AGENTS 哈希一致，原图片删除状态保留；未改 main/preload、Vault 工厂或真实笔记。 |

桌面脚本：`node tests/electron/vmark-20261019-image-smoke.cjs`。结构化结果见 [verification-2026-10-19.json](verification-2026-10-19.json)，原始日志在忽略目录 `release/vmark-20261019-verification/`，截图/网络指标在 `release/vmark-20261019-image-smoke/`。

**测试探针修正**：一开始误假定切换文档后一定处于顶部，以及完整源码模式会显示混合图片。实际 UI 保留了物理滚动位置，而完整源码模式按设计是纯文本；修正探针去明确顶部视口、区分曾近屏而已加载的图，不修改产品语义或放宽核心“离屏无 src、首开有界请求、末图可加载”断言。

**未验证范围**：Windows/Linux 实机、全量 E2E/安全审计、整篇文档的 CPU/内存前后 profile、所有本地/Vault 外绝对路径媒体的真实加载、完整 PDF 逐图 load/decode 等待，以及全部历史映射。固定 120px 占位不能保证所有图片加载后完全没有布局位移。未递增版本、打包安装、提交、推送、打 tag 或发布。

## 工程复盘

- **更新什么**：装饰层补丁、富文本按需图片加载、取消/所属目录/媒体刷新边界，以及安装和真实 bundle 验证。
- **为什么/取舍**：先用 Auris 当前依赖复现错误再复用上游；共用已有调度队列而非引入另一套框架，保存与平台专属状态仅在同构缺陷存在时移植。
- **解决什么**：减少多图笔记首开启动的请求，修正装饰层映射缺陷和二次方增长，防止旧依赖构建缓存悄悄绕过补丁。
- **学到什么**：不能把“尚无本地故障报告”当作不验证的理由；差分/负向/增长基准能把候选转成证据；单元通过仍需真实布局和网络探针，探针本身也必须符合当前产品模式。
- **工程思维归类**：性能与复杂度治理、状态所有权、生命周期与取消、供应链可复现性、回归测试与证据驱动的架构适配。
