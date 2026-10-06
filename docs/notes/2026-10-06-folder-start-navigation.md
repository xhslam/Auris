# 文件夹“起点”导航（2026-10-06）

截图对应 `/notes` 的 NotesWelcomeScreen 与 NotesFolderBrowser。既有 getNotesRootLocation 在欢迎页已访问且存在最后文件夹时恢复 folder，因此不能把“起点”绑定为 Notes 一级入口事件。

在搜索与排序之间增加“起点”，复用 notes-folder-browser__tool-button、17px House 图标、原生 button 键盘行为和已有主题/focus tokens。NotesPageClient 显式切换 location 为 landing，不删除最后文件夹、Vault、openTabs 或草稿；仍可从侧栏进入文件夹、从欢迎页执行既有文件操作。未改变 Notes 一级入口的会话恢复规则。

源码对照：VMark 固定提交 2d3903cb2887a7c6a7a8df7b814f14b745bc2415（v0.9.92，ISC），读取 src/components/Editor/Editor.tsx:78 和 src/components/Welcome/WelcomeScreen.tsx。上游无活跃 tab 时呈现 Welcome，沿用原有文件服务；Auris 已有独立 landing/folder/note 模型，直接复用本地导航和欢迎组件，没有复制上游实现，也不通过关闭所有笔记来返回首页。改动后再次检查上游 dispatcher 边界与本地 diff。

参考 Shape of AI 的 Wayfinders 与 Meta Astryx 的主题/组件一致性原则；此按钮不是 AI 操作。指定 UI_DESIGN_SYSTEM_GUIDE.md 在给定路径不存在，沿用项目已有工具栏样式，未安装设计库。

验证：4 个 Notes 导航/页面/文件夹/样式测试文件，39 项通过；实际页面组件回归覆盖工具栏顺序、folder → landing → folder → note，以及最后文件夹记录保持。全仓 lint 0 errors / 20 既有 warnings；TypeScript 改动前后均 248 errors，错误清单无增减；生产构建、Markdown bundle 门禁、桌面运行时装配及隐私审计通过。安装和桌面 UI 结果见下文。未发布远端 Release。

本机交付：electron-builder mac arm64 完成，签名权限门禁与 codesign --verify --deep --strict 通过；同版本 1.0.17 本地更新已安装 /Applications/Auris.app，旧包保存 release/backups/Auris-1.0.17-before-start-button-20261006.app。通过 Computer Use 正常退出旧应用、启动新应用，实际打开 /notes 和考研文件夹（30 个文件），确认搜索 → 起点 → 最近修改顺序，点击起点呈现“开始你的下一页笔记”及 20 个最近使用文件，再点考研恢复 30 个文件。截图确认按钮高度、颜色和间距与相邻按钮一致；应用停留文件夹页供用户直接使用。未编辑真实笔记正文。

提交前同步：从 b208cd1 快进至 Windows 推送的 e6b8970（本地 Windows 更新脚本），与这次起点功能没有文件重叠。备份后拉取，5 个本地文件 SHA-256 完全保持；同步后的 Notes/导航/运行时依赖 51 项与 Windows 更新脚本 8 项测试通过。备份位于忽略的 release/backups/git-sync-start-button-20261006/。
