# English Shadowing Web 技术文档

**Last Updated:** 2026-05-13  
**Scope:** `english-shadowing-web/`  
**Document Type:** 综合技术架构与功能实现说明  
**Source of Truth:** 本文基于当前代码结构、路由、API、组件、Electron 桥接、Supabase 迁移和测试目录整理。

## 1. 项目定位

`English Shadowing Web` 最初是一个英语跟读 Web MVP，目前已经演进成一个“英语技术会议演练 + 本地优先学习工作台”：

- Web 端基于 Next.js App Router，承载首页、登录、训练工作区、笔记、纠音、课程、社区、音频、文档、视频、设置等页面。
- 桌面端基于 Electron，通过 `window.shadowingDesktop` 桥接本地文件、SQLite 数据库、视频库、AI Dock、终端、插件、下载目录和运行时状态。
- 移动端基于 Capacitor，保留 Next.js 页面作为主体，`mobile-shell/` 作为没有远端服务时的 fallback shell。
- 数据层采用混合模式：Supabase/PostgreSQL 用于云端登录用户，本地 JSON、localStorage、IndexedDB、Electron SQLite 和本地文件系统用于离线或桌面场景。
- 核心学习闭环是：导入材料 -> 生成训练会话 -> 生成/加载音频与词级时间轴 -> 跟读播放 -> 收藏词句/录音 -> 沉淀到笔记与学习记忆。

## 2. 技术栈概览

| 层级    | 技术                                                             | 当前用途                                                        |
| ----- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| 应用框架  | Next.js 16 App Router, React 19                                | 页面路由、API Route、客户端 shell                                    |
| 语言与类型 | TypeScript strict mode                                         | Web、服务层、平台适配层                                               |
| 状态管理  | Zustand, Immer, TanStack Query                                 | 用户偏好、工作区 UI、笔记 UI、AI Dock、服务端数据缓存                           |
| 校验    | Zod                                                            | API payload、会议材料、环境变量、插件 manifest                           |
| 音频/语音 | OpenAI TTS/STT, Windows TTS fallback, VoxCPM, Azure Speech     | 跟读音频生成、词级时间戳、发音评估                                           |
| 数据    | Supabase, local JSON, localStorage, IndexedDB, Electron SQLite | 云端会话、本地历史、笔记 vault、录音、AI/视频/运行时数据库                          |
| 桌面    | Electron                                                       | 本地文件系统、Vault、AI Dock、视频库、终端、插件                              |
| 移动    | Capacitor 7                                                    | iOS/Android shell、native billing/notification/file adapters |
| 编辑器   | CodeMirror 6, ProseMirror, markdown-it, mermaid, KaTeX         | Markdown 笔记、混合阅读/编辑、富文本能力                                   |
| 测试    | Vitest, Testing Library, Playwright                            | 单元、组件、E2E、迁移测试                                              |

## 3. 目录结构

```text
english-shadowing-web/
  src/app/                  Next.js 页面与 API routes
  src/components/           页面 shell、工作区面板、播放器、笔记、AI Dock
  src/features/             业务功能模块
  src/lib/                  环境、Supabase、DI、Query Client、错误类
  src/platform/             Web/Desktop/Mobile 平台适配服务
  src/server/repositories/  服务端数据访问与本地 fallback
  src/services/             DI 服务层与 repository 适配器
  src/stores/               Zustand 全局状态
  electron/                 Electron 主进程、preload、SQLite repository、本地桥
  supabase/migrations/      PostgreSQL 表结构、RLS、Storage policy
  tests/                    unit/component/e2e/migration tests
  mobile-shell/             Capacitor fallback webDir
  scripts/                  desktop launcher、migration、secret check、schema sync
```

## 4. 运行入口

### 4.1 Web/Next.js

- `src/app/layout.tsx` 注册服务层 `registerServices()`，并包裹 `GlobalErrorBoundary`、`ServiceProvider`、`QueryProvider`。
- `src/app/page.tsx` 渲染 `DesktopHomeShell`。
- `src/proxy.ts` 通过 `updateSession()` 对 `/login`、`/register`、`/workspace/:path*` 做 Supabase session refresh 和 workspace 登录保护。
- `next.config.ts` 开启 React strict mode，并将 `wordpos`、`wordnet-db` 声明为 server external packages，支持离线词典。

### 4.2 Electron 桌面端

- `scripts/desktop-launcher.cjs` 检查 Electron 运行依赖，然后用当前 Node 启动 `electron/main.cjs`。
- `electron/main.cjs` 负责：
  - 单实例锁。
  - 启动或连接 Next dev/server URL。
  - 创建主窗口。
  - 注册 `shadowing-media://` 视频协议。
  - 注册所有 `ipcMain.handle("shadowing:*")` 桌面 API。
  - 初始化运行时状态、AI library、训练历史、视频库、终端、MCP bridge。
