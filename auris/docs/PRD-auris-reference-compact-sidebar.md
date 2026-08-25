# PRD：Auris 参考图式超窄胶囊侧边栏

> 状态：可直接交给 Antigravity 执行
>
> 日期：2026-08-25
>
> 适用范围：Auris Electron 桌面端全局应用侧边栏
>
> 重要说明：本文件是自包含规格。执行者不需要、也不应依赖原始截图。

## 1. Summary

把 Auris 当前 48px、贴左、全高、直角的侧边栏，改成参考界面的 30px 超窄悬浮胶囊轨道。新侧栏距窗口左侧、顶部和底部均为 8px，使用克制的深色表面、28px 导航按钮、2px 珊瑚红活动指示条和 14px 图标，同时保留 Auris 的现有路由、可访问性、Notes 笔记库入口和展开能力。

实现时必须整理现有重复 CSS，建立一套最终权威规则；禁止只在 `globals.css` 末尾继续追加更高优先级的临时覆盖。

## 2. Contacts

| 角色 | 负责人 | 职责 |
| --- | --- | --- |
| 产品所有者 | 用户 | 确认侧栏是否达到参考图的视觉密度 |
| 规格与测量 | Codex | 提供不依赖图片的像素、颜色和行为规格 |
| 实现者 | Antigravity | 修改组件和样式、补齐测试、报告验证结果 |

## 3. Background

### 3.1 问题

Auris 当前桌面侧栏最终生效规则位于 `src/app/globals.css` 后部，主要表现为：

- `--desktop-app-sidebar-width: 48px`；
- `left: 0`、`top: 0`、`height: 100vh`；
- `border-radius: 0`；
- 导航按钮和图标块均为 36px；
- 活动态仍可能受到旧的金色主题覆盖；
- 同一个 `.desktop-app-sidebar` 选择器在文件中被多轮设计方案重复定义，并大量使用 `!important`。

参考界面不是贴边矩形栏。它是一条与窗口四周留出呼吸空间的超窄圆头轨道，活动项也不是大色块或发光卡片，而是轨道内部的轻量深色方块、左侧短指示条和蓝色线性图标。

### 3.2 测量依据

原始截图是 2880×1800 设备像素，DPI 为 144，对应 2× Retina 缩放，即 1440×900 CSS 逻辑像素。以下所有实现尺寸均已换算为 CSS 像素。

| 对象 | 截图设备像素 | CSS 逻辑像素 | 说明 |
| --- | ---: | ---: | --- |
| 截图视口 | 2880×1800 | 1440×900 | 2× Retina |
| 轨道左边 | x = 16 | x = 8 | 距窗口左侧 8px |
| 轨道顶边 | y = 16 | y = 8 | 距窗口顶部 8px |
| 轨道宽度 | 60 | 30 | 不得实现成 60 CSS px |
| 轨道高度 | 1768 | 884 | `calc(100vh - 16px)` |
| 轨道底部间距 | 16 | 8 | 与顶部对称 |
| 首个导航槽顶边 | y = 96 | y = 48 | 相对窗口；相对轨道顶边 40px |
| 活动项 | 56×56 | 28×28 | 左边 x = 9px，轨道内左右各 1px |
| 活动指示条 | 4×40 | 2×20 | 在活动项左边，垂直居中 |
| 图标可见色块 | 约 24×26 | 约 12×13 | 实际 SVG 盒使用 14×14 |

### 3.3 从截图采样的 Night 主题颜色

| 用途 | 色值 | 约束 |
| --- | --- | --- |
| 页面背景 | `#24262B` | 仅用于对照，不要因此改写页面自己的主题背景 |
| 轨道表面 | `#2B2E33` | Night 主题精确目标 |
| 活动项表面 | `#333D4B` | 平面纯色，不用渐变 |
| 活动指示条 | `#E55E51` | 2px 珊瑚红短条 |
| 活动图标 | `#6BA4F8` | 线性蓝色图标 |

