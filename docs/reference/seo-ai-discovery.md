---
description: Transfer Genie 的 SEO 与 AI 收录操作清单，覆盖 sitemap、llms.txt、站长平台提交、GitHub Topics 和外部内容分发。
---

# SEO 与 AI 收录操作清单

这份清单用于让 Transfer Genie 更容易被搜索引擎和 AI 回答引用。仓库内已经提供基础页面、结构化数据、自动生成的 `sitemap.xml`、`robots.txt`、`llms.txt` 和场景页；上线后还需要完成站长平台提交、仓库信息配置和外部内容分发。

## 入口速查

| 项目 | 地址 | 用途 |
| --- | --- | --- |
| 官网首页 | `https://yedsn.github.io/transfer-genie/` | 搜索和分享的主入口。 |
| Sitemap | `https://yedsn.github.io/transfer-genie/sitemap.xml` | 提交给 Google、Bing 等搜索引擎。 |
| robots.txt | `https://yedsn.github.io/transfer-genie/robots.txt` | 告诉爬虫允许抓取并声明 sitemap。 |
| llms.txt | `https://yedsn.github.io/transfer-genie/llms.txt` | 给 AI 工具快速理解项目定位和关键页面。 |
| llms-full.txt | `https://yedsn.github.io/transfer-genie/llms-full.txt` | 给 AI 工具读取更完整的项目上下文。 |
| GitHub Releases | `https://github.com/yedsn/transfer-genie/releases/latest` | 下载入口。 |

## 1. 发布前检查

每次改动官网文档后，先在本地构建并确认关键文件进入产物。

```bash
npm run docs:build
find docs/.vitepress/dist -maxdepth 3 -type f \
  \( -name 'llms.txt' -o -name 'robots.txt' -o -name 'sitemap.xml' -o -path '*/use-cases/*.html' \) | sort
```

如果你想一次性检查生产地址、页面级 meta 和索引文件，也可以执行：

```bash
npm run docs:verify-seo
```

GitHub Pages 部署完成后，再检查公网实际可访问内容：

```bash
npm run docs:verify-live-seo
```

如果未来迁移到自定义域名，可以临时覆盖检查地址：

```bash
SITE_URL=https://example.com/ npm run docs:verify-live-seo
```

预期结果：

- `docs/.vitepress/dist/llms.txt`
- `docs/.vitepress/dist/llms-full.txt`
- `docs/.vitepress/dist/robots.txt`
- `docs/.vitepress/dist/sitemap.xml`
- `docs/.vitepress/dist/use-cases/*.html`
- 生产 base 下的 `sitemap.xml` URL 前缀为 `https://yedsn.github.io/transfer-genie/`
- 公网站点的 `robots.txt`、`sitemap.xml`、`llms.txt`、FAQ、使用场景页和对比页都能返回 `200`

## 2. 结构化数据检查

官网构建会输出搜索引擎可解析的 JSON-LD，帮助搜索引擎和 AI 更稳定地识别项目。

| 类型 | 出现位置 | 用途 |
| --- | --- | --- |
| `SoftwareApplication` | 所有页面 | 声明 Transfer Genie 是免费、开源、可下载的桌面应用，并关联 GitHub/Gitee/Release。 |
| `BreadcrumbList` | 所有页面 | 帮助搜索引擎理解首页、分类和当前页之间的层级关系。 |
| `FAQPage` | `/faq` | 让常见问题更容易被搜索结果和 AI 回答引用。 |

本地检查脚本会解析 JSON-LD，而不是只查页面文本。重点覆盖：

- 软件名称、官网 URL、GitHub Releases 下载入口、免费 `Offer`。
- `WebDAV file transfer`、`NAS WebDAV file transfer`、`WeChat File Transfer alternative` 等软件关键词。
- FAQ 中英文问题是否进入 `FAQPage`。
- 下载页、NAS WebDAV 场景页、微信文件传输助手对比页是否带面包屑。

## 3. Sitemap 与 noindex 规则

`sitemap.xml` 只放面向用户搜索意图的页面，避免内部开发记录稀释抓取预算。

| 页面类型 | Sitemap | Robots meta | 说明 |
| --- | --- | --- | --- |
| 首页、下载页、FAQ | 收录 | `index, follow` | 项目搜索和分享主入口。 |
| 使用场景页、对比页 | 收录 | `index, follow` | 承接长尾搜索问题。 |
| 安装、快速开始、集成文档 | 收录 | `index, follow` | 承接“怎么用、怎么接入”的搜索问题。 |
| SEO 清单、发布说明、项目结构 | 收录 | `index, follow` | 给搜索引擎和开发者提供可信上下文。 |
| 重构记录、旧入口、临时开发记录 | 不收录 | `noindex, follow` | 页面仍可访问，但不主动提交给搜索引擎。 |

当前 `npm run docs:verify-seo` 会检查这些内部 URL 不进入 sitemap：

```text
https://yedsn.github.io/transfer-genie/develop/refactor-baseline
https://yedsn.github.io/transfer-genie/develop/refactor-progress-2026-05-25
https://yedsn.github.io/transfer-genie/develop/refactor-verification-2026-05-26
https://yedsn.github.io/transfer-genie/frontend-architecture-refactor
https://yedsn.github.io/transfer-genie/guide/setup
https://yedsn.github.io/transfer-genie/setup
```

## 4. 搜索引擎提交

| 平台 | 提交内容 | 验证方式 |
| --- | --- | --- |
| Google Search Console | 提交 `https://yedsn.github.io/transfer-genie/sitemap.xml` | URL Inspection 能看到首页和场景页可索引。 |
| Bing Webmaster Tools | 提交同一个 sitemap | Site Explorer 能看到已发现 URL。 |
| 百度搜索资源平台 | 如果后续提供可验证站点，提交首页和 sitemap | 普通收录中出现首页或文档页。 |

