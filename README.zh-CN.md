# dsh-annotate

[English](README.md) · **简体中文**

[![CI](https://github.com/alaliqing/dsh-annotate/actions/workflows/ci.yml/badge.svg)](https://github.com/alaliqing/dsh-annotate/actions/workflows/ci.yml)
[![许可证：MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](package.json)

**直接指出界面问题，把准确上下文交给编程助手。**

`dsh-annotate` 为 DeepSeek Harness 网页端增加了一个可视化评审面板。打开本地应用，
点选想改的元素，逐条留下意见，再把整份评审以结构化文本发进当前对话。

![dsh-annotate 中的本地应用、批注列表和页面编号标记](docs/panel-overview.png)

```text
⌘/Ctrl ⇧ B → 选择本地应用 → 标记 → 点选 → 写批注 → 发送
```

> **预发布状态：** 目前尚未发布到 npm，请从本地检出安装；仓库已包含构建产物。

## 核心能力

- **零配置发现**正在运行的本地开发服务器，同时支持 IPv4 和 IPv6。
- **元素级上下文：** CSS 选择器及命中数量、语义属性、React 组件链、几何信息、
  计算样式和可见文本。
- **始终跟随元素的标记：** 支持窗口滚动、内层滚动、尺寸变化和布局位移。
- **两种明确的发送方式：** 单独发送评审，或加入当前草稿；发送失败也不会丢批注。
- **彼此隔离的预览：** 保留应用路由、资源、fetch 和 WebSocket，同时不与 Harness 共用源。
- **中英双语界面**，可在工具栏切换。

插件不会截图、不会修改页面样式，也不会替你启动或结束开发服务器。

## 安装

需要可重启的 DeepSeek Harness 网页客户端、Node.js 20+，以及 Chromium
（目前完成完整验证的浏览器）。

```sh
git clone https://github.com/alaliqing/dsh-annotate.git
cd ~/.dsh/profiles/web
npx --yes pnpm@10 add "link:/绝对路径/dsh-annotate/packages/dsh-annotate"
```

在该 profile 的 `cordis.patch.yml` 中启用插件：

```yaml
- insert:
    - name: dsh-annotate
```

重启 `dsh web`。首个 npm 版本发布后，安装命令会变为：

```sh
dsh plugin --profile web add dsh-annotate
```

## 使用

1. 启动应用的开发服务器。
2. 打开一个 Harness 对话，然后按 `⌘/Ctrl⇧B` 或点击顶部的**标注**按钮。
3. 选择检测到的服务，或手动输入端口/回环 URL。
4. 点击**标记**，点选元素并写下意见。
5. 选择**加入输入框**或**发送批注**。

| 按键 | 操作 |
| --- | --- |
| `Enter` | 保存并继续标记 |
| `Shift+Enter` | 换行 |
| `Esc` | 取消并退出标记模式 |
| `⌘/Ctrl` + 点击 | 保存并发送整批内容 |

批注和草稿按 Harness 会话与完整应用 URL 存储，因此不同路由可以独立恢复，
不同会话也不会串数据。

## 模型会收到什么

```text
🎯 界面标注 · /settings · 视口 1440×900（1 条）
#1 button.primary  组件: SubmitButton
   语义: aria-label="保存修改" · data-testid=save
   组件链: SettingsPage > SettingsForm > SubmitButton
   选择器: #root > form > button.primary（命中 1 个元素）
   位置/尺寸: 96×32 @ (640, 512) · 视口 正中
   当前样式: display:inline-block; padding:8px 16px; …
   文本: 保存修改
   批注: 表单没有变化时，这个按钮应该禁用。
```

React 组件名需要开发构建才能可靠获取；可见文本最多保留 120 个字符。

## 预览隔离

普通跨源 iframe 无法暴露 DOM。`dsh-annotate` 不会把应用搬到 Harness 源上，
而是为每个会话/应用组合创建独立的临时回环源，并注入一层很小的 shim 和点选覆盖层。

- 面板与覆盖层通信时同时校验消息来源和源站。
- 目标仅允许 `localhost`、`127.0.0.1` 和 `[::1]`。
- 应用 cookie 带独立命名空间；没有前缀的 cookie 会在两个方向都被移除。
- 插件销毁时一并关闭预览服务和 socket。

这是本地开发工具，不是浏览器沙箱。OAuth、严格源白名单、Service Worker、限制性 CSP、
Shadow DOM 内部、跨源子 frame 和 Canvas 内部对象，可能需要正常浏览器或应用专门配置。
完整 cookie 模型目前只在 Chromium 上验证过。

## 可选配置

```yaml
- insert:
    - name: dsh-annotate
      config:
        detect:
          extraPorts: [4321]
          probeTimeoutMs: 900
          cacheMs: 2000
          staticPorts: false
```

仓库还包含 [`dsh-app-bridge`](packages/dsh-app-bridge/README.md)，用于必须把应用挂载到
Harness 源固定路径下的少数情况。它只是反向代理，不提供批注界面。

## 开发

```sh
npm ci
npx playwright install chromium
npm run check
npm test
```

测试会在 Chromium 中驱动真实的 client、shim 和 overlay 构建产物，不会调用模型。
`packages/dsh-annotate/lib/` 下的生成文件会提交到仓库，必须与源码保持同步。

仓库约定见 [CONTRIBUTING.md](CONTRIBUTING.md)；安全问题请按
[SECURITY.md](SECURITY.md) 私下报告。

## 许可证

[MIT](LICENSE)，第三方归属见 [NOTICE](NOTICE)。

这是独立的社区插件，与 DeepSeek 没有隶属或背书关系。