## 4. Objective

### 4.1 目标

让全局导航在视觉上更轻、更窄、更接近内容边缘，同时维持明确的当前位置、可靠的点击区域、键盘可用性和 Auris 现有导航能力。

### 4.2 Key Results

1. 在 1440×900 CSS 视口中，折叠轨道的计算尺寸必须是 `30×884px`，位置必须是 `left: 8px; top: 8px`，允许测量误差不超过 1px。
2. 折叠态活动项必须是 `28×28px`，活动指示条必须是 `2×20px`，图标盒必须是 `14×14px`。
3. `/`、`/notes`、`/flash`、`/review`、`/reading`、`/video`、`/settings` 七个现有目标都必须保留并可点击。
4. 当前路由只能有一个 `data-active="true"` 导航项；活动状态不再出现大面积金色填充、玻璃渐变、粒子或爆炸动画。
5. White、Paper、Mint、Tan、Night、Solarized 六种应用主题下几何尺寸完全一致，并且文本/图标对比度可读。
6. 1280×720、1440×900、1728×1117 三档桌面视口中，侧栏不得遮住 Notes 左下角工具、正文滚动条或可点击内容。
7. 定向组件测试、样式契约测试、生产构建全部通过；不得新增 TypeScript 或 ESLint 错误。

## 5. Market Segment(s)

### 5.1 主要使用者

长期使用 Auris 进行笔记、复习、阅读和视频学习的人。他们希望屏幕尽量留给内容，但仍能随时知道自己所在的位置并快速换页。

### 5.2 使用约束

- 产品只维护 Electron 桌面端，不为 Web 登录页或移动端重新设计。
- 侧栏是全应用导航，不是 Notes 内部文件夹栏。
- 用户可能使用六种主题，不能只在 Night 下正确。
- Notes 和 Reading 在展开态有二级入口，不能因外观重构而丢失。
- 屏幕可能只有 720px 高，七个入口仍需全部可达。

## 6. Value Proposition(s)

- 用 30px 的常驻轨道代替宽重的导航卡片，把更多横向空间还给内容。
- 用“深色活动面 + 蓝色图标 + 红色短条”提供双重当前位置提示，不依赖文字标签。
- 保留 hover 提示、键盘焦点和展开面板，让超窄外观不牺牲可发现性。
- 用一套权威 CSS 规则替代多轮互相覆盖，降低以后调整主题或尺寸时的回归风险。

## 7. Solution

### 7.1 UX / Wireframe

以下坐标以 1440×900 CSS 视口左上角为 `(0, 0)`：

```text
窗口左边
x=0
│       8px 空隙
│       ┌──────────────┐  y=8
│       │  30px 轨道   │  顶部是完整圆头，radius=15px
│       │              │
│       │┌────────────┐│  第一个导航槽：x=9, y=48, 28×28
│       ││▌    ◇      ││  左条：2×20；图标盒：14×14
│       │└────────────┘│
│       │    下一项    │  每项 28px，高度间隔 4px
│       │    下一项    │
│       │              │
│       │    工具组    │  工具组可固定在底部，但保持 8px 内边距
│       └──────────────┘  y=892，距窗口底部 8px
│
└──────────────────────────────────────── 主内容画布
```

折叠态正常显示时，不出现 Auris Logo、头像、标题、分组文字或描述。轨道顶部保留 40px 空间。为了保留展开能力，可在这段空白中放置一个 `28×28px` 的展开按钮：默认视觉透明，只在轨道 hover 或按钮 `:focus-visible` 时显示低对比面板图标；其可点击和可聚焦能力始终存在。

### 7.2 折叠轨道精确规格

#### 7.2.1 容器

```css
position: fixed;
left: 8px;
top: 8px;
width: 30px;
height: calc(100vh - 16px);
padding: 0;
border: 0;
border-radius: 15px;
overflow: hidden;
z-index: 90;
```

