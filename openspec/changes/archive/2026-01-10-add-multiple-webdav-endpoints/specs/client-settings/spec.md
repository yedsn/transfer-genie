## MODIFIED Requirements
### Requirement: WebDAV connection settings
客户端 SHALL 允许用户配置多个 WebDAV 端点（包含名称、URL 与认证凭据），并持久化保存。
客户端 SHALL 支持为每个端点设置启用状态，并仅允许启用的端点被设置为当前活动端点。
客户端 SHALL 使用当前活动端点进行所有同步与上传操作，并在认证或连接失败时显示错误状态。

#### Scenario: Save multiple WebDAV endpoints
- **WHEN** 用户新增或编辑多个 WebDAV 端点并保存
- **THEN** 端点列表与认证信息被持久化并在重启后可用

#### Scenario: Update WebDAV endpoint name
- **WHEN** 用户为 WebDAV 端点设置或修改名称并保存
- **THEN** 端点名称在列表与切换入口中展示

#### Scenario: Select active WebDAV endpoint
- **WHEN** 用户选择某个已启用端点作为当前活动端点
- **THEN** 后续同步与上传使用该端点

#### Scenario: Disable active WebDAV endpoint
- **WHEN** 用户将当前活动端点设为禁用
- **THEN** 客户端清除活动端点并提示用户选择另一个已启用端点