- `electron/preload.cjs` 通过 `contextBridge.exposeInMainWorld("shadowingDesktop", ...)` 暴露类型化桌面能力。

### 4.3 Capacitor 移动端

- `capacitor.config.ts` 定义 appId `com.shadowingstudio.app` 和 appName `Shadowing Studio`。
- `webDir` 指向 `mobile-shell`。
- 设置 `CAPACITOR_SERVER_URL` 后，原生壳会加载指定 Next.js server；未设置时使用 fallback shell。

## 5. 路由与页面功能

| 路由                     | 页面组件                                 | 功能说明                         | 实现方式                                                                                         |
| ---------------------- | ------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------- |
| `/`                    | `DesktopHomeShell`                   | 首页仪表盘、继续学习入口、最近训练/纠音/笔记、资源推荐 | 从桌面 runtime、训练历史、纠音历史、笔记 storage 汇总 `DesktopHomeResumeSnapshot`                              |
| `/login`               | `AuthShell` + `AuthForm`             | 登录                           | Supabase 配置存在时走邮箱密码登录；否则走 demo cookie 登录                                                     |
| `/register`            | `AuthShell` + `AuthForm`             | 注册                           | Supabase signUp 或 demo 模式本地 profile upsert                                                   |
| `/workspace`           | `WorkspaceShell`                     | 训练与技术会议演练主工作区                | 动态加载 shell，支持 `resumeSessionId`；内部组合材料导入、生成音频、播放器、词句本、录音、学习记忆                                |
| `/workspace?view=chat` | `DesktopChatShell`                   | 桌面对话工作区                      | 由 query 参数切换动态加载的 chat shell                                                                 |
| `/notes`               | `NotesPageClient` + `NotesWorkbench` | 本地优先 Markdown 笔记工作台          | Desktop/browser/mobile vault client + Markdown index + autosave + command palette + terminal |
| `/assessment`          | `AssessmentShell`                    | 发音评估历史                       | 从桌面 assessmentHistory 或 browser localStorage 读取，支持排序、展开详情、复制结果                               |
| `/video`               | `DesktopVideoLibraryShell`           | 桌面本地视频库                      | 仅 Electron bridge 可用；选择库目录、导入本地视频、刷新、打开目录                                                    |
| `/video/[videoId]`     | `DesktopVideoDetailShell`            | 视频播放器详情页                     | 读取视频详情、source variant 播放、倍速、清晰度、元数据回写、影院模式                                                   |
| `/courses`             | `CoursesShell`                       | 课程与计划面板                      | 使用 fixture 数据展示课程概览、周节奏、课程卡片                                                                 |
| `/community`           | `CommunityShell`                     | 社区页面                         | 使用 fixture 数据展示话题、热榜、分类和帖子列表                                                                 |
| `/audio`               | `DesktopCollectionShell`             | 跟读音频资源库                      | 使用 fixture card + 资源概览展示                                                                     |
| `/documents`           | `DesktopCollectionShell`             | 文档与素材库                       | 复用课程卡片，展示 Markdown/文稿导入素材面板                                                                  |
| `/wordbook`            | `DesktopWordbookShell`               | 重点词条页                        | 当前页面使用 fixture 词条；训练工作区内词本使用 localStorage                                                    |
| `/settings`            | `SettingsShell`                      | 设置页                          | 使用 fixture 设置组展示基础设置界面                                                                       |

## 6. API Routes

