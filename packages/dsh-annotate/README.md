# dsh-annotate

**右侧栏原生 tab**：在 DeepSeek Harness 里预览本地页面、圈选界面元素、写批注、一次发给 AI。

形态对齐 [Codex 的 in-app browser](https://developers.openai.com/codex/app/browser)：
预览活在**工作界面里**（对话旁边的右侧栏，push 模式把对话挤开），不是浮在上面的卡片；
Annotation 模式点元素写评论；`⌘/Ctrl+点击`立即提交；评论汇成一段结构化说明交给 agent
（选择器路径 / 位置尺寸 / 计算样式 / React 组件名 / 视口）。

## 能力

| 能力 | 说明 |
| --- | --- |
| 同源预览 | 面板里用 iframe 预览 dev server；跨源会自动提示改用同源桥（见下） |
| 元素圈选 | 悬停高亮 + 制图式测量框（角标刻度）、读数条显示 `标签.类 · 组件名 · 尺寸` |
| 就地批注 | 点击元素弹卡片，`Enter` 保存、`Shift+Enter` 换行、`Esc` 取消；卡片自动避开被标注元素 |
| 编号标记 | 批注以编号圆钉钉在元素上，随页面滚动/缩放跟随；点击钉子可回看/编辑 |
| 持久化 | 按页面路径存在 `localStorage`，刷新不丢 |
| 结构化投递 | 每条含选择器路径、位置尺寸、计算样式、文本、React 组件名；一次写入输入框，可整段移除 |
| 样式微调 | 卡片里「样式」可直接改 `font-size / padding / gap / border-radius / color / background-color`，**页面上实时生效**，改动随批注一起投递（可一键复原） |
| 精确定位 | 选择器 + **命中元素数**、`role`/`aria-label`/`alt`/`name`、`data-testid`、**组件链**、计算样式、**视口定位**（如 `中中 50%W × 43%H`） |
| 深链 | `⌘⇧B`（与 Codex 一致）/ `⌘⇧A` 打开；会话头部「标注」按钮；右侧栏 `+` 的 guide 条目 |

## 零手工

打开 tab（`⌘⇧B`）即可用，不需要任何终端命令或地址输入：

- **自动起 dev server**：tab 打开时宿主半在工作区执行 `npm run dev:panel`
  （`npm start` 风格的 `IDD_BASE=/app/ vite --port 5180 --strictPort`），等端口就绪再加载预览；
  工具栏有 `● 运行中 / 启动中 / 出错` 状态、▶/⏹ 启停、日志抽屉（含「日志→对话」）。
  已在运行的 dev server 会被直接复用，不会抢端口。
- **地址自动填**：预览地址固定为同源桥的 `${origin}/app/`，无需手输。

## 为什么没有截图

一开始做过（宿主用 Playwright 按选择器裁图，再经原生 drop 送进输入框），后来**去掉了**，原因：

- 截图是**另一次渲染**：视口尺寸可以对齐，但滚动位置、瞬时状态（hover/loading/浮层）、数据、未生效的 HMR
  都可能不同 —— 拍出来未必是读者当时看到的那一屏，照着一张不一致的图改容易追幻影。
- 它是**栅格**，不携带 DOM/样式真相；真要动手仍然得靠结构化字段，图只是补充。
- 每张图 ~1s（起一次 Playwright）+ 进对话历史。

取而代之，把"哪个部分"这件事做成**可机读的确定性数据**（见上表"精确定位"）：选择器给出路径与命中数，
语义锚点与组件链给出代码坐标，视口定位给出"在哪一眼可读"。纯视觉缺陷（遮挡/裁切/对比度）
用文字描述即可；**修复后的验证由 AI 自己截图核对**（它有 Playwright + 同源桥，这一整轮就是这么验的）。

## 依赖：同源桥

浏览器的同源策略决定了跨源 iframe 的 DOM 读不到，所以标注**必须**在
`http://127.0.0.1:<harness端口>/app/` 这种同源地址上做。桥插件 `dsh-app-bridge`
把本地 dev server（含 WebSocket/HMR）反代到 harness 的 `/app/` 下，两者配套使用：

```bash
# 1) 应用以 /app/ 为基址启动（infinite-web 已内置该脚本）
npm run dev:panel        # = IDD_BASE=/app/ vite --host 127.0.0.1 --port 5180 --strictPort
# 2) 面板地址栏填 http://127.0.0.1:3080/app/
```

## 安装

```bash
cd ~/.dsh/profiles/web
pnpm add link:../../<path-to-repo>/packages/dsh-annotate
pnpm add link:../../<path-to-repo>/packages/dsh-app-bridge   # 同源桥，配套必需
# cordis.patch.yml
- insert:
    - name: dsh-app-bridge
      config: { target: http://127.0.0.1:5180, prefix: /app }
    - name: dsh-annotate
# 重启 dsh web
```

仓库根目录的 README 讲清了「为什么必须有同源桥」与消费方的配合改动。

包内 `cordis.patch.yml` 提供了 `dsh plugin add` 使用的挂载清单。

## 设计取向：制图标注（drafting overlay）

**栏内是列，不是卡**（`ui-sidebar-right` 的契约要求）：无圆角、无阴影、无毛玻璃，
只有发丝分隔线与内容内边距；打开时按 push 模式把对话让出宽度，关闭不留痕迹。

页面内的标注层用"工程制图"语汇：发丝测量框 + 四角刻度、等宽读数（`标签.类 · 组件名 · 456×117`）、
编号圆钉，以及唯一的暖色标记色 `#f0a05a` —— 与应用自身强调色刻意区分，
一眼能看出"这是评审标记，不是应用的一部分"。主题随 DSH（`--dsw-alias-*`）与应用自身明暗自动适配。

## 结构

```
src/overlay.js   注入到被预览页面里的标注层（纯 JS，无 React，可独立测试）
src/client.js    右侧栏 tab 主体 / 会话头部入口 / 待发送芯片（ModuleLoader bundle 的源）
src/host.js      宿主半（当前无宿主面，占位以便挂载与发现客户端半）
build.mjs        src → lib（宿主半原样、客户端半包成 ModuleLoader 工厂） + 类型声明
tests/           注入层的独立交互测试与 GUI 端到端测试（Playwright）
```

## 已验证

- 注入层：hover 测量框 / 读数、点击出卡片、`Enter` 落钉、刷新后恢复、多条并存
- 右侧栏 tab：`⌘⇧B` 打开、栏内同源预览（无跨域提示）、圈选后清单同步、`发给 AI` 写入输入框
- 零手工：打开 tab 自动起 dev server（状态显示「运行中」）、地址自动为 `${origin}/app/`
- 样式微调：改 `font-size: 26px` 后页面元素 `style.fontSize === "26px"`，投递文本含 `样式改动（已在页面上预览）: font-size 16px → 26px`
- 精确定位：投递文本含 `命中 1 个元素`、`语义: aria-label=...`、`组件链: ExplorationHome > App`、`视口 中中（50%W × 43%H）`
- 投递内容示例（真实回读输入框）：

```
🎯 界面标注 · /app/ · 视口 720×764（1 条）

#1 textarea  组件:ExplorationHome
   语义: aria-label="Your question"
   组件链: ExplorationHome > App
   选择器: main.idd-main > div.idd-canvas-area > div.idd-exploration-home > ... > textarea（命中 1 个元素）
   位置/尺寸: 678×165 @ (21, 250) · 视口 中中（50%W × 43%H）
   当前样式: display:block; padding:20px; font-size:16px; line-height:41.6px; ...
   样式改动（已在页面上预览）: font-size 16px → 26px
   批注: 字号调大后行高也需同步；确认样式改动随批注投递
```

## 未做（下一步）

- 从 React fiber 反推组件文件路径，批注里直接给到源码行（现在给到组件链）
- 多选与区域选择（Codex 支持 `Shift+点击`选区域）、批注状态（待修/已修）与跨轮次追踪
- tab 胶囊前的类型图标（`sidebar.right.pane.tab.title` 槽）
