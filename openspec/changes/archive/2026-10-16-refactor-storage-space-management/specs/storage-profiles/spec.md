# Spec Delta

## ADDED Requirements

### Requirement: Unified storage space management
客户端 SHALL 在统一的存储空间列表中展示所有 WebDAV 和 Supabase 空间，并允许用户新增、编辑、启用、禁用、切换和移除空间。新增和编辑 SHALL 使用独立弹框；弹框中的配置草稿 SHALL 可在保存前执行连接测试，测试操作 MUST NOT 自动持久化草稿或切换当前空间。新增空间时 MUST 先选择 Provider 类型；同一 Provider 类型 MUST 支持多个独立空间。

#### Scenario: Add multiple Supabase spaces
- **WHEN** 用户连续新增两个具有不同 API 地址、账号或 `space_id` 的 Supabase 存储空间
- **THEN** 两个空间均以稳定且不同的标识保存
- **AND** 用户可以分别登录、检查和切换它们

#### Scenario: Add WebDAV and Supabase from one entry
- **WHEN** 用户点击“新增存储空间”
- **THEN** 客户端打开独立弹框并先要求选择 WebDAV 或 Supabase
- **AND** 随后只展示所选 Provider 需要的配置项

#### Scenario: Test an unsaved storage profile draft
- **WHEN** 用户在新增或编辑弹框中填写连接配置并点击“测试连接”
- **THEN** 客户端直接使用当前草稿检查 WebDAV 或 Supabase 连接并在弹框内展示结果
- **AND** 草稿不会因此被保存，当前活动空间也不会改变

#### Scenario: Manage a Supabase account inside the profile editor
- **WHEN** 用户编辑一个已保存的 Supabase 存储空间
- **THEN** 编辑弹框展示该空间自己的登录状态、邮箱密码登录和退出操作
- **AND** 客户端不再要求用户前往独立的 Supabase 登录区域

#### Scenario: Replace login form with signed-in account summary
- **WHEN** Supabase 存储空间已经登录
- **THEN** 编辑弹框隐藏邮箱和密码输入框并展示账号、用户、Space 与会话有效期信息
- **AND** 已登录区域只提供退出登录操作

#### Scenario: Restore login form after sign-out
- **WHEN** 用户退出当前 Supabase 存储空间
- **THEN** 编辑弹框立即恢复邮箱密码登录表单
- **AND** 其他 Supabase 存储空间的登录状态保持不变

#### Scenario: Save then sign in to a new Supabase profile
- **WHEN** 用户在新增弹框中保存 Supabase 配置
- **THEN** 弹框保持打开并切换为编辑状态
- **AND** 用户可以立即登录该空间账号

#### Scenario: Preserve profiles while saving one editor
- **WHEN** 用户只编辑并保存其中一个存储空间
- **THEN** 其他 WebDAV 和 Supabase 空间的配置、登录状态和启用状态保持不变

#### Scenario: Update an existing profile in place
- **WHEN** 用户在编辑弹框中修改存储空间名称或其他允许修改的字段并点击“保存修改”
- **THEN** 客户端 MUST 使用打开弹框时的原 profile ID 原位更新该空间
- **AND** 保存不得创建新的 profile 或新的远端 Space
- **AND** 若原 profile 已不存在，客户端停止保存并要求重新打开弹框

#### Scenario: Reject duplicate Supabase destination
- **WHEN** 用户新增一个与现有 profile 指向相同 API 项目和 `space_id` 的 Supabase 空间
- **THEN** 客户端拒绝创建重复 profile
- **AND** 提示用户切换到已经存在的存储空间

### Requirement: Independent profile identity and credentials
每个存储空间 SHALL 具有独立的配置、连接状态和凭据作用域。Supabase Session MUST 按存储空间标识保存；一个空间的登录、退出或连接失败 MUST NOT 改变其他空间的 Session。

#### Scenario: Use different accounts on one Supabase project
- **WHEN** 两个 Supabase 空间使用相同 API 地址但分别登录不同账号
- **THEN** 客户端按各自存储空间保存和使用对应 Session
- **AND** 两个账号的数据、队列与缓存保持隔离

