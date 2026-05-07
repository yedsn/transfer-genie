# 构建与发布

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
