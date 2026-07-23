---
description: Transfer Genie 官网 VitePress 构建、GitHub Pages 发布、DOCS_BASE 配置和内容维护说明。
---

# 站点与发布说明

Transfer Genie 官网使用 VitePress 构建，并通过 GitHub Pages 发布。

## 本地预览

安装依赖：

```bash
npm install
```

开发模式：

```bash
npm run docs:dev
```

生产构建：

```bash
npm run docs:build
```

本地预览构建结果：

```bash
npm run docs:preview
```

## GitHub Pages `base` 约束

默认按 GitHub Pages 项目站点构建：

- 仓库：`yedsn/transfer-genie`
- 站点地址：`https://yedsn.github.io/transfer-genie/`
- 默认 `base`：`/transfer-genie/`

VitePress 配置会优先读取 `DOCS_BASE`；如果在 GitHub Actions 中未显式指定，就自动根据 `GITHUB_REPOSITORY` 推导仓库名。

这意味着：

- 本地开发默认使用 `/`
- CI 构建默认使用 `/<repo-name>/`
- 如果未来切到自定义域名，可以把 `DOCS_BASE=/` 作为构建环境变量覆盖

## GitHub Actions 工作流

站点通过 `.github/workflows/pages.yml` 发布，主要步骤为：

1. Checkout 仓库
2. 安装 Node 依赖
3. 执行 `npm run docs:verify-seo`
4. 上传 `docs/.vitepress/dist`
5. 调用 GitHub Pages deploy action 发布

`npm run docs:verify-seo` 会先按生产 `base` 构建，再检查 `robots.txt`、`sitemap.xml`、`llms.txt`、FAQ 结构化数据、使用场景页和对比页是否进入产物。

构建时会过滤 sitemap：面向用户的下载页、FAQ、使用场景、对比、安装和集成文档会进入 `sitemap.xml`；重构记录、旧入口和临时开发记录不会进入 sitemap，并会输出 `noindex, follow`。

## 部署后公网检查

部署完成后可以手动检查公网内容：

```bash
npm run docs:verify-live-seo
```

默认检查 `https://yedsn.github.io/transfer-genie/`。如果改成自定义域名，可以用 `SITE_URL` 覆盖：

```bash
SITE_URL=https://example.com/ npm run docs:verify-live-seo
```

仓库也提供 `.github/workflows/live-seo-check.yml`，用于在 GitHub Actions 中手动触发公网检查。适合在 GitHub Pages 部署完成后验证：

- 首页是否带 `SoftwareApplication` 结构化数据。
- `robots.txt` 是否允许抓取并指向生产 sitemap。
- `sitemap.xml` 是否包含下载页、FAQ、使用场景页和对比页。
- `llms.txt` 和 `llms-full.txt` 是否能被直接访问。
- FAQ、下载页、NAS WebDAV 场景页、微信文件传输助手对比页是否返回 `200`。

手动触发时可以保留默认 `site_url`，也可以输入自定义域名。

## 内容维护约定

- README 保持仓库首页入口角色
- 深度说明优先更新 `docs/` 里的文档页
- 公开站点首页与 README 的产品定位、核心能力和主 CTA 需要同步维护
- 改动 SEO 相关内容后，优先执行 `npm run docs:verify-seo`
- GitHub Pages 发布完成后，再执行 `npm run docs:verify-live-seo` 检查公网内容
- 如果不方便在本地检查，可以在 GitHub Actions 手动运行 `Live SEO Check`
