# UI 设计系统与交互规范参考手册 (UI Design System & Heuristics Guide)

> **适用对象**：AI 编码智能体（AI Agents）、全栈开发者、前端工程师。  
> **核心渊源**：基于《Refactoring UI》（Adam Wathan & Steve Schoger）的核心思想沉淀，融合现代 Web 规范与工程化最佳实践。  
> **使用方式**：可直接在项目根目录、`AGENTS.md`、`CLAUDE.md` 或 System Prompt 中引用本规范，作为编写、重构或审查前端界面代码（Tailwind CSS / CSS / React / Vue 等）的执行基准。

---

## 目录
1. [Agent 执行准则 (Agent Prompt Directives)](#1-agent-执行准则-agent-prompt-directives)
2. [核心设计令牌 (Design Tokens)](#2-核心设计令牌-design-tokens)
   - [2.1 离散间距与尺寸体系 (Spacing & Sizing)](#21-离散间距与尺寸体系-spacing--sizing)
   - [2.2 文字排版与层级阶梯 (Typography)](#22-文字排版与层级阶梯-typography)
   - [2.3 色彩体系与 HSL 规则 (Color Architecture)](#23-色彩体系与-hsl-规则-color-architecture)
   - [2.4 空间高度与双层阴影 (Elevation & Dual-Layer Shadows)](#24-空间高度与双层阴影-elevation--dual-layer-shadows)
   - [2.5 圆角与表面材质 (Radii & Surfaces)](#25-圆角与表面材质-radii--surfaces)
3. [视觉层级与排版铁律 (Hierarchy & Layout Rules)](#3-视觉层级与排版铁律-hierarchy--layout-rules)
   - [3.1 负向强调法 (De-emphasis)](#31-负向强调法-de-emphasis)
   - [3.2 格式塔邻近律与去含糊间距](#32-格式塔邻近律与去含糊间距)
   - [3.3 标签是下策 (Labels as Last Resort)](#33-标签是下策-labels-as-last-resort)
   - [3.4 解耦语义与视觉层级](#34-解耦语义与视觉层级)
   - [3.5 抗击栅格原教旨与大屏填满综合征](#35-抗击栅格原教旨与大屏填满综合征)
4. [战术级组件设计指南 (Tactical Component Guidelines)](#4-战术级组件设计指南-tactical-component-guidelines)
   - [4.1 操作按钮金字塔 (Action Pyramid)](#41-操作按钮金字塔-action-pyramid)
   - [4.2 表单与输入控件 (Forms & Inputs)](#42-表单与输入控件-forms--inputs)
   - [4.3 卡片与容器表面 (Cards & Panels)](#43-卡片与容器表面-cards--panels)
   - [4.4 数据表格与列表 (Tables & Lists)](#44-数据表格与列表-tables--lists)
   - [4.5 空状态第一等公民 (Empty States)](#45-空状态第一等公民-empty-states)
   - [4.6 图片与 UGC 防御体系 (Images & UGC Defence)](#46-图片与-ugc-防御体系-images--ugc-defence)
5. [AI Agent UI 避坑与自检清单 (Anti-Patterns Checklist)](#5-ai-agent-ui-避坑与自检清单-anti-patterns-checklist)
6. [即插即用配置预设 (Drop-in Tailwind & CSS Presets)](#6-即插即用配置预设-drop-in-tailwind--css-presets)

---

## 1. Agent 执行准则 (Agent Prompt Directives)

当你在编写或重构前端 UI 组件时，必须严格遵守以下执行纪律：

1. **离散令牌优先**：绝不随意发明连续数值（如 `padding: 13px;`、`color: #4a515a;`）。所有间距、字号、颜色、阴影必须来自第 2 节的离散令牌阶梯。
2. **做减法而非做加法**：当元素不够突出时，优先**弱化竞争元素**（降低非激活态对比度、移除冗余边框），而不是直接把目标加大、加粗、加红。
3. **物理直觉与光学平衡**：光线默认从正上方照射；深色图标在视觉上重于文本，必须降低图标对比度以达平衡；不同字号混排必须按基线对齐。
4. **防御性设计**：永远假设数据可能为空（空状态优先）、标题可能极长（断行与截断防范）、用户上传图片可能白底且构图糟糕（容器固定、内描边防渗色）。
5. **悲观交付切片**：从一个真实的核心功能开始，延迟全局外壳设计；不做无技术支撑的画饼交互。

---

## 2. 核心设计令牌 (Design Tokens)

### 2.1 离散间距与尺寸体系 (Spacing & Sizing)
非线性增长：小尺寸端密度高（微调显著），大尺寸端跨度大（相对变化率需 ≥ 25%）。以 `16px (1rem)` 为基准。

| Token | 像素值 | Tailwind 类名 | 典型应用场景 |
| :--- | :--- | :--- | :--- |
| `space-1` | 4px | `p-1`, `gap-1` | 图标与文字间隙、紧凑 Badge 内边距 |
| `space-2` | 8px | `p-2`, `gap-2` | 按钮内部元素间隙、表单 Label 与 Input 纵向间距 |
| `space-3` | 12px | `p-3`, `gap-3` | 紧凑按钮纵向内边距、小卡片内边距 |
| `space-4` | 16px | `p-4`, `gap-4` | **标准基准**：默认按钮横向内边距、标准表单项间距 |
| `space-6` | 24px | `p-6`, `gap-6` | 表单组（Form Groups）之间间距、标准卡片内边距 |
| `space-8` | 32px | `p-8`, `gap-8` | 页面区块（Sections）间距、大卡片内边距 |
| `space-12`| 48px | `p-12`, `gap-12` | 页面主要区域留白、空状态（Empty State）呼吸区域 |
| `space-16`| 64px | `p-16`, `gap-16` | Hero 区域上下 Padding、营销页大分块 |
| `space-24`| 96px | `p-24`, `gap-24` | 落地页通栏分段大间距 |

### 2.2 文字排版与层级阶梯 (Typography)
* **严禁使用 `em` 定义字号阶梯**（避免嵌套乘法失控），必须使用 `rem` 或 `px`。
* **正文行长控制**：单行 **45–75 个字符**（中文约 25–40 字），通过 `max-w-prose` 或 `max-w-[65ch]` 严格约束。
* **行高规律**：行高与字号成**反比**（小字号需宽松行高避免串行；超大标题需紧凑行高避免松散），行高与行长成**正比**。

| 级别 | 字号 (px / rem) | 行高 (Line Height) | 字重 (Weight) | 字距 (Tracking) | 适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `text-xs` | 12px (0.75rem) | 1.5 (18px) | 500 / 600 | `tracking-wide` | 辅助标注、徽章、上角标 |
| `text-sm` | 14px (0.875rem)| 1.5 (21px) | 400 / 500 | normal | 次要说明、表格数据、紧凑表单 |
| `text-base`| 16px (1.0rem)  | 1.5–1.6 (24px) | 400 (正文), 600 (加粗) | normal | **默认基准**：段落正文、标准输入框 |
| `text-lg` | 18px (1.125rem)| 1.5 (27px) | 500 / 600 | normal | 卡片小标题、引言首段 |
| `text-xl` | 20px (1.25rem) | 1.4 (28px) | 600 | normal | 模态框标题、次级区块标题 |
| `text-2xl`| 24px (1.5rem)  | 1.3 (31px) | 600 / 700 | `tracking-tight`| 页面主标题、统计看板大指标 |
| `text-3xl`| 30px (1.875rem)| 1.2 (36px) | 700 | `tracking-tight`| 文章主标题、重要看板指标 |
| `text-4xl`| 36px (2.25rem) | 1.15 (41px)| 700 / 800 | `tracking-tight`| 落地页 Hero 标题 |
| `text-5xl`| 48px+ (3.0rem+)| 1.1 (52px) | 800 | `tracking-tighter`| 超大展示型标题 |

> [!TIP]
> **排版微调规则**：
> 1. 全大写英文字符（All-caps）：必须调大字距（`tracking-wider` 或 `0.05em`），字重建议 600+。
> 2. 大标题（24px+）：必须收紧字距（`tracking-tight`），行高压缩至 1.1–1.2。
> 3. 多字号同排对齐：必须声明 `items-baseline`，严禁 `items-center`。

### 2.3 色彩体系与 HSL 规则 (Color Architecture)
放弃简单的 5 色配置，产品级 UI 必须具备完整的色盘矩阵。

#### A. 灰阶色盘 (8-10 档，决定 90% 的界面质感)
* 绝不使用 `饱和度 0%` 的死灰，必须注入微量色温（冷灰注入微蓝 `H: 215-220`；暖灰注入微橙黄 `H: 35-40`）。
* 绝不在正文使用纯黑 `#000000`，深灰 `#0f172a` 或 `#111827` 显得更自然舒适。

| 色阶 | 用途定义 | 典型 CSS 属性 |
| :--- | :--- | :--- |
| `gray-900` / `950` | 主要文本、大标题 | `color: var(--gray-900)` |
| `gray-600` / `700` | 次要文本、正文辅助说明 | `color: var(--gray-600)` |
| `gray-400` / `500` | 占位符文字、图标次要色彩、第三级信息 | `color: var(--gray-400)` |
| `gray-300` | 聚焦态弱描边、次级分隔线 | `border-color: var(--gray-300)` |
| `gray-200` | 默认边框、卡片内部分割线 | `border-color: var(--gray-200)` |
| `gray-100` | 悬停背景、输入框禁用底色 | `background: var(--gray-100)` |
| `gray-50`  | 全局页面浅底色、斑马纹表格底色 | `background: var(--gray-50)` |
| `white`    | 卡片容器顶层、悬浮面板底色 | `background: #ffffff` |

#### B. 品牌主色与语义色阶（预设九档生成法）
1. **500 档（基准色）**：适合作为实心主按钮底色。
2. **900 档（深色两极）**：适合在浅色背景上的高对比度彩色文字。
3. **100/50 档（浅色两极）**：适合作为通知警示条或 Tag 的浅色背景。
4. **旋转色相防发脏（Hue Rotation）**：
   * 调亮时：向最近的亮色相（黄 60°、青 180°、品红 300°）旋转 5–15°，同时提升饱和度 S。
   * 调暗时：向最近的暗色相（红 0°、绿 120°、蓝 240°）微转，**尤其是黄色调深必须向橙红色旋转**，否则会呈现排泄物般的污浊灰绿色。

#### C. 彩色背景上的文字与 WCAG 无障碍
* **反转对比原则**：徽章（Badge）或状态提示不要用“深色高饱和底 + 白字”（抢主按钮视觉），改为“浅色底（100 档）+ 深色文字（800 档）”，既轻量又达到 WCAG 4.5:1。
* **彩色背景上的辅助文本**：严禁直接用灰色或半透明白。必须以背景色为基准，提取同色相并微调明度与饱和度。

### 2.4 空间高度与双层阴影 (Elevation & Dual-Layer Shadows)
高质量阴影必须由**两层**叠加构成：
1. **外层漫反射层**：大偏移、大模糊、低透明度（模拟直射光）。
2. **内层环境光遮蔽层 (Contact Shadow)**：极小偏移（1-2px）、小模糊、较高透明度（模拟物体根部遮挡）。

```css
/* 双层阴影规范 */
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05); /* 基础按钮、小输入框 */

--shadow-md: 
  0 4px 6px -1px rgba(0, 0, 0, 0.08), 
  0 2px 4px -2px rgba(0, 0, 0, 0.04); /* 卡片默认状态、操作悬浮小浮层 */

--shadow-lg: 
  0 10px 15px -3px rgba(0, 0, 0, 0.08), 
  0 4px 6px -4px rgba(0, 0, 0, 0.03); /* 下拉菜单、激活/拖拽中卡片 */

--shadow-xl: 
  0 20px 25px -5px rgba(0, 0, 0, 0.10), 
  0 8px 10px -6px rgba(0, 0, 0, 0.04); /* 模态对话框 (Modals) */
```

### 2.5 圆角与表面材质 (Radii & Surfaces)
* **圆角风格全局一致**：一个系统内严格统一基调，绝不混用直角与大圆角。
  * `rounded-md (6px)`：严谨专业、企业级中后台。
  * `rounded-xl (12px)` / `rounded-2xl (16px)`：消费级 SaaS、现代移动端产品。
  * `rounded-full (9999px)`：胶囊按钮、头像、Badge 标签。
* **微质感光源模拟（光从上方来）**：
  * **凸起元素（按钮）**：`box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.2)`（顶沿迎光亮线）。
  * **内凹元素（输入框）**：`box-shadow: inset 0 1px 2px 0 rgba(0, 0, 0, 0.06)`（内顶沿遮蔽暗影）。

---

## 3. 视觉层级与排版铁律 (Hierarchy & Layout Rules)

### 3.1 负向强调法 (De-emphasis)
> **原则：当你想要某个元素更显眼，而又无法再强化它时，去弱化它周围的竞争者。**
* 激活态 Tab 不够明显？把未选中的 Tab 文本透明度降到 60%，或去掉背景。
* 内容区被侧边栏喧宾夺主？把侧边栏背景改成与整页背景一致，移除实心底色。
* 主要按钮不够跳脱？把同一行所有的“次要按钮”从实心背景降级为透明描边或纯幽灵链接。

### 3.2 格式塔邻近律与去含糊间距
> **原则：组外间距必须显著大于组内间距（Outer Spacing >> Inner Spacing）。**
* **表单控件**：`Label 到 Input 的间距 (8px)` 必须远小于 `Input 到下一组 Label 的间距 (24px)`。
* **内容标题**：`Section 标题到底部正文的间距 (12px)` 必须小于 `标题到上方前序内容的间距 (32px)`。
* **列表项目**：列表项之间的间距必须大于单项内部文字的行距，杜绝粘连。

### 3.3 标签是下策 (Labels as Last Resort)
* **能自解释的数据坚决不加前缀标签**：
  * ❌ `Email: support@example.com` → ✅ `support@example.com`
  * ❌ `Price: $299` → ✅ `$299`
* **将标签融于数值**：
  * ❌ `Stock: 5` → ✅ `5 left in stock`
  * ❌ `Bathrooms: 2` → ✅ `2 baths`
* **不得不展示标签时**：将标签字号调小至 `text-xs`，字重加粗 `font-medium`，颜色设为次级灰 `text-gray-500`，数值使用主要字号 `text-base font-semibold text-gray-900`。

### 3.4 解耦语义与视觉层级
* HTML 的 `<h1>` - `<h6>` 标签仅代表文档大纲结构，**绝不绑定字号**。
* 应用界面（App UI）中的局部标题（如面板标题 `Account Settings`）实质是辅助性标签，字号应克制收敛在 `text-base` 或 `text-lg`，让内部具体操作和数据成为视觉重心。

### 3.5 抗击栅格原教旨与大屏填满综合征
* **侧边栏必须固定宽度**：例如 `w-64 (256px)` 或 `w-72 (288px)`，严禁给侧栏设置 `25%` 这类弹性百分比（会导致小屏截断、大屏过阔）。
* **表单与卡片使用 `max-width` 防过宽**：在桌面端使用 `max-w-md (448px)` 或 `max-w-xl (576px)` 限制表单，超出区域居中留白，不要为了通栏而拉扁表单。
* **非线性跨端响应**：大屏上的大尺寸元素（如 48px 大标题）在移动端必须加速缩减（缩小 50% 变成 24px），而小元素（14px 正文）在移动端基本保持不变（14px 或 13px）。

---

## 4. 战术级组件设计指南 (Tactical Component Guidelines)

### 4.1 操作按钮金字塔 (Action Pyramid)
一屏界面中，操作动作必须存在严格的层级排序：

```
      ▲
     / \     1. Primary: 实心高亮饱和主色 (一屏通常仅 1 个)
    /   \    2. Secondary: 描边 / 浅灰微底色 (中等频次操作)
   /     \   3. Tertiary: 纯文本 / 幽灵链接 (低频/取消操作)
  /_______\  Destructive: 常态为 Secondary/Tertiary，弹窗确认时才转为 Primary 红色
```

* **主要按钮 (Primary Button)**：
  ```html
  <button class="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg shadow-sm">
    Save Changes
  </button>
  ```
* **次要按钮 (Secondary Button)**：
  ```html
  <button class="bg-white hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg border border-gray-300 shadow-sm">
    Export Data
  </button>
  ```
* **三级按钮 (Tertiary Button)**：
  ```html
  <button class="text-gray-600 hover:text-gray-900 font-medium px-3 py-2">
    Cancel
  </button>
  ```
* **破坏性操作 (Destructive Action)**：
  在页面列表常态下：使用 `text-red-600 hover:text-red-700 hover:bg-red-50`（次级/幽灵态）；仅在“确认删除”的二次确认 Modal 中，才使用 `bg-red-600 text-white` 实心大红主按钮。

### 4.2 表单与输入控件 (Forms & Inputs)
* **默认状态**：浅灰背景或纯白背景，搭配柔和灰色边框（`border-gray-300`），带有极轻微内顶沿遮蔽阴影。
* **聚焦状态 (Focus Ring)**：绝不保留浏览器原生生硬外框，使用两层光晕 `focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500`。
* **单选与复选**：放弃无聊的小圆点与默认勾选框。对于重要选择，重构成**带图标、标题和辅助说明的“可选择卡片”（Selectable Cards）**，选中时边框高亮并带有微底色。

### 4.3 卡片与容器表面 (Cards & Panels)
* **告别黑色重边框**：替代方案包括：
  1. 使用微妙的背底色差（如外层 `bg-gray-50`，卡片 `bg-white`）。
  2. 使用双层柔和阴影（`shadow-sm` 或 `shadow-md`）。
  3. 直接加大与其他容器的距离。
* **顶部彩色强调条（Accent Border）**：在卡片顶沿增加 `border-t-4 border-indigo-500`，瞬间提升界面的色彩丰富度与打磨精致感。

### 4.4 数据表格与列表 (Tables & Lists)
* **数值强制右对齐**：金额、百分比、日期数字必须一律 `text-right`，让小数点垂直对齐便于用户纵向比对大小。
* **复合单元格（Merge Columns）**：如果某些非排序字段信息高度关联，将其合并展示。例如：同一单元格内，首行显示“用户头像 + 姓名（加粗深色）”，次行紧跟“电子邮箱（灰色小字）”。
* **列表项目符号升级**：将原始无序列表黑点换成带业务含义的 SVG 小图标（绿色对勾、盾牌锁、向右小箭头）。

### 4.5 空状态第一等公民 (Empty States)
* **黄金三要素**：
  1. 契合业务语境的精美矢量插画或图标占位符；
  2. 清晰的空状态文案（标题告知“这里什么都没有”，说明文字阐述“为什么为空”）；
  3. **突出的主要操作行动呼吁（Call To Action Button）**，引导用户迈出第一步。
* **防御原则**：在尚未产生任何数据前，主动在 UI 上隐藏复杂的搜索框、高级筛选器和空 Tab 标签页。

### 4.6 图片与 UGC 防御体系 (Images & UGC Defence)
* **固定比例防畸变**：用户上传图片统一外包固定宽高容器，强制注入 `object-fit: cover`。
* **白底防渗色（White-on-white Bleed）**：用户可能上传纯白底商品图或头像。在容器上叠加极细的内阴影或半透明内描边：
  ```css
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  ```
* **图片叠放文字的动态范围护盾**：
  1. **暗色半透明遮罩**：`bg-black/40`。
  2. **正片叠底单色着色**：降对比度 → 纯黑白化 → `mix-blend-multiply` 叠加品牌主色。
  3. **文字背后光晕**：`text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5)`。
* **固有尺度尊严**：
  * ❌ 严禁把 16px 的微型线性 SVG 粗暴放大为 64px。**解法**：保持图标 20px，嵌套在 48px 带浅底色、圆角的外壳圆形/矩形容器内。
  * ❌ 严禁把 1440px 的全屏桌面截图硬缩小到 300px（文字全糊）。**解法**：截取局部操作细节，或用极简骨架线框替代。

---

## 5. AI Agent UI 避坑与自检清单 (Anti-Patterns Checklist)

当生成或重构代码完成后，Agent 必须逐条核对以下 15 条自检清单：

- [ ] **[自检 1：颜色]** 是否在彩色背景上使用了纯浅灰或透明白色文字？（若有，改为同色相微调明度）。
- [ ] **[自检 2：颜色]** 状态是否仅通过颜色区分？（若有，为色盲用户增加箭头、对勾、叹号等辅助图标）。
- [ ] **[自检 3：按钮]** 页面上是否存在多个并列的大实心高亮主按钮？（一屏通常仅保留 1 个主按钮，其余降级为次要或三级幽灵按钮）。
- [ ] **[自检 4：按钮]** 常态下的危险操作（如“删除账户”）是否被做成了常驻的大红按钮？（应降级为次级描边或文字链接，仅在二次确认模态框中亮起红色主按钮）。
- [ ] **[自检 5：排版]** 混用字号同行排列时，是否错误地使用了垂直居中对齐？（必须修改为 `items-baseline` 基线对齐）。
- [ ] **[自检 6：排版]** 超过 3 行的长段落是否被居中对齐了？（必须左对齐，或重写文案使其短于 2 行）。
- [ ] **[自检 7：排版]** 正文行长是否过宽溢出？（必须给文本块设置 `max-w-prose` 或 `max-w-[65ch]` 限制在 45-75 字符内）。
- [ ] **[自检 8：排版]** 超大标题的行高是否过松？（大标题字号自带视觉外边距，行高必须收紧至 1.1–1.2）。
- [ ] **[自检 9：排版]** 全大写文字是否忘记了加宽字距？（全大写英文字符必须配置 `tracking-wider`）。
- [ ] **[自检 10：表格]** 表格内的数值列（金额、百分比、计数）是否左对齐了？（数值列必须一律 `text-right`）。
- [ ] **[自检 11：间距]** 组外间距是否与组内间距相同甚至更小？（组外间距必须至少达到组内间距的 2 倍以上）。
- [ ] **[自检 12：布局]** 是否在宽屏桌面端把简单的表单拉伸到了通栏？（必须施加 `max-w-md` 或 `max-w-lg`）。
- [ ] **[自检 13：图标]** 是否将 16-24px 的微型图标强制放大到了 48px+？（应保持图标小尺寸，放入外层带底色的圆角容器中）。
- [ ] **[自检 14：边框]** 界面是否充斥着密集的深色 `1px` 黑边框像铁丝网？（移除冗余边框，使用浅底色块差、双层阴影或加大留白）。
- [ ] **[自检 15：UGC]** 用户头像或图片是否没有防渗色保护？（必须增加 `object-fit: cover` 与半透明内阴影环 `ring-1 ring-black/5`）。

---

## 6. 即插即用配置预设 (Drop-in Tailwind & CSS Presets)

### A. Tailwind CSS 配置推荐扩展 (`tailwind.config.js`)
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      spacing: {
        '4.5': '1.125rem', // 18px
        '18': '4.5rem',    // 72px
      },
      lineHeight: {
        'tight-title': '1.15',
      },
      letterSpacing: {
        'tight-title': '-0.025em',
      },
      boxShadow: {
        'soft-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'soft-md': '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
        'soft-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.03)',
        'soft-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.10), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
        'inner-light': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2)',
        'inner-dark': 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      },
    },
  },
};
```

### B. 核心设计变量 (`design-tokens.css`)
```css
:root {
  /* 注入冷色温的现代灰阶 (Cool Slate) */
  --gray-50:  hsl(210, 20%, 98%);
  --gray-100: hsl(210, 15%, 95%);
  --gray-200: hsl(210, 14%, 89%);
  --gray-300: hsl(210, 14%, 80%);
  --gray-400: hsl(210, 12%, 65%);
  --gray-500: hsl(210, 10%, 50%);
  --gray-600: hsl(215, 14%, 34%);
  --gray-700: hsl(215, 18%, 23%);
  --gray-800: hsl(215, 25%, 15%);
  --gray-900: hsl(217, 33%, 10%);

  /* 品牌色（以高质感 Indigo 为例） */
  --primary-50:  hsl(225, 100%, 97%);
  --primary-100: hsl(226, 100%, 94%);
  --primary-500: hsl(234, 89%, 64%); /* 基准主色 */
  --primary-600: hsl(239, 84%, 58%); /* Hover 态 */
  --primary-700: hsl(243, 75%, 50%);
  --primary-900: hsl(244, 55%, 30%); /* 浅底深色文本 */

  /* 语义破坏色 (Red) */
  --danger-50:  hsl(0, 86%, 97%);
  --danger-100: hsl(0, 93%, 94%);
  --danger-500: hsl(0, 84%, 60%);
  --danger-600: hsl(0, 72%, 51%);
  --danger-900: hsl(0, 70%, 35%);

  /* 语义成功色 (Emerald) */
  --success-50:  hsl(152, 76%, 96%);
  --success-500: hsl(156, 72%, 39%);
  --success-900: hsl(160, 84%, 18%);
}
```
