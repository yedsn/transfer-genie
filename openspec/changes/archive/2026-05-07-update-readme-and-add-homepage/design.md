## Context

Transfer Genie 当前已经有一个更像 landing page 的 `README.md`，并且仓库里已有 `docs/` 目录承载安装、HTTP API、Telegram Bridge 等内容。但这些文档仍然只是仓库文件，还没有变成一个对外可访问的公开站点。用户希望参考 `cc-haha` 的 `docs/` 实现方式，而该项目目前采用 `docs/index.md` + `docs/.vitepress/config.mts` 的结构，用首页 frontmatter、侧边栏导航、本地搜索和 GitHub Pages 友好的静态构建来组织官网与文档。

这意味着 Transfer Genie 的最佳落地方向已经从“再新增一个单页官网目录”转变为“把现有 `docs/` 直接升级成公开站点源码”。这样既能复用现有 Markdown 内容，也能保持官网首页、产品文档与 GitHub Pages 部署链路的统一。与此同时，Tauri 桌面应用的 `frontend/` 仍应保持独立，不能与对外站点资源混在一起。

## Goals / Non-Goals

**Goals:**
- 参考 `cc-haha` 的结构，在 `docs/` 下建立一个适合 GitHub Pages 的公开站点源码布局。
- 提供一个带产品 Hero、功能亮点、工作流入口和 CTA 的首页，同时承接现有安装、HTTP API、Telegram Bridge 文档。
- 用尽量少的前端基础设施完成站点建设，优先复用 Markdown、截图和现有品牌资源。
- 让 README 负责“仓库入口”，让公开站点负责“完整官网 + 文档阅读”，并保证两者叙事一致。
- 增加本地预览、静态构建与 GitHub Pages 自动部署方案，方便后续持续维护。

**Non-Goals:**
- 不在本次变更中引入博客、CMS、评论系统或复杂营销插件。
- 不重构 Tauri 应用的 `frontend/`，也不把桌面端页面迁移到 VitePress。
- 不首发中英双语；如需国际化，后续再基于 VitePress locales 扩展。
- 不追求高度定制的前端交互或重动画首页，避免站点复杂度超过产品文档价值。

## Decisions

### 1. 采用 VitePress，并直接使用 `docs/` 作为站点内容根目录

- Decision: 在现有 `docs/` 下新增 `.vitepress/` 配置与首页文件，使用 VitePress 承载官网首页与项目文档，而不是再单独创建 `site/` 目录。
- Rationale: 用户参考的 `cc-haha` 正是这种结构；Transfer Genie 也已经拥有 `docs/` 内容，直接升级为站点源码能减少重复维护，并天然适配 GitHub Pages。
- Alternatives considered:
  - 新建独立 `site/` 目录：隔离性更强，但会导致 README、站点和 `docs/` 三处内容分裂。
  - 纯 HTML/CSS 单页：上线快，但难以承载持续扩展的安装、API 与集成文档。

### 2. README 负责仓库入口，VitePress 站点负责公开官网与深度文档

- Decision: 保留 README 的产品定位与快速导航能力，但将更完整的使用说明、FAQ、集成文档与后续新增页面收敛到 VitePress 站点。
- Rationale: README 适合首屏获客和仓库内阅读，公开站点更适合结构化阅读与搜索。两者分工明确后，后续维护成本更低。
- Alternatives considered:
  - README 继续承载全部详细说明：会越来越长，且不利于公开传播。
  - 站点完全独立于 README 叙事：容易产生内容漂移。

### 3. 站点首页采用“产品首页 + 文档入口”的混合模型

- Decision: `docs/index.md` 使用 VitePress home frontmatter 构建首屏 Hero、功能卡片和 CTA，下面通过导航或特性区引导用户进入安装、HTTP API、Telegram Bridge、更新日志等页面。
- Rationale: `cc-haha` 的首页模式已经验证了这种模型对开源工具类项目有效；Transfer Genie 也同时需要产品展示与文档承接。
- Alternatives considered:
  - 做纯文档首页：结构清晰，但产品感不足。
  - 做纯 marketing landing page：视觉更强，但无法自然承接后续文档。

