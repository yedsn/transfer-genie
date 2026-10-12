# local-first-sync Specification

## Purpose
定义所有远端 Provider 共用的 SQLite 本地优先保存、可靠上传、增量拉取、删除传播、冲突处理和用户可见同步状态。

## Requirements

### Requirement: Transactional local-first writes
客户端 SHALL 在同一 SQLite 事务中保存业务修改与对应 outbox 操作，并在事务提交后立即向界面展示本地结果。网络上传 MUST 在事务提交后异步执行。

#### Scenario: Save while offline
- **WHEN** 用户离线发送或修改消息
- **THEN** 业务记录和待同步操作一起持久化
- **AND** 重启后内容与待同步状态仍然存在

#### Scenario: Local transaction fails
- **WHEN** SQLite 事务因空间不足或数据库错误失败
- **THEN** 客户端不得显示已保存
- **AND** 应保留用户输入供重试或导出

### Requirement: Idempotent recoverable upload queue
每个待同步逻辑操作 SHALL 使用稳定 operation ID 和不可变上传快照。结果未知、进程退出或网络失败后 MUST 使用同一 operation ID 重试，不得重复产生业务记录或副作用。

#### Scenario: Response is lost after server commit
- **WHEN** 服务端已提交操作但客户端未收到响应
- **THEN** 客户端使用原 operation ID 重试
- **AND** 服务端返回原结果而不重复应用操作

#### Scenario: Process exits while sending
- **WHEN** 操作处于 sending 状态时程序退出
- **THEN** 下一次同步在会话和网络检查前恢复该领取状态
- **AND** 操作重新进入可安全处理状态

### Requirement: Revision conflicts and deletion tombstones
远端业务实体 SHALL 使用服务端 revision。更新 MUST 校验 base revision；版本不一致时 MUST 返回冲突而非静默覆盖。删除 SHALL 作为带 revision 的墓碑传播，离线旧设备不得自动复活已删除记录。

#### Scenario: Concurrent message edit
- **WHEN** 两台设备基于相同 revision 修改同一消息
- **THEN** 第一项提交成功
- **AND** 后续提交进入包含本机版与远端版的冲突状态

#### Scenario: Offline edit after remote delete
- **WHEN** 一台设备删除消息而另一台设备离线修改旧版本
- **THEN** 删除墓碑被保留
- **AND** 离线修改不得自动恢复消息

### Requirement: Recoverable incremental pull
客户端 SHALL 使用服务端提供的每空间单调变更序号增量拉取变化，并在同一 SQLite 事务中应用变化和推进 checkpoint。Realtime MUST 仅作为变化提醒；启动、重连、恢复网络和手动刷新均 MUST 执行补拉。

#### Scenario: Realtime notification is missed
- **WHEN** 设备断开 Realtime 期间发生新增、更新或删除
- **THEN** 重连后的增量补拉仍能获取全部变化

#### Scenario: Client crashes during pull
- **WHEN** 客户端应用一批变化时崩溃
- **THEN** 未提交的 checkpoint 不会前移
- **AND** 重启后能够安全重放该批变化

### Requirement: Observable sync status
客户端 SHALL 区分“已保存到本机”“等待连接恢复”“同步中”“已同步”“需要登录”“同步失败”和“有冲突”。本地事务新增 outbox 后 MUST 先广播待同步数量，再唤醒后台上传。

#### Scenario: Fast successful upload
- **WHEN** 在线修改在极短时间内被服务端确认
- **THEN** 界面仍可观察到待同步数量从零变为非零再回到零
- **AND** 展示延时不得阻塞实际上传

#### Scenario: Manual sync with remaining work
- **WHEN** 用户手动同步但网络错误导致仍有待同步项
- **THEN** 客户端显示本机已保存及剩余数量
- **AND** 不得提示云端保存成功
