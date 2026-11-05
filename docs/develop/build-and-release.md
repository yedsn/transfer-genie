# 构建与发布

本文档面向维护者和开发者，说明如何构建桌面应用以及如何发布文档站。

## 本地构建桌面应用

```bash
cargo tauri build
```

生成的安装包默认位于：

- macOS：`target/release/bundle/`
- Windows：`target/release/bundle/`

## GitHub Release 流程

仓库已包含桌面应用发布 workflow：

- `release.yml`：构建 Tauri 安装包并上传到 GitHub Releases
- `sync-gitee-release.yml`：将 GitHub Release 同步到 Gitee

### Gitee 同步下载容错

同步脚本从 GitHub 下载 Release 附件时，依次尝试以下方式；每种方式连续失败 3 次后才切换到下一种：

1. GitHub Variables 中配置的第三方下载代理前缀
2. Runner 网络代理 `GITEE_SYNC_PROXY`
3. GitHub 官方地址直连

每次下载完成后都会计算 SHA-256。若 GitHub Release 资产元数据提供 `digest: sha256:...`，脚本会在上传 Gitee 前强制比对；哈希不一致会删除本次临时文件，并按当前方式重试，连续失败 3 次后切换下一种下载方式。若 GitHub 没有提供 digest，日志只会输出本地计算值并明确标记为“无可比对值”。

在仓库 [Actions Variables](https://github.com/yedsn/transfer-genie/settings/variables/actions) 中新建：

- Name：`RELEASE_DOWNLOAD_PROXY_PREFIXES`
- Value：一个或多个第三方代理前缀，多个值可用逗号、分号或换行分隔

例如：

```text
https://ghfast.top
```

脚本会把 GitHub 下载地址拼成：

```text
https://ghfast.top/https://github.com/yedsn/transfer-genie/releases/download/vX.Y.Z/<asset>
```

也可以使用 `{url}` 占位符，例如 `https://example.com/?url={url}`。不配置该变量时会直接从 Runner 代理方式开始。工作流会自动把所有第三方代理域名加入 `NO_PROXY/no_proxy`，下载脚本也会显式禁用环境代理，因此第三方地址不会经过 `GITEE_SYNC_PROXY`。日志中的 `Connection: direct (environment proxies disabled)`、`Response host`、`Response cache status` 和 `Average speed` 可用于确认实际连接方式和代理站缓存状态。新 Release 首次访问出现 `MISS` 时，代理站可能需要回源 GitHub，因此可能比后续缓存命中慢。`GITEE_SYNC_PROXY` 必须是 Runner 主机可以访问的代理地址；只有代理程序也运行在 Runner 主机上时才能使用 `127.0.0.1`。Gitee API 和附件上传保持直连。

### GitHub 侧配置

1. 打开 [Actions Variables](https://github.com/yedsn/transfer-genie/settings/variables/actions)，点击 **New repository variable**，将 `RELEASE_DOWNLOAD_PROXY_PREFIXES` 设置为 `https://ghfast.top`，然后点击 **Add variable**。如果需要配置多个第三方代理，可按优先级用换行分隔。GitHub 禁止自定义 Variable 使用保留的 `GITHUB_` 前缀，因此不能命名为 `GITHUB_DOWNLOAD_PROXY_PREFIXES`。
2. 打开 [Actions Secrets](https://github.com/yedsn/transfer-genie/settings/secrets/actions)，确认 Secret `GITEE_ACCESS_TOKEN` 已配置；该 Token 所属账号必须能向 `hongxiaojian/transfer-genie` 发布 Release 附件。
3. 打开 [Actions Runners](https://github.com/yedsn/transfer-genie/settings/actions/runners)，确认 self-hosted Runner 为 Online/Idle，并能匹配工作流中的 `self-hosted` 标签。
4. Runner 是否需要代理访问 GitHub：**待确认**。如果需要，在 Actions Variables 新建 `GITEE_SYNC_PROXY`；Value 必须是 Runner 主机可达的代理 URL。运行工作流后，确认 `Configure proxy for GitHub access` 没有被跳过，且 Checkout、GitHub API 和附件下载均成功；如果 Runner 服务本身无法注册、上线或领取任务，还需为 Runner 服务配置代理并重启服务。
5. 在 [Sync Latest Release to Gitee](https://github.com/yedsn/transfer-genie/actions/workflows/sync-gitee-release.yml) 页面手动运行工作流，可留空 tag 同步最新 Release，或填写指定的 `v*` tag。日志中应出现 `SHA-256 verified`；只有所有附件下载并校验完成后，脚本才会更新 Gitee Release。

## 文档站发布流程

官网与文档站使用 VitePress 构建，通过 GitHub Pages 发布。

本地命令：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:preview
```

部署细节与 `base` 配置见：[`/reference/site-deployment`](/reference/site-deployment)
