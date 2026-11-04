# Spec Delta

## Purpose

定义 iOS 用户将系统分享面板中的文件和媒体带入 Transfer Genie 待发送草稿的完整行为，包括持久接收、冷启动恢复、幂等导入和失败处理。

## ADDED Requirements

### Requirement: System share entry

iOS 客户端 SHALL 在系统分享面板中提供 Transfer Genie 入口，接收来自照片、文件 App 及其它应用的图片、视频和文件。单次分享最多接收 10 项。

#### Scenario: Share photos from the Photos app

- **WHEN** 用户从照片 App 选择一张或多张图片并打开系统分享面板
- **THEN** 分享面板显示 Transfer Genie
- **AND** 选择 Transfer Genie 后进入文件接收流程

#### Scenario: Share files from a third-party app

- **WHEN** 用户从文件 App 或其它 App 分享一个或多个文件
- **THEN** Transfer Genie 接收这些文件并保留其原始文件名和内容类型

#### Scenario: Share unsupported or empty content

- **WHEN** 分享内容没有任何受支持的文件项
- **THEN** 客户端显示明确的不支持提示
- **AND** 不创建空分享批次或残留附件

### Requirement: Durable share intake

选择 Transfer Genie 后，分享扩展 SHALL 将内容保存到主 App 可访问的私有共享收件箱，并记录稳定批次标识和文件元数据。接收完成后的导入不得依赖原 App 或源文件继续可用。

#### Scenario: Source file becomes unavailable

- **WHEN** 用户在分享完成后删除或移动源文件
- **THEN** 主 App 仍能导入分享前保存的文件副本

#### Scenario: App is killed after sharing

- **WHEN** 分享扩展完成接收后主 App 被终止或尚未启动
- **THEN** 用户再次打开主 App 时可以继续导入该分享批次

#### Scenario: Share copy fails partway

- **WHEN** 分享扩展在复制多个文件时发生错误
- **THEN** 客户端不展示不完整的分享批次
- **AND** 已写入但未完成批次的内容不会进入草稿

### Requirement: Composer handoff

待导入批次 SHALL 在主 App 可用时打开移动端 Composer，并把分享附件追加到当前草稿。分享行为本身 MUST NOT 直接发送消息。

#### Scenario: Warm app receives a share

- **WHEN** 主 App 正在运行时用户完成一次系统分享
- **THEN** App 打开 Composer 并显示新加入的附件
- **AND** 已有草稿文字、格式和附件保持不变

#### Scenario: Cold start receives a share

- **WHEN** 主 App 未运行时用户完成一次系统分享
- **THEN** 冷启动完成时直接进入带分享附件的 Composer
- **AND** 初始化期间不出现空白或可交互的空草稿

#### Scenario: User confirms sending

- **WHEN** 用户检查分享附件并点击发送
- **THEN** 客户端使用现有本地优先消息保存与同步流程
- **AND** 分享附件不会在用户确认前自动发送

### Requirement: Idempotent share import

同一分享批次 SHALL 只导入一次。重复打开分享 URL、重复前台恢复或中断后的重试 MUST NOT 产生重复附件；共享收件箱中的副本仅可在主 App 草稿持久化成功后清理。

#### Scenario: Import URL is handled twice

- **WHEN** 主 App 对同一分享批次重复处理导入通知
- **THEN** Composer 中仍只有一组该批次附件

#### Scenario: App exits after staging attachments

- **WHEN** 主 App 已把分享文件复制到草稿附件目录但在保存草稿前退出
- **THEN** 下次启动能够安全恢复或重新导入该批次
- **AND** 不丢失文件或产生重复附件

#### Scenario: Draft persistence fails

- **WHEN** 分享附件已导入但草稿持久化失败
- **THEN** 共享收件箱中的批次仍可重试
- **AND** 客户端不得报告分享已成功接收

### Requirement: Account and destination readiness

主 App SHALL 在当前账号和存储空间可用后将分享文件带入该空间的草稿。若用户尚未登录或当前存储空间不可用，客户端 SHALL 保留待导入批次并在就绪后继续。

#### Scenario: User is signed out

- **WHEN** 用户分享文件但尚未登录 Supabase 账号
- **THEN** 文件保留在私有共享收件箱
- **AND** 客户端在登录流程完成后提示或自动继续导入

#### Scenario: Storage space becomes ready

- **WHEN** 用户选择一个可用存储空间
- **THEN** 分享附件进入该空间的 Composer 草稿
- **AND** 分享附件不会写入其它存储空间

### Requirement: Import error recovery

分享导入失败时，客户端 SHALL 显示可理解的错误并保留可重试的数据。客户端 MUST NOT 把导入失败显示为消息已发送。

#### Scenario: Large iCloud file cannot be prepared

- **WHEN** 分享项因下载、存储空间或系统时间限制无法准备
- **THEN** 分享扩展或主 App 显示失败原因
- **AND** 用户可以从系统相册或文件 App 的其它入口重试

#### Scenario: Import retry succeeds

- **WHEN** 用户排除存储、网络或权限问题后重试同一批次
- **THEN** 客户端导入仍可用的分享项
- **AND** 失败的分享项继续保留明确状态
