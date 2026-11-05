# Design

## Context

当前同步脚本由 Python 获取 GitHub Release 元数据，再通过第三方 URL 前缀、Runner 代理或 GitHub 官方地址下载资产，最后上传到 Gitee。第三方缓存未命中时会慢速回源；目标变更见 `proposal.md`，行为契约见 `specs/release-sync-download/spec.md`。

## Goals / Non-Goals

**Goals:**

- 用 aria2 作为唯一 GitHub Release 资产下载器，并支持 `GITEE_SYNC_PROXY`。
- 保留官方 GitHub 资产 API 元数据、重试、临时文件、文件大小和 SHA-256 校验。
- 保证 Gitee API/上传不经过 GitHub 下载代理。
- 让 self-hosted Runner 在下载前明确检查 aria2。

**Non-Goals:**

- 不引入第三方下载站或缓存服务。
- 不改变 Gitee Release 创建、删除附件、上传附件和 `latest.json` 重写逻辑。
- 不在本变更中调整 Tauri updater 协议或应用端更新 UI。

## Decisions

### 1. 使用 aria2 CLI，不在 Python 中实现分段下载

Python 负责调用 GitHub API、准备临时签名下载地址、执行 aria2、读取退出码和校验文件；aria2 负责 Range 分段、连接复用、代理和进度。这样避免重复实现下载器。

备选方案：继续使用 `urllib` 单连接下载；实现成本低，但不能利用 GitHub Release 的 Range 能力改善慢速链路。

### 2. 下载地址使用 GitHub 资产 API 返回的官方地址

先用 `GITHUB_TOKEN` 请求 Release 资产元数据并获取资产 API URL。下载阶段只将 GitHub 返回的官方可下载 URL 交给 aria2，通过 `--all-proxy` 使用 `GITEE_SYNC_PROXY`；不把 Token 注入第三方域名，也不构造第三方 URL 前缀。

备选方案：把 `Authorization` 作为 aria2 Header 传入。该方案可能在重定向到对象存储时泄露 GitHub Token，因此不采用；若 GitHub API 返回的签名地址仍需要鉴权，则使用短时 URL 与最小必要 Header，并在实现时限制重定向凭据传播。

### 3. aria2 参数采用保守的多连接配置

默认使用 `--split=4`、`--max-connection-per-server=4`、`--min-split-size=1M`、`--file-allocation=none`、`--allow-overwrite=true` 和 `--auto-file-renaming=false`。参数通过脚本常量集中管理，便于在 Runner 网络上调优。

备选方案：使用 16 或更多连接；可能触发代理限流或让同一上游重复回源，默认不采用。

### 4. 通过临时文件和 aria2 checksum/后置校验双重保护

aria2 输出到 `<asset>.part`，成功退出后 Python 校验文件大小和 GitHub `digest`；校验通过才替换为正式文件。若 aria2 版本支持 `--checksum=sha-256=...`，可以同时启用，但 Python 后置校验仍是最终门槛，避免不同 aria2 版本行为差异。

### 5. 工作流和 Runner 依赖显式化

两个 Gitee 同步工作流都移除 `RELEASE_DOWNLOAD_PROXY_PREFIXES` 及第三方域名提取步骤，保留 `GITEE_SYNC_PROXY` 的 Checkout/API 代理配置，并在 Checkout 后增加 `aria2c --version` 预检。Runner 安装指南增加 aria2 安装命令和版本检查。

## Risks / Trade-offs

- [GitHub 官方地址或代理不支持稳定 Range] → aria2 仍可退化为单连接；失败时按资产重试 3 次并报告 aria2 原始错误。
- [self-hosted Runner 没有 aria2c] → 预检阶段直接失败，提示安装，不静默回到第三方下载。
- [aria2 并发连接触发代理限流] → 默认只使用 4 个连接，参数集中可调，日志记录最终速度。
- [临时签名 URL 过期] → 每次资产重试前重新获取/刷新可下载 URL，避免复用过期地址。
- [GitHub 资产 API URL 需要鉴权] → 优先使用 API 返回的官方可下载响应；不得向非 GitHub 主机发送 `GITHUB_TOKEN`。

## Migration Plan

1. 更新同步脚本、两个工作流和发布文档，删除第三方前缀变量说明。
2. 在目标 self-hosted Runner 安装 aria2，并确认 `aria2c --version` 可执行。
3. 配置或确认 `GITEE_SYNC_PROXY`，运行手动同步工作流验证官方 GitHub URL 经代理下载。
4. 检查日志、文件大小、SHA-256 和 Gitee 上传结果。
5. 回滚时恢复旧脚本和工作流；不删除已上传的 Gitee Release 资产。

## Open Questions

- 当前 self-hosted Runner 上的 aria2 版本和安装方式需在实施前确认；不影响设计，但决定预检和安装文档的具体命令。
