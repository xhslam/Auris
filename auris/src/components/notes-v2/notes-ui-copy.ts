"use client";

export const NOTES_UI_COPY = {
  workspace: {
    browserFallback: "浏览器笔记库",
    label: "笔记库",
    sourceFirstFallback: "展示编辑优先笔记库",
  },
  headerActions: {
    command: "命令",
    delete: "删除",
    exportHtml: "HTML",
    exportPdf: "PDF",
    exportVault: "导出",
    formatCjk: "中文排版",
    newNote: "新建",
    rebuildIndex: "重建索引",
    refresh: "刷新",
    rename: "重命名",
  },
  indexStatus: {
    failed: "索引重建失败",
    rebuiltPrefix: "索引已重建",
    rebuilding: "正在重建索引...",
  },
  leftRail: {
    collapse: "收起侧栏",
    expand: "展开侧栏",
    files: {
      open: "打开文件面板",
      short: "文",
    },
    outline: {
      open: "打开大纲面板",
      short: "纲",
    },
    search: {
      open: "打开搜索面板",
      short: "搜",
    },
  },
  rightRail: {
    collapse: "收起右侧栏",
    expand: "展开右侧栏",
    backlinks: {
      open: "打开反链面板",
      short: "反",
    },
    learning: {
      open: "打开学习面板",
      short: "学",
    },
    library: {
      open: "打开笔记检索面板",
      short: "检",
    },
    properties: {
      open: "打开属性面板",
      short: "属",
    },
    terminal: {
      open: "打开终端面板",
      short: "终",
    },
  },
  leftPane: {
    files: {
      chooseFolder: "选择文件夹",
      emptyRecent: "打开一篇笔记后，这里会显示最近访问记录。",
      label: "文件",
      recent: "最近打开",
      title: "文件",
    },
    outline: {
      label: "大纲",
      title: "大纲",
    },
    search: {
      label: "搜索",
      title: "搜索",
    },
  },
  rightDock: {
    backlinks: {
      label: "反链",
      show: "显示反链面板",
    },
    learning: {
      label: "学习",
      show: "显示学习面板",
    },
    properties: {
      label: "属性",
      show: "显示属性面板",
    },
    terminal: {
      label: "终端",
      show: "显示终端面板",
    },
  },
  toolbar: {
    delete: "删除",
    displayEditing: "展示编辑",
    reading: "展示",
    rename: "重命名",
    richText: "富文本",
    table: {
      addColumnAfter: "后列",
      addColumnBefore: "前列",
      addRowAfter: "后行",
      addRowBefore: "前行",
      deleteColumn: "删列",
      deleteRow: "删行",
      deleteTable: "删表",
      headerCell: "表头格",
      headerColumn: "表头列",
      headerRow: "表头行",
      label: "表格",
      mergeCells: "合并",
      splitCell: "拆分",
      toolbarLabel: "表格工具栏",
    },
    source: "源码",
  },
  banners: {
    loading: "正在加载笔记库...",
  },
  emptyEditor: "选择或新建一篇笔记。",
  commandPalette: {
    dialogLabel: "笔记命令面板",
    placeholder: "执行命令或打开笔记",
  },
  tabs: {
    closePrefix: "关闭",
    openTabs: "已打开的笔记标签",
  },
  fileTree: {
    ariaLabel: "笔记库文件树",
    kinds: {
      attachment: "附件",
      audio: "音频",
      markdown: "Markdown",
    },
  },
  panels: {
    backlinks: {
      description: "引用当前文件的笔记。",
      empty: "暂时还没有反链。",
      title: "反链",
    },
    learning: {
      description: "把已保存的单词和句子作为 Markdown 片段插入。",
      empty: "没有匹配的学习片段。",
      searchPlaceholder: "搜索单词或句子",
      searchSrOnly: "搜索学习片段",
      sentenceSnippet: "句子片段",
      title: "学习插入",
      wordSnippet: "单词片段",
    },
    library: {
      title: "笔记检索",
    },
    outline: {
      description: "当前 Markdown 文件中的标题结构。",
      empty: "暂时还没有标题。",
      title: "大纲",
    },
    properties: {
      description: "查看路径、元数据和派生统计。",
      empty: "选择一篇笔记后可查看属性。",
      none: "无",
      editorMode: "编辑模式",
      openStrategy: "打开策略",
      path: "路径",
      selection: "选区",
      selectionEmpty: "未选择文本",
      size: "大小",
      tags: "标签",
      title: "属性",
      words: "字数",
    },
    reading: {
      empty: "打开一篇笔记后即可预览 Markdown。",
    },
    search: {
      description: "搜索文件名、标题、标签和正文内容。",
      empty: "没有匹配的笔记。",
      hint: "输入 #标签 或 tag:标签 可按标签精确过滤。",
      searchPlaceholder: "搜索当前笔记库",
      searchSrOnly: "搜索笔记",
      title: "搜索",
    },
    tags: {
      clear: "清除标签过滤",
      description: "点击标签即可按标签过滤当前笔记库。",
      empty: "当前笔记库还没有标签。",
      filterLabel: (tag: string) => `按标签过滤 ${tag}`,
      title: "标签",
    },
    terminal: {
      availableDescription:
        "桌面端已接入本地终端桥，可以在当前笔记库目录旁边直接运行会话。",
      backends: {
        pipe: "本地 shell",
        pty: "本地 PTY",
      },
      clearSession: "清空",
      closeSession: "关闭",
      contextMenu: {
        clear: "Clear",
        copy: "Copy",
        label: "Terminal edit actions",
        paste: "Paste",
        selectAll: "Select All",
      },
      copySelection: "复制",
      description: "在笔记工作台中运行本地 shell，会话输出会实时显示在这里。",
      empty: "当前没有可用的桌面命令。",
      lastCommandPrefix: "上次执行：",
      newSession: "新会话",
      refreshCommands: "刷新命令",
      restartSession: "重启",
      searchPlaceholder: "搜索终端输出",
      searchSrOnly: "搜索终端输出",
      sessionsLabel: "终端会话",
      starting: "启动中",
      title: "终端",
      unavailableDescription:
        "当前运行环境没有桌面桥接，终端面板位置已预留但暂不可用。",
    },
  },
  commands: {
    deleteNote: {
      keywords: ["删除", "remove", "trash", "note"],
      subtitle: "删除当前 Markdown 笔记并关闭对应标签",
      title: "删除当前笔记",
    },
    exportVault: {
      keywords: ["导出", "export", "manifest", "backup", "vault", "zip"],
      subtitle: "导出当前 vault 文件夹，包含 Markdown、assets 和 manifest",
      title: "导出 Vault 文件夹",
    },
    formatCjk: {
      keywords: ["排版", "格式化", "中文", "空格", "cjk", "format", "pangu"],
      subtitle: "在中英文、中文与数字之间自动补齐半角空格（跳过代码块与 front matter）",
      title: "一键中文排版",
    },
    newNote: {
      keywords: ["新建", "create", "markdown", "笔记", "vault"],
      subtitle: "在 Inbox/ 中创建一篇新的 Markdown 笔记",
      title: "新建笔记",
    },
    openRecentPrefix: "最近打开：",
    refreshVault: {
      keywords: ["刷新", "reload", "sync", "同步"],
      subtitle: "重新加载条目和文档索引",
      title: "刷新笔记库",
    },
    renameNote: {
      keywords: ["重命名", "title", "file", "wiki link"],
      subtitle: "重命名当前 Markdown 文件并重写 wiki 链接",
      title: "重命名当前笔记",
    },
    saveAllNotes: {
      keywords: ["保存全部", "save all", "autosave", "dirty"],
      subtitle: "保存当前工作台里所有未保存的 Markdown 笔记",
      title: "保存全部笔记",
    },
    saveNote: {
      keywords: ["保存", "save", "manual", "dirty"],
      subtitle: "立即保存当前 Markdown 笔记",
      title: "保存当前笔记",
    },
    toggleReading: {
      keywords: ["阅读", "preview", "view", "预览"],
      subtitle: "在源码视图和阅读视图之间切换",
      title: "切换阅读视图",
    },
  },
  dialogs: {
    externalEditorConflict: {
      copyDiff: "复制差异",
      description:
        "这个文件被外部编辑器改过了。你可以重新加载远程版本，保留当前版本，或者复制差异后手动合并。",
      eyebrow: "保存冲突",
      keepLocalVersion: "保留我的版本",
      reload: "重新加载",
      title: "外部编辑器冲突",
    },
    deleteNoteConfirm: "确定要删除当前笔记吗？此操作无法撤销。",
    renameNote: "重命名笔记",
  },
  errors: {
    chooseDirectory: "选择笔记目录失败。",
    createNote: "创建新的 Markdown 笔记失败。",
    deleteNote: "删除 Markdown 笔记失败。",
    exportNote: "导出当前笔记失败。",
    exportVault: "导出 vault 清单失败。",
    loadVault: "加载笔记库失败。",
    moveEntry: "移动失败。",
    moveEntryCollision: "目标文件夹已存在同名文件或文件夹。",
    moveEntryIntoSelf: "无法将文件夹移动到它自己内部。",
    renameNote: "重命名 Markdown 笔记失败。",
    renameNoteCollision: "已存在同名笔记，请换一个名称。",
    runDesktopCommand: "运行桌面命令失败。",
    saveNote: "保存 Markdown 笔记失败。",
    vaultExportValidation: "Vault 清单校验失败。",
  },
} as const;
