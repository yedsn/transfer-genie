# Design

## Context

见 `proposal.md`。当前实现已经能在登录后列出账号可见 Space，并能把选中的 `space_id` 原位写回同一个本地 profile。问题来自另两个行为：设置规范化会为空的 Supabase `space_id` 生成确定性 UUID；同步启动前的 Space 检查使用 upsert，因此第一次推送会把该 UUID 对应的远端 Space 自动创建出来。

新增 profile 的登录目前依赖先保存 profile，前端因此把“保存连接配置”和“登录账号”拆成了两个不连贯动作。新的向导需要让未保存连接也能完成登录和 Space 发现，同时保证 refresh token 仍只由 Rust 管理。

## Goals / Non-Goals

**Goals:**

- 让新增 Supabase profile 在不写入正式设置的情况下完成连接检查、登录和 Space 选择。
- 复用现有按 profile Session、Space 列表和原位切换能力。
- 彻底隔离“验证 Space 存在”和“创建 Space”两种服务端操作。
- 对旧版自动生成 `space_id` 提供不丢本地数据的迁移路径。

**Non-Goals:**

- 不改变 Supabase Auth、RLS、Realtime、业务 RPC 或 Storage 的总体协议。
- 不自动合并两个 Space，也不把切换 Space 解释为数据传输。
- 不自动删除历史上已经创建的空 Space。
- 不在此变更中提供 Supabase 项目或 Auth 用户的创建功能。

## Decisions

### 1. 新增向导使用 Rust 持有的短生命周期绑定会话

第一步连接检查成功后，前端向 Rust 申请一个随机 `binding_flow_id`。登录命令接收该 ID、API 地址、公开 Key 和用户凭据；Rust 将 access/refresh token、账号信息、已选 Space 和配置摘要保存在进程内存中的短生命周期上下文，前端只接收脱敏状态。

只有“完成绑定”命令会在一个受控流程中创建正式 profile ID、保存设置并把 refresh token 迁入该 profile 的系统凭据作用域。取消、超时、Supabase 项目字段变化或应用退出都会丢弃临时上下文。这样无需为了登录先写入半成品 profile，也不会把 token 放入前端或普通 Settings。

备选方案是第一步就保存一个“待绑定”profile。它改动较少，但关闭向导会在正式列表留下半成品，并使活动空间、导出和清理逻辑都必须识别更多临时记录，因此不用于全新 profile；“待绑定”只保留给旧配置迁移和已存在 profile 的修复。

### 2. 绑定状态由 Space 标识与显式状态共同表达

Supabase 配置增加可向后兼容的绑定状态，例如 `unbound | bound | needs_attention`。`bound` 必须同时具有非空、格式合法且已经由当前账号确认的 `space_id`；设置规范化不再为空值生成 UUID。

单独状态字段避免仅靠空字符串区分“新配置尚未选择”和“旧配置的目标 Space 消失”。活动空间解析、发送、数据传输目标、历史分页、outbox 和 Realtime 在入口统一要求 `bound`，从而不依赖每条路径各自猜测配置是否完整。

备选方案是只以空 `space_id` 表示未绑定，但它无法安全表达带本地待处理数据的失效旧绑定，因此不采用。

### 3. 服务端 Space 操作拆为只读验证与显式创建

普通同步入口把现有 `ensure_space` 的 upsert 语义替换为只读/无副作用的可访问性检查。创建 Space 使用独立 Tauri 命令和独立 Supabase RPC，仅能由有效绑定向导触发，并要求当前 Auth 用户、客户端生成的 operation ID、名称和预期 Space ID。重复提交同一 operation ID 必须幂等。

Space 列表和选择继续使用 RLS 下的普通用户查询。完成绑定前不会启动 outbox、Realtime 或历史补拉。这样可以在测试中精确证明登录、列表与同步失败均不会增加远端 Space 数量。

备选方案是在 `ensure_space` 增加布尔参数控制是否创建，但调用方容易传错并重新引入隐式创建，因此使用两个不同接口。

### 4. 向导是线性步骤，但允许安全返回

前端状态固定为：`connection → account → space → confirm`。每一步都有明确完成条件；“下一步”不会兼任“保存”。返回并修改上游字段时，所有依赖的下游状态失效：修改 API 地址或公开 Key 会清除临时 Session 和 Space 选择；退出账号会清除 Space 选择；Space 创建成功只把新 Space 设为候选，仍需最终确认。

编辑已绑定 profile 复用相同视觉步骤，但以现有 profile ID 和已保存 Session 初始化。所有修改保存在编辑草稿中；最终确认调用原位更新命令。影响远端身份的切换仍先检查 outbox、冲突和数据传输任务。

### 5. 旧配置按可访问性和本地工作量分类迁移

升级不再补齐空 `space_id`。已登录且可访问原 Space 的 profile 标记为 `bound`。无法访问时先检查该 profile/账号作用域下的消息、附件、outbox、冲突和传输任务：没有本地业务状态的 profile 进入 `unbound`；存在任何本地工作时进入 `needs_attention` 并保留原 `space_id`。

`needs_attention` 的修复界面提供三个显式方向：使用原 ID 创建/恢复 Space、在确认放弃或导出待处理工作后选择已有 Space、暂不处理。任何选择都不得静默删除本地记录或远端内容。

### 6. 原位 Space 切换继续清空旧绑定的本地镜像边界

已绑定 profile 切换到另一个 Space 时保留 profile ID、Supabase 项目配置和 Session，并沿用现有安全检查。确认切换后停止旧 Realtime，清理该 profile 下属于旧 Space 的镜像、checkpoint 和历史游标，再从新 Space 重新获取最近页与增量数据；旧 Space 的远端内容不变。

这项行为不新增本地 profile，也不做跨 Space 复制。需要复制数据时仍使用“存储空间数据传输”。

## Risks / Trade-offs

- 临时绑定会话在应用退出后无法恢复 → 关闭前提示进度不会保存；流程本身只有连接、登录和选择步骤，重新执行成本可控。
- 旧 profile 缺少可用 Session，启动时无法立即判断 Space 是否存在 → 先保持原配置并标记“登录后核验”，不得据此自动创建或清空数据。
- 普通同步移除 upsert 后，已有依赖自动修复的测试会失败 → 用显式创建测试替换，并新增“所有非创建路径 Space 数量不变”的回归断言。
- 切换 Space 会清理同一 profile 的旧本地镜像 → 切换前展示影响范围并阻止有待处理工作的 profile；远端数据始终保留。
- 新增绑定状态影响多个入口 → 在后端统一 profile 解析层校验，前端禁用仅作为体验增强，不能作为唯一保护。

## Migration Plan

1. 先增加兼容读取的绑定状态和统一校验，停止为新空配置生成 `space_id`，但暂不改变已有有效绑定。
2. 增加短生命周期绑定会话、草稿连接测试、登录、Space 列表和显式创建命令及测试。
3. 将新增/编辑 Supabase 弹框切换为四步向导，并接入最终原子绑定或原位更新。
4. 把同步前的 Space upsert 改为无副作用验证，并为发送、Realtime、数据传输和附件入口补齐已绑定校验。
5. 执行旧配置分类迁移；对 `needs_attention` profile 只提示处理，不自动创建、切换或删除。
6. 验证新增、取消、单 Space、多 Space、无 Space、切换、Session 失效和旧配置迁移后，再移除旧的高级自动分配路径。

回滚时保留新增绑定状态字段并恢复旧界面读取，但不得恢复同步中的隐式 Space 创建。已经由用户明确创建的 Space 和已绑定 profile 保持可用。
