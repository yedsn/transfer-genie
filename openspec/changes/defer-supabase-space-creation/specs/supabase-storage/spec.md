# Spec Delta

## ADDED Requirements

### Requirement: Explicit Supabase Space provisioning boundary
远端 Supabase Space 的创建 MUST 是独立、可识别且经过用户确认的操作。连接测试、Auth 登录、Session 恢复、Space 列表查询、历史读取、Realtime 订阅、outbox 推送和附件上传 MUST NOT 在 Space 缺失时隐式创建或重建 Space。

#### Scenario: Login and list Spaces without provisioning
- **WHEN** 用户登录账号并查询可访问的 Space
- **THEN** 客户端仅执行身份验证和只读列表查询
- **AND** 远端 Space 数量保持不变

#### Scenario: Provision after explicit confirmation
- **WHEN** 用户在绑定向导中明确确认创建新 Space
- **THEN** 客户端通过受 RLS 保护的创建操作建立该 Space
- **AND** 返回创建结果供用户完成绑定

#### Scenario: Reject sync for an unbound profile
- **WHEN** 客户端尝试为没有已确认 `space_id` 的 profile 启动同步、Realtime、消息发送或附件上传
- **THEN** 操作被拒绝并返回“尚未绑定账号空间”的可处理状态
- **AND** 不向远端写入业务数据

#### Scenario: Bound Space no longer exists
- **WHEN** 已绑定 profile 的 Space 在远端不存在或当前账号不再可访问
- **THEN** 客户端停止该 profile 的云端写入和 Realtime
- **AND** 保留本地数据并提示用户重新授权、重新选择或明确恢复 Space
- **AND** 不自动调用创建操作

#### Scenario: Normal sync validates but does not create
- **WHEN** 已绑定 profile 开始普通同步
- **THEN** 客户端验证目标 Space 可访问后执行同步
- **AND** 验证失败时停止并报告错误，不使用 upsert 创建缺失 Space
