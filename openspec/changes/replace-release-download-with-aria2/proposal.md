# Proposal

## Why

第三方下载代理的缓存未命中时会回源 GitHub，导致 Release 大文件同步速度很慢且不可预测。将下载路径收敛为通过 Runner 配置的 `GITEE_SYNC_PROXY` 使用 aria2 下载 GitHub 官方 Release 资产，可以移除第三方缓存依赖，同时保留多连接下载、失败回退和完整性校验。

## What Changes

- 移除 `RELEASE_DOWNLOAD_PROXY_PREFIXES`、第三方代理 URL 前缀和缓存 MISS 快速回退逻辑。
- 使用 aria2 下载 GitHub Release 资产，支持通过 `GITEE_SYNC_PROXY` 为 aria2 配置 HTTP/HTTPS 代理。
- 增加 GitHub Actions Variable `GITEE_SYNC_USE_ARIA2`；只有值为 `true` 时使用 aria2，未配置或为 `false` 时使用 curl 单连接下载。
- 保留 GitHub API 资产信息获取、3 次重试、临时文件、文件大小校验和 SHA-256 digest 校验。
- 将 aria2 作为 self-hosted Runner 的明确前置依赖，并在工作流中预检版本/可用性。
- 继续让 Gitee API 和上传请求直连，代理只用于 GitHub Checkout/API/Release 下载。
- 同步更新项目发布文档、GitHub Actions 工作流和 `my-github-release` 技能模板，统一后续项目的下载流程。

## Capabilities

### New Capabilities
- `release-sync-download`: 定义 GitHub Release 资产通过 aria2、Runner 代理和完整性校验同步到 Gitee 的行为。

### Modified Capabilities

## Impact

- `.github/workflows/release.yml`
- `.github/workflows/sync-gitee-release.yml`
- `scripts/release/release_sync_gitee.py`
- `docs/develop/build-and-release.md`
- `my-github-release` 技能的主规则、工作流模板、同步脚本模板及发布参考文档
- self-hosted Runner：需要可执行的 `aria2c`，并确认 `GITEE_SYNC_PROXY` 可达
- GitHub Actions Variables：可选的 `GITEE_SYNC_USE_ARIA2=true` 用于启用 aria2；默认使用 curl