#### Scenario: Sign out one Supabase profile
- **WHEN** 用户退出一个 Supabase 存储空间
- **THEN** 仅该空间的持久 Session 被清除
- **AND** 其他 Supabase 空间保持登录

### Requirement: Supabase remote space discovery
客户端 SHALL 在 Supabase profile 登录后列出当前账号在同一 API 项目中通过 RLS 可访问的全部远端 Space，并展示空间名称、有效消息数量和脱敏 Space ID。账号空间列表只用于切换当前 Supabase profile 的远端 `space_id`；切换 MUST 原位更新当前 profile，MUST NOT 新增本地 profile。切换前 MUST 阻止仍有待上传、冲突或未完成数据传输的 profile；切换后 MUST 清理旧 Space 的本地缓存和同步游标并从新 Space 重新加载，同时保留 profile ID、显示名称、项目配置和登录 Session。

#### Scenario: List all accessible remote spaces
- **WHEN** 用户在已登录的 Supabase 存储空间中打开账号空间列表
- **THEN** 客户端列出该账号在当前 Supabase 项目中全部 RLS 可见 Space
- **AND** 每项展示名称、有效消息数量和 Space ID

#### Scenario: Switch the current profile to another remote space
- **WHEN** 用户在账号空间列表选择另一个可访问 Space
- **THEN** 客户端原位修改当前 Supabase profile 的 `space_id` 并保持 profile ID 不变
- **AND** 本地存储空间列表数量不变，项目配置和登录 Session 继续复用
- **AND** 旧 Space 的远端数据保持不变

#### Scenario: Block switching with unfinished local work
- **WHEN** 当前 Supabase profile 仍有待上传、同步冲突或未完成数据传输
- **THEN** 客户端停止 Space 切换并要求用户先处理未完成工作
- **AND** 当前 profile 的 `space_id` 和本地缓存保持不变

#### Scenario: Reset local state after switching spaces
- **WHEN** 当前 profile 成功切换到另一个 `space_id`
- **THEN** 客户端停止旧 Space 的 Realtime，清理旧本地消息缓存、附件元数据和同步游标
- **AND** 从新 Space 加载最近消息并建立新的 Realtime 生命周期
- **AND** 选择一个 Space 不得把其他 Space 的消息合并进来

### Requirement: Active profile lifecycle
客户端 SHALL 只把一个已启用空间设置为当前活动空间。只有当前活动 Supabase SHALL 保持 Realtime 连接；非活动 Supabase 不保持 WebSocket。切换空间 MUST 断开旧 Realtime、加载目标空间的本地数据，并通过目标 Provider 执行一次补拉或刷新。WebDAV MUST 继续提供手动刷新且 MUST NOT 定时自动刷新。

#### Scenario: Switch between Supabase profiles
- **WHEN** 用户从一个 Supabase 空间切换到另一个 Supabase 空间
- **THEN** 客户端断开旧空间的 Realtime
- **AND** 连接新空间的 Realtime 并从其 checkpoint 补拉变化

#### Scenario: Manually refresh WebDAV
- **WHEN** 用户在当前 WebDAV 空间点击刷新
- **THEN** 客户端立即同步该空间并更新列表
- **AND** 客户端不会在后台按时间间隔自动刷新 WebDAV

### Requirement: Safe profile editing and removal
已使用的存储空间 SHALL 防止用户在无明确确认的情况下改变远端数据目的地。普通移除 MUST 在空间存在未完成写入、冲突或数据传输任务时停止；客户端 SHALL 提供风险确认后的强制移除，放弃该 profile 的待上传操作、未解决冲突和未完成数据传输，再移除本机配置。移除配置 MUST NOT 删除远端数据或本机历史缓存。移除 Supabase 空间时 MUST 清除该 profile 的持久 Session。

#### Scenario: Protect destination fields
- **WHEN** 用户尝试修改已有数据或待同步任务的 Supabase API 地址、公开 Key 或 `space_id`
- **THEN** 客户端阻止普通保存并提示新建存储空间

