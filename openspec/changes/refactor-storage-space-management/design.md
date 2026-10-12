# Design

## Context

见 `proposal.md`。前置 change `refactor-pluggable-storage-backends` 已在 Rust 中引入 `StorageProfile`、`active_storage_profile_id`、按 profile 保存的 Supabase Session、隔离的 SQLite/outbox/checkpoint 和 WebDAV → Supabase 导入批次，但它尚未归档。当前主要限制位于前端单一 Supabase 表单，以及后端导入流程把来源固定为 WebDAV、目标固定为 Supabase。

现有消息列表仍以本地 SQLite 为查询入口。WebDAV 使用文件与 history/manifest 表达消息；Supabase 使用数据库记录、私有 Storage 和 Realtime。通用复制必须跨越两种远端格式，同时保持现有空间、队列和本地缓存相互隔离。

## Goals / Non-Goals

**Goals:**

- 用一套列表和编辑器管理任意数量的 WebDAV 与 Supabase profile。
- 将现有导入批次演进为 Provider 无关的复制计划，支持四种来源/目标组合。
- 复用现有本地 SQLite、Supabase Session、outbox、冲突和附件缓存机制。
- 让复制可预览、可恢复、幂等，并在完成前进行目标核验。
- 保证复制、登录或编辑一个 profile 时不会修改其他 profile 的状态。

**Non-Goals:**

- 不建立不同存储空间之间的持续同步、双写或自动合并。
- 不实现双向同步、镜像删除、CRDT 或自动冲突覆盖。
- 不让非活动 Supabase 长期保持 Realtime WebSocket。
- 不在“移除配置”时删除远端数据或自动清理全部本地历史缓存。
- 不改变 Supabase 服务端 Schema、RPC、RLS 或 Storage bucket 协议，除非通用复制暴露出必须修复的协议缺口。

## Decisions

### 1. 前端采用统一列表和单个草稿编辑器

设置状态改为 `storageProfiles[]`、`editingProfileId`、`editorMode` 和 `storageProfileDraft`。新增时先选 Provider，再创建对应草稿；编辑时只替换目标 profile，不再通过“所有 WebDAV + 第一个 Supabase”重新构造完整数组。邮箱、密码、连接反馈和忙碌状态属于按 profile 的运行时状态，不进入 Settings。

选择列表 + 弹窗/抽屉编辑器，而不是把所有空间的完整表单同时展开，可避免多个 Supabase 的密钥、登录和进度状态互相覆盖，也减少长页面。

### 2. 复制引擎使用 Provider 读取器与写入器的组合

复制命令仍接收 `source_profile_id` 和 `target_profile_id`，但上下文同时通过 `resolve_provider_by_id` 解析，不再限制类型。内部按 Provider enum 分派以下能力：

- 来源：刷新/增量补拉、列出消息和标签、读取附件流、返回稳定来源键与内容摘要。
- 目标：检查稳定映射、写入标签和消息、流式上传附件、提交 Provider 元数据、核验远端结果。

第一版优先使用 enum 分派和小型共享数据结构，不为异步 trait 引入新依赖。四种组合由同一编排器组装，Provider 模块只处理自身远端格式。

备选方案是分别实现四套复制函数，但它会重复批次、进度、重试和核验逻辑，后续修复很容易只覆盖某一种组合，因此不采用。

### 3. 复制以刷新后的固定计划执行

“检查数据”先在不切换当前活动 profile 的情况下对来源执行一次作用域明确的刷新：WebDAV 读取并合并远端 history/manifest，Supabase 使用该 profile 的 Session 从 checkpoint 补拉。随后从来源 profile 隔离的 SQLite 数据建立复制计划，持久保存来源键、来源版本或摘要、类型、大小和稳定目标 ID，再返回预览。

开始复制使用该计划而不是重新扫描一个变化中的来源。预览后新增的数据留到下一次复制；来源项目在执行前已改变或消失时记录为冲突/失败，不静默复制另一版本。这样预览数量、进度总数和最终报告可对齐。

### 4. 稳定映射由来源身份决定，批次还包含目标身份

消息、标签与附件的目标标识由 `source_profile_id + source_entity_type + source_entity_key` 生成确定性 UUID，并在复制项目表中持久化。复制计划的身份包含来源 profile、目标 profile 和 Supabase 目标账号作用域；同一来源再次复制到同一目标时复用映射，不同目标拥有独立执行状态。

稳定映射用于判断幂等，不等于允许覆盖。目标不存在时创建；目标存在且摘要一致时跳过；目标存在但摘要或 revision 不一致时记录冲突。

### 5. Provider 目标保持各自的一致性协议

Supabase 目标继续先把目标记录和附件操作写入目标 profile/账号隔离的 SQLite 与 outbox，再上传 Storage、提交 RPC、补拉并核验。复制完成判断不能只依赖 outbox 为空。