| Endpoint                             | Method | 功能                         | 校验与权限                                                    | 主要实现                                                       |
| ------------------------------------ | ------ | -------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| `/api/auth/demo-session`             | POST   | Demo 登录并写入 httpOnly cookie | `z.object({ account, password })`                        | `buildDemoAuthUser()` + `upsertAuthProfile()`              |
| `/api/auth/profile`                  | POST   | 同步账号标识到 profile            | `account/userId` 非空                                      | `auth-profile-repository.ts`                               |
| `/api/sessions`                      | GET    | 最近训练列表                     | `getSessionActor()`                                      | `listRecentSessions()`                                     |
| `/api/sessions`                      | POST   | 创建训练会话                     | Zod: sourceType/title/text；要求登录或桌面本地请求                   | `createSession()` -> `createEmptySessionRecord()`          |
| `/api/sessions/[sessionId]`          | DELETE | 删除会话                       | `requireSessionOwner()`                                  | `deleteSession()`                                          |
| `/api/sessions/[sessionId]/prepare`  | POST   | 生成训练音频、句子、词级时间轴            | voiceId 校验；session owner                                 | `prepareSessionPlayback()`                                 |
| `/api/sessions/[sessionId]/playback` | GET    | 读取播放数据                     | session owner；桌面本地特殊处理 audioUrl                          | `getSessionPlayback()`                                     |
| `/api/audio/[sessionId]`             | GET    | 返回训练音频二进制                  | session owner 或 desktop local request                    | 本地 DB asset -> `.shadowing-data/audio` -> Supabase Storage |
| `/api/dictionary/lookup`             | GET    | 离线词典查词                     | word 1-64 chars                                          | `wordpos` WordNet lookup                                   |
| `/api/import-url`                    | POST   | 从远程 URL 提取正文               | URL 必须 http/https，阻止 localhost/127.0.0.1/::1             | fetch + `extractReadableTextFromHtml()`                    |
| `/api/templates`                     | GET    | 列出练习模板                     | 无额外输入                                                    | `listTemplates()`                                          |
| `/api/assessment/pronunciation`      | POST   | Azure 发音评估                 | FormData: referenceText/audio/locale；支持 wav/mp3/ogg/flac | `evaluatePronunciationAssessment()`                        |
| `/api/meeting-drill/materials`       | GET    | 列出会议材料                     | `getSessionActor()`                                      | `listMeetingMaterialsByUser()`                             |
| `/api/meeting-drill/materials`       | POST   | 创建会议材料                     | `createMeetingMaterialSchema`                            | 归一化后写入本地 meeting drill store                               |
| `/api/billing/entitlements`          | GET    | 返回 entitlement 状态          | 读取当前用户                                                   | 当前返回空 entitlement 与支持状态                                    |

## 7. 核心功能实现

### 7.1 认证与用户身份

功能：

- 登录/注册页面。
- Supabase 正式认证。
- 无 Supabase 配置时的 demo 登录。
- 桌面本地模式下允许 API 以 `desktop-local-user` 身份工作。

实现：

- `AuthForm` 先调用 `normalizeAccountIdentifier()` 规范手机号/邮箱。
- `isSupabaseBrowserConfigured()` 判断是否有 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- 正式模式使用 `createSupabaseBrowserClient().auth.signInWithPassword/signUp`。
- Demo 模式调用 `/api/auth/demo-session`，服务端写入 `shadowing_demo_auth` httpOnly cookie。
- `getCurrentUser()` 在未配置 Supabase 时读取 demo cookie；配置 Supabase 时读取 server client 的 auth user。
- `getSessionActor()` 在无当前用户但带有 `x-shadowing-client: desktop` 或 `localDesktop=1` 时返回 `desktop-local-user`。
- `/workspace` 由 `src/proxy.ts` 和 `updateSession()` 做 Supabase 登录保护；demo/桌面本地路径通过 API 层补足身份。

### 7.2 首页与继续学习

功能：

- 首页展示 primary action。
- 汇总最近训练、最近纠音、最近笔记。
- 显示 Vault、下载目录、启动模式。
- 对主要页面做预取。

实现：

- `DesktopHomeShell` 调用 `loadDesktopHomeResumeSnapshot()`。
- 桌面端从 `desktopBridge.runtimeState`、`trainingHistory`、`assessmentHistory` 和 notes storage 读取信息。
- 浏览器端使用 localStorage legacy runtime 与 browser notes storage fallback。
- `buildWorkspaceResumeHref()` 根据 resume target 生成 `/workspace?resumeSessionId=...`、`/assessment?resumeAssessmentId=...`、`/notes?resumeNoteId=...`。

### 7.3 桌面应用框架与导航

功能：

- 统一桌面 frame。
- 左侧 hover/focus 显示导航。
- 右侧 AI Dock。
- 记录最后访问工作区。
- 预取常用路由。

实现：

- `DesktopAppFrame` 包裹所有桌面风格页面。
- `useHydratedDesktopBridge()` 探测 `window.shadowingDesktop`。
- `persistLastWorkspace()` 写入 Electron runtime SQLite 或 browser localStorage。
- `DesktopAppSidebar` 使用 `DESKTOP_NAV_ITEMS` 和图标渲染导航，鼠标进入时 prefetch，点击时通过 Next router push。
- `DesktopAiDockShell` 动态加载，仅在 Electron bridge 存在且提供 `aiDock` 时显示。

### 7.4 训练工作区

功能：

- 粘贴文本、上传 txt/md/html、导入 URL。
- 自动切句/格式化导入文本。
- 生成训练会话。
- 生成 TTS 音频与词级时间轴。
- 播放、暂停、倍速、重播本句、重复间隔。
- 逐词高亮与点击跳转。
- 收藏单词和句子。
- 录制自己的跟读音频。
- 保存源材料笔记，联动学习记忆。
- 技术会议 Q\&A 演练占位面板。

实现：