#### Scenario: Remove inactive clean profile
- **WHEN** 用户确认移除一个非活动且没有未完成任务的空间
- **THEN** 客户端移除本地配置及该空间的持久凭据
- **AND** 远端消息和附件保持不变

#### Scenario: Reject removal with pending work
- **WHEN** 存储空间仍有待上传、冲突或未完成数据传输项目
- **THEN** 客户端在未获得强制移除确认时停止移除
- **AND** 明确提示强制移除会放弃这些未完成工作

#### Scenario: Force removal with pending work
- **WHEN** 用户在风险弹框中确认强制移除存在未完成工作的存储空间
- **THEN** 客户端放弃该 profile 的待上传操作、未解决冲突和未完成数据传输
- **AND** 移除本机配置及 Supabase 持久凭据
- **AND** 已写入的远端数据与本机历史缓存保持不变

#### Scenario: Force removal of active profile
- **WHEN** 用户确认强制移除当前正在使用的存储空间
- **THEN** 客户端停止当前同步与 Realtime 生命周期并清空当前空间选择
- **AND** 随后按强制移除规则删除本机配置

### Requirement: Transfer preview and source readiness
客户端 SHALL 在写入目标前刷新或增量补拉来源和目标空间，建立状态为 `prepared` 的固定传输计划并展示预览。预览 MUST 包含来源与目标名称、消息数、附件数、附件总大小、标签数、标记数以及预计跳过或待覆盖摘要；预览阶段 MUST NOT 修改目标空间，也 MUST NOT 因缺失摘要而下载全部附件。只有用户确认后计划才进入 `running`。

#### Scenario: Preview a transfer plan
- **WHEN** 用户选择来源和目标并请求检查数据
- **THEN** 客户端先同步来源并创建可恢复的数据传输计划
- **AND** 展示将要传输的数据摘要而不写入目标

#### Scenario: Source cannot be refreshed
- **WHEN** 来源空间认证失败、未登录或无法完成刷新
- **THEN** 客户端不得开始数据传输
- **AND** 明确显示需要修复的来源空间状态

#### Scenario: Preview does not become a running task
- **WHEN** 用户完成检查但尚未确认传输，或在检查过程中关闭应用
- **THEN** 该计划保持为待确认或可丢弃状态
- **AND** 下次打开数据传输入口仍从来源和目标选择开始

### Requirement: Recoverable and idempotent transfer
数据传输任务 SHALL 持久保存来源、目标、目标账号作用域、来源项目标识、稳定目标映射和逐项状态。中断后 MUST 标记为 `interrupted` 并能由用户明确继续或放弃；相同来源项目再次传输到相同目标时 MUST 跳过已确认的相同数据，不得重复创建消息或附件。数据库中存在计划 MUST NOT 单独作为后台执行器仍在运行的证据。

#### Scenario: Resume interrupted transfer
- **WHEN** 数据传输在部分项目完成后因退出应用或网络中断而停止
- **THEN** 用户可以继续同一数据传输任务
- **AND** 已确认成功的项目不会重复写入

#### Scenario: Abandon an unfinished transfer
- **WHEN** 用户放弃待确认或中断的数据传输任务
- **THEN** 任务被标记为已取消且不再阻止新建传输或移除相关空间
- **AND** 仅清理该任务的临时缓存，不删除来源或目标远端数据
- **AND** 属于该任务且尚未发送的目标操作不再被后台同步

#### Scenario: Repeat transfer after new source data
- **WHEN** 用户在首次数据传输完成后再次选择相同来源和目标
- **THEN** 客户端将来源新增项目加入传输计划
- **AND** 已存在且内容一致的项目被标记为跳过
- **AND** 已从来源删除的旧计划项目不会残留在新的传输概览中

#### Scenario: Merge with existing target data
- **WHEN** 稳定目标标识已经存在但内容或版本与来源不一致
- **THEN** 客户端使用来源消息、附件和标记元数据覆盖目标对应项目
- **AND** Supabase 覆盖使用目标当前 revision，WebDAV 覆盖同一稳定文件路径

