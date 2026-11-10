# Notes 图片拖放（v1.0.37）

## 交互与保存

- 按用户确认，不增加「插入图片」按钮或文件选择框；支持把图片拖到正文指定位置，也保留图片粘贴。
- 富文本按拖放坐标定位，图片独立成段；在文字中间拖入时保留两侧文字。多图按顺序插入，使用一个编辑事务以支持整批撤销。
- 图片尺寸保持既有规则：富文本不增加宽高上限或缩放控件，不压缩原图；源码预览继续使用原有等比例宽度限制。
- 附件使用既有 Vault saveFile IPC 写入笔记同级 assets 目录，正文保存可移植相对路径，不上传云端。
- 支持 PNG、JPEG、GIF、WebP、AVIF，单张不超过 20 MB。保存失败报错，不静默改为大体积内嵌图片。
- 只读、视图销毁、切换笔记和读取期间发生编辑时禁止过期插入。系统直接打开的绝对笔记路径只在当前 Vault 内转为附件相对路径。
- 中文附件名经 Markdown/HTML 导入后可能已被 URL 编码；媒体解析解码一次后重新验证路径边界，再生成协议 URL，避免重复编码导致重开后图片失效。

## 实现与来源

编辑器适配统一在 `src/features/notes/editor/notes-image-insertion.ts`，复用 `editor-image-attachments.ts` 和既有 Electron 二进制写入。只修正桌面 bridge 的 saveFile 参数类型，没有新增 IPC，也没有修改主进程和预加载。

固定对照 VMark `449fbc3e0b25215b3e1e38079ca59999f7a06a2b` 的 `src/plugins/imageHandler/imageHandlerInsert.ts`、`imageHandlerClipboard.ts` 与 `src/services/media/imageOperations.ts`；保留附件先保存、异步后检查 owner/view 和独立图片块的行为边界，适配 Auris 原生 ProseMirror/CodeMirror。没有复制 Tauri/Tiptap 主机接口。ISC 许可见 `docs/vmark-port/UPSTREAM-LICENSE.txt`。

## 验证与边界

- Notes 回归：174 文件、3,110 项通过。
- 发布前完整类型检查：`npm run typecheck` 通过。
- 全仓测试：`npm test -- --maxWorkers=4`，493 文件、5,379 项通过。首次默认并发运行有一项未修改的浏览器计时测试超时；该文件单独复测 51 项和完整低并发重跑均通过，没有放宽测试断言。
- 全仓 lint、生产构建和 `git diff --check` 通过。
- `node tests/electron/notes-image-insertion-smoke.cjs` 在临时 Vault / 独立 Electron profile 验证无按钮、坐标落点、图片独立段落、上下文保留、附件字节落盘及中文笔记关闭重开后的图片显示。截图位于忽略的 `release/notes-image-insertion-smoke/`。
- 严格桌面冒烟最终的「无 renderer 错误」断言捕获 React hydration #418，因而不能把整个冒烟称为零错误通过；图片业务断言均已通过。启动警告尚未定位，不宣称已经修复。
- 未修改真实用户笔记，不自动替换本机应用。GitHub 多平台发布结果以对应 Actions 和 Release 实际状态为准。

## 发布跟进（2026-11-11）

v1.0.37 已推送 main（`75d67e8`），但 GitHub Release Actions `42848808695` 在完整测试门禁失败，两个平台的打包步骤均未执行，未生成正式 Release。失败是 `terminal-focus-workspace.test.tsx` 的测试 helper 只等待 `resume` 被调用，没有等待其异步回调发布 running 状态，导致立即断言时仅 7/8 个运行指示可见。

后续仅在 helper 增加每次会话状态渲染完成的等待，保留原有 8 个运行指示断言，不修改终端业务代码；使用 v1.0.38 重新发布，不移动 v1.0.37 标签。终端/CJK 基准定向 66 项、全仓 5,379 项、lint 和完整 typecheck 通过。独立 Notes workflow 的 CJK 基准曾以 1.413 指数略超 1.4 门槛，定向复测通过，未放宽阈值或修改基准源码。
