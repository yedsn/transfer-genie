# message-feed Delta Specification

## MODIFIED Requirements

### Requirement: 聊天式布局与排序

客户端 SHALL 以时间顺序显示消息列表，最新消息位于底部；输入框 SHALL 固定在主内容底部；加载或刷新消息列表后 SHALL 自动滚动到最新消息。

#### Scenario: 初始加载滚动到最新

- **WHEN** 消息列表加载或刷新完成
- **THEN** 列表按时间顺序展示且最新消息在底部
- **AND** 滚动位置显示最新消息
- **AND** 仅加载最新一页消息（最多 10 条）

#### Scenario: 切换端点后滚动到最新

- **WHEN** 用户切换到新的 WebDAV 端点
- **THEN** 列表清空并仅加载新端点的最新一页消息
- **AND** 滚动位置显示最新消息

#### Scenario: 加载历史消息后保持阅读位置

- **WHEN** 用户滚动到列表顶部附近触发历史消息加载
- **THEN** 更早的消息插入列表头部
- **AND** 调整滚动位置使当前阅读的消息保持可见
- **AND** 不自动滚动到列表顶部或底部