- `WorkspaceShell` 是训练页面总装配层。
- `SourcePanel` 管理三种输入方式：
  - paste：直接使用 textarea 文本。
  - file：用 `File.text()` 读取；HTML 文件走 `extractReadableTextFromHtml()`。
  - url：调用 `/api/import-url`，服务端阻止本地/内网 URL。
- 创建训练时，`SourcePanel` 先 POST `/api/sessions`，再 POST `/api/sessions/{id}/prepare`。
- `createSession()` 使用 `normalizeInput()` 清洗文本，写入 session draft。
- `prepareSessionPlayback()`：
  - `resolveSpeechProvider()` 选择 OpenAI、VoxCPM 或 fallback。
  - `prepareShadowingAudio()` 生成音频与 transcript words。
  - `splitIntoSentences()` 分句。
  - `tokenizeSentence()` 逐句分词。
  - `mapWordTimestamps()` 按 token 与 transcript word 做严格顺序对齐；不匹配时抛 `ALIGNMENT_FAILED`。
  - `storeAudioAsset()` 写本地音频 asset，并在可用时同步 Supabase Storage。
  - `savePreparedSessionArtifacts()` 保存 sentences、word\_tokens、audio metadata。
- `useWorkspaceSessionRuntime()` 负责加载最近训练、模板、回放、删除历史和预取回放。
- 桌面端优先使用 `desktopBridge.trainingHistory`；Web 端调用 API routes。
- `ReaderStage` 根据 playback sentences 与 wordTokens 渲染逐词跟读舞台。
- `useAudioPlayback()` 管理 audio 元素、播放时间、重复播放和 fallback timing。
- `useActiveWord()` 根据 currentTimeMs 定位当前词。
- `PlaybackDock` 提供播放控制、进度、倍速、隐私模式、智能提醒和参考录音播放入口。
- `ArticlePreviewPanel` 对原文做词 token 化，双击单词调用 `/api/dictionary/lookup`，结果可保存到词本。
- `VoiceRecorderPanel` 使用 `MediaRecorder`，桌面失败时切到 `startWavRecording()` 兼容模式，录音保存到 IndexedDB。
- `TrainingSettingsPanel` 修改训练设置，写入兼容 localStorage 与 Zustand storage。
- `MeetingMaterialPanel`、`RehearsalStage`、`ReadinessPanel` 当前主要是技术会议演练 UI 占位；数据 schema 和材料 API 已经存在。

### 7.5 音频生成与存储

功能：

- 云端 TTS。
- 本地语音引擎优先。
- Windows TTS fallback。
- 音频二进制存储与下载。

实现：

- `resolveSpeechProvider()` 根据训练设置、voiceProfile 和 `SHADOWING_VOXCPM_URL` 选择 provider。
- `OpenAISpeechProvider`：
  - 有 `OPENAI_API_KEY` 时调用 `gpt-4o-mini-tts` 生成 mp3。
  - 再调用 `gpt-4o-mini-transcribe` 获取 word timestamps。
  - 出错或无 transcript words 时 fallback 到 Windows TTS + 合成时间轴。
- `VoxCPMSpeechProvider`：
  - 调用 `${SHADOWING_VOXCPM_URL}/generate`。
  - 接收 base64 audio、contentType、durationMs、transcriptWords。
- `local-windows-tts.ts`：
  - 通过 PowerShell `System.Speech.Synthesis.SpeechSynthesizer` 生成 wav。
  - 自动按 voiceId 选择 Microsoft voice candidates。
- `audio-storage.ts`：
  - 总是写入本地 DB asset 和 `.shadowing-data/audio`。
  - Supabase admin client 可用时创建/使用私有 bucket `shadowing-audio` 并上传。
  - API 返回音频时按 DB asset、本地文件、Supabase Storage 的顺序读取。

### 7.6 词典、词本和句本

功能：

- 离线查词。
- 保存单词。
- 保存句子。
- 导出词本/句本。
- 词句与源材料笔记建立关联。

实现：

- `wordnet-dictionary.ts` 使用 `wordpos` 查询 WordNet。
- 查词会做英文单词格式校验，按词性聚合 definitions，收集 synonyms。
- `local-wordbook-store.ts` 使用 localStorage key `english-shadowing-wordbook`。
- `local-sentencebook-store.ts` 使用 localStorage key `english-shadowing-sentencebook`。
- `useWorkspaceLibraryRuntime()` 负责刷新、保存、删除、导出词句。
- 保存词句时，`WorkspaceShell` 会调用 `appendWordToSourceMaterialNote()` 或 `appendSentenceToSourceMaterialNote()` 写回源材料笔记。
- 服务层中也有 `WordbookService` 和 `WordbookRepository`，用于较新的 DI 架构；部分 UI 仍保留兼容 storage 文件。

### 7.7 学习记忆与源材料笔记

功能：

