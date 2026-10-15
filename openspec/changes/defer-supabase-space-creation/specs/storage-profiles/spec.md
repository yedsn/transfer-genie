# Spec Delta

## ADDED Requirements

### Requirement: Explicit Supabase profile binding lifecycle
Supabase 存储空间 SHALL 将本地 profile、Supabase 项目连接、Auth 账号和账号内 Space 视为分离但有顺序的绑定阶段。只有具有可访问的明确 `space_id` 且完成用户确认的 profile 才能成为已绑定空间；客户端 MUST NOT 因新增、保存、登录或切换账号而自动选择或创建远端 Space。

#### Scenario: Complete a new binding
- **WHEN** 用户依次验证 Supabase 项目、登录账号、选择一个可访问 Space 并确认绑定
- **THEN** 客户端创建一个已绑定的本地 Supabase profile
- **AND** profile 使用用户确认的 Space

#### Scenario: Cancel a new binding
- **WHEN** 用户在最终确认前关闭或取消新增向导
- **THEN** 客户端不在正式存储空间列表中新增 profile
- **AND** 不在远端创建 Space 或启动任何同步

#### Scenario: Unbound profile cannot become active
- **WHEN** 一个迁移后的 Supabase profile 尚未绑定可访问 Space
- **THEN** 客户端将其显示为“待绑定”并允许继续处理
- **AND** 该 profile 不得被启用为活动空间或参与数据传输

### Requirement: Explicit account Space selection and in-place switching
客户端 SHALL 使用当前 Supabase Auth Session 列出账号可访问的全部 Space，并要求用户明确选择已有 Space 或明确发起新建。选择或切换账号 Space MUST 原位更新当前本地 profile，不得新增第二个本地 profile，也不得自动复制、合并或删除不同 Space 的数据。

#### Scenario: Select one of multiple existing Spaces
- **WHEN** 当前账号可访问多个 Space 且用户选择其中一个并确认
- **THEN** 当前 profile 绑定到所选 Space
- **AND** 其他 Space 保持不变

#### Scenario: Confirm the only existing Space
- **WHEN** 当前账号只可访问一个 Space
- **THEN** 客户端可以突出推荐该 Space
- **AND** 仍须等待用户明确确认后才能绑定

#### Scenario: Switch an existing profile in place
- **WHEN** 用户编辑已绑定 profile 并确认切换到同账号的另一个 Space
- **THEN** 客户端保留原 profile ID、名称、Supabase 地址、公开 Key 和登录 Session
- **AND** 仅更新该 profile 的 Space 绑定，不新增本地存储空间

#### Scenario: Block unsafe Space switch
- **WHEN** 当前 profile 存在待上传操作、未解决冲突或未完成数据传输任务
- **THEN** 客户端阻止切换账号 Space
- **AND** 明确展示需要先处理的项目，不修改现有绑定

### Requirement: Compatibility for legacy Supabase bindings
客户端 SHALL 在升级时核验已有 Supabase profile 的 Space 绑定，而不是为缺失或不可访问的 `space_id` 自动创建远端 Space。可访问的现有绑定 MUST 保持不变；无法确认的绑定 MUST 保留其本地数据并进入可恢复状态。

#### Scenario: Preserve an accessible legacy binding
- **WHEN** 旧 profile 的 `space_id` 在当前账号下存在且可访问
- **THEN** 客户端保持该 profile 的绑定、活动状态和本地数据不变

#### Scenario: Unbind an empty invalid legacy profile
- **WHEN** 旧 profile 的 `space_id` 不存在且该 profile 没有本地业务数据、待上传操作或冲突
- **THEN** 客户端将该 profile 标记为“待绑定”
- **AND** 不自动创建缺失的远端 Space

#### Scenario: Preserve unresolved local work
- **WHEN** 旧 profile 的 `space_id` 不存在但仍有本地业务数据、待上传操作或冲突
- **THEN** 客户端保持原绑定标识和全部本地数据并标记为“需要处理”
- **AND** 在用户明确选择恢复原 Space、放弃待处理数据或保持现状前不得切换绑定
