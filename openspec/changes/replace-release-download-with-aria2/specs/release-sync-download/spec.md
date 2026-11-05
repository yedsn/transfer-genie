# Spec Delta

## Purpose

为 GitHub Release 到 Gitee 的同步流程提供可代理、多连接、可校验且不依赖第三方缓存站的资产下载能力。

## ADDED Requirements

### Requirement: GitHub Release assets use aria2 through the configured Runner proxy
同步流程 MUST 使用 Runner 上可用的 aria2 下载 GitHub Release 资产；当配置了 `GITEE_SYNC_PROXY` 时，下载器 MUST 通过该代理访问 GitHub，且不得再依赖第三方 URL 前缀或第三方缓存站。

#### Scenario: Proxy-backed aria2 download succeeds
- **WHEN** self-hosted Runner 存在可执行的 aria2 且 `GITEE_SYNC_PROXY` 可用
- **THEN** 资产通过 aria2 经该代理下载，日志记录下载方式和最终响应主机，并继续执行完整性校验

#### Scenario: aria2 is unavailable
- **WHEN** Runner 未安装 aria2 或 aria2 不可执行
- **THEN** 同步任务在下载前明确失败，并提示安装或配置 aria2，而不是静默退回第三方下载站

### Requirement: Download retries and fallback preserve release synchronization
下载流程 MUST 对每个 GitHub 资产执行最多 3 次 aria2 下载尝试；单个资产下载失败后 MUST 清理临时文件并重试，3 次仍失败时 MUST 终止同步或按已确认的官方 GitHub 回退地址继续，不得使用第三方下载代理。

#### Scenario: Transient aria2 failure is retried
- **WHEN** aria2 因网络超时、连接重置或代理暂时不可用而失败
- **THEN** 同一资产最多重试 3 次，并在日志中记录每次尝试结果

#### Scenario: All aria2 attempts fail
- **WHEN** 同一资产的 3 次 aria2 尝试均失败
- **THEN** 同步任务报告资产名称、失败原因和可操作的 Runner/代理检查项，并且不上传未完成文件

### Requirement: Downloaded assets are verified before Gitee upload
同步流程 MUST 在上传到 Gitee 前校验 GitHub 资产声明的文件大小，并在 GitHub API 提供 `digest: sha256:...` 时校验 SHA-256；只有校验成功的完整文件才允许上传。

#### Scenario: Size and SHA-256 match
- **WHEN** aria2 下载文件的字节数和 SHA-256 与 GitHub 资产元数据一致
- **THEN** 临时文件转为正式文件并允许上传到 Gitee

#### Scenario: Size or SHA-256 mismatch
- **WHEN** 下载结果大小不一致或 SHA-256 不匹配
- **THEN** 文件被删除，当前尝试视为失败并进入重试，不得上传该文件

### Requirement: Proxy credentials and Gitee direct access are isolated
第三方下载站 URL 前缀 MUST 从同步流程和配置文档中移除；`GITHUB_TOKEN` MUST NOT 被发送给非 GitHub 下载主机；Gitee API 和上传请求 MUST 保持直连，不使用 GitHub 下载代理。

#### Scenario: GitHub token is not sent to Gitee
- **WHEN** 同步流程调用 Gitee API 或上传附件
- **THEN** 请求不携带 `GITHUB_TOKEN`，并直接连接 Gitee

#### Scenario: No third-party proxy variable is configured
- **WHEN** 仓库中仍存在旧的 `RELEASE_DOWNLOAD_PROXY_PREFIXES` 配置
- **THEN** 新版工作流和脚本忽略或明确拒绝该配置，并只使用 aria2 + `GITEE_SYNC_PROXY` 的下载路径