- 将每次导入材料保存为结构化 Markdown source note。
- 自动把收藏词句附加到 source note。
- 根据当前材料召回相关词、句、笔记。
- 一键创建 learning note。
- 复制 AI review prompt。

实现：

- `saveSourceMaterialNote()` 生成 `Sources/{slug}--source-{hash}.md`。
- source note frontmatter 包含 `type: source-material`、`sourceType`、`sourceUrl`、`audioPath`、tags。
- 正文包含 Original、Sentences、Excerpts、Vocabulary、Notes。
- `buildRelatedMemory()` 用 token overlap 对 saved sentences、saved words、notes、sessions 打分排序。
- `useWorkspaceLearningMemory()` 读取 notes storage、词本、句本，生成 recallItems。
- `buildLearningNoteMarkdown()` 生成新的 learning note。
- `buildLearningAiContextPrompt()` 将材料、词句、召回原因整理成最多 6000 字的 AI prompt。

### 7.8 Markdown 笔记工作台

功能：

- Desktop/browser/mobile 三端 vault。
- Markdown 文件列表、打开、创建、重命名、删除。
- 自动保存。
- 写入冲突检测。
- 搜索、最近文件、backlinks、outline、properties、learning panel。
- 命令面板。
- 桌面终端。
- Notes MCP bridge。
- Vault 导出。

实现：

- `/notes` 动态加载 `NotesPageClient`，其内部调用 `useNotesWorkbenchFacade()`。
- `useNotesRuntime()` 根据 runtime 选择：
  - desktop：`createDesktopVaultClient(createDesktopVaultService(bridge))`
  - native：`createMobileVaultClient()`
  - web：`createBrowserVaultClient()`
- browser vault 优先使用 File System Access API；不可用时使用 localStorage key `shadowing-browser-vault-v2`。
- Electron vault 通过 `desktopBridge.vault` 操作真实目录，并由 `fs.watch` 推送变更。
- `vault-store.ts` 负责读取 entries、documents、backlinks 和 snapshot。
- `markdown-codec.ts` 解析/序列化 frontmatter、标题、兼容 block。
- `markdown-index.ts` 提取 headings、tasks、tags、wiki links、word count。
- `notes-reading-blocks.tsx` 将 Markdown 渲染成阅读块，支持 heading、TOC、task list、ordered/unordered list、quote、callout。
- `useNotesDocuments()`：
  - 合并 snapshot documents 与 live draft。
  - 180ms debounce 更新衍生文档/backlinks。
  - 360ms debounce 自动保存。
  - `safeWriteVaultFile()` 做 expected source 校验，冲突时生成 `VaultWriteConflict`。
- `useNotesActions()` 处理创建、重命名、删除、选择目录、运行桌面命令。
- `buildNotesCommandPalette()` 把固定命令、最近文件和所有文档转成命令面板项。
- `notes-mcp-request-handler.ts` 支持 `document.getSource`、`editor.focus`、`editor.revealLine`、`selection.get`、`selection.insertSnippet`、`selection.set`。
- `electron/notes-mcp-bridge.cjs` 在 `127.0.0.1` 上启动 WebSocket JSON-RPC bridge，并用随机 token 授权。
- `NotesTerminalPanel` 使用 `desktopBridge.terminal` 与 xterm 生态组件提供多 session 终端。

### 7.9 发音评估

功能：

- 发音评估 API。
- 纠音历史页面。
- 桌面与浏览器本地历史存储。
- 复制评估结果。

实现：

- `/api/assessment/pronunciation` 接收 FormData：`referenceText`、`locale`、`audio`。
- 支持 `wav/mp3/ogg/flac`。
- `evaluatePronunciationAssessment()` 调用 Azure Speech REST endpoint：
  - Header `Pronunciation-Assessment` 用 base64 JSON，开启 HundredMark、Phoneme、EnableMiscue。
  - 解析 `NBest[0].PronunciationAssessment` 得出 overall、accuracy、fluency、completeness。
  - 解析 Words 得出词级 accuracy 与 errorType。
- `AssessmentShell` 当前展示历史记录，不直接内置“新评估”录制流程。
- browser 历史保存在 localStorage key `shadowing-pronunciation-assessments`。
- desktop 历史通过 `desktopBridge.assessmentHistory` 写入 Electron local history repository。

### 7.10 AI Dock

功能：

- 右侧 AI Dock hover/reveal。
- 打开/关闭、宽度调整、provider 切换。
- provider surface。
- Prompt library。
- Chat history。
- 导入默认 prompt、收藏、搜索、导出。
- 捕获当前 AI provider 会话。

实现：

