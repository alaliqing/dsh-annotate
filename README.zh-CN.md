# dsh-annotate

[English](README.md) | **简体中文**

[![CI](https://github.com/alaliqing/dsh-annotate/actions/workflows/ci.yml/badge.svg)](https://github.com/alaliqing/dsh-annotate/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D%2020-brightgreen.svg)](package.json)

<!-- 0.1.0 发布后把这个徽章加回来，否则它会显示成红色的 "package not found"：
     [![npm](https://img.shields.io/npm/v/dsh-annotate.svg)](https://www.npmjs.com/package/dsh-annotate) -->

**指着界面说话，而不是指着代码。** 打开一个你本来就在跑的本地应用，点选想改的元素，
逐个写下意见，然后把整份评审作为一个结构化区块发给对话——选择器、组件名、几何信息、
计算样式都在里面，模型不用猜你说的是哪个按钮。

它就是 DeepSeek Harness 网页客户端里的一个普通侧边栏标签页，不是一个需要你手动保持同步的独立窗口：

```
  ⌘⇧B  →  选一个正在运行的本地服务  →  点选元素  →  写一句意见
        →  发送批注（或加入输入框）
```

![批注面板与被预览的应用并排：工具栏、批注列表，以及页面上的编号标记](docs/panel-overview.png)

*工具栏、内嵌式批注列表，以及挂在一个已选元素上的标记。截图取自测试夹具；
用 `npm test` 可重新生成。*

> **状态：0.1.0 之前，尚未发布到 npm。** 首个版本还没发布，
> 请先从本地检出安装（见[安装](#安装)）。`v0.1.0` 的发布流程已经就绪。

## 功能

- **自己找到你的开发服务器。** 所有真正在应答的回环服务都会连同页面标题列出来——
  不用配置，不用猜端口。列表在可见时每 5 秒刷新一次，只监听 IPv6 的服务也能找到。
- **在一个 DOM 可读的预览里打开它。** 每个应用都有自己的独立回环源，
  这才让元素点选成为可能；同时应用保留自己的路径，所以它的资源和路由照常工作。
- **标记会一直跟在元素上。** 窗口滚动、内层容器滚动、尺寸变化、布局位移都不会掉队；
  元素被裁剪或消失时标记会隐藏，而不是飘在错误的位置。
- **发的是证据，不是截图。** 载荷包含选择器和它的命中数量、语义锚点、组件链、几何信息，
  以及真正有用的那些计算样式。见[发送的内容](#发送的内容)。
- **绝不碰你的草稿。** 「发送批注」只发这份评审；「加入输入框」把它并进你正在写的内容。
  发送被拒时批注会保留，无关文字和附件绝不会被带走。
- **中英双语**，工具栏切换，按浏览器记住。

## 环境要求

- 一个你可以重启的 **DeepSeek Harness** 网页客户端。Harness 相关包
  （`@deepseek-ai/dsh-*`）已发布在 npm 上。
- Harness 需要运行在 **Node.js 20+** 上。
- 浏览器以 **Chromium** 为准（见[限制](#限制)）。

`dsh-annotate` 本身没有任何运行时依赖，构建产物也已提交，所以安装它不需要构建步骤。

## 安装

### 从本地检出安装（现在就能用）

```sh
git clone https://github.com/alaliqing/dsh-annotate
cd ~/.dsh/profiles/web
npx --yes pnpm@10 add "link:/绝对路径/dsh-annotate/packages/dsh-annotate"
```

### 从 npm 安装（0.1.0 发布之后）

```sh
dsh plugin --profile web add dsh-annotate    # 需要 PATH 里有 pnpm
```

### 两种情况都要：启用并重启

在该 profile 的 `cordis.patch.yml` 里加上这个插件：

```yaml
- insert:
    - name: dsh-annotate
```

然后重启 `dsh web`。插件会注册一个侧边栏标签页、一个顶部按钮，以及
`⌘/Ctrl⇧B` 快捷键（`⌘/Ctrl⇧A` 是别名）。

## 评审一个本地应用

1. 照你平时的习惯，把项目自己的开发服务器跑起来。插件只会打开你自己启动的服务，
   永远不会替你启动或杀掉进程。
2. 打开一个**会话**（侧边栏和顶部按钮要有会话才会出现），然后按 `⌘/Ctrl⇧B`，
   或点顶部的**标注**按钮。
3. 从列表里选一个检测到的服务，或者输入 `5173`、`localhost:3000/path` 或任意回环 URL。
4. 点**标记**，再点页面里的元素，写下你的意见。

   | 按键 | 作用 |
   | --- | --- |
   | `Enter` | 保存并继续标记 |
   | `Shift+Enter` | 换行 |
   | `Esc` | 取消编辑并退出标记模式 |
   | `⌘/Ctrl`+点击 | 保存这条意见并立即发送整批 |

   中文输入法的候选词确认不会被当成保存。
5. 选**加入输入框**把评审并进草稿，或选**发送批注**单独发送它。

发送走的是被寻址的 Harness 会话，并等待对方接受。agent 正忙时评审会排队。
想改之前写的意见，点它的标记即可；或点**批注**按钮展开内嵌列表，逐条定位和删除，
且不会遮住预览。删除可以撤销。

批注和写到一半的草稿以「Harness 会话 **+ 完整应用 URL**」为作用域，
所以 SPA 的各个路由各自恢复，两个会话也永远看不到彼此的批注。刷新不会丢，
旧的 `v1` 记录会原样保留，而不是被猜测后塞进一个不相干的会话。

## 发送的内容

每次评审一个区块，语言跟随面板当前语言。一个两条批注的评审长这样
（真实情况下样式那行很长，它是单独一行，不是折行的）：

```
🎯 界面标注 · /settings · 视口 1440×900（2 条）
#1 button.primary  组件: SubmitButton
   语义: aria-label="保存修改" · data-testid=save
   组件链: SettingsPage > SettingsForm > SubmitButton
   选择器: #root > form > button.primary（命中 1 个元素）
   位置/尺寸: 96×32 @ (640, 512) · 视口 正中（45%W × 59%H）
   当前样式: display:inline-block; padding:8px 16px; font-size:14px; font-weight:600; line-height:20px; color:rgb(255, 255, 255); background-color:rgb(109, 74, 255); border-radius:8px; width:96px; height:32px
   文本: Save changes
   批注: 表单没改动前这个按钮应该是禁用的。

#2 input.email  组件: EmailField
   语义: aria-label="邮箱" · name=email
   选择器: #root > form > input.email（命中 1 个元素）
   位置/尺寸: 320×36 @ (480, 448) · 视口 正中（44%W × 52%H）
   当前样式: display:block; padding:8px 10px; font-size:14px; border-radius:6px; width:320px; height:36px
   批注: 校验错误请内联显示，不要用 toast。
```

| 字段 | 来源 |
| --- | --- |
| 位置 | 应用 URL、页面、视口，以及元素在视口中的粗略分区 |
| 身份 | 转义后的 CSS 选择器及命中数量、标签名、首个 class |
| 语义锚点 | 存在时给出 `role`、`aria-label`、`alt`、`name`，以及 `data-testid`/`data-test`/`data-test-id`/`data-qa` |
| 组件 | 最近的 React 组件名，以及最多三层的组件链——需要开发构建，生产构建的名字会被压缩 |
| 几何 | 取整后的宽 × 高与位置 |
| 样式 | 14 个计算样式值，顺序固定——是证据，不是样式编辑器 |
| 文本 | 元素可见文本，压缩空白并截断到 120 字符 |
| 批注 | 你写的意见 |

载荷不会截图，也不会改动任何样式。

## 预览是怎么工作的

值得知道的那个难点：`http://127.0.0.1:5173` 提供的页面与 Harness 不同源，
而跨源 iframe 的 DOM 根本读不到——所以任何覆盖层都无法标注它。本插件给
**每个会话/应用一个独立的临时回环源**，并刻意使用与 Harness 相反的主机名：

- 浏览器看到的是应用原本的路径（`/settings` 还是 `/settings`），
  所以根绝对路径的脚本、样式、SPA 路由和 WebSocket 升级都不需要路径前缀，
  也不需要改写 `<base>`。
- host 侧会往每个 HTML 文档注入一个小 shim（处理页面自身源拼出的 URL 和 socket）
  以及点选覆盖层。
- 面板与覆盖层只用 `postMessage` 通信，两侧都同时校验来源 **和** 源站。
  面板从不伸手去读预览页的 DOM。
- 目标只允许 `localhost`、`127.0.0.1` 和 `[::1]`——HTTP 和 WebSocket 升级都一样。
  外部主机、URL 里带凭据、以及 Harness 自身都会被拒绝。
- 应用 cookie 会加命名空间，并以 `SameSite=None; Secure; Partitioned` 发送；
  没有前缀的 cookie 双向都会被剥离。
- 插件销毁时预览服务及其 socket 一并关闭；每次启动最多保留 24 个会话/应用预览。

早期设计是在 Harness 源上用路径前缀代理应用。它被直接删除而不是留成开关：
它什么也没隔离，还把一条通往任意回环端口的、不校验来源的 WebSocket 隧道放在了 Harness 源上。

## 限制

这是本地开发预览，不是通用浏览器。已知边界，以及撞上时的表现：

| 限制 | 表现 |
| --- | --- |
| OAuth 跳转、源白名单、写死源的应用、Service Worker | 需要专门配置，或者用正常浏览器 |
| 上游 HTTPS 证书不受信任 | 显式报错；绝不会静默跳过证书校验 |
| 禁止内联脚本的 CSP | 注入可能被拦下；面板会报出失败 |
| Shadow DOM 内部、跨源子 frame | 无法选中 |
| Canvas 内容 | 整个 canvas 可以作为一个元素选中，不能选中其中绘制的对象 |
| 非 Chromium 浏览器 | 分区 cookie 只在 Chromium 上验证过，其他引擎行为不同 |
| 远程 Harness、HTTPS 反向代理、从另一台电脑访问本机回环 | 不在「仅本地」这一设计范围内 |
| 信任 | 预览页是受信任的本地代码，它并不是你和被预览应用之间的安全边界 |

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| `⌘⇧B` 和顶部按钮都没反应 | 还没打开会话，侧边栏尚未渲染出来。先打开一个会话。 |
| 列表说没找到服务 | 没有东西在监听被探测的端口。启动你的开发服务器，或在输入框里直接填端口。默认探测列表是 5173、3000、4173、5180、8080、8000、5000、5500、9000、3001、1234、4200、4321、5174、6006、7000、8001、8888；用 `detect.extraPorts` 加上你自己的。 |
| 预览一直出不来，也没有覆盖层 | 应用的开发 CSP 禁止内联脚本。为开发环境放宽它，或改用正常浏览器。 |
| 提示「仅支持本地开发服务」 | 你输入了外部网址。按设计只允许回环。 |
| 标记不再跟着元素 | 应用把该元素移除或替换了。标记会隐藏；删掉这条批注重新标注。 |
| 发送被拒 | Harness 会话没有接受。批注会保留，输入框里其他内容也没被动过——等 agent 空闲后重试。 |
| 预览里字体或资源 404 | 应用用源白名单拼绝对 URL。见[限制](#限制)。 |

## 配置

全部可选——面板一项都不需要。

```yaml
- insert:
    - name: dsh-annotate
      config:
        detect:
          extraPorts: [4321]     # 除默认列表外，始终额外探测这些端口
          probeTimeoutMs: 900    # 单个端口的 HTTP 探测预算
          cacheMs: 2000          # 扫描结果的复用时长
          staticPorts: false     # 默认 true 时也会探测默认端口列表
```

另有一套用于启动开发服务器的 host API（`command` 或 `argv`，以及 `port`、`base`、
`readyTimeoutMs`）。它只面向程序化集成：面板没有启动/停止控件，也从不调用它，
所以配置它不会改变界面上的任何行为。

## `dsh-app-bridge`

本仓库里第二个刻意做小的包，用于应用必须挂在 **Harness 源上的固定路径** 这一情形——
通常是已经带 base 前缀（`vite --base=/app/`）、没法用别的方式提供的开发服务器。

```sh
cd ~/.dsh/profiles/web
npx --yes pnpm@10 add "link:/绝对路径/dsh-annotate/packages/dsh-app-bridge"
```

```yaml
- insert:
    - name: dsh-app-bridge
      config:
        target: http://127.0.0.1:5180   # 必须是回环 http(s) URL
        prefix: /app                    # 它在 Harness 源上出现的位置
        # wsPaths: ['/app/', '/app']    # 可选；默认两种写法都注册
        # forwardCredentials: false     # 默认值；见下
```

它会注册一条前缀路由（双向流式转发，所以 SSE 可用）以及开发服务器 WebSocket 的
HTTP upgrade 路由。由于被桥接的应用与 Harness 同源，Harness 自己的 cookie 和
`Authorization` 头对它可见，而它的 `Set-Cookie` 会落在 Harness 源上——
所以默认双向剥离凭据，除非你用 `forwardCredentials: true` 主动开启。

它只是个代理，不会注入任何脚本。请优先使用普通的 `dsh-annotate` 预览——
后者与 Harness 完全不共享源。

## 卸载

从该 profile 的 `cordis.patch.yml` 里删掉 `- name: dsh-annotate` 这一项和依赖，
然后重启：

```sh
cd ~/.dsh/profiles/web
npx --yes pnpm@10 remove dsh-annotate
```

已保存的批注存在浏览器存储里（Harness 源上的键前缀是 `dsh-review:v2:`，
预览源上是 `dsh-annotate:v2:`）。清掉该工作区的存储即可一并清除。

## 开发

```sh
npm ci
npx playwright install chromium
npm run check   # 构建 lib/、解析每个文件、校验 i18n 文案表
npm test        # 产物内容检查 + 基于断言的 Chromium 套件
```

`npm test` 会启动一次性的回环服务，并让**真实的构建产物**（client、shim、overlay）
通过一个 React 夹具跑起来——目前 26 条断言，覆盖服务发现、源隔离、路径保持、
cookie/fetch/WebSocket 往返、中文输入法、内层滚轮滚动、裁剪、布局位移、
路由与会话隔离、发送被拒与成功、加入输入框、语言切换和窄屏布局。
不会调用任何模型。截图写入被忽略的 `tests/shots/`。

想连真实 Harness，`node scripts/dev.mjs` 会生成一个临时 profile 并把自带夹具跑在上面。

| 路径 | 说明 |
| --- | --- |
| `packages/dsh-annotate/` | 插件本体：host 半、client 半、注入的 shim 与覆盖层 |
| `packages/dsh-app-bridge/` | 固定挂载点的反向代理 |
| `examples/demo-app/` | 开发流程与测试使用的零依赖夹具 |

`packages/dsh-annotate/lib/` 由 `src/` 生成**并提交**（Harness 直接加载这些文件），
所以改动后要跑 `npm run build` 并把结果放进同一个提交。一旦漂移 CI 就会失败。

## 参与贡献

欢迎提 issue 和 pull request——请先看 [CONTRIBUTING.md](CONTRIBUTING.md)，
里面写了上面那条构建规则、对测试的要求，以及文案表的规则。
安全相关问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要开公开 issue。

## 许可证

[MIT](LICENSE)，第三方归属见 [NOTICE](NOTICE)。

这是一个独立插件，与 DeepSeek 没有隶属、背书或赞助关系；
*DeepSeek* 与 *DeepSeek Harness* 归其所有者所有。

---

本文档是 [README.md](README.md) 的中文翻译。`CONTRIBUTING.md`、`SECURITY.md`、
`CHANGELOG.md` 目前只有英文版；改动英文 README 的结构、标题或结论时，请同步更新本文件。
