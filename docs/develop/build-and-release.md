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

同步脚本默认使用 `curl` 单连接下载 GitHub Release 附件；将仓库 Actions Variable `GITEE_SYNC_USE_ARIA2` 设置为 `true` 后改用 `aria2c`。两种下载器都通过可选的 Runner 代理 `GITEE_SYNC_PROXY` 访问 GitHub，且单个附件最多尝试 3 次。aria2 使用 4 个分段连接、每个服务器最多 4 个连接和 `1M` 最小分段大小。工作流会根据开关执行 `curl --version` 或 `aria2c --version` 预检。

每次下载先写入临时 `.part` 文件，完成后检查 GitHub 资产声明的文件大小并计算 SHA-256。若资产元数据提供 `digest: sha256:...`，脚本会在上传 Gitee 前强制比对；哈希或大小不一致会删除临时文件并重试，3 次失败后停止同步，不会上传不完整文件。若 GitHub 没有提供 digest，日志会输出本地计算值并标记为“无可比对值”。

需要在 Runner 上比较普通单连接下载与 aria2 多连接下载时，可运行：

```bash
chmod +x scripts/release/benchmark_github_download.sh
GITEE_SYNC_PROXY=http://代理地址:端口 \
  ./scripts/release/benchmark_github_download.sh \
  'https://github.com/OWNER/REPO/releases/download/vX.Y.Z/ASSET'
```

脚本让 `curl` 和 `aria2c` 使用完全相同的 URL 与代理，每种方式默认测试两轮并交替执行顺序，最后比较平均耗时、平均速度、文件大小和 SHA-256。使用 `--rounds 3` 可增加测试轮数，使用 `--keep` 可保留下载文件和 CSV 结果。为了避免 GitHub CDN 缓存、代理缓存和瞬时网络波动影响结论，建议使用至少几十 MiB 的 Release 附件并测试 2～3 轮。

在仓库 [Actions Variables](https://github.com/yedsn/transfer-genie/settings/variables/actions) 中仅按需配置：

### GitHub 侧配置

1. 打开 [Actions Variables](https://github.com/yedsn/transfer-genie/settings/variables/actions)：如 Runner 访问 GitHub 需要代理，新增 `GITEE_SYNC_PROXY`；如需启用 aria2，新增 `GITEE_SYNC_USE_ARIA2` 并设为 `true`。未配置或设为 `false` 时使用 curl。
2. 打开 [Actions Secrets](https://github.com/yedsn/transfer-genie/settings/secrets/actions)，确认 Secret `GITEE_ACCESS_TOKEN` 已配置；该 Token 所属账号必须能向 `hongxiaojian/transfer-genie` 发布 Release 附件。
3. 打开 [Actions Runners](https://github.com/yedsn/transfer-genie/settings/actions/runners)，确认 self-hosted Runner 为 Online/Idle，并能匹配工作流中的 `self-hosted` 标签。默认路径要求 `curl`；只有 `GITEE_SYNC_USE_ARIA2=true` 时才要求安装 `aria2c`。
4. 运行工作流后，确认 `Configure proxy for GitHub access` 已设置 Gitee 直连规则。同步日志应出现 `curl attempt` 或 `aria2 attempt`，随后出现 `SHA-256 verified`。
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
