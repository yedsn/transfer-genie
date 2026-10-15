# Proposal

## Why

新增 Supabase 存储空间时，客户端目前会先为本地配置自动分配 `space_id`，并在首次同步时隐式创建远端 Space。这会在账号已有可用 Space 时产生重复和浪费，也让“连接 Supabase 项目”“登录账号”和“选择业务空间”三个不同动作混在一次保存中。

## What Changes

- 将 Supabase 存储空间绑定改为“连接服务 → 登录账号 → 选择或新建 Space → 确认绑定”的分步骤向导。
- 新增流程在绑定完成前使用独立向导草稿；旧配置或失效绑定可以进入明确的“待绑定”状态。两者均可测试连接和登录，但不能启用同步、Realtime、消息发送、文件上传或成为活动空间。
- 登录后读取当前账号可见的 Space 列表，由用户明确选择已有 Space；即使只有一个 Space，也只推荐选择，不自动绑定。
- 仅在用户点击“新建空间”并确认后创建远端 Space；保存配置、登录、列出 Space 和普通同步流程均不得隐式创建 Space。
- 编辑已有 Supabase profile 时，在同一 profile 内原位切换账号 Space，保留本地 profile ID、连接配置和 Session，不新增本地存储空间。
- 为旧配置定义兼容迁移：已存在且可访问的绑定保持不变；无效绑定根据本地待同步数据情况进入待选择或需人工处理状态，且不自动删除或重建远端 Space。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `storage-profiles`: 增加 Supabase profile 的待绑定生命周期、显式 Space 选择/创建及原位切换约束。
- `client-settings`: 将 Supabase 新增和编辑交互改为可恢复的分步骤绑定向导，并定义各步骤的校验、返回和取消行为。
- `supabase-storage`: 移除普通同步中的隐式 Space 创建，明确只有经过用户确认的创建动作可以写入远端 Space。

## Impact

- 前端：存储空间新增/编辑弹框、Supabase 连接测试、登录状态、账号 Space 列表、向导步骤与错误提示。
- Rust：设置规范化与校验、按 profile 的 Supabase Auth、Space 查询/创建/切换命令、活动空间选择及同步启动条件。
- 同步：`ensure_space` 不再承担自动创建语义；outbox、Realtime、历史分页和附件上传必须要求 profile 已完成绑定。
- 本地数据：Supabase profile 需要持久化绑定状态，并兼容旧版自动生成的 `space_id` 及其本地缓存、outbox 和冲突。
- Supabase：复用现有 Auth、RLS、RPC 和 Storage，不新增外部依赖；现存自动创建的远端 Space 不会被自动删除。