- `DesktopAiDockShell` 仅在桌面 bridge 存在时渲染。
- `useAiDockVisibility()` 管理 hover/focus 露出逻辑。
- `useAiDockLayoutSync()` 计算 panel width、layout reservation、provider host bounds，并同步到 `desktopBridge.aiDock.syncLayout()`。
- `electron/runtime-state-db.cjs` 持久化 AI Dock 状态。
- `electron/ai-view-manager.cjs` 与主进程管理 provider view。
- `electron/ai-library-db.cjs` 使用 SQLite 表 `ai_prompt_library` 和 `ai_chat_history`。
- `useAiDockPrompts()` 调用 `desktopBridge.aiPrompts` 完成搜索、收藏、默认库导入、导出。
- `useAiDockHistory()` 调用 `desktopBridge.aiHistory` 完成会话列表、搜索、收藏、导出和捕获。
- `electron/ai-extractors/*` 为不同 AI provider 提供会话抽取脚本。

### 7.11 本地视频库

功能：

- 选择视频库目录。
- 导入本地视频文件。
- 刷新文件状态。
- 浏览视频卡片。
- 详情页播放源视频。
- 倍速与 variant 选择。
- 保存视频元数据和 poster thumbnail。
- 预留 transcript/chaptering/quality-ladder AI 任务位。

实现：

- `DesktopVideoLibraryShell` 通过 `getDesktopVideoLibraryBridge()` 读取 `desktopBridge.videoLibrary`。
- Electron 侧 `video-library-db.cjs` 使用 SQLite：
  - `video_items`
  - `video_variants`
  - `video_thumbnails`
  - `video_analysis_jobs`
- 导入时用源文件绝对路径 sha1 生成 video id，存储策略是 `reference`，不复制原始视频。
- 每个视频自动创建 source variant 和默认 analysis jobs。
- `video-media-protocol.cjs` 注册 `shadowing-media://` 协议，供播放器读取本地文件。
- 详情页 `onLoadedMetadata` 读取 video 元数据并调用 `updateSourceMetadata()` 回写 duration/width/height。
- `refreshLibrary()` 会检查源文件是否仍存在，更新 `ready/missing` 状态。

### 7.12 技术会议演练材料

功能：

- 会议材料 schema。
- 会议材料创建/列表 API。
- 工作区中的材料说明、Q\&A rehearsal、readiness review UI。

实现：

- `meeting-drill-schemas.ts` 定义材料、生成 drill、问题、timeline、phrase bank、回答尝试等 schema。
- `/api/meeting-drill/materials` 使用 `createMeetingMaterialSchema` 校验，最大文本 120000 字符。
- `meeting-drill-repository.ts` 当前使用本地 persistence backend。
- UI 组件 `MeetingMaterialPanel`、`RehearsalStage`、`ReadinessPanel` 当前展示固定引导/占位数据；生成 drill 的实际 API 尚未接入。

### 7.13 插件系统

功能：

- 桌面插件目录。
- manifest 校验。
- 启用/禁用插件。
- 插件注册命令。
- Notes terminal panel 可显示和运行桌面命令。

实现：

- 插件目录默认在桌面配置下的 `.shadowing/plugins`。
- 插件 manifest 由 `plugin-manifest.ts` 用 Zod 校验：`id/name/version/main`。
- `plugin-host.ts` 通过 CommonJS `require(entryPath)` 加载插件。
- 插件入口必须导出 `activate(api)` 或 default function。
- `PluginApi.registerCommand()` 注册 `{ id, title, run }`。
- Electron 主进程暴露 `shadowing:plugins:*` 和 `shadowing:commands:*` IPC。

### 7.14 课程、社区、音频、文档、设置、词条展示页

这些页面当前更偏“桌面产品壳/信息架构展示”，主要依赖 fixture 数据：

- `CoursesShell`：课程概览、周训练节奏、课程卡片。
- `CommunityShell`：社区分类、标签、热榜、话题列表。
- `AudioPage`：音频资源库概览。
- `DocumentsPage`：文档资源库概览。
- `SettingsShell`：设置分组展示。
- `DesktopWordbookShell`：重点词条展示。

实现数据位于 `components/runtime/desktop-shell-fixtures.ts`，后续如果要接真实数据，应优先替换 fixture 来源，而不是重写页面结构。

### 7.15 Billing 与 Native 服务

功能：

- Web/native billing service 抽象。
- Native purchase restore 预留。
- entitlement API。

实现：

- `createBillingService()` 根据 `detectRuntime()` 返回 native 或 web service。
- Web billing 当前返回 unsupported。
- Native billing 尝试读取 `Capacitor.Plugins.Billing`，没有产品映射时返回空列表。
- `/api/billing/entitlements` 当前返回空 entitlements，但会标记当前用户是否支持。

## 8. 数据模型与持久化

### 8.1 Supabase/PostgreSQL

初始迁移创建：

- `profiles`
- `sessions`
- `sentences`
- `word_tokens`
- `templates`
- Storage bucket `shadowing-audio`