- Night 主题背景精确使用 `#2B2E33`。
- 禁止玻璃模糊、描边、渐变、内发光和高亮边。
- 外部阴影只用于把轨道从背景中轻微分开，目标值：`0 4px 14px rgba(0, 0, 0, 0.18)`。不得形成明显浮卡效果。
- 主内容画布继续铺满窗口；轨道作为固定浮层存在，不因折叠态给整个页面增加 30px Grid 列。

#### 7.2.2 导航布局

- 第一项顶部固定为窗口 `y=48px`，即轨道内 `padding-top: 40px`。
- 每个导航项 `width: 28px; height: 28px; min-height: 28px`。
- 相邻项目间距 `4px`。
- 主导航按现有 fixture 顺序显示。
- tools 组仍可用 `margin-top: auto` 固定在轨道底部；最末项距胶囊底部至少 8px。
- 如果 720px 高度下所有项目与 Notes 子入口不能同时放下，只有二级入口区域允许滚动；七个一级路由必须始终可达。

#### 7.2.3 默认、Hover、Active 和 Focus

默认态：

- 链接和 mark 都是透明背景，无边框、无阴影。
- 图标盒 `14×14px`，居中。
- 图标用线性 SVG，`stroke-width: 1.8`，不允许填充成厚重实心图标。
- Night 主题默认图标建议使用 `rgba(215, 217, 222, 0.52)`。

Hover 态：

- 整个 28×28 项出现轻微表面：Night 下 `rgba(255, 255, 255, 0.045)`。
- 不放大、不位移、不发光。
- 保留 `title` 或等价 tooltip，以显示中文功能名。

Active 态：

- 整个 28×28 项背景为 `#333D4B`，`border-radius: 5px`。
- 左侧指示条定位为 `left: 0; top: 4px; width: 2px; height: 20px; border-radius: 0 1px 1px 0`。
- 指示条颜色为 `#E55E51`。
- 活动图标颜色为 `#6BA4F8`。
- mark 本身必须透明；不得在活动项内部再套一个有背景的第二层方块。
- 禁止金色活动填充、白色图标、投影光晕、ripple 和粒子 burst。

Focus 态：

- `:focus-visible` 使用 1px 高对比轮廓和 1px offset。
- 焦点轮廓不能被 `overflow: hidden` 截断；可改用 inset box-shadow。
- 每个入口必须保留清楚的 `aria-label`。

### 7.3 展开态：Auris 兼容设计

参考图只定义折叠态。展开态按 Auris 现有功能做受控延续：

- `data-sidebar-expanded="true"` 时变为 `240px` 宽的浮层；仍保持 `left: 8px; top: 8px; height: calc(100vh - 16px)`。
- 展开态圆角为 `16px`，不得挤压或重排主内容，覆盖在主内容上方。
- 显示 Auris 品牌、导航文字、Notes 笔记库入口和 Reading 二级导航。
- 收起按钮必须清楚可见，点击后回到 30px 胶囊。
- 展开状态继续写入现有 sessionStorage key：`auris.desktop.sidebar-expanded`。
- 不改路由、不改预取、不改 Notes 根导航事件。

### 7.4 六主题规则

几何尺寸在所有主题下固定。禁止通过主题改变轨道宽度、圆角、按钮尺寸或间距。

- Night：必须精确使用本规格的 `#2B2E33`、`#333D4B`、`#E55E51`、`#6BA4F8`。
- 其他五种主题：轨道背景取该主题的实色 surface，活动表面使用比轨道深或浅约 6%–10% 的中性层；活动指示条和活动图标仍保持珊瑚红/蓝色语义，但必须满足可读对比。
- 不允许沿用当前 `rgba(199, 168, 106, 0.12)` 的金色活动背景。
- 建议在 `.desktop-app-shell` 定义并消费以下局部语义变量：
  - `--sidebar-rail-bg`
  - `--sidebar-item-hover-bg`
  - `--sidebar-item-active-bg`
  - `--sidebar-icon`
  - `--sidebar-active-icon`
  - `--sidebar-active-indicator`

