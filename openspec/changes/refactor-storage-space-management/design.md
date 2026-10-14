# Design

## Context

见 `proposal.md`。已归档 change `refactor-pluggable-storage-backends` 在 Rust 中引入了 `StorageProfile`、`active_storage_profile_id`、按 profile 保存的 Supabase Session、隔离的 SQLite/outbox/checkpoint 和 WebDAV → Supabase 导入批次。当前主要限制位于前端单一 Supabase 表单，以及后端导入流程把来源固定为 WebDAV、目标固定为 Supabase。

现有消息列表仍以本地 SQLite 为查询入口。WebDAV 使用文件与 history/manifest 表达消息；Supabase 使用数据库记录、私有 Storage 和 Realtime。通用数据传输必须跨越两种远端格式，同时保持现有空间、队列和本地缓存相互隔离。

## Goals / Non-Goals

**Goals:**

- 用一套列表和编辑器管理任意数量的 WebDAV 与 Supabase profile。
- 将现有导入批次演进为 Provider 无关的数据传输计划，支持四种来源/目标组合。
- 复用现有本地 SQLite、Supabase Session、outbox、冲突和附件缓存机制。
- 让数据传输可预览、可恢复、幂等，并在完成前进行目标核验。
- 保证传输、登录或编辑一个 profile 时不会修改其他 profile 的状态。

**Non-Goals:**

- 不建立不同存储空间之间的持续同步、双写或自动合并。
- 不实现双向同步、镜像删除或 CRDT；显式数据传输允许按来源覆盖同一传输身份的目标内容。
- 不让非活动 Supabase 长期保持 Realtime WebSocket。
- 不在“移除配置”时删除远端数据或自动清理全部本地历史缓存。
- 不改变 Supabase 服务端 Schema、RPC、RLS 或 Storage bucket 协议，除非通用数据传输暴露出必须修复的协议缺口。

## Decisions

### 1. 前端采用统一列表和单个草稿编辑器

设置状态改为 `storageProfiles[]`、`editingProfileId`、`editorMode` 和 `storageProfileDraft`。新增时先选 Provider，再创建对应草稿；编辑时只替换目标 profile，不再通过“所有 WebDAV + 第一个 Supabase”重新构造完整数组。邮箱、密码、连接反馈和忙碌状态属于按 profile 的运行时状态，不进入 Settings。

选择列表 + 弹窗/抽屉编辑器，而不是把所有空间的完整表单同时展开，可避免多个 Supabase 的密钥、登录和进度状态互相覆盖，也减少长页面。

### 2. 数据传输引擎使用 Provider 读取器与写入器的组合

数据传输命令仍接收 `source_profile_id` 和 `target_profile_id`，但上下文同时通过 `resolve_provider_by_id` 解析，不再限制类型。内部按 Provider enum 分派以下能力：

- 来源：刷新/增量补拉、列出消息和标签、读取附件流、返回稳定来源键与内容摘要。
- 目标：检查稳定映射、写入标签和消息、流式上传附件、提交 Provider 元数据、核验远端结果。

第一版优先使用 enum 分派和小型共享数据结构，不为异步 trait 引入新依赖。四种组合由同一编排器组装，Provider 模块只处理自身远端格式。

备选方案是分别实现四套传输函数，但它会重复批次、进度、重试和核验逻辑，后续修复很容易只覆盖某一种组合，因此不采用。

### 3. 数据传输以刷新后的固定计划执行

“检查数据”先在不切换当前活动 profile 的情况下对来源执行一次作用域明确的刷新：WebDAV 读取并合并远端 history/manifest，Supabase 使用该 profile 的 Session 从 checkpoint 补拉。随后从来源 profile 隔离的 SQLite 数据建立传输计划，持久保存来源键、来源版本或摘要、类型、大小和稳定目标 ID，再返回预览。

预览计划使用 `prepared` 状态，不得被解释为后台任务正在运行。只有用户点击“确认传输”后才切换为 `running`。应用启动时把遗留的 `running` 批次恢复为 `interrupted`，因为进程内执行器已经不存在；新建传输入口始终从选择空间开始，未完成任务通过独立提示继续或放弃。

预览阶段只读取来源元数据、已知大小和已有摘要，不为了补齐摘要下载全部附件。缺失摘要在正式传输读取附件流时计算并持久化，避免“检查”阶段变成不可见的大文件下载。

开始传输使用该计划而不是重新扫描一个变化中的来源。预览后新增的数据留到下一次传输；来源项目在执行前已改变或消失时记录为冲突/失败，不静默传输另一版本。这样预览数量、进度总数和最终报告可对齐。

### 4. 稳定映射由来源身份决定，批次还包含目标身份