RLS 迁移：

- `profiles` 仅用户本人读写。
- `sessions` 仅 session owner 读写删。
- `sentences` 通过 session owner 判断。
- `word_tokens` 通过 sentence -> session owner 判断。
- `templates` 认证用户可读。
- `storage.objects` 中 `shadowing-audio/sessions/{sessionId}.*` 仅 owner 可读写。

Profile 扩展：

- `account_identifier`
- `account_type`
- `updated_at`
- `last_login_at`
- `profiles_account_identifier_idx`

### 8.2 本地数据

| 存储                             | 文件/Key/DB                                                   | 内容                                                 |
| ------------------------------ | ----------------------------------------------------------- | -------------------------------------------------- |
| Local session JSON             | `.shadowing-data/session-store.json`                        | sessions、sentences、wordTokens、authProfiles         |
| Local audio files              | `.shadowing-data/audio/{sessionId}.{ext}`                   | 训练音频二进制与 metadata                                  |
| Wordbook localStorage          | `english-shadowing-wordbook`                                | 保存单词                                               |
| Sentencebook localStorage      | `english-shadowing-sentencebook`                            | 保存句子                                               |
| Training settings localStorage | `english-shadowing-training-settings` 和 `training-settings` | 训练设置兼容存储                                           |
| Pronunciation localStorage     | `shadowing-pronunciation-assessments`                       | 浏览器纠音历史                                            |
| Recordings IndexedDB           | DB `shadowing-studio`, store `local-recordings`             | 用户录音 Blob                                          |
| Browser vault localStorage     | `shadowing-browser-vault-v2`                                | 无 File System Access 时的 Markdown vault fallback    |
| Electron runtime SQLite        | `shadowing-runtime-state.db`                                | last workspace、resume target、AI Dock、window bounds |
| Electron AI SQLite             | `shadowing-ai-library.db`                                   | prompt library、AI chat history                     |
| Electron video SQLite          | `shadowing-video-library.db`                                | video items、variants、thumbnails、analysis jobs      |
| Electron local history SQLite  | `shadowing-local-history.db`                                | training history、assessment history                |

## 9. 架构模式

### 9.1 页面 shell 与业务模块分离

`src/app/*/page.tsx` 通常只负责读取 params/searchParams 和选择 shell。实际业务在：

- `src/components/*`
- `src/features/*`
- `src/platform/*`
- `src/server/repositories/*`

这样可以让路由层保持薄，便于组件测试和 runtime 适配。

### 9.2 服务层与 DI

`src/lib/di/service-container.ts` 提供 lazy singleton service container。

当前已注册：

- `SESSION_REPOSITORY`
- `WORDBOOK_REPOSITORY`
- `SESSION_SERVICE`
- `WORDBOOK_SERVICE`

`SessionService` 和 `WordbookService` 负责输入验证、业务错误包装和 repository 调用。部分 UI 仍直接使用旧的 local storage helper，项目处于渐进迁移状态。

### 9.3 状态分层

- 临时 UI 状态：组件内 `useState`。
- 客户端持久 UI：`src/stores/app-store.ts` 中的 Zustand stores。
- 服务端数据缓存：TanStack Query client。
- 本地优先数据：Vault client、localStorage、IndexedDB、Electron SQLite。

Zustand store 包括：

- `useTrainingSettingsStore`
- `useWorkspaceUIStore`
- `useNotesUIStore`
- `useAIDockStore`
- `useAppPreferencesStore`
- `useNotesVaultStore`

### 9.4 平台适配层

`detectRuntime()` 输出 `web/desktop/ios/android`。

平台服务按 runtime 分发：

- 文件导出：desktop/native/web。
- 通知：native/web。
- Vault：desktop/browser/mobile。
- Billing：native/web。
- 桌面专属：Electron bridge。

## 10. 安全与边界处理

- `.env.example` 保持空值，所有真实 secret 放 `.env.local` 或部署环境变量。
- `scripts/check-secrets.mjs` 检查：
  - `.env.example` 是否列全关键环境变量。
  - `.env*` 是否 git ignored。
  - 源码中是否有 OpenAI/Supabase/Azure key 字面量。
- `/api/import-url` 明确阻止 localhost、127.0.0.1、::1，降低 SSRF 风险。
- API route 使用 Zod 做边界校验。
- Session/audio/playback/delete API 使用 `requireSessionOwner()` 或 desktop local request 判断。
- Supabase RLS 是云端数据隔离的最终防线。
- Audio API 返回 `Cache-Control: no-store`。
- Electron terminal、MCP、AI library 等敏感 IPC 多处使用 `requireTrustedDesktopEvent()`。
- Notes MCP bridge 只监听 `127.0.0.1`，并使用随机 token + timingSafeEqual 授权。
- Vault 文件操作通过 `resolveVaultTarget()` 限制在所选 vault 内。

