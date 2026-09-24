# VMark v0.9.84：Notes 超链接修复对齐

## 上游复核

VMark 发布标签 `v0.9.84` 指向 commit `12c98051efec2adc12c3a8fdb7afe30be036e82a`。它包含修复 PR #1449 的四个提交和一个合并提交，修复 #1448 报告的 macOS/Windows 超链接行为，并补上验证期间发现的链接图片保存丢标记问题。

- macOS 的 POSIX 绝对路径不能被拼接为来源笔记目录下的相对路径。
- Windows 相对链接必须保留来源盘符；盘符绝对路径不能被当作 URI scheme。
- WYSIWYG 与源码模式的 Cmd/Ctrl+点击都必须经过应用链接路由，阻止 Renderer 原生导航把文件路径变成应用 origin URL。
- 普通点击要让用户继续在编辑器里输入、复制和粘贴；Mod+K 编辑链接目标时才聚焦目标字段。
- UNC/网络路径和 Windows 盘符相对路径需拒绝；损坏的百分号编码片段不能让导航抛异常。
- `[![图片](pic.png)](A.md)` 导入再保存后必须仍保留外层链接。链接范围判定要把带链接标记的行内图片计入，并把 href 不同的相邻链接分开。

来源：[v0.9.84 发布说明](https://github.com/xiaolai/vmark/releases/tag/v0.9.84)、[PR #1449](https://github.com/xiaolai/vmark/pull/1449)、[Issue #1448](https://github.com/xiaolai/vmark/issues/1448)。PR 报告了 macOS 实机手动验证；Windows 运行时未实测，上游 Windows CI 也未覆盖桌面运行时。

## Auris 实现

- 新增 `markdown-link-navigation.ts`：按来源目录解析相对路径，保留 POSIX 与 Windows 绝对路径，限制目录越界和不安全 scheme，拒绝 UNC / `//host` / `C:relative`，并安全解析片段。
- Notes WYSIWYG 中普通链接点击阻止 Renderer 原生跳转；Cmd/Ctrl+点击调用应用路由。源码模式 Cmd/Ctrl+点击从 Markdown AST 找到链接，使用同一条路由。
- HTTP(S) 与 mailto 交由桌面系统打开；Vault 内 Markdown 复用现有工作区；Vault 外的绝对 Markdown 通过新增受限 Electron IPC 打开。此 IPC 只接受本地绝对路径并要求可信主进程事件。
- Mod+K 在 WYSIWYG 的链接标记内打开现有 Notes 地址输入框，更新 URL 时保留链接文字，并拒绝编辑期间已变化的旧范围。源码模式可直接修改 Markdown 源文本。
- 本地 Markdown 路径携带标题片段时，在目标文档与对应编辑器桥接都就绪后定位标题；找不到标题时显示反馈。
- 增加路径解析、失败/危险边界、真实 WYSIWYG Cmd/Ctrl+点击与 Mod+K 编辑、链接图片范围/往返、Electron 本地路径约束及 IPC 合约回归测试。

## 验证与工程归类

本轮没有运行测试、lint、TypeScript 检查、构建或桌面手动验证。新增回归测试已写入工作树，但结果未知；macOS 与 Windows 的运行时链路仍需实机/桌面 CI 验证。没有递增 Auris 版本、提交、推送、打包或替换已安装应用。

软件工程归类：软件维护与演进，含纠错性维护、功能增强、回归测试与跨平台验证。实践要点是按用户真实点击、编辑、保存和失败路径检查端到端行为，不能只验证解析函数或代码表面形态。

本地 `vmark-upstream` 起始工作树干净，但检出分支 `main` 比抓取前的 `origin/main` 落后 23 个提交；本轮已将其快进至 `v0.9.84` 对应的 `12c9805`。Auris 主仓库起始为干净且与 `origin/main` 同步。用户给定的 UI 指南文件路径在本机不存在，本轮链接编辑继续复用已有 Notes 输入对话框。
