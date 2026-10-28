# Spec Delta

## ADDED Requirements

### Requirement: Mobile suspension-safe synchronization
iOS 客户端 SHALL 在进入后台前保持业务记录、附件本地副本、outbox 快照和 checkpoint 可恢复。同步正确性 MUST NOT 依赖应用在后台持续运行；未完成操作 SHALL 在下一次可运行时从持久状态恢复。

#### Scenario: Suspend while an outbox item is pending
- **WHEN** 用户发送内容后立即将应用切到后台
- **THEN** 本地消息和 outbox 操作保持持久化
- **AND** 应用恢复前台后继续处理同一 operation ID

#### Scenario: System terminates the suspended application
- **WHEN** iOS 在应用暂停期间终止进程
- **THEN** 下一次启动能够恢复未完成的同步状态
- **AND** 不创建重复消息或附件

### Requirement: Foreground recovery ordering
iOS 客户端恢复可运行状态时 SHALL 先恢复被中断的领取状态与本地同步元数据，再建立或恢复 Session，随后处理可上传 outbox 并执行增量补拉。界面 SHALL 在恢复期间展示真实待同步数量和登录状态。

#### Scenario: Restore with a valid session
- **WHEN** 应用回到前台且持久 Session 仍有效
- **THEN** 客户端恢复待处理 outbox 并执行增量补拉
- **AND** 最终同步状态反映剩余失败或冲突项

#### Scenario: Restore with an expired session
- **WHEN** 应用回到前台但 Session 无法恢复或刷新
- **THEN** 客户端保留本地消息和 outbox
- **AND** 显示需要登录而不是丢弃待同步操作

### Requirement: Mobile transfer continuation policy
首个 iOS 版本 SHALL 对未完成附件传输提供可恢复语义。若普通网络任务在应用暂停后未完成，客户端 MUST 保留本地文件、稳定 operation ID 和进度状态，并在恢复前台后继续或重新开始安全传输；界面 MUST NOT 误报为云端已完成。

#### Scenario: Attachment upload pauses in background
- **WHEN** 普通附件上传在应用进入后台后未完成
- **THEN** 附件保持本地待同步或同步中断状态
- **AND** 回到前台后可安全继续处理

#### Scenario: Attachment upload response is unknown
- **WHEN** 应用在上传响应确认前被暂停或终止
- **THEN** 客户端使用原 operation ID 重试或核对远端结果
- **AND** 不创建第二条附件记录