## 11. 环境变量

| 变量                               | 用途                                        |
| -------------------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       | 浏览器 Supabase URL                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | 浏览器 Supabase anon key                     |
| `SUPABASE_SERVICE_ROLE_KEY`      | 服务端 Supabase admin 操作                     |
| `OPENAI_API_KEY`                 | OpenAI TTS/STT                            |
| `AZURE_SPEECH_KEY`               | Azure 发音评估                                |
| `AZURE_SPEECH_REGION`            | Azure Speech region                       |
| `SHADOWING_VOXCPM_URL`           | 本地 VoxCPM 语音引擎                            |
| `SHADOWING_VOXCPM_MODEL_VERSION` | VoxCPM 模型版本标识                             |
| `CAPACITOR_SERVER_URL`           | Capacitor native shell 加载的 Next.js server |

## 12. 开发与验证命令

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test
npm run playwright:test
npm run security:secrets
```

桌面端：

```bash
npm run desktop:dev
npm run desktop:start
```

移动端：

```bash
npm run mobile:doctor
npm run mobile:add:android
npm run mobile:add:ios
npm run mobile:sync
```

数据库：

```bash
npm run migration:status
npm run migration:up
npm run migration:down
npm run migration:create
npm run db:check
npm run db:sync
npm run db:sync-sqlite
```

## 13. 测试覆盖结构

| 目录                          | 覆盖内容                                                                    |
| --------------------------- | ----------------------------------------------------------------------- |
| `tests/unit/api`            | API routes，如 sessions、templates、dictionary、assessment、meeting materials |
| `tests/unit/audio`          | speech provider、voice options、timestamp mapping、Windows TTS             |
| `tests/unit/auth`           | demo auth                                                               |
| `tests/unit/notes`          | vault、markdown codec、backlinks、rename、safe write、MCP request handler    |
| `tests/unit/electron`       | Electron DB、AI Dock、terminal、video library、voice engine                 |
| `tests/unit/platform`       | runtime、file export、notification、desktop bridge                         |
| `tests/component/workspace` | workspace shell、source panel、wordbook/sentencebook/recorder panels      |
| `tests/component/notes`     | notes workbench、editor、panels                                           |
| `tests/component/video`     | video library/detail shell                                              |
| `tests/e2e`                 | App smoke、desktop sidebar、notes workbench/localization/editor flows     |
| `tests/migrations`          | migration 脚本与 SQL 管理                                                    |

Vitest 配置在 `vitest.config.ts`，Playwright 配置在 `playwright.config.ts`。

## 14. 当前实现状态与注意点

- 训练工作区、音频生成、词级高亮、词句收藏、录音、source note、学习记忆是当前最完整的学习闭环。
- 笔记工作台已经具备较完整的本地优先架构：vault client、autosave、conflict、backlinks、command palette、terminal、MCP bridge。
- Electron 桌面能力较丰富，但 Web 环境会降级；文档、视频、AI Dock、终端等功能需要桌面 bridge 才完整。
- 会议演练的 schema 和材料 API 已有，但 Q\&A 生成、答题记录、phrase bank 等还没有完整 UI/生成 API 闭环。
- 纠音评估 API 已有，`/assessment` 页面当前主要是历史展示，“新评估”按钮尚未接具体动作。
- 课程、社区、音频资源库、文档资源库、设置页、独立词条页当前主要使用 fixture 数据。
- 服务层和状态层处在迁移后期与兼容期：新代码有 DI/Zustand/TanStack Query，部分旧 UI 仍直接调用 localStorage helper。
- `DEFAULT_VOICE_PROFILE_ID` 在 `stores/app-store.ts` 中为 `alloy`，而 `voice-profile-options.ts` 中默认 profile 是 `openai-female`；兼容层会做 voice profile 解析，后续整理音色设置时建议统一命名。

## 15. 后续开发建议

1. 如果继续推进技术会议演练，优先补齐 `generateMeetingDrill` API、drill run repository、answer attempt UI，再把 `RehearsalStage` 从占位数据切到真实 run。
2. 如果继续推进纠音，优先把 `/api/assessment/pronunciation` 接入工作区录音或独立评估表单，并将结果保存到 desktop/browser storage。
3. 如果整理服务层，优先让 wordbook/sentencebook/session UI 统一走 service/query hooks，减少兼容 helper 分叉。
4. 如果推进云端同步，需要明确 Supabase 与本地 Electron SQLite/JSON 的冲突策略，目前已有 migration 和 consistency 脚本基础。
5. 如果开放插件生态，需要为插件目录、命令能力、可访问 API 和异常隔离补充安全策略与开发者文档。