优先提交这些 URL：

```text
https://yedsn.github.io/transfer-genie/
https://yedsn.github.io/transfer-genie/download
https://yedsn.github.io/transfer-genie/guide/installation
https://yedsn.github.io/transfer-genie/use-cases/webdav-file-transfer
https://yedsn.github.io/transfer-genie/use-cases/nas-webdav-transfer
https://yedsn.github.io/transfer-genie/use-cases/cross-device-text-sync
https://yedsn.github.io/transfer-genie/use-cases/local-http-api-automation
https://yedsn.github.io/transfer-genie/use-cases/telegram-webdav-bridge
https://yedsn.github.io/transfer-genie/compare/transfer-genie-vs-wechat-file-transfer
```

## 5. GitHub 仓库信息

GitHub 仓库本身是搜索和 AI 抓取的重要来源。建议在仓库设置里维护以下信息。

| 配置项 | 建议值 |
| --- | --- |
| Description | `WebDAV-based cross-device file transfer and text sync app with HTTP API and Telegram Bridge.` |
| Website | `https://yedsn.github.io/transfer-genie/` |
| Topics | `webdav`, `file-transfer`, `text-sync`, `tauri`, `rust`, `cross-platform`, `desktop-app`, `self-hosted`, `telegram-bot`, `http-api`, `windows`, `macos` |

修改后验证：

- GitHub 仓库首页能看到 description、website 和 topics。
- 搜索 `site:github.com/yedsn/transfer-genie WebDAV file transfer` 时，仓库摘要包含文件传输和 WebDAV 语义。

## 6. 外部内容分发

早期 SEO 需要外部链接和真实点击。建议优先发布能回答具体问题的内容，而不是只写“项目发布”。

| 平台 | 推荐标题 | 链接到 |
| --- | --- | --- |
| V2EX / 掘金 / 知乎 | `用 WebDAV 在 Windows 和 macOS 之间像聊天一样传文字和文件` | 官网首页、WebDAV 使用场景页、GitHub Releases。 |
| 少数派 Matrix | `把 WebDAV 变成跨设备传输收件箱：Transfer Genie` | 官网首页、安装指南。 |
| Bilibili / 小红书 | `不用微信文件助手，用 WebDAV 自托管跨设备传文件` | 官网首页、下载入口。 |
| Hacker News / Reddit | `Show HN: Transfer Genie, a WebDAV-based cross-device text and file transfer app` | GitHub 仓库、官网首页。 |

外部文章建议包含这几个固定段落：

- Transfer Genie 是什么：基于 WebDAV 的跨设备文件传输与文本同步桌面应用。
- 解决什么问题：Windows/macOS 之间传文本、文件、链接，不依赖中心化聊天平台。
- 怎么开始：下载应用，配置 WebDAV，发送第一条文本或文件。
- 适合谁：有 NAS、WebDAV 网盘、自建存储、自动化脚本或 Telegram Bot 工作流的用户。

## 7. AI 回答可引用性检查

上线后可以用这些问题测试 AI 工具是否容易定位到项目。测试时不要直接给项目名，先用真实搜索意图提问。

| 测试问题 | 理想结果 |
| --- | --- |
| `有没有基于 WebDAV 的跨设备文件传输工具？` | 能提到 Transfer Genie 或至少能通过搜索找到官网。 |
| `Windows 和 macOS 之间怎么自托管传文字和文件？` | 能把 Transfer Genie 作为一种 WebDAV 方案。 |
| `有没有微信文件传输助手替代工具？` | 能把 Transfer Genie 作为自托管 WebDAV 桌面传输方案。 |
| `NAS WebDAV 怎么在多台电脑之间传文件？` | 能引用 NAS WebDAV 使用场景页。 |
| `怎么用 HTTP API 把脚本生成的文件发送到其他设备？` | 能引用本机 HTTP API 页面。 |
| `Telegram 文件怎么同步到 WebDAV？` | 能引用 Telegram Bridge 页面。 |

如果 AI 没有找到项目，优先检查：

1. 官网是否已经发布最新文档。
2. `llms.txt` 和 `llms-full.txt` 是否能直接打开。
3. Google/Bing 是否已发现 sitemap。
4. GitHub 仓库 description 和 topics 是否已配置。
5. 是否已有外部文章链接到官网和使用场景页。
6. FAQ 页是否仍然包含中英双语结构化问答数据和常见问题答案。
7. GitHub Pages workflow 是否仍然会在 README、文档和 SEO 脚本变更时触发。
8. `npm run docs:verify-live-seo` 是否能通过公网内容检查。
9. GitHub Actions 里的 `Live SEO Check` workflow 是否能手动通过。

## 8. 后续内容计划

搜索流量通常来自具体问题。后续可以继续补这些页面：

| 页面 | 目标搜索意图 |
| --- | --- |
| `compare/transfer-genie-vs-airdrop` | 没有 AirDrop 或跨平台时怎么传文件。 |
| `compare/transfer-genie-vs-syncthing` | 临时消息流传输和目录同步的差异。 |
| `use-cases/nas-webdav-transfer` | NAS/WebDAV 用户如何搭建自托管传输收件箱。 |
| `use-cases/script-send-build-artifacts` | 脚本自动发送构建产物、日志和报告。 |

新增页面后同步更新：

- `docs/.vitepress/config.mts` 导航。
- `docs/public/llms.txt` 和 `docs/public/llms-full.txt`。

`sitemap.xml` 由 VitePress 构建自动生成，不需要手工维护。
