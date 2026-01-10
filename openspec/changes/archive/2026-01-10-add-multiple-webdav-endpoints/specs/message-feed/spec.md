## ADDED Requirements
### Requirement: WebDAV endpoint switching
客户端 SHALL 在首页提供 WebDAV 端点切换入口，仅显示已启用端点。
客户端在切换端点后 SHALL 立即使用新端点执行同步并更新消息列表。

#### Scenario: Switch active endpoint from home
- **WHEN** 用户在首页切换至另一个已启用的 WebDAV 端点
- **THEN** 客户端更新活动端点并触发一次立即同步
- **AND** 消息列表刷新为该端点的内容
