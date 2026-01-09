## ADDED Requirements
### Requirement: WebDAV connection settings
客户端 SHALL 允许用户配置 WebDAV 端点 URL 与认证凭据，并持久化保存。
客户端 SHALL 使用已保存的设置进行所有同步与上传操作，并在认证或连接失败时显示错误状态。

#### Scenario: Save WebDAV settings
- **WHEN** 用户保存 WebDAV URL 与认证信息
- **THEN** 后续同步使用该设置
- **AND** 连接失败时在界面提示错误

### Requirement: Sender name configuration
客户端 SHALL 在首次启动时生成一个随机发送者名称，并允许用户在设置中修改。
发送者名称 SHALL 用于所有外发消息的元数据。

#### Scenario: Default sender name
- **WHEN** 应用首次启动
- **THEN** 生成随机发送者名称并用于后续发送

#### Scenario: Update sender name
- **WHEN** 用户在设置中修改发送者名称
- **THEN** 后续消息使用新的名称

### Requirement: Refresh interval configuration
客户端 SHALL 允许用户设置刷新间隔（秒），默认 5 秒。
刷新间隔变更 SHALL 在后续同步周期生效。

#### Scenario: Change refresh interval
- **WHEN** 用户将刷新间隔设置为新值
- **THEN** 后续同步周期使用新的间隔