### 7.5 与主内容及 Notes 底栏的关系

- 轨道右边坐标是 `8 + 30 = 38px`。
- 普通正文或工具按钮若靠左，安全起点不得小于 `46px`。
- Notes 左下角 corner cluster 的推荐起点为 `54px`，计算式为 `8px + 30px + 16px`。
- 删除当前依赖旧值的 `left: calc(14px + var(--desktop-app-sidebar-width, 74px) + 16px)`；改为使用新的 left/width 变量，不得继续写死 14 和 74。
- 页面滚动条不得被轨道覆盖；需要时给滚动内容增加局部安全 inset，而不是给整个 App 强加宽侧栏列。

### 7.6 实现范围

主要修改：

1. `src/app/globals.css`
   - 合并侧栏几何、主题、活动态和响应式规则。
   - 删除或改写与新规格冲突的 74px、78px、48px、`left: 0`、`top: 0`、`border-radius: 0` 和金色活动态规则。
   - 不允许用新增的最后一段 `!important` 作为唯一解决办法。
2. `src/components/desktop/desktop-app-sidebar.tsx`
   - 保留路由、预取、`aria-label`、Notes/Reading 二级导航和展开按钮。
   - 折叠态隐藏品牌视觉，仅保留 hover/focus 才显现的展开控制。
   - 删除纯视觉用的粒子与爆炸动画 DOM/state；点击导航应立即沿用现有安全跳转逻辑。
   - 活动指示条使用伪元素或单个装饰节点，不添加第二层卡片。
3. `src/components/desktop/desktop-app-frame.tsx`
   - 仅在展开/折叠状态或 CSS 变量承载确有需要时修改。
   - 保留 `isPersistentRail` 和 sessionStorage 行为。
4. 测试
   - 更新 `tests/component/runtime/desktop-app-sidebar.test.tsx`。
   - 更新 `tests/component/runtime/desktop-app-frame.test.tsx`。
   - 新增 `tests/unit/desktop/desktop-sidebar-reference-geometry.test.ts`，读取 CSS 并防止关键几何回退。

明确禁止修改：

- `electron/main.cjs`、`electron/preload.cjs`；
- `src/components/desktop/desktop-shell-fixtures.ts` 中的现有路由内容和顺序；
- Notes 编辑器、Vault 数据、数据库和用户文件；
- 全局应用主题契约；
- 登录、认证、Supabase。

### 7.7 CSS 整理要求

当前 `globals.css` 存在多轮 sidebar 方案。实现者必须先用选择器检索所有定义，再完成以下收敛：

1. 保留一处基础组件规则，处理通用语义和非桌面 fallback。
2. 保留一处 Electron 折叠态权威规则。
3. 保留一处 `data-sidebar-expanded="true"` 展开态规则。
4. 保留六主题仅改变颜色变量的规则。
5. 响应式只改变确有必要的高度/滚动行为，不改变 30px 宽度。
6. 删除已经失效的 “Image-2 sidebar skin”“48px flush-left strip”“74/78px final alignment” 冲突块，或将仍有用途的声明迁入上述权威块。
7. 完成后，关键几何声明不应依赖 `!important` 才能生效。

### 7.8 验收测试

#### 自动测试

- 折叠侧栏仍渲染七个一级导航目标。
- 活动路由只有一个活动项。
- 折叠态有可访问的“展开侧栏”按钮，展开态有“收起侧栏”按钮。
- 点击 Notes 活动项仍能切换现有 Vault 子导航。
- Reading 展开态仍显示文章、书籍、题目入口。
- 删除旧粒子 DOM 后，测试不得再要求 8 个 `.desktop-app-sidebar__link-particle`。
- 样式契约测试至少断言：30px、8px、15px、28px、14px、2×20px，以及 Night 五个关键颜色。
- 样式契约测试禁止出现最终生效的 `left: 0`、`border-radius: 0`、48/74/78px 折叠宽度和金色活动填充。

