# Spec Delta

## Purpose

定义用户如何在统一列表中管理多个 WebDAV 与 Supabase 存储空间，并在保持空间相互独立的前提下安全、可恢复地复制完整数据。

## ADDED Requirements

### Requirement: Unified storage space management
客户端 SHALL 在统一的存储空间列表中展示所有 WebDAV 和 Supabase 空间，并允许用户新增、编辑、启用、禁用、切换和移除空间。新增空间时 MUST 先选择 Provider 类型；同一 Provider 类型 MUST 支持多个独立空间。

#### Scenario: Add multiple Supabase spaces
- **WHEN** 用户连续新增两个具有不同 API 地址、账号或 `space_id` 的 Supabase 存储空间
- **THEN** 两个空间均以稳定且不同的标识保存
- **AND** 用户可以分别登录、检查和切换它们

#### Scenario: Add WebDAV and Supabase from one entry
- **WHEN** 用户点击“新增存储空间”
- **THEN** 客户端先要求选择 WebDAV 或 Supabase
- **AND** 随后只展示所选 Provider 需要的配置项

#### Scenario: Preserve profiles while saving one editor
- **WHEN** 用户只编辑并保存其中一个存储空间
- **THEN** 其他 WebDAV 和 Supabase 空间的配置、登录状态和启用状态保持不变

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
已使用的存储空间 SHALL 防止用户在无明确确认的情况下改变远端数据目的地。移除配置 MUST NOT 删除远端数据；若空间存在未完成写入或复制任务，客户端 MUST 阻止移除并说明原因。移除 Supabase 空间时 MUST 清除该 profile 的持久 Session。

#### Scenario: Protect destination fields
- **WHEN** 用户尝试修改已有数据或待同步任务的 Supabase API 地址、公开 Key 或 `space_id`
- **THEN** 客户端阻止普通保存并提示新建存储空间

#### Scenario: Remove inactive clean profile
- **WHEN** 用户确认移除一个非活动且没有未完成任务的空间
- **THEN** 客户端移除本地配置及该空间的持久凭据
- **AND** 远端消息和附件保持不变

#### Scenario: Reject removal with pending work
- **WHEN** 存储空间仍有待上传、冲突或未完成复制项目
- **THEN** 客户端阻止移除并显示未完成项目摘要

### Requirement: Cross-profile data copy
客户端 SHALL 允许用户在任意两个不同的存储空间之间显式复制消息、附件、标签和标记元数据。第一版 MUST 支持 WebDAV → WebDAV、WebDAV → Supabase、Supabase → WebDAV 和 Supabase → Supabase。复制 MUST 保留来源数据、保留目标已有数据，并且 MUST NOT 建立持续同步或自动反向复制。

#### Scenario: Select source and target
- **WHEN** 用户打开“复制存储空间数据”
- **THEN** 客户端允许从所有已启用且可连接的空间中选择来源和目标
- **AND** 不允许来源与目标是同一个存储空间

#### Scenario: Copy between each Provider combination
- **WHEN** 用户选择任一受支持的来源与目标 Provider 组合并开始复制
- **THEN** 客户端读取来源消息和附件并按目标 Provider 的格式写入目标
- **AND** 当前活动存储空间不会因复制而隐式改变

#### Scenario: Source remains independent after copy
- **WHEN** 一次复制成功完成后来源空间出现新数据或数据被修改
- **THEN** 目标空间不会自动随之改变
- **AND** 用户可再次发起复制以补充数据

### Requirement: Copy preview and source readiness
客户端 SHALL 在写入目标前刷新或增量补拉来源空间，建立固定复制计划并展示预览。预览 MUST 包含来源与目标名称、消息数、附件数、附件总大小、标签数、标记数以及预计重复或冲突摘要；预览阶段 MUST NOT 修改目标空间。

#### Scenario: Preview a copy plan
- **WHEN** 用户选择来源和目标并请求检查数据
- **THEN** 客户端先同步来源并创建可恢复的复制计划
- **AND** 展示将要复制的数据摘要而不写入目标

#### Scenario: Source cannot be refreshed
- **WHEN** 来源空间认证失败、未登录或无法完成刷新
- **THEN** 客户端不得开始复制
- **AND** 明确显示需要修复的来源空间状态

### Requirement: Recoverable and idempotent copy
复制任务 SHALL 持久保存来源、目标、目标账号作用域、来源项目标识、稳定目标映射和逐项状态。中断后 MUST 能继续；相同来源项目再次复制到相同目标时 MUST 跳过已确认的相同数据，不得重复创建消息或附件。

#### Scenario: Resume interrupted copy
- **WHEN** 复制在部分项目完成后因退出应用或网络中断而停止
- **THEN** 用户可以继续同一复制任务
- **AND** 已确认成功的项目不会重复写入

#### Scenario: Repeat copy after new source data
- **WHEN** 用户在首次复制完成后再次选择相同来源和目标
- **THEN** 客户端将来源新增项目加入复制计划
- **AND** 已存在且内容一致的项目被标记为跳过

#### Scenario: Existing target data differs
- **WHEN** 稳定目标标识已经存在但内容或版本与来源不一致
- **THEN** 客户端记录冲突并且不得静默覆盖目标
- **AND** 其他无冲突项目可以继续复制

### Requirement: Copy progress and completion verification
客户端 SHALL 持续展示复制阶段、已处理数、总数、失败数和附件字节进度，并持久保存进度。完成前 MUST 核验目标元数据和附件；附件至少 MUST 核验大小与摘要。任务结束后 SHALL 隐藏活动进度条并保留成功、跳过、冲突和失败结果摘要。

#### Scenario: Show active copy progress
- **WHEN** 复制正在执行
- **THEN** 客户端显示当前阶段与处理数量
- **AND** 上传或下载大型附件时显示字节进度

#### Scenario: Complete only after verification
- **WHEN** 所有写入请求已经返回成功
- **THEN** 客户端核验目标记录数量及附件大小和摘要
- **AND** 只有核验通过的项目才计入成功

#### Scenario: Report partial failure
- **WHEN** 部分项目复制或核验失败
- **THEN** 客户端保留成功项目并展示失败和冲突明细
- **AND** 用户可以只继续未完成项目