消息与附件的目标标识由 `source_profile_id + source_entity_type + source_entity_key` 生成确定性 UUID，并在传输项目表中持久化。标签优先按目标唯一索引语义（去除首尾空白并忽略大小写）复用同名目标标签 ID，否则使用确定性 ID。传输计划的身份包含来源 profile、目标 profile 和 Supabase 目标账号作用域；同一来源再次传输到同一目标时复用映射，不同目标拥有独立执行状态。

稳定映射用于判断幂等。目标不存在时创建；目标存在且摘要一致时跳过；目标存在但摘要不一致时使用来源内容覆盖。Supabase 消息以 `message_id` 作为稳定唯一身份，兼容文件名发生变化时先按 `message_id` 读取目标当前 revision，再原位替换本地旧文件名记录，不得创建第二行。Supabase 覆盖操作读取目标当前 revision 后提交 RPC，附件使用同一 Storage 路径 upsert；只有来源在预览后变化、目标 revision 在提交期间再次改变或无法自动核验时才记录冲突/失败。

### 5. Provider 目标保持各自的一致性协议

Supabase 目标继续先把目标记录和附件操作写入目标 profile/账号隔离的 SQLite 与 outbox，再上传 Storage、提交 RPC、补拉并核验。数据传输完成判断不能只依赖 outbox 为空。

WebDAV 目标按现有文件布局流式上传附件或文本文件，并通过现有 history/manifest 更新逻辑提交元数据；只有远端文件与 history 均可读且摘要符合时才把项目标为成功。文件已上传但 history 更新失败时保留项目并以同一路径重试。

两种远端都无法与本地 SQLite 构成分布式事务，因此依赖稳定路径、逐项状态和幂等重试恢复，而不是尝试跨服务回滚。

### 6. 附件全程流式处理并进行端到端核验

来源附件通过临时文件或现有 profile 隔离缓存传递，不把大型附件整体保存在内存。传输项目记录已传输字节；UI 的总进度按项目数展示，当前附件额外展示字节进度。目标写入后至少核验字节大小和 SHA-256；来源缺少摘要时在读取过程中计算。

临时文件位于明确的数据传输批次目录，成功、取消或可确认失败后清理；需要继续的任务保留仍被引用的缓存。

### 7. 数据传输不改变活动空间和 Realtime 生命周期

非活动 Supabase 的来源补拉或目标写入使用短生命周期 HTTP/RPC 请求及各自 Session，不启动常驻 Realtime。数据传输期间首页继续展示当前活动空间。只有用户显式切换 profile 时，才重建 Realtime、generation 和页面数据。

这避免“为了复制而切换 UI”导致晚到回调串写，也符合只有活动空间实时同步的资源边界。

### 8. 安全移除通过后端受控命令执行

前端不能仅从 Settings 数组删除 profile。后端移除命令先检查活动状态、outbox、冲突和数据传输任务；通过后原子更新 Settings，并清除该 profile 的 Supabase 系统凭据。远端数据和普通本地业务数据默认保留，以便重新添加相同 profile 后恢复或由独立清理功能处理。

目的地字段修改沿用“新建空间”语义：已有数据或未完成任务时，API URL、anon key、`space_id`、WebDAV URL 等影响远端身份的字段不可普通修改。显示名称和启用状态可直接修改。

### 9. 现有导入记录原地兼容升级为数据传输记录

保留现有 `storage_import_batches/items` 表和 Tauri 命令的兼容读取能力，新增通用计划所需的来源类型、目标类型、来源摘要、字节进度、结果计数与核验状态。数据库迁移把旧批次标记为 WebDAV → Supabase；前端和新命令使用中性的 `storage_transfer` 语义。若直接重命名 SQLite 表会增加迁移和回滚风险，因此第一版可保留物理表名，代码层统一称为 transfer plan。

### 10. 重复检查重建计划，放弃任务停止未发送操作

相同来源、目标和账号作用域继续使用稳定批次 ID，但每次用户重新执行“检查”都生成新的计划 token，并以当前来源快照重建批次项目。来源已删除的旧项目从计划移除，来源 revision 变化的项目重置为待处理并获得新的 outbox 操作标识；目标当前内容一致时标记为跳过，内容不同则标记为待覆盖。旧计划中被替代且尚未确认的 outbox 操作会标记为 superseded。

放弃任务会把属于该批次且尚未确认的 Supabase outbox 标记为 superseded，清除发送租约，并删除仅由该批次暂存且尚无远端 revision 的本地消息、附件或标签。已确认写入远端的数据保持不变。

### 11. 两种目标都必须核验真实远端

Supabase 继续通过远端行、Storage 对象大小和 SHA-256 核验。WebDAV 在完成前重新读取远端 history 与标签，并逐个下载已应用或跳过的消息文件核验大小和 SHA-256；本地 SQLite 镜像不能作为完成证据。核验失败的项目转为可继续的错误状态。

