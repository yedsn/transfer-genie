## 1. 信息架构与内容迁移规划

- [x] 1.1 盘点当前 README 结构、已有文档、项目链接、图标资源以及可复用的产品视觉素材。
- [x] 1.2 定义 README 与官网首页共享的信息架构，包括 hero 文案、功能支柱、工作流分区和主要 CTA。
- [x] 1.3 确定公开站点的目录结构、导航分组、slug 路由规范，以及 GitHub Pages `base` 约束。

## 2. VitePress 站点脚手架

- [x] 2.1 增加最小 Node/VitePress 配置与本地运行脚本，确保站点可在仓库内独立预览和构建。
- [x] 2.2 在 `docs/` 下创建首页、`.vitepress` 配置、主题样式和导航骨架。
- [x] 2.3 配置站点导航、侧边栏、本地搜索和仓库外链，形成首版公开站点骨架。

## 3. 内容落地与 README 协同

- [x] 3.1 将 `README.md` 重写为更像 landing page 的项目门面文档，强化开场文案、导航结构和章节层次。
- [x] 3.2 增补或重写 README 中对核心工作流的说明，包括 WebDAV 传输、本地 HTTP API 自动化、Telegram Bridge 和快速开始。
- [x] 3.3 将现有 `docs/` 内容迁移到新的站点信息架构中，并更新 README、站点首页与文档页之间的链接关系。

## 4. GitHub Pages 发布与验证

- [x] 4.1 新增 GitHub Pages workflow，完成站点构建、artifact 上传和部署流程。
- [x] 4.2 编写官网本地预览、构建发布和 Pages 配置说明。
- [x] 4.3 交叉检查 README、站点首页和文档页面的产品表达、资源路径与响应式表现，并通过 OpenSpec 严格校验。