#### Electron 实机测量

在 1440×900 窗口运行：

```js
const rail = document.querySelector('.desktop-app-sidebar');
const active = document.querySelector('.desktop-app-sidebar__link[data-active="true"]');
console.table({
  rail: rail?.getBoundingClientRect().toJSON(),
  active: active?.getBoundingClientRect().toJSON(),
});
```

期望：

- rail：`x=8, y=8, width=30, height=884`；
- 第一个路由为活动项时 active：`x=9, y=48, width=28, height=28`；
- 误差不超过 1px；
- `getComputedStyle(rail).borderRadius === "15px"`；
- Night 下轨道和活动项计算背景分别为 `rgb(43, 46, 51)` 与 `rgb(51, 61, 75)`。

#### 必跑命令

```bash
npx vitest run tests/component/runtime/desktop-app-sidebar.test.tsx \
  tests/component/runtime/desktop-app-frame.test.tsx \
  tests/unit/desktop/desktop-sidebar-reference-geometry.test.ts
npx eslint src/components/desktop/desktop-app-sidebar.tsx \
  src/components/desktop/desktop-app-frame.tsx \
  tests/component/runtime/desktop-app-sidebar.test.tsx \
  tests/component/runtime/desktop-app-frame.test.tsx \
  tests/unit/desktop/desktop-sidebar-reference-geometry.test.ts
git diff --check
npm run build
```

最后必须用 `npm run desktop:dev` 打开 `/`、`/notes`、`/reading`、`/video` 和 `/settings`，确认导航、展开/收起、主题切换和内容左边界均正常。

### 7.9 Assumptions

- 参考截图来自 2× Retina 环境，因此 60 个设备像素应实现为 30 CSS px。
- 用户要临摹的是侧栏的几何、层级和活动状态，不是复制截图中的业务图标或 Markdown 内容。
- Auris 的七个现有入口全部保留；参考图只显示一个入口，不代表要删除 Auris 功能。
- 展开态没有参考图，所以沿用 Auris 的功能，并用克制的 240px 浮层表达。

## 8. Release

### 第一阶段：样式与结构收敛

- 整理重复 CSS。
- 完成 30px 折叠胶囊、活动态、主题变量和左下角安全区。
- 移除旧粒子视觉状态，但保留导航预取和跳转。

### 第二阶段：功能回归

- 验证七个路由、Notes Vault、Reading 子导航和展开状态持久化。
- 运行定向测试、ESLint、diff check 和生产构建。

### 第三阶段：实机验收

- 在三档视口和六种主题下检查。
- 用 `getBoundingClientRect()` 记录实际几何。
- 截图对比时以本文件给出的 CSS 坐标和颜色为准，不要求执行者读取原参考图。

### 暂不进入本次版本

- 重做应用图标体系。
- 修改导航信息架构或增加新路由。
- 修改 Notes 内部左右侧栏。
- 修改 AI Dock。
- 为移动端设计同款胶囊轨道。

## 附录 A：规格编写轨迹

- 将任务解释为“产出给无法看图的执行代理使用的自包含侧栏实现规格”，本轮不直接修改产品代码。
- 对 2880×1800、144 DPI 截图做了颜色与边界采样，并按 2× Retina 换算为 1440×900 CSS 坐标。
- 检查了 Auris 的 `DesktopAppSidebar`、`DesktopAppFrame`、导航 fixture、现有组件测试和 `globals.css` 中的多轮侧栏覆盖。
- 发现当前最终方案为 48px、贴左、全高直角栏，与目标 30px、四周 8px、15px 圆头胶囊不一致；Notes 左下角偏移公式仍含旧的 14px/74px 常量。
- 本文件只新增规格文档，没有修改路由、应用代码、用户数据或 Electron 主进程。