#### Scenario: Merge a legacy Supabase message filename
- **WHEN** 目标 Supabase 已存在相同稳定 `message_id`，但本地兼容文件名与本次传输计算出的文件名不同
- **THEN** 客户端仍将其识别为同一条消息并使用目标当前 revision 执行跳过或覆盖
- **AND** 不得尝试插入第二条消息或触发消息唯一约束错误

#### Scenario: Reuse an existing tag by name
- **WHEN** 目标已存在与来源标签同名的活动标签，即使标签 ID 不同或名称大小写不同
- **THEN** 客户端复用目标标签 ID，不创建重复标签
- **AND** 消息中的标签引用使用目标真实标签 ID

### Requirement: Transfer progress and completion verification
客户端 SHALL 持续展示数据传输阶段、已处理数、总数、失败数和附件字节进度，并持久保存进度。完成前 MUST 核验目标元数据和附件；附件至少 MUST 核验大小与摘要。任务结束后 SHALL 隐藏活动进度条并保留成功、跳过、冲突和失败结果摘要。

#### Scenario: Show active transfer progress
- **WHEN** 数据传输正在执行
- **THEN** 客户端显示当前阶段与处理数量
- **AND** 上传或下载大型附件时显示字节进度

#### Scenario: Complete only after verification
- **WHEN** 所有写入请求已经返回成功
- **THEN** 客户端核验目标记录数量及附件大小和摘要
- **AND** 只有核验通过的项目才计入成功
- **AND** WebDAV 目标的跳过项目也必须重新读取真实远端文件进行核验

#### Scenario: Download a transferred Supabase attachment after switching spaces
- **WHEN** WebDAV 文件已传输到 Supabase，用户随后切换到目标 Supabase 存储空间并加载历史消息
- **THEN** 客户端将附件记录的 Storage 对象路径关联回对应消息
- **AND** 下载和预览可以读取该云端对象，不得误报附件仍仅保存在原设备

#### Scenario: Recover attachment metadata when its message is missing
- **WHEN** Supabase Storage 对象已上传，但附件 RPC 因目标消息不存在返回 `MESSAGE_NOT_FOUND`
- **THEN** 客户端保留相同附件操作与对象路径，并先恢复关联消息再重试附件元数据
- **AND** 新建传输的附件操作必须显式等待对应消息操作获得服务端确认

#### Scenario: Settle attachment work after resolving its message conflict
- **WHEN** 附件恢复所依赖的消息发生冲突，并且用户已经采用云端消息版本
- **THEN** 云端消息仍有效时，客户端解除旧依赖并继续同步全部附件
- **AND** 云端消息已删除时，客户端取消对应附件上传，不得留下永久待同步项目
- **AND** 同步问题入口一次重试当前空间的全部普通待同步项目，不逐项询问

#### Scenario: Report partial failure
- **WHEN** 部分项目传输或核验失败
- **THEN** 客户端保留成功项目并展示失败和冲突明细
- **AND** 完成结果展示总体错误、受影响项目和每项具体异常原因
- **AND** 用户可以只继续未完成项目

#### Scenario: List multiple unfinished transfers
- **WHEN** 不同来源或目标存在多个待确认、中断或失败任务
- **THEN** 客户端在选择空间步骤列出全部未完成任务
- **AND** 用户可以逐项查看、继续或放弃，不会因只展示最新任务而失去其他任务入口

### Requirement: Batch Supabase conflict resolution
客户端 SHALL 允许用户对当前 Supabase 存储空间和当前账号的全部未解决同步冲突一次性选择统一策略。选择云端 SHALL 批量应用每个实体最新的远端版本；选择本地 SHALL 批量基于最新远端 revision 重新提交每个实体最新的本地版本。批量处理 MUST NOT 影响其他 profile 或账号，并 SHALL 返回处理数量和剩余冲突数量。

#### Scenario: Use all remote versions
- **WHEN** 当前空间存在多项同步冲突且用户选择“全部使用云端”
- **THEN** 客户端一次性对全部未解决冲突应用每个实体最新的云端快照
- **AND** 对应冲突操作停止重试，界面不再逐项询问

