# Notes 公式乱码：粘贴、解析、保存与显示链路修复

日期：2026-10-04。安装版本：1.0.16（本地修复包，未发布）。

## 可验证的根因

computer use 在已安装 Auris 的 `/notes` 观察到《串联超前校正超前校正指南》中的 `$K$`、多重反斜杠命令及被转义的下划线直接作为文字显示，中文本身正常。磁盘和 Auris document bridge 读取结果一致，包含四重命令反斜杠、三重下划线转义、附着反斜杠的 `$$` 和 `&gt;`。

失败测试确认的链路：

1. 富文本粘贴插件只处理兼容括号的行内公式，漏掉 dollar 行内公式与 display 公式；它们成为普通文本并由 Markdown serializer 继续转义。
2. 原兼容清理只减少一层命令转义，且下划线只覆盖花括号下标，无法清理这篇实际笔记。
3. remark-math 在解析时创建 `data.hChildren`。只更新 MDAST `value` 不会同步阅读/导出使用的 HAST 缓存，导致编辑与阅读结果不一致。
4. 块公式 serializer 以单次 `write()` 输出多行，没有为列表/引用内的正文及闭合 fence 写出容器前缀。第一次保存正常的 AST，重新打开可能被拆成普通文字或吞掉后文。
5. CodeMirror 混合预览另有 dollar 扫描器，实际回归测试发现代码中的 `$K$` 也被转换为公式。

这些是已复现的机制；不能据此确定原笔记历史上经历了哪次复制/保存操作。

## 改动范围与 VMark 对照

改动在 `src/features/notes/` 的共用 Markdown、富文本粘贴/序列化和混合预览，覆盖编辑、阅读、HTML/PDF 导出的公式输入文本。没有改动 Vault 工厂、认证、API、Electron 主进程或预加载。

固定对照 VMark `fa785a7008999bc2077889a9faaca0175f122cee`：

- `src/utils/markdownPipeline/parser/mathProbe.ts`：直接复用其基于 Markdown AST 位置的 opaque-range 逻辑，适配为 Auris 的 GFM/fast-path、math-disabled probe，并将遍历改为显式栈。代码来源与 ISC 许可在新增 `notes-math-opaque-ranges.ts` 和 `docs/vmark-port/UPSTREAM-LICENSE.txt` 中记录，安装包已有上游许可资源。
- `parser/mathDelimiterSpans.ts`：核查保护区和 fence sizing 边界。Auris 保留已有一至三反斜杠括号兼容、同句 display 及列表/引用续行行为，补齐已观察到的 dollar 导出损坏；未将全部上游 source guards 标记为已对齐。
- `serializer.ts`、`serializer.test.ts`：对照行内/块公式及货币 round-trip。Auris 继续使用既有 ProseMirror serializer，修正容器缩进并按内容选择不会冲突的 dollar fence。

粘贴前识别公式 atom，保留 HTML 加粗等行内 marks；块公式拆出合法 block，原有代码块与 code mark 保持原文。单次清理多层命令转义、损坏下标和 math 内实体，保持矩阵行分隔/行距及文本中的合法转义下划线。同步 MDAST/HAST 内容，使编辑、阅读与导出一致。

## 验证与交付

- 首轮 Notes 整组：133 文件、1125 项通过。
- 后续混合预览、真实损坏笔记、粘贴、round-trip、导出和编辑器同步：6 文件、79 项通过；再增加首项为块公式的 HTML 列表粘贴检查，真实损坏笔记测试文件最终 13 项通过。
- 全仓 ESLint：0 errors；清理本轮 unused helper 后定向 ESLint 无 warning。全仓 TypeScript 检查有 248 项既有错误（108 项在历史 release 类型文件、140 项在其他测试；`src/` 与本轮文件无错误）。
- `git diff --check`、Next 生产构建及 Markdown patch 产物门禁通过；standalone 装配、隐私审计、macOS arm64 打包、签名权限检查、严格 codesign 验证通过。
- `/Applications/Auris.app` 已替换并启动，仍为 1.0.16，本地 ad-hoc 签名。旧包：`/Applications/Auris.app.backup-1.0.16-before-note-math-20261004`。
- 原笔记仅清理公式源码/分隔符，通过 document bridge 的 revision 校验写入，已核验磁盘与修复草稿一致。原文件备份：`/Users/apple/Desktop/Auris修复备份/2026-10-04/串联超前校正超前校正指南.md`。
- computer use 在新包实机重新打开原笔记确认分式、下标、希腊字母和 display 公式；新建临时笔记分别用 text/HTML clipboard 粘贴，确认 5 个公式正常、加粗保留、代码 `$K$` 与货币保持文字。保存、关闭、重开后源码逐字相同，截图/AX 再次确认显示正确。临时笔记已移至上述备份目录，最后回到用户原笔记。

未批量改写其他笔记，未提交、推送或发布 GitHub Release。兼容恢复只处理可识别的公式；本轮没有声称能无歧义恢复任意损坏文本。
