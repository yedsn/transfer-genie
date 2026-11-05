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

同步脚本使用 `aria2c` 从 GitHub 下载 Release 附件，并通过可选的 Runner 代理 `GITEE_SYNC_PROXY` 访问 GitHub。aria2 默认使用 4 个分段连接、每个服务器最多 4 个连接和 `1M` 最小分段大小；单个附件最多尝试 3 次。self-hosted Runner 必须预装 `aria2c`，工作流会在同步前执行 `aria2c --version` 预检。

每次下载先写入临时 `.part` 文件，完成后检查 GitHub 资产声明的文件大小并计算 SHA-256。若资产元数据提供 `digest: sha256:...`，脚本会在上传 Gitee 前强制比对；哈希或大小不一致会删除临时文件并重试，3 次失败后停止同步，不会上传不完整文件。若 GitHub 没有提供 digest，日志会输出本地计算值并标记为“无可比对值”。

在仓库 [Actions Variables](https://github.com/yedsn/transfer-genie/settings/variables/actions) 中仅按需配置：

### GitHub 侧配置

1. 打开 [Actions Variables](https://github.com/yedsn/transfer-genie/settings/variables/actions)，如 Runner 访问 GitHub 需要代理，新增 `GITEE_SYNC_PROXY`；Value 必须是 Runner 主机可达的代理 URL。
2. 打开 [Actions Secrets](https://github.com/yedsn/transfer-genie/settings/secrets/actions)，确认 Secret `GITEE_ACCESS_TOKEN` 已配置；该 Token 所属账号必须能向 `hongxiaojian/transfer-genie` 发布 Release 附件。
3. 打开 [Actions Runners](https://github.com/yedsn/transfer-genie/settings/actions/runners)，确认 self-hosted Runner 为 Online/Idle，并能匹配工作流中的 `self-hosted` 标签，且已安装 `aria2c`。
4. 运行工作流后，确认 `Configure proxy for GitHub access` 没有被跳过（如果配置了代理），日志出现 `aria2 attempt` 和 `SHA-256 verified`；Gitee API 与附件上传通过 `NO_PROXY` 保持直连。
5. 在 [Sync Latest Release to Gitee](https://github.com/yedsn/transfer-genie/actions/workflows/sync-gitee-release.yml) 页面手动运行工作流，可留空 tag 同步最新 Release，或填写指定的 `v*` tag。只有所有附件下载并校验完成后，脚本才会更新 Gitee Release。

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