#### Scenario: Merge a remote message whose local filename changed
- **WHEN** 用户批量使用云端版本，且本地已有相同 `message_id`、不同兼容文件名的消息
- **THEN** 客户端按稳定 `message_id` 合并为单条消息并应用云端内容
- **AND** 不得触发消息唯一约束或留下重复消息

#### Scenario: Keep all local versions
- **WHEN** 当前空间存在多项同步冲突且用户选择“全部保留本地”
- **THEN** 客户端一次性为每个冲突实体生成一条基于最新远端 revision 的重试操作
- **AND** 只触发一次真实同步并展示已处理和剩余数量

#### Scenario: Preserve conflict scope and newly exposed conflicts
- **WHEN** 批量解决过程中其他 profile、其他账号或后续同步产生新的冲突
- **THEN** 本次操作只处理开始时属于当前 profile/account 的冲突集合
- **AND** 新产生或不在当前作用域的冲突保持未解决并计入剩余状态，不进行无限自动重试

## MODIFIED Requirements

### Requirement: Storage space data transfer
客户端 SHALL 在“存储空间”标题右侧、紧邻“批量测速”的按钮组中提供“存储空间数据传输”入口，并以向导式弹窗允许用户在任意两个不同的存储空间之间显式传输消息、附件、标签和标记元数据。向导 SHALL 依次包含来源与目标选择、传输概览、确认传输、进度展示和完成结果五个阶段。第一版 MUST 支持 WebDAV → WebDAV、WebDAV → Supabase、Supabase → WebDAV 和 Supabase → Supabase。数据传输 MUST 采用非破坏性复制语义，保留来源数据和目标已有数据，并且 MUST NOT 建立持续同步或自动反向传输。

#### Scenario: Open transfer wizard from storage header
- **WHEN** 用户在存储空间标题右侧点击“存储空间数据传输”
- **THEN** 客户端打开向导式弹窗并展示来源与目标选择
- **AND** 入口与“批量测速”位于同一按钮组
- **AND** 存在未完成任务时只展示独立提示，不自动跳转到进度步骤

#### Scenario: Select source and target
- **WHEN** 用户打开“存储空间数据传输”
- **THEN** 客户端允许从所有已启用且可连接的空间中选择来源和目标
- **AND** 不允许来源与目标是同一个存储空间

#### Scenario: Advance through transfer overview and confirmation
- **WHEN** 用户选择不同的来源和目标并点击“下一步”
- **THEN** 客户端创建预览并展示传输概览
- **AND** 用户必须再次确认后才开始向目标写入

#### Scenario: Finish the transfer wizard
- **WHEN** 数据传输结束
- **THEN** 向导展示成功、跳过、冲突与失败统计并提供“完成”按钮
- **AND** 用户点击“完成”后关闭弹窗并清理本次向导的临时界面状态

#### Scenario: Transfer between each Provider combination
- **WHEN** 用户选择任一受支持的来源与目标 Provider 组合并开始传输
- **THEN** 客户端读取来源消息和附件并按目标 Provider 的格式写入目标
- **AND** 当前活动存储空间不会因数据传输而隐式改变

#### Scenario: Source remains independent after transfer
- **WHEN** 一次数据传输成功完成后来源空间出现新数据或数据被修改
- **THEN** 目标空间不会自动随之改变
- **AND** 用户可再次发起数据传输以补充数据

#### Scenario: Preview WebDAV import
- **WHEN** 用户选择来源和目标并请求预览
- **THEN** 客户端显示消息数、附件数、总大小、标记和标签摘要
- **AND** 尚不修改任一空间

#### Scenario: Resume interrupted import
- **WHEN** 数据传输在部分记录完成后中断并重新执行
- **THEN** 已确认项目不会重复创建
- **AND** 未完成项目继续处理
- **AND** 来源空间数据保持不变

## RENAMED Requirements

- FROM: `### Requirement: Explicit cross-profile import`
- TO: `### Requirement: Storage space data transfer`
