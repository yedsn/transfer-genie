## Why

Transfer Genie 已经把 `README.md` 升级成了更像产品首页的入口，但项目仍然缺少一个真正可发布、可导航、可持续维护的官网站点。参考 `cc-haha` 的 `docs/` 方案后，更适合 Transfer Genie 的不是再单独做一个零散的静态单页，而是基于 Markdown 文档与首页结合的 GitHub Pages 站点：既能承接产品展示，也能直接托管现有使用文档。

## What Changes

- 将现有官网目标从“独立单页首页”细化为“基于文档的公开站点”，采用与 `cc-haha` 类似的 `docs/ + .vitepress` 结构。
- 在站点中提供产品首页（landing page）与文档导航，使访客既能快速理解 Transfer Genie，也能继续阅读安装、HTTP API、Telegram Bridge 等使用文档。
- 规范现有 `docs/` 内容的目录与路由结构，优先保留 Markdown 作为内容源，减少 README、官网、文档三处重复维护。
- 增加 GitHub Pages 构建与发布流程，并明确本地预览、构建产物、仓库子路径 `base` 配置等约束。
- 继续保持 README 与官网首页的核心表达一致，但将“深入说明”逐步沉淀到公开站点中，而不是继续堆叠在 README 内。

## Capabilities

### New Capabilities
- `project-docs`: 以仓库首页 README 的形式，清晰传达产品价值、快速开始路径、文档入口，以及与公开站点之间的导航关系。
- `public-docs-site`: 一个基于 Markdown 与 VitePress 构建的公开站点，包含产品首页、文档导航、本地预览与 GitHub Pages 发布能力。

### Modified Capabilities
- 无。

## Impact

- 影响的代码与内容：`README.md`、`docs/**`、`docs/.vitepress/**`、站点资源目录、根级 Node/VitePress 配置文件，以及 `.github/workflows/` 下的 Pages 发布流程。
- 影响的系统：仓库对外展示、项目文档组织方式、GitHub Pages 静态托管，以及 README 与公开文档站之间的内容协同。
- 依赖约束：官网实现必须与 Tauri 桌面前端隔离；优先复用现有 Markdown 文档和截图资源；默认以 GitHub Pages 项目站点模式设计，并为后续自定义域名保留空间。
