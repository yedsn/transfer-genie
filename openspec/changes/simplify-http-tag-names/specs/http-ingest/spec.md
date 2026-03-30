## ADDED Requirements
### Requirement: 本机 HTTP 标签名称解析
本机 HTTP 发送接口 SHALL 允许调用方通过 `markedOptions.tagNames` 指定本次消息期望关联的标签，其中 `tagNames` 是标签名称列表。后端 SHALL 对传入的标签名称做标准化处理，按名称匹配已有标签，在缺失时自动创建标签，并通过现有已标记消息流程将最终标签集合应用到新消息。

#### Scenario: 按名称复用已有标签
- **GIVEN** 本机 HTTP API 已启用
- **AND** 当前活动端点中已经存在名为 `urgent` 的已标记标签
- **WHEN** 外部程序发送文件或文本请求，并在 `markedOptions.tagNames` 中传入 `["urgent"]`
- **THEN** 系统复用现有的 `urgent` 标签
- **AND** 系统不创建重复标签

#### Scenario: 按名称自动创建缺失标签
- **GIVEN** 本机 HTTP API 已启用
- **AND** 当前活动端点中不存在名为 `follow-up` 的已标记标签
- **WHEN** 外部程序发送文件或文本请求，并在 `markedOptions.tagNames` 中传入 `["follow-up"]`
- **THEN** 系统创建 `follow-up` 标签
- **AND** 系统在同一个请求中把新标签关联到发送出去的消息

#### Scenario: 标准化并去重标签名称
- **GIVEN** 本机 HTTP API 已启用
- **WHEN** 外部程序传入 `markedOptions.tagNames`，其中包含 `[" Urgent ", "urgent"]` 这类重复或大小写不同的值
- **THEN** 系统将它们视为同一个标签选择
- **AND** 最终只向消息应用一个对应标签

#### Scenario: 拒绝旧标签字段协议
- **GIVEN** 本机 HTTP API 已启用
- **WHEN** 外部程序在 `markedOptions` 中传入 `selectedTagIds`、`createdTags` 或 `deletedTagIds`
- **THEN** 系统以 4xx 错误拒绝该请求
- **AND** 响应中明确提示本机 HTTP 标签参数必须改用 `tagNames`
