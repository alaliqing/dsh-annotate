# dsh-annotate

[English](README.md) | **简体中文**

[![CI](https://github.com/alaliqing/dsh-annotate/actions/workflows/ci.yml/badge.svg)](https://github.com/alaliqing/dsh-annotate/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-annotate.svg)](https://www.npmjs.com/package/dsh-annotate)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/node/v/dsh-annotate.svg)](package.json)

**指着界面说话，而不是指着代码。** 一个给
[DeepSeek Harness](https://www.npmjs.com/search?q=%40deepseek-ai%2Fdsh)
网页客户端用的评审面板：打开一个你本来就在跑的本地应用，点选想改的元素，
逐个写下意见，然后把整份评审作为一个结构化区块发给当前对话。

面板就是一个普通的侧边栏标签页，用起来像 Harness 自带的功能，而不是外挂工具。

![批注面板与被预览的应用并排：工具栏、批注列表，以及页面上的编号标记](docs/panel-overview.png)

*截图来自测试套件自带的示例应用：工具栏、内嵌式批注列表，以及挂在一个已选元素上的标记。
用 `npm test` 可重新生成。*

```
  ⌘⇧B  →  选一个正在运行的本地服务  →  点选元素  →  写一句意见
        →  发送批注（或加入输入框）  →  模型收到选择器、组件名、几何信息和
           计算样式，以及你的批注
```

## 环境要求

- Node.js 20 或更高版本。
- 一个你可以重启其网页客户端的 DeepSeek Harness 实例。Harness 相关包
  （`@deepseek-ai/dsh-*`）已发布在 npm 上。
- 浏览器以 Chromium 为准。限制见[预览架构与限制](#预览架构与限制)。

除此之外没有别的：`dsh-annotate` 没有任何运行时依赖，构建产物也已提交，
所以安装时不需要构建步骤。

## 安装

用 pnpm 装进某个 Harness profile（`dsh plugin` 内部就是转发给 pnpm）：

```sh
dsh plugin --profile web add dsh-annotate
```

然后在该 profile 的 `cordis.patch.yml` 里加上这个插件：

```yaml
- insert:
    - name: dsh-annotate
```

重启 `dsh web`。如果 `PATH` 里没有 pnpm，可以手动安装：

```sh
cd ~/.dsh/profiles/web
npx --yes pnpm@10 add dsh-annotate
```

想直接跑本地检出而不是已发布包：

```sh
cd ~/.dsh/profiles/web
npx --yes pnpm@10 add "link:/absolute/path/to/dsh-annotate/packages/dsh-annotate"
```

改动 host 侧需要重启 Harness；只改 client 侧刷新页面即可。

## 评审一个本地应用

1. 照你平时的习惯，把项目自己的开发服务器跑起来。
2. 打开一个会话，按 `⌘/Ctrl⇧B`，或点顶部的**标注**按钮，或用侧边栏 `+` 里的入口。
   Harness 需要已经渲染出会话/侧边栏界面；空的欢迎页可能还没有。
3. 从检测结果里选一个服务，或者直接输入 `5173`、`localhost:3000/path` 或本地 URL。
   列表在可见时每 5 秒刷新一次，IPv4 和 IPv6 都会探测。
4. 点**标记**，再点页面里的元素，写下你的意见。

   | 按键 | 作用 |
   | --- | --- |
   | `Enter` | 保存并继续标记 |
   | `Shift+Enter` | 换行 |
   | `Esc` | 取消编辑并退出标记模式 |
   | `⌘/Ctrl`+点击 | 保存这条意见并立即发送本批批注 |

   中文输入法的候选词确认不会被当成保存。
5. 选**加入输入框**把评审合并进你的草稿，或选**发送批注**只发送这份评审。

发送走的是被寻址的 Harness 会话，并等待对方接受。发送被拒时批注会保留；
输入框里无关的文字和附件绝不会被带走。如果 agent 正忙，评审会排队。

标记会跟随真实元素：窗口滚动、内层容器滚动、尺寸变化、布局位移都不会掉队。
元素被裁剪或已经消失时，标记会隐藏，而不是停在过期坐标上。点标记可以修改意见，
或点工具栏里的**批注**按钮展开内嵌列表，逐条定位和删除，且不会遮住预览。
删除可以撤销。

## 语言

面板提供英文和中文。启动时跟随浏览器语言，工具栏上的 `中` / `EN` 按钮可以切换；
选择会按浏览器记住，并同步给被预览的页面，所以页内覆盖层的文案也会跟着变。

文案都在 [`src/i18n.js`](packages/dsh-annotate/src/i18n.js) 里，
两种语言一旦不一致，`npm run check` 就会失败。

## 预览架构与限制

难点在于：`http://127.0.0.1:5173` 提供的页面与 Harness 不同源，而跨源 iframe 的 DOM
根本读不到——所以任何覆盖层都无法标注它。本插件的做法是**每个会话＋应用一个回环预览源**：

- 一个专用的临时 HTTP 服务，监听 `localhost` 或 `127.0.0.1`，并刻意选择与 Harness
  *相反*的主机名，让两者永不共享源。
- 浏览器看到的是应用原本的路径：`/settings` 还是 `/settings`。
  因此根绝对路径的脚本、样式、SPA 路由和 WebSocket 升级都不需要任何路径前缀，也不需要 `<base>`。
- host 侧会往每个 HTML 文档里注入一个小 shim（处理绝对 fetch/XHR/EventSource/WebSocket
  以及 SPA 导航上报）和覆盖层。
- 覆盖层与面板之间只用 `postMessage` 通信，两侧都同时校验来源 **和** 源站。
  面板从不伸手去读预览页的 DOM。
- 代理目标只允许 `localhost`、`127.0.0.1` 和 `[::1]`。外部主机、URL 里带凭据、
  以及 Harness 自身都会被拒绝，HTTP 和 WebSocket 升级都是如此。
- 除非来自 Harness 自己的源，否则写入类 host API 一律拒绝。
- 应用 cookie 会加命名空间，并以 `SameSite=None; Secure; Partitioned` 发送；
  没有前缀的 cookie 双向都会被剥离。分区 cookie 以 Chromium 为准。
- 插件销毁时，预览服务及其 socket 一并关闭。每次启动最多保留 24 个会话/应用预览。

早期设计是在 Harness 源上用路径前缀代理应用。它被直接删除而不是留成开关：
它什么也没隔离，还把一条通往任意回环端口的、不校验来源的 WebSocket 隧道放在了 Harness 源上。

这是本地开发预览，不是通用浏览器：

- 对源敏感的应用可能需要专门配置，或者干脆用正常浏览器：OAuth 跳转、
  源白名单、写死源的应用、Service Worker。
- HTTPS 上游使用正常的证书校验。证书不受信任会显式报错，绝不会静默跳过校验。
- 禁止内联脚本的 CSP 会导致注入失败。预览会去掉 HTTP 层的 CSP 头，
  但文档内部声明的策略依然生效。
- 无法选中 Shadow DOM 内部和跨源子 frame。Canvas 只能整体作为一个 canvas 元素选中，
  不能选中其中绘制的单个对象。
- 远程 Harness 实例、HTTPS 反向代理部署、以及从另一台电脑访问宿主机的回环服务，
  都不在"仅本地"这一设计范围内。
- 预览页是受信任的本地代码，它并不是你和被预览应用之间的安全边界。

## 一条批注包含什么

每条意见都会带上模型重新定位该元素所需的证据：

| 字段 | 内容 |
| --- | --- |
| 位置 | 原始 URL、页面、视口尺寸，以及元素在视口中的分区 |
| 身份 | 转义后的 CSS 选择器、命中元素数量、标签名、首个 class |
| 语义锚点 | 存在时给出 `role`、`aria-label`、`alt`、`name`、`data-testid` |
| 组件 | 最近的组件名与组件链（需要开发构建） |
| 几何 | 宽 × 高与位置 |
| 样式 | 一小组计算样式值，作为证据——不是样式编辑工具 |
| 文本 | 元素可见文本（在足够短、有用时） |
| 批注 | 你写的意见 |

载荷不会截图，也不会改动任何样式。

批注和写到一半的草稿以「Harness 会话 + 完整应用 URL（含 query 和 hash）」为作用域，
所以 SPA 的各个路由会各自恢复。它们同时镜像在预览源的存储和 Harness 一侧，
刷新不会丢失评审。旧的 `v1` 记录会原样保留，而不是被猜测后塞进一个不相干的会话。

## 配置

全部可选；面板靠自动发现工作，不需要任何配置。

```yaml
- insert:
    - name: dsh-annotate
      config:
        detect:
          extraPorts: [4321]     # 除常见端口外，始终额外探测这些端口
          probeTimeoutMs: 900    # 单个端口的 HTTP 探测预算
          cacheMs: 2000          # 扫描结果的复用时长
          staticPorts: false     # 默认 true 时也会探测常见端口列表
```

进程托管默认关闭，除非你显式配置。host API 接受 `command`（空格分隔）或 `argv`
（路径含空格时推荐），以及 `port`、`base`、`readyTimeoutMs`。面板不提供启动/停止按钮：
默认情况下插件永远不会启动或停止你的开发服务器，只会打开你自己启动的那个。

## `dsh-app-bridge`

本仓库里的第二个小包，用于应用必须挂在**Harness 源上的固定路径**这一情形
（例如已经带 base 前缀、无法用别的方式提供的开发服务器）：

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
`Authorization` 头对它可见，而它的 `Set-Cookie` 会落在 Harness 源上；
默认双向剥离凭据，除非你用 `forwardCredentials: true` 主动开启。

它只是个代理，不会注入任何脚本。请优先使用普通的 `dsh-annotate` 预览——
后者与 Harness 完全不共享源。

## 开发

```sh
npm ci
npx playwright install chromium
npm run check   # 构建 lib/、检查每个文件语法、校验 i18n 文案表
npm test        # 产物内容检查 + 基于断言的 Chromium 套件
```

`npm test` 会启动一次性的回环服务，并让真实的构建产物（client、shim、overlay）
通过一个 React 测试夹具跑起来。覆盖内容包括：服务发现、预览隔离、路径保持、
cookie/fetch/WebSocket 往返、中文输入法、内层滚轮滚动、裁剪、布局位移、
路由与会话隔离、发送被拒与成功、加入输入框、语言切换，以及窄屏布局。
不会调用任何模型。截图写入被忽略的 `tests/shots/`。

想连真实 Harness，`node scripts/dev.mjs` 会生成一个临时 profile 并把自带夹具跑在上面。
参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

| 路径 | 说明 |
| --- | --- |
| `packages/dsh-annotate/` | 插件本体：host 半、client 半、注入的 shim 与覆盖层 |
| `packages/dsh-app-bridge/` | 固定挂载点的反向代理 |
| `examples/demo-app/` | 开发流程与测试使用的零依赖夹具应用 |

## 参与贡献

欢迎提 issue 和 pull request——请先看 [CONTRIBUTING.md](CONTRIBUTING.md)，
里面写了最容易踩的构建规则（`lib/` 既是生成产物**又**要提交）以及对测试的要求。
安全相关问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要开公开 issue。

## 许可证

[MIT](LICENSE)，第三方归属见 [NOTICE](NOTICE)。

---

本文档是 [README.md](README.md) 的中文翻译。`CONTRIBUTING.md`、`SECURITY.md`、
`CHANGELOG.md` 目前只有英文版；改动英文 README 的结构时，请同步更新本文件。
