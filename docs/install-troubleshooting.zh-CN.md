# 安装排障

[English](install-troubleshooting.md)

仅在[常规安装](../README.zh-CN.md#安装)失败或重启后没有标注面板时查看此页。
这里的排查项不需要在每次安装时全部执行。

## 权限报错（`EPERM`）

编程助手的沙盒可能无法写入工作区之外的 Harness profile 或包管理器缓存。
先核对报错中的路径，再为本次操作所需的写入授权，或在外部终端执行安装命令。
修改文件所有权前，先确认实际权限问题。

## 找不到 CLI 或 profile

先打开 Desktop 一次，完成保留的 `desktop` profile 初始化。
该 profile 使用 Desktop 自带的 CLI，独立的 npm CLI 无法管理。
应用不在 `/Applications` 时，请调整命令中的路径。内置 CLI 已带有 Node.js 和 pnpm。

如果 Desktop 已将它的 `dsh` 命令加入 `PATH`，也可执行：

```sh
dsh plugin --profile desktop add dsh-annotate@0.1.14
```

如果通过 `npx @deepseek-ai/dsh web` 启动网页端，使用：

```sh
npx @deepseek-ai/dsh plugin --profile web add dsh-annotate@0.1.14
```

## pnpm 拒绝刚发布的版本

README 使用确切版本，是因为 pnpm 11 默认的 24 小时版本等待期可能让
`@latest` 选到旧版本。内置 pnpm `11.7.0` 在默认配置下可以直接安装指定版本，
并自动记录该版本的 `minimumReleaseAgeExclude` 条目。

如果严格的等待期检查拒绝安装，可以等待配置中的等待期结束。
如需立即安装已核对的版本，仅将该确切版本追加到当前 profile 的
`$DSH_HOME/profiles/<profile>/pnpm-workspace.yaml`
（默认 `~/.dsh/profiles/<profile>/pnpm-workspace.yaml`）中现有的列表，再重试安装：

```yaml
minimumReleaseAgeExclude:
  - dsh-annotate@0.1.14
```

保留其他设置和已有放行条目。等待期结束后，可移除此版本的例外。

## 安装完成，但没有标注面板或无法使用

等当前任务结束后，彻底退出并重新打开 Desktop，或重启网页端 profile 并刷新浏览器。
只刷新预览不会加载更新后的插件。

如果仍有问题，核对当前 profile：

- `node_modules/dsh-annotate/package.json` 中的版本是否与安装版本一致。
- `package.json` → `dsh.profile.bundles` 中是否恰好有一个 `dsh-annotate` 条目。

网页端可用 `dsh --profile web --dump-config` 确认恰好有一个
`- id: dsh-annotate` 条目。Desktop 不支持该 CLI 命令。

重新打开后，进入**标注**（`⌘/Ctrl⇧B`），选择本地应用并保存一条批注。
包已包含构建产物，会自动登记 bundle；常规安装无需构建或手动添加补丁。

## 升级 `0.1.2` 及更早版本（网页端）

这些版本曾在 profile 的 `cordis.patch.yml` 中手动添加：

```yaml
- insert:
    - name: dsh-annotate
```

先移除再添加包，让 Harness 登记 bundle。如使用自定义网页端 profile，请替换 `web`：

```sh
dsh plugin --profile web remove dsh-annotate
dsh plugin --profile web add dsh-annotate@0.1.14
```

只从 `cordis.patch.yml` 删除旧的手动插入行，保留其他条目。
若没有条目剩余，写入 `[]`，不要只留注释。重启 profile、刷新浏览器后，
用 `dsh --profile web --dump-config` 确认恰好有一个标注条目。