### 4. 对现有文档做轻量重组，优先采用稳定 slug 路由

- Decision: 将现有 `docs/setup.md`、`docs/HTTP API 说明.md`、`docs/Telegram Bridge 说明.md` 等内容逐步迁移到更稳定的层级路径，如 `docs/guide/setup.md`、`docs/integrations/http-api.md`、`docs/integrations/telegram-bridge.md`。
- Rationale: GitHub Pages 与 VitePress 更适合使用稳定、可读、可扩展的 slug 路由；这也有利于后续侧边栏、搜索与外部分享。
- Alternatives considered:
  - 保留现有中文文件名和平铺结构：短期最省事，但 URL 编码可读性较差，后续信息架构也不够清晰。

### 5. 通过 GitHub Actions 部署到 GitHub Pages，并默认兼容项目站点路径

- Decision: 新增 GitHub Pages workflow，采用官方 Pages Action 构建并发布 VitePress 产物；配置默认兼容项目站点路径，例如仓库名为 `transfer-genie` 时使用 `/transfer-genie/` 作为默认 `base`。
- Rationale: GitHub Pages 是用户的首选托管方式，官方 Actions 流程比手工推送 `gh-pages` 分支更稳定，也更容易在后续接自定义域名。
- Alternatives considered:
  - 手工发布 `gh-pages` 分支：一次性可行，但长期维护容易出错。
  - 继续仅提供本地静态文件：不满足“官网站点”目标。

### 6. 只引入最小 Node 工具链，并把站点脚本控制在文档相关范围内

- Decision: 为 VitePress 增加最小化 Node 依赖和脚本，例如 `docs:dev`、`docs:build`、`docs:preview`，不引入额外前端框架。
- Rationale: 仓库当前主技术栈是 Rust/Tauri，文档站不应演变成第二个复杂前端工程。
- Alternatives considered:
  - 引入 Vue/React 自定义主题开发：灵活度更高，但远超当前需求。

## Risks / Trade-offs

- [文档文件路径调整导致旧链接失效] -> 为 README 和常用入口优先更新链接，必要时补充索引页或迁移说明。
- [GitHub Pages 子路径 `base` 配置错误导致资源 404] -> 在设计中明确以“项目 Pages”作为默认场景，并在本地预览与 CI 中校验构建结果。
- [Rust 项目新增 Node 工具链带来维护负担] -> 严格控制依赖数量，仅引入 VitePress 及必要脚本。
- [首页过度营销化，反而削弱文档可用性] -> 保持首页一屏讲价值、两屏讲能力、随后进入文档，而不是堆积视觉段落。
- [截图或视觉资源不足] -> 首版优先复用 README 已有截图和图标，后续再扩充更系统的视觉素材。

## Migration Plan

1. 盘点现有 `docs/` 内容、README 文案、截图和项目外链，确定首版站点信息架构。
2. 为站点添加最小 Node/VitePress 配置，包括脚本、`docs/.vitepress/config.*`、主题样式和首页。
3. 将现有 Markdown 文档重组到更清晰的目录结构，并补齐侧边栏导航。
4. 调整 README 中的文档/官网链接，让仓库入口与公开站点互相跳转。
5. 新增 GitHub Pages workflow，完成构建、上传 artifact 和部署步骤。
6. 在本地执行文档预览/构建，检查桌面端、移动端与 GitHub Pages 子路径场景。
7. 如需回滚，可保留现有 Markdown 内容，移除 `.vitepress` 与 Pages workflow，恢复为纯仓库文档模式。

## Open Questions

- GitHub Pages 首发是否使用项目站点 URL（`https://<user>.github.io/transfer-genie/`），还是同时配置自定义域名？
- 首页主 CTA 首版应直接指向 GitHub Releases、Gitee Releases，还是先统一指向仓库下载说明页？
- 文档目录首版是否只做中文，还是在结构上预留未来英文 locales 的扩展位？
