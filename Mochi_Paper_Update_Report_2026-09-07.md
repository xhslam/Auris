# 笑来老师开源项目（Mochi 与 Paper）更新与本地应用升级报告

> **报告时间**：2026-09-07  
> **涉及仓库**：
> - [xiaolai/mochi](https://github.com/xiaolai/mochi)（本地源码：`/Users/apple/Desktop/xiaolai-source/mochi`）
> - [xiaolai/paper-one](https://github.com/xiaolai/paper-one)（本地源码：`/Users/apple/Desktop/xiaolai-source/paper-one`）
> **本地应用升级**：
> - `/Applications/Mochi.app`：`v0.1.19` ➔ **`v0.1.20`**（Apple Developer ID 官方公证签名）
> - `/Applications/Paper.app`：`v0.2.0` ➔ **`v0.2.3`**（Tauri 本地原生优化编译构建）

---

## 目录
1. [执行概览与应用状态](#一执行概览与应用状态)
2. [项目一：Mochi (v0.1.19 ➔ v0.1.20 及架构重大拆分)](#二项目一mochi-v0119--v0120-及架构重大拆分)
   - [1. 桌面端终版更新 v0.1.20：多人在场防打断与响应节奏](#1-桌面端终版更新-v0120多人在场防打断与响应节奏)
   - [2. 关键架构转折：桌面端退役与 mochi-avatar 角色引擎独立](#2-关键架构转折桌面端退役与-mochi-avatar-角色引擎独立)
3. [项目二：Paper (v0.2.0 ➔ v0.2.3 连续演进)](#三项目二paper-v020--v023-连续演进)
   - [1. v0.2.1：多格式语料扩展与自动化门禁强化](#1-v021多格式语料扩展与自动化门禁强化)
   - [2. v0.2.2：手机端离线阅读内核与同步调度重构](#2-v022手机端离线阅读内核与同步调度重构)
   - [3. v0.2.3：后台唤醒锁屏修复与测试桩安全审计](#3-v023后台唤醒锁屏修复与测试桩安全审计)
4. [本地应用打包与替换细节](#四本地应用打包与替换细节)
5. [对当前工作区（Auris）的启示与后续建议](#五对当前工作区auris的启示与后续建议)

---

## 一、执行概览与应用状态

本次检查并同步了笑来老师 GitHub 上的两个核心项目最新源码，并全部完成本地应用的重新构建与安装替换：

| 项目 / 应用 | 升级前版本 | 升级后版本 | 源码更新 Commit / 分支 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **Mochi** (`/Applications/Mochi.app`) | `0.1.19` | **`0.1.20`** | `archive/app` (`441b6e6`)<br>`main` (`cbc4eb2`) | ✅ 已替换官方签署正式版 |
| **Paper** (`/Applications/Paper.app`) | `0.2.0` | **`0.2.3`** | `main` (`87819df`) | ✅ 已完成 Tauri 原生构建并替换 |

- **旧版备份位置**：
  - `/Applications/Mochi.app.backup-0.1.19`
  - `/Applications/Paper.app.backup-0.2.0`

---

## 二、项目一：Mochi (v0.1.19 ➔ v0.1.20 及架构重大拆分)

### 1. 桌面端终版更新 v0.1.20：多人在场防打断与响应节奏

* **核心提交**：`7490218` (*hearing: any voice in the room ended her sentence, and nothing could say otherwise*) 与 `441b6e6` (*chore(release): v0.1.20*)
* **解决痛点**：真实多子女家庭 / 团队桌面环境测试反馈。当一个房间里有多个孩子或多台 Mochi 时，麦克风会同时采集到房间里所有人的声音。原版的语义 VAD（`semantic_vad`）只要听到语音就会判定打断，导致 Nia/Mochi 刚说半句话就被隔壁桌的声音截断。

#### (1) 两项全新的「听力偏好（Hearing you）」控制项
1. **`Let anyone cut her off`（允许任何人打断）**：
   - 默认开启（维持原有交互体验）；
   - **关闭时**：向服务端发送 `interrupt_response: false`。无论房间里谁在说话，Mochi 都会坚持把当前整句话讲完，不再被无关闲聊误打断；
   - 界面明确提示取舍：关闭后用户自己的中途插话也会暂时被忽略，直到本轮表述结束。
2. **`How soon she answers`（回答前等待时长）**：
   - 控制分类器判定用户是否已说完话的等待门限；
   - 支持 **8 秒、4 秒、2 秒** 或 **服务自适应（Auto）**；
   - 嘈杂环境中可保持允许打断，但通过适当延长等待门限，避免外界噪音被误判为开始轮次。

#### (2) 内部架构改进
- 对话轮次判定完全解耦至 `src/shared/turn-taking.ts`；
- 优化了渲染门禁测试中对单选下拉框 `<select>` 与多选列表 `<select multiple>` 的危险操作判定规则。

---

### 2. 关键架构转折：桌面端退役与 mochi-avatar 角色引擎独立

在发布 `v0.1.20` 之后，笑来老师在提交 `86c74c5`（*package: the app is over, and she is the part worth keeping*）中对仓库结构进行了极其深远的调整：

> *"The desktop application is retired. It survives whole on `archive/app` at v0.1.20, and its releases are untouched... This branch becomes the thing the app was only ever a vehicle for."*

#### 关键事实与设计考量：
1. **桌面应用归档**：
   - 完整的 Electron 桌面伴侣应用已封板并归档于 `archive/app` 分支（版本定格在 `v0.1.20`）；
   - GitHub Releases 历史保留所有签名发布包；由于已安装应用内部包含发布源检查，未来不再在此仓库发布破坏现有客户端更新流的 Electron Releases。
2. **角色引擎独立（`mochi-avatar`）**：
   - 仓库 `main` 分支重构为独立 npm 库（初始命名 `@hando/mochi`，随后统一为 `mochi-avatar`），定位于轻量级、可嵌入任意 Web/Node/桌面项目的 AI 桌面伴侣角色引擎；
   - **双协议拆分（Dual Licensing）**：
     - **几何、物理与渲染引擎**（`src/` 核心）：采用宽松的 **MIT 协议**；
     - **角色与外观资产**（`src/characters/`）：采用保护性协议，允许在商业与自研产品中完整集成与使用，但禁止改名、单卖形象或注册为自身商标；
   - 包含完整的 8 个表情、6 款配色资产，以及每 5% 图像高度轮廓比对的 Conformance 自动化测试。

---

## 三、项目二：Paper (v0.2.0 ➔ v0.2.3 连续演进)

`xiaolai/paper-one`（即 Paper Reader）从 `v0.2.0`（`bd9c775`）连续迭代至 `v0.2.3`（`87819df`），主要成果集中在**离线移动端支持、全格式语料扩展与同步调度稳定性**：

### 1. v0.2.1：多格式语料扩展与自动化门禁强化
- **格式选择器补全（`411cb0e`）**：
  - 完整开放 5 种文档格式的选单（PDF、EPUB、MOBI、FB2、CBZ/AZW3）；
  - 新增真实样本测试集（`tests/fixtures/fixture.{azw3,cbz,epub,fb2,fbz,mobi}`）及格式语料自动化断言 `src/kernel/ui/reader/formats.corpus.test.ts`。
- **性能优化与架构修正（`d039d7c`, `2022ef7`）**：
  - 移除对半兆数据重复全量 Hash 的无谓开销；
  - 修复自动化桥接（automation bridge）的权限注册漏放缺陷；
  - 升级至 Vitest 4，消除了覆盖率流水线在部分极端场景下的测试挂起。

### 2. v0.2.2：手机端离线阅读内核与同步调度重构
- **手机端（Mobile）全离线本地存储（`8e1e586`, `fd1fe49`）**：
  - 增加 `src/app/mobile/localContent.ts`、`localMarks.ts`、`localPositions.ts`；
  - 移动端不再强制依赖桌面端实时在线，可从设备自身磁盘离线响应内容读取、高亮书签与阅读进度三大核心契约。
- **同步调度器（Satchel / Sync Scheduler）节拍优化（`f1ceb66`, `377c0fc`）**：
  - 修复此前“仅在应用启动时同步一次”以及临时网络中断后重试失败的缺陷，建立动态节拍调度与状态机重试。

### 3. v0.2.3：后台唤醒锁屏修复与测试桩安全审计
- **锁屏后台启动唤醒修复（`74f7a45`）**：
  - 修复在 macOS / iOS 锁屏或暗屏后台拉起应用时，由于渲染主循环未激活导致进程陷入永久挂起的问题。
- **路径前缀与测试桩安全性（`aa8db63`, `e74fdf3`）**：
  - 修复装饰性前缀与真实文件名 Basename 的混淆守卫；
  - 引入经过严格审计的幂等测试运行桩（可连续安全执行多次）。

---

## 四、本地应用打包与替换细节

1. **`/Applications/Mochi.app` 更新**：
   - 从 GitHub Releases 官方通道下载并提取 `Mochi-0.1.20-arm64-mac.zip`；
   - 校验 Apple Developer ID 签名（`Developer ID Application: HANDO K.K. (Y53RSUA3SM)`，包含苹果官方公证票据 Notarization Ticket）；
   - 备份旧版为 `/Applications/Mochi.app.backup-0.1.19` 后完成就地安装。
2. **`/Applications/Paper.app` 更新**：
   - 在本地仓库 `/Users/apple/Desktop/xiaolai-source/paper-one` 执行 `pnpm install` 同步最新依赖；
   - 运行 `pnpm tauri build` 重新编译前端（`pnpm build && pnpm build:web`）与 Rust 优化二进制；
   - 产出原生 macOS Bundle：`Paper.app`（版本 `0.2.3`）；
   - 备份旧版为 `/Applications/Paper.app.backup-0.2.0` 后完成就地安装。

---

## 五、对当前工作区（Auris）的启示与后续建议

1. **Auris 中的 Nia 桌面伴侣可直接吸收 Mochi v0.1.20 听力打断机制**：
   - Auris 现有的实时语音（WebRTC GPT-4o-realtime）会话同样可借鉴 `interrupt_response: false`（防打断）与 `eagerness` 等待时长配置，在家庭学习或多人讨论场景下提供更稳健的听力交互。
2. **关注 `mochi-avatar` 纯前端渲染库**：
   - 随着 Mochi 桌面端正式封板，其主分支已转变为纯粹的角色渲染引擎。Auris 未来若希望在阅读页或笔记页原位嵌入动态 Nia 形象（而非使用独立的 Electron 辅助窗口），可直接引入该库的轻量 Canvas / SVG 渲染器。
3. **Paper 的 5 格式语料测试与离线存储模型**：
   - Auris 的 Reading 模块若需要扩充对 AZW3、MOBI、FB2 的离线解析，可参考 Paper `v0.2.3` 的 `formats.corpus.test.ts` 与 `localContent.ts` 设计。
