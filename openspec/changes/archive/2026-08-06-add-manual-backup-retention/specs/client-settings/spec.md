## ADDED Requirements

### Requirement: Automatic Local Backup Archive Count Limit
客户端 SHALL 在设置中提供「本地备份归档最多自动保留数量」设置项，用于控制自动本地备份归档的最大保留数量。该设置 MUST 持久化保存，并在自动备份归档清理时生效。自动清理 SHALL 只删除超出数量上限的自动备份归档，MUST NOT 删除手动备份归档。

#### Scenario: Update automatic archive count limit
- **WHEN** 用户在设置页修改「本地备份归档最多自动保留数量」并保存
- **THEN** 设置被持久化
- **AND** 后续自动备份归档清理使用新的数量上限

#### Scenario: Prune automatic archives by count
- **WHEN** 自动备份归档数量超过配置的最大自动保留数量
- **THEN** 客户端按旧到新清理超出上限的自动备份归档
- **AND** 最新的自动备份归档保留数量不超过该上限

#### Scenario: Preserve manual archives during automatic cleanup
- **WHEN** 自动备份归档清理运行且目录中同时存在手动备份归档
- **THEN** 客户端只将自动备份归档计入数量上限
- **AND** 手动备份归档不被自动清理删除

### Requirement: Manual Backup Creation With Metadata
客户端 SHALL 在「本地备份归档」和「快照」页面提供「手动备份」按钮。点击后客户端 SHALL 允许用户填写备份名称与备注，并创建带有手动标记、名称、备注、创建时间和备份类型的备份记录。手动备份记录 SHALL 在应用重启后仍可被列表读取并展示名称与备注。

#### Scenario: Create manual local backup archive
- **WHEN** 用户在「本地备份归档」页面点击「手动备份」并提交名称与备注
- **THEN** 客户端创建一条手动本地备份归档记录
- **AND** 列表展示该记录的备份名称与备注

#### Scenario: Create manual snapshot backup
- **WHEN** 用户在「快照」页面点击「手动备份」并提交名称与备注
- **THEN** 客户端创建一条手动快照备份记录
- **AND** 列表展示该记录的备份名称与备注

#### Scenario: Manual backup metadata persists
- **WHEN** 用户创建手动备份后重启应用或刷新备份列表
- **THEN** 手动备份记录仍然存在
- **AND** 备份名称、备注和手动标记保持不变

#### Scenario: Manual backup form accepts empty optional fields
- **WHEN** 用户打开手动备份弹窗但未填写名称或备注并提交
- **THEN** 客户端仍创建手动备份记录
- **AND** 列表使用默认文件名或创建时间作为可识别展示信息

### Requirement: Manual Backups Are Excluded From Automatic Cleanup
客户端 SHALL 在所有自动备份清理流程中识别手动备份记录。任何由用户通过「手动备份」创建的本地备份归档或快照 MUST NOT 被自动数量上限清理或自动保留策略清理删除。

#### Scenario: Automatic cleanup skips manual local archive
- **WHEN** 用户已创建手动本地备份归档且后续自动备份触发清理
- **THEN** 手动本地备份归档仍保留在列表中
- **AND** 自动归档清理只影响符合清理条件的自动备份归档

#### Scenario: Automatic cleanup skips manual snapshot
- **WHEN** 用户已创建手动快照备份且后续快照清理运行
- **THEN** 手动快照备份仍保留在列表中
- **AND** 自动快照清理只影响符合清理条件的自动快照

### Requirement: Local Backup Archive Management Actions
客户端 SHALL 在「本地备份归档」页面提供「新建归档」和「清空归档」操作。「新建归档」SHALL 创建一条普通本地数据备份归档记录并刷新归档列表。「清空归档」SHALL 在用户确认后删除当前可列出的本地备份归档文件及其元数据记录，并刷新归档列表。

#### Scenario: Create local backup archive from archive page
- **WHEN** 用户在「本地备份归档」页面点击「新建归档」
- **THEN** 客户端创建一条新的本地备份归档记录
- **AND** 创建完成后刷新本地备份归档列表

#### Scenario: Clear local backup archives from archive page
- **WHEN** 用户在「本地备份归档」页面点击「清空归档」并确认
- **THEN** 客户端删除当前可列出的本地备份归档文件及其元数据记录
- **AND** 清空完成后刷新本地备份归档列表

#### Scenario: Cancel clearing local backup archives
- **WHEN** 用户点击「清空归档」但取消确认
- **THEN** 客户端 MUST NOT 删除任何本地备份归档
