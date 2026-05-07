## ADDED Requirements

### Requirement: GitHub Pages 公开站点
项目 SHALL 提供一个可部署到 GitHub Pages 的公开站点，用于对外展示 Transfer Genie。该站点 SHALL 包含产品首页、文档导航，以及通往仓库、下载或进一步阅读入口的主要 CTA。

#### Scenario: 访客打开公开站点
- **WHEN** 访客打开站点首页
- **THEN** 访客能够在首屏快速理解 Transfer Genie 的用途与核心价值
- **AND** 访客可以继续进入安装、集成或下载相关页面

### Requirement: Markdown 驱动的文档导航
公开站点 SHALL 以 Markdown 文档作为主要内容源，并 SHALL 将安装、HTTP API、Telegram Bridge 等现有项目文档组织到清晰的导航结构中。

#### Scenario: 访客继续阅读功能文档
- **WHEN** 访客从首页进入文档区域
- **THEN** 访客可以通过导航或侧边栏找到安装、HTTP API 和 Telegram Bridge 等主题
- **AND** 文档页面使用稳定、可分享的站点路由

### Requirement: 静态构建与多设备可访问性
公开站点 SHALL 以静态资源方式构建，并 SHALL 在桌面浏览器与移动端浏览器中正确呈现。页面核心内容 MUST 不依赖 Tauri 桌面运行时或服务端应用才能访问。

#### Scenario: 站点在不同设备中打开
- **WHEN** 站点在桌面浏览器或移动端浏览器中被打开
- **THEN** 页面布局保持可读且易于导航
- **AND** 用户无需安装桌面应用即可访问站点内容

### Requirement: Pages 发布与本地预览说明
项目 SHALL 记录维护者如何在本地预览该站点，以及如何通过 GitHub Pages 构建与发布站点。

#### Scenario: 维护者准备发布官网
- **WHEN** 维护者需要本地验证或发布站点
- **THEN** 仓库中提供清晰的开发、构建与 GitHub Pages 部署说明
