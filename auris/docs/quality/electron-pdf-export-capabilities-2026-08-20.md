# Electron PDF 输出能力依据

> 记录日期：2026-08-20（GMT+8）
> 用途：Auris 桌面笔记 PDF 导出的实现与回归验证依据。

Electron 官方 `webContents.printToPDF()` 的 `PrintToPDFOptions` 支持设置纸张尺寸、横竖向、页边距、背景打印、页眉/页脚模板、CSS 页面尺寸优先级、页码范围，并提供实验性的 `generateTaggedPDF` 与 `generateDocumentOutline` 选项。本文档所记录的能力只用于 Auris 本地 Electron 主进程生成用户主动导出的 PDF，不涉及外部网页内容或浏览器自动化。

Auris 的 PDF 输出默认策略为：A4、打印背景、采用 CSS `@page`、页脚页码、请求文档大纲和请求可访问标签。渲染端只允许传递受限的纸张、方向与两项开关；任意模板、页码范围或任意对象字段均不接受，以避免渲染进程改变主进程输出模板。

## 参考

- [Electron `webContents` API](https://www.electronjs.org/docs/latest/api/web-contents)
- [Electron `PrintToPDFOptions` API](https://www.electronjs.org/docs/latest/api/structures/print-to-pdf-options)