WebDAV 目标按现有文件布局流式上传附件或文本文件，并通过现有 history/manifest 更新逻辑提交元数据；只有远端文件与 history 均可读且摘要符合时才把项目标为成功。文件已上传但 history 更新失败时保留项目并以同一路径重试。

两种远端都无法与本地 SQLite 构成分布式事务，因此依赖稳定路径、逐项状态和幂等重试恢复，而不是尝试跨服务回滚。

### 6. 附件全程流式处理并进行端到端核验

来源附件通过临时文件或现有 profile 隔离缓存传递，不把大型附件整体保存在内存。复制项目记录已传输字节；UI 的总进度按项目数展示，当前附件额外展示字节进度。目标写入后至少核验字节大小和 SHA-256；来源缺少摘要时在读取过程中计算。

临时文件位于明确的复制批次目录，成功、取消或可确认失败后清理；需要继续的任务保留仍被引用的缓存。

### 7. 复制不改变活动空间和 Realtime 生命周期

非活动 Supabase 的来源补拉或目标写入使用短生命周期 HTTP/RPC 请求及各自 Session，不启动常驻 Realtime。复制期间首页继续展示当前活动空间。只有用户显式切换 profile 时，才重建 Realtime、generation 和页面数据。

这避免“为了复制而切换 UI”导致晚到回调串写，也符合只有活动空间实时同步的资源边界。

### 8. 安全移除通过后端受控命令执行

前端不能仅从 Settings 数组删除 profile。后端移除命令先检查活动状态、outbox、冲突和复制任务；通过后原子更新 Settings，并清除该 profile 的 Supabase 系统凭据。远端数据和普通本地业务数据默认保留，以便重新添加相同 profile 后恢复或由独立清理功能处理。

目的地字段修改沿用“新建空间”语义：已有数据或未完成任务时，API URL、anon key、`space_id`、WebDAV URL 等影响远端身份的字段不可普通修改。显示名称和启用状态可直接修改。

### 9. 现有导入记录原地兼容升级

保留现有 `storage_import_batches/items` 表和 Tauri 命令的兼容读取能力，新增通用计划所需的来源类型、目标类型、来源摘要、字节进度、结果计数与核验状态。数据库迁移把旧批次标记为 WebDAV → Supabase；前端新调用使用中性的“copy”语义。若直接重命名 SQLite 表会增加迁移和回滚风险，因此第一版可保留物理表名，代码层统一称为 copy plan。

## Risks / Trade-offs

- 前置 change 尚未归档，两个 change 同时声明 `storage-profiles` 容易产生归档冲突 → 先验证并归档 `refactor-pluggable-storage-backends`，再基于归档后的正式规格校准本 change 的 delta。
- Supabase 非活动 profile 的 Session 可能过期 → 在预览和执行前按 profile 刷新 token，失败时只暂停该复制任务并要求重新登录该空间。
- WebDAV 缺少强事务和统一 revision → 固定计划保存 ETag/mtime/摘要，写目标时采用稳定路径与读回核验，差异进入冲突而不覆盖。
- 目标 WebDAV 的 history 更新与附件上传不可原子提交 → 项目状态区分“附件已写入”和“元数据已提交”，恢复时重用同一路径并清理无引用临时对象。
- 多 GB 附件复制时间长且占用本地磁盘 → 流式传输、按批次复用缓存、展示字节进度，并在开始前检查可用磁盘空间。
- 同时对同一目标执行多个复制任务可能产生竞争 → 后端按目标 profile/账号作用域加复制锁，其他目标仍可并行。
- 配置移除后保留本地数据会占用磁盘 → 将“移除配置”和“删除本地缓存”保持为两个明确操作，后者另行确认。

## Migration Plan

1. 先严格验证并归档前置 change `refactor-pluggable-storage-backends`，确认正式 `storage-profiles` 规格与当前数据库迁移一致。
2. 增加复制批次兼容迁移和 Provider 无关的数据结构，旧 WebDAV → Supabase 批次保持可继续。
3. 将后端复制上下文、来源读取和目标写入逐步抽离；先用现有 WebDAV → Supabase 回归测试锁定行为，再依次启用其余三种组合。
4. 上线统一存储空间列表和草稿编辑器，加载旧设置时不改 profile ID，也不丢弃第二个及之后的 Supabase。
5. 将旧“从 WebDAV 导入”入口替换为“复制存储空间数据”，但保留对运行中旧批次的状态展示和继续能力。
6. 以小批文本、标签和附件验证四种组合，再验证大文件、中断恢复、重复复制和冲突报告。

回滚时恢复旧设置界面和旧导入入口，但不回退或删除新增复制批次字段；数据库迁移保持向后兼容。已复制到远端的数据不自动删除。
