## Context
本机 HTTP API 最近已经支持了 `markedOptions`，但当前结构更接近内部发送模型，而不是外部调用方的使用习惯。外部程序通常只知道标签名称，不知道稳定的标签 id，也不应该被迫区分“选中已有标签”和“创建新标签”这两类底层操作。

## Goals / Non-Goals
- Goals:
  - 让本机 HTTP API 调用方只通过 `tagNames` 指定消息标签
  - 在 HTTP 请求进入后复用现有的已标记标签存储和发送链路
  - 把变更范围限制在本机 HTTP API 契约内
- Non-Goals:
  - 修改前端或内部 Tauri 命令的发送参数结构
  - 增加模糊匹配、别名匹配之类的标签名称能力
  - 保留旧 HTTP 标签字段的兼容行为

## Decisions
- Decision: 保留 `markedOptions` 作为外层对象，但将 HTTP 标签参数收敛为 `tagNames`。
  - Why: 这样既能保持接口整体结构稳定，又能去掉 id 化和生命周期导向的标签字段。
- Decision: 标签名称在匹配前执行 `trim`，并按大小写不敏感规则查找已有标签。
  - Why: 外部调用方不应因为大小写或首尾空格差异而无法复用现有标签。
- Decision: 对不存在的标签名称自动创建，并在同一个请求内直接关联到新消息。
  - Why: 避免外部调用方必须先查询或创建标签，再二次发送消息。
- Decision: 当 `tagNames` 非空时，它表达的是“本次消息最终应具备的标签集合”。
  - Why: 简化后的接口应该表达目标状态，而不是暴露内部的标签增删细节。
- Decision: 对 `selectedTagIds`、`createdTags`、`deletedTagIds` 这类旧 HTTP 字段直接返回 4xx 错误。
  - Why: 如果继续做部分兼容，会让调用方很难发现自己还在使用旧协议。

## Risks / Trade-offs
- Risk: 这是一个破坏性变更，现有本机 HTTP 客户端需要调整请求格式。
  - Mitigation: 在 proposal 中明确标注 breaking change，并同步更新测试脚本与示例。
- Risk: 大小写不敏感匹配在已有近似标签名时，可能带来预期差异。
  - Mitigation: 继续复用现有标签唯一性约束，确保新建标签遵循和 UI 一致的规则。

## Migration Plan
1. 更新 HTTP API spec，定义 `markedOptions.tagNames` 以及自动解析/创建行为。
2. 修改 HTTP 请求解析逻辑，将标签名称标准化后匹配已有标签，缺失时自动创建。
3. 对旧 HTTP 标签字段返回 4xx 校验错误。
4. 更新 Node 测试脚本和示例，请求只使用 `tagNames`。

## Open Questions
- 暂无。本提案默认这次简化仅作用于本机 HTTP API，不影响前端内部发送模型。
