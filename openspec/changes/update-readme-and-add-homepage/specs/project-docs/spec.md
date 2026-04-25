## ADDED Requirements

### Requirement: README 门面结构
仓库 SHALL 提供一个根目录 `README.md`，使其作为项目门面文档存在，而不只是功能清单式说明。README SHALL 以产品名称、简洁价值主张和直接导航开场，让访问者可以快速进入快速开始、文档、官网和项目链接等关键入口。

#### Scenario: 新访客打开仓库
- **WHEN** 新访客打开仓库首页
- **THEN** README 以清晰的产品标题和简短说明开场
- **AND** 首屏为访客提供继续了解或快速开始的直接入口

### Requirement: README 覆盖核心工作流
README SHALL 说明 Transfer Genie 的主要使用工作流，包括基于 WebDAV 的同步、文本与文件发送、本地 HTTP API 自动化、Telegram Bridge 使用方式，以及端点/配置等关键概念，以便访问者快速判断产品是否适合自己的使用场景。

#### Scenario: 访客评估支持的使用场景
- **WHEN** 访客阅读 README 中的功能与工作流章节
- **THEN** 访客能够识别产品的主要能力以及支持的自动化/集成路径

### Requirement: README 具备行动指引与文档路由
README SHALL 包含可执行的本地使用或开发起步说明，并 SHALL 链接到更深入的项目文档，例如环境搭建、HTTP API 用法、Telegram Bridge 说明、发布/更新信息及其他后续阅读主题。

#### Scenario: 访客希望在总览后继续深入
- **WHEN** 访客阅读完 README 的总览部分
- **THEN** 访客可以沿着清晰的快速开始路径继续操作
- **AND** 访客无需手动搜索仓库目录即可进入相关深度文档
