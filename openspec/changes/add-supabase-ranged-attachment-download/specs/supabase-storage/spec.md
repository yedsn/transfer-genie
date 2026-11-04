## MODIFIED Requirements

### Requirement: Private attachment lifecycle

附件 SHALL 先可靠保存到本机，再上传到独立私有 bucket。对象路径 MUST 包含用户、空间和附件稳定 ID；数据库只保存稳定对象路径。上传确认前附件不得标记为云端可用。客户端下载 Supabase 私有附件时，文件大小超过 16MB SHALL 默认使用最多 4 段的 HTTP Range 并发下载，并 SHALL 持久化整体任务及分段进度，以便在连接中断、应用重启或 iOS 前后台切换后仅恢复未完成部分。每个分段失败 SHALL 独立重试；当 Storage 不支持或不正确响应 Range 时，客户端 SHALL 自动回退到单流断点续传或完整单流下载。所有下载结果在正式缓存发布前 MUST 通过预期大小和可用的 SHA-256 校验。

#### Scenario: Large attachment downloads in segments

- **WHEN** 用户下载一个大于 16MB 且 Supabase Storage 正确返回 206 Content-Range 的私有附件
- **THEN** 客户端最多并发请求 4 个不重叠字节区间
- **AND** 每个区间独立保存进度并写入独立临时分段文件
- **AND** 所有区间完成后按顺序合并并校验大小和 SHA-256

#### Scenario: Resume after an interrupted segment

- **WHEN** 某个分段在传输中发生 EOF、网络中断或应用退出
- **THEN** 客户端保留已完成分段和未完成分段的持久化状态
- **AND** 下次恢复只重新请求未完成或校验失败的分段
- **AND** 不重新下载已完成且身份匹配的分段

#### Scenario: Segmented download progress is reported

- **WHEN** 用户在传输页面查看一个正在并发分段下载的附件任务
- **THEN** 进度事件以所有分段已接收字节之和对比完整附件大小
- **AND** 进度条显示聚合百分比，并标明当前并发分段数量
- **AND** 进度事件区分继续下载、重新下载与新下载，且不把整文件范围当作单段进度展示

#### Scenario: Range is unsupported

- **WHEN** Supabase Storage 忽略 Range、返回非预期的 200，或返回缺失或错误的 Content-Range
- **THEN** 客户端停止使用分段并发模式
- **AND** 优先使用单流 Range 断点续传
- **AND** 如果服务端仍不支持 Range，则回退到完整单流下载而不损坏已有正式缓存

#### Scenario: Integrity or identity check fails

- **WHEN** 合并后的附件大小、SHA-256、对象路径、账号或空间身份与任务记录不匹配
- **THEN** 客户端不得发布或替换正式缓存文件
- **AND** 保留可恢复的临时状态或清理不匹配的旧分段
- **AND** 向用户报告可重试的下载错误

#### Scenario: Object upload succeeds but metadata commit fails

- **WHEN** Storage 对象上传成功但附件元数据事务失败
- **THEN** 客户端保留本地原件与重试任务
- **AND** 重试可复用或清理孤立对象而不覆盖他人文件

#### Scenario: Open attachment offline

- **WHEN** 用户离线打开附件
- **THEN** 已缓存附件可以打开
- **AND** 未下载附件明确提示需要联网