### 12. Supabase 历史快照与 Realtime 增量分离

Supabase 消息列表继续只读取本地 SQLite，但进入空间和刷新最近列表时必须主动读取远端最近一页消息快照；用户滚动到顶部时，再按 `(timestamp_ms, message_id)` 向更早方向读取。远端分页结果先事务写入 profile/account 隔离的本地消息、标签和附件元数据，再由现有列表查询返回；附件原始字节仍按需下载。

历史分页游标单独保存在 `supabase_history_cursors`，不得推进 `sync_checkpoints`。Realtime 和 change log 只负责增量补拉，因此初始化快照期间发生的更新仍可重放，不会因历史分页跳过变化。最近页刷新只更新本地内容，不移动最老历史边界；只有加载更早页时才推进历史游标。

### 13. 已登录账号可发现并原位切换远端 Space

存储空间编辑弹框在 Supabase 登录成功后，通过当前 Session 和 RLS 查询该账号在当前 API 项目中可见的全部 `spaces`，并统计各空间的有效消息数量。账号空间列表是同一个 Supabase profile 内的远端 Space 选择器：选择其他 Space 时保留 profile ID、名称、API URL、公开 Key和登录 Session，只原位替换 `space_id`，不创建新的本地 profile。

切换前检查该 profile 的 outbox、同步冲突和数据传输任务；存在未完成工作时停止切换。切换成功时停止旧 Realtime，并清理该 profile 的本地消息、标签、附件元数据、checkpoint 与历史分页游标，让新 Space 从空缓存重新拉取，避免同一 profile ID 下混入旧 Space 数据。旧 Space 的远端内容不删除。手工 Space ID 保留为高级设置，但账号空间列表是登录后的主要选择入口。

### 14. Supabase 冲突按当前空间和账号一次性批量解决

同步状态入口不再逐条提示冲突。用户只选择一次“全部使用云端”或“全部保留本地”，后端在同步互斥内读取当前 profile/account 的全部未解决冲突，并以一个 SQLite 事务完成本地状态变更。选择云端时按每个实体最新的远端快照覆盖本地并停止对应冲突 outbox；选择本地时按每个实体最新的本地快照和远端 revision 生成一条新的稳定重试操作，随后只触发一次真实 Supabase 同步。

批量范围严格限定为当前活动 Supabase profile 和当前 Auth 用户，不处理其他空间或账号。相同实体存在多条历史冲突时只应用最新快照或生成一条重试操作，但所有对应冲突记录一起标记为已处理。接口返回本次发现、处理和剩余数量；新同步期间再次产生的冲突保留为剩余项，不无限循环。

## Risks / Trade-offs

- 已归档规格中的导入要求与新传输要求可能重叠 → 通过 RENAMED + 完整 MODIFIED delta 将旧要求原位升级，避免归档后保留两套入口。
- Supabase 非活动 profile 的 Session 可能过期 → 在预览和执行前按 profile 刷新 token，失败时只暂停该数据传输任务并要求重新登录该空间。
- WebDAV 缺少强事务和统一 revision → 固定计划保存 ETag/mtime/摘要，差异内容覆盖同一稳定路径，并在提交 history 后读回核验。
- 目标 WebDAV 的 history 更新与附件上传不可原子提交 → 项目状态区分“附件已写入”和“元数据已提交”，恢复时重用同一路径并清理无引用临时对象。
- 多 GB 附件复制时间长且占用本地磁盘 → 流式传输、按批次复用缓存、展示字节进度，并在开始前检查可用磁盘空间。
- 同时对同一目标执行多个数据传输任务可能产生竞争 → 后端按目标 profile/账号作用域加传输锁，其他目标仍可并行。
- 配置移除后保留本地数据会占用磁盘 → 将“移除配置”和“删除本地缓存”保持为两个明确操作，后者另行确认。

## Migration Plan

1. 以已归档的 `storage-profiles` 规格和当前数据库迁移为兼容基线。
2. 增加数据传输批次兼容迁移和 Provider 无关的数据结构，旧 WebDAV → Supabase 批次保持可继续。
3. 将后端传输上下文、来源读取和目标写入逐步抽离；先用现有 WebDAV → Supabase 回归测试锁定行为，再依次启用其余三种组合。
4. 上线统一存储空间列表和草稿编辑器，加载旧设置时不改 profile ID，也不丢弃第二个及之后的 Supabase。
5. 将旧“从 WebDAV 导入”入口替换为“存储空间数据传输”，但保留对运行中旧批次的状态展示和继续能力。
6. 以小批文本、标签和附件验证四种组合，再验证大文件、中断恢复、重复传输和冲突报告。

回滚时恢复旧设置界面和旧导入入口，但不回退或删除新增数据传输批次字段；数据库迁移保持向后兼容。已传输到远端的数据不自动删除。
