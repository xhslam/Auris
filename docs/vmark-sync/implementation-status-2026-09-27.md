# VMark v0.9.82 ~ v0.9.84：输入法按键守卫与物理状态机对齐（2026-09-27）

## 上游复核与背景

复核 VMark 自 `v0.9.81` 至 `v0.9.84`（commit `12c98051e`）的核心演进，其中输入法（IME）守卫与快捷键状态机经历了根本性重构（Issue #1445，PR #1446）：

1. **操作系统标志只是“信念（Belief）”，而非“物理事实（Fact）”**：
   - 过去守卫在任意键盘事件触发时重新读取 `event.ctrlKey` / `event.metaKey`，导致一旦全局第三方工具（如 Windows 上的 AltSnap、窗口管理器等）拦截了修饰键的 `keyup`，操作系统将永远报告该修饰键处于按下状态。
   - 之前设计的 `blur` 重置会被随后的任意敲键立即推翻（被滞留的标志重新激发），导致 Windows 中文用户完全无法打出中文逗号 `，`（单字符标点被守卫误杀吞噬）。
2. **非 macOS 平台 Super/Windows 键无权激活 Command 守卫**：
   - Windows/Linux 上快捷键修饰键为 Ctrl，Super 键不属于快捷键命令键体系。之前全平台将 `meta` 纳入守卫范围，属于无益且破坏性强的误杀。
3. **AltGr 欧洲键盘布局保护**：
   - Windows 欧洲键盘上的 AltGr 由系统规范化（`getModifierState("AltGraph")`），会伴随特殊的 Ctrl+Alt 行为，守卫必须视同 Alt 予以绝对放行，绝不可误吞字符。
4. **多维脱困保障机制**：
   - 引入 `pointerdown`（鼠标点击是用户最自然的脱困行为，且覆盖 macOS Emoji 拾取器的点击插入）、`focus`（窗口进入时可能有前置按键未重置）、`visibilitychange` 与 `blur`，共同兜底按键状态。

## Auris 对齐实现

- **重写 `src/features/notes/editor/ime-chord-guard.ts`**：
  - 将激活机制从“被动读取聚合标志”改为“必须观测到修饰键自身的 `keydown` 事件（`COMMAND_MODIFIER_KEYS[e.key]`）”。
  - 非 macOS 平台上将 Command 判定限制为仅 `ctrl`，严格排除 `meta`（Super/Win 键）。
  - 规范化支持 `AltGraph`，作为 Alt 放行字符，不触发 Control 释放判定。
  - 将聚合标志（`!e.ctrlKey`、`!e.metaKey`）作为**释放（Disarm）的权威**，任意键盘事件检测到松开立即释放，保证双 Ctrl 并发场景正确。
  - 增加 `pointerdown`、`focus`、`blur`、`visibilitychange` 监听与注销。
- **扩充测试用例 `tests/unit/notes/ime-chord-guard.test.ts`**：
  - 断言非 macOS 平台下 `metaHeld` 绝不拦截单字符插入；
  - 断言普通按键携带的 `ctrlKey: true` 虚假聚合标志绝不激活守卫；
  - 断言真实 `Control` 按键自身 `keydown` 成功激活守卫并拦截 IME 孤立字符；
  - 断言 `pointerdown`、`focus`、`keyup` 能准确解除激活状态。

## 验证结论

- **单元测试**：
  - `tests/unit/notes/ime-chord-guard.test.ts`：10 项全部通过（10/10 green）。
  - `tests/unit/notes/` 全量：102 个测试文件、845 项测试全部通过（0 failure）。
  - 包含超链接与图片往返的 `markdown-link-navigation.test.ts`、`notes-rich-link-range.test.ts`、`notes-rich-link-interaction.test.tsx` 全部通过。
- **静态代码检查**：
  - ESLint：修改文件 0 errors, 0 warnings。
  - TypeScript：`npx tsc --noEmit` 审查确认未引入任何新类型错误。
