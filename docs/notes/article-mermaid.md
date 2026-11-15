# 当前文章 Mermaid 图

右下角「关系图」现展示当前文章的 Mermaid 图，而不是 Vault 双链关系。面板默认占窗口宽度的 92%、高度的 90%，支持缩放、滚动和显式关闭。右下角「大纲」按钮已移除；其他位置的大纲能力保持不变。

## 使用

1. 打开笔记，点击右下角「关系图」。
2. 没有图时，点击「复制 Agent 生成指令」，粘贴给已连接 Auris Notes MCP 的 Agent。
3. Agent 读取当前笔记并生成图，通过下述接口写入。默认沿用 Auris 修改审批；审批通过后面板实时刷新，无须关闭重开。
4. 保存笔记后，图随 Markdown 文件持久化。正文变化后会提示图可能需要更新，不自动调用模型或产生费用。

应用不会凭空生成语义图。这里的实时更新是对已经生成并写入的数据进行实时渲染；初次生成和更新由用户交给 Agent 完成。

## Agent 接口

沿用已有 `auris_document` 工具，新增 `write_mermaid` action，不新增开放 HTTP 端口、不绕过现有 Vault 授权或审批：

```json
{"action":"read","tab_id":"学习/微积分.md"}
```

读取返回 `content`、`revision`、`tab_id`。根据全文生成 Mermaid 后：

```json
{
  "action": "write_mermaid",
  "tab_id": "学习/微积分.md",
  "expected_revision": "上一步返回的完整 revision",
  "content": "flowchart LR\n  A[\"核心概念\"] --> B[\"关系与应用\"]"
}
```

- 接口只改变专用元数据，不替换正文；正文包括 BOM、CRLF、标题和末尾空行均保留。
- 内容上限 50,000 字符；可接受一层完整 Mermaid 代码围栏，但推荐直接传图定义。
- 拒绝空图、未闭合/非法 YAML 和 Mermaid init/config 指令。完整 Mermaid 语法由渲染器检查，错误显示于面板，不执行图中的链接/回调；Agent 应先验证语法。
- 必须使用最新文档 `expected_revision`，否则返回 `STALE`。遇到冲突应重读全文再生成。
- 审批时再次核对目标仍已打开且原文/版本未变化；等待期间的编辑不会被旧请求覆盖。
- 若需要用户审批，返回 `pending_review`，不代表已经写入或保存。用户拒绝则不生效。
- 接受修改后，通过 `auris_workspace` 调用 `{"action":"save","tab_id":"学习/微积分.md"}`，只有成功返回才代表已落盘。
- 已连接的 Agent 需重新连接/刷新工具列表才能取得扩展 schema；旧版 `read` / `write` 行为兼容。

存储字段为 YAML frontmatter：`aurisMermaid`（多行图定义）、`aurisMermaidSourceRevision`（生成时正文摘要）。它们不出现在正文编辑区，随文档复制、移动和重命名。其他元数据与注释保留语义，YAML 格式化可能调整空白。专用图不存在时，兼容显示正文顶层 Mermaid 代码块；嵌套 Markdown 示例不会误识别成图。

## 渲染边界与参考

- 使用已安装的 Mermaid 12.1.0，本地打包，不下载 CDN、不安装 Claude hook、不打开外部预览标签。
- Strict 模式、不绑定 Mermaid 交互回调；异步渲染失效后不更新旧笔记视图。缩放和滚动在更新时保留，切换文件时重置。
- 跟随 Auris 六主题区分浅色/深色 Mermaid 配色，外围面板使用 Notes 主题令牌。正文改变只标记旧图，不偷偷重写图。
- 参考 [mermaid-preview-for-claude](https://github.com/xiaolai/mermaid-preview-for-claude/tree/2789e0d9188741f1099ef290a40fc8e40afd6e08) 的 README 和 `scripts/mermaid-preview.sh`（ISC）。借鉴离线、按文件隔离、变化后刷新和 strict 模式；未复制其 shell/HTML 实现，也未采用文件轮询。
- 对照 VMark `449fbc3e0b25215b3e1e38079ca59999f7a06a2b` 的 `src/plugins/codePreview/renderers/renderMermaidPreview.ts`，采用等价的异步失效保护，未照搬 Tiptap decoration 和 Tauri 边界。

## 验证

- 定向 Notes/MCP/页面回归 10 文件、144 项通过；源码与测试 TypeScript 检查、定向 ESLint、生产构建和 Markdown 产物门禁通过。
- 广泛 Notes 回归 173 文件、3107 项中 3106 项通过；旧关系图异步 chunk 的立即挂载断言在并发运行中失败，单独重跑其 11 项全部通过。未将该整组报告为全绿。
- 隔离 Electron 测试使用临时 Vault 而非文件双击产生的独立外部副本，验证真实 MCP 读取、write_mermaid、人工审批、SVG、save 成功及正文不变；六主题和缩放通过。1280×799 内容区域实测面板约 1178×719。
- 可复跑：`node tests/electron/article-mermaid-smoke.cjs`。测试截图和结果写到忽略的 `release/article-mermaid-smoke/`，不使用真实用户笔记。
- 本接口沿用现有 MCP 的已打开 Vault 文档范围。独立的 Vault 外文件副本不在这个 MCP 文档会话中；Agent 必须先读取成功，不得使用同名 Vault 笔记替代它。
- 未替换安装版、提交、推送或发布；安装版需要后续打包安装才会生效。
