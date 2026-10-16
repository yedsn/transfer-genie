# Spec Delta

## ADDED Requirements

### Requirement: Private attachment preview lifecycle
Supabase 图片和视频附件 SHALL 使用与原附件分离的私有预览派生对象。预览对象路径 MUST 包含 Auth 用户、空间和附件稳定 ID，附件元数据 SHALL 保存稳定的预览对象路径而非临时 URL。客户端 SHALL 使用当前普通用户 Session 读写预览对象，并 MUST 对预览对象执行与原附件相同的用户和空间访问隔离。

#### Scenario: Upload preview with a new image attachment
- **WHEN** 用户向 Supabase 空间发送支持预览的图片
- **THEN** 客户端保存并上传原附件
- **AND** 客户端生成并上传独立的受限尺寸预览对象
- **AND** 附件元数据记录原附件路径和预览对象路径

#### Scenario: Upload preview with a new video attachment
- **WHEN** 用户向 Supabase 空间发送支持预览的视频
- **THEN** 客户端从视频生成封面帧并上传为独立预览对象
- **AND** 附件元数据记录该预览对象路径

#### Scenario: Read preview on another device
- **WHEN** 同一账号的另一台设备拉取到包含预览对象路径的附件元数据
- **THEN** 该设备可使用当前 Session 从私有 Storage 获取预览对象
- **AND** 无需先下载完整原附件

#### Scenario: Reject cross-user preview access
- **WHEN** 用户尝试读取、覆盖或删除另一用户路径下的预览对象
- **THEN** Supabase Storage 拒绝该操作

#### Scenario: Delete attachment with preview
- **WHEN** Supabase 附件被确认从远端删除
- **THEN** 原附件对象和已记录的预览对象都进入对应的清理流程
- **AND** 其他设备通过增量同步移除对应预览状态

### Requirement: Recoverable preview publication
原附件上传和附件元数据提交 SHALL 保持现有可靠同步语义；预览生成或上传失败 MUST NOT 阻止原附件变为云端可用。预览发布 SHALL 可独立重试，并在成功后通过带 revision 和 operation ID 的权威附件操作更新 `preview_object_path`，不得覆盖其他附件或产生重复业务记录。

#### Scenario: Preview generation fails after original is saved
- **WHEN** 原附件已经可靠保存在本机但预览生成失败
- **THEN** 原附件仍可进入上传和元数据同步流程
- **AND** 附件显示为可下载但预览待补全或失败

#### Scenario: Preview upload response is lost
- **WHEN** 预览对象已经写入 Storage 但客户端没有收到成功响应
- **THEN** 客户端可使用稳定对象路径安全重试
- **AND** 重试不会创建第二个附件或错误关联到其他消息

#### Scenario: Transfer attachment into Supabase
- **WHEN** 存储空间数据传输把支持预览的附件写入 Supabase
- **THEN** 目标空间保存原附件并建立对应预览对象或可恢复的预览补全任务
- **AND** 目标附件元数据最终包含正确的预览对象路径

### Requirement: Lazy completion of historical previews
对于 `preview_object_path` 为空的历史 Supabase 图片或视频，客户端 SHALL 在预览首次被需要时执行懒补全。客户端 SHALL 优先使用隔离缓存中的本地原件；没有本地原件时可临时获取云端原件用于生成预览，并 SHALL 在补全结束后避免把该临时获取误记为用户正式下载。成功补全后，其他设备 SHALL 能通过附件变化获取新的预览路径。

#### Scenario: Complete preview from local original
- **WHEN** 历史附件没有预览路径但当前设备仍有本地原件
- **THEN** 客户端从本地原件生成并发布预览
- **AND** 不重新上传或覆盖原附件内容

#### Scenario: Complete preview from remote original
- **WHEN** 历史附件没有预览路径且当前设备没有本地原件
- **THEN** 客户端在预览确实进入需要状态后临时获取原附件并生成预览
- **AND** 生成过程不得被报告为用户完成了一次正式下载

#### Scenario: Historical preview cannot be completed
- **WHEN** 原附件不可访问、不受支持或预览生成失败
- **THEN** 客户端保留文件类型卡片并记录可重试的预览状态
- **AND** 原附件元数据和已有 Storage 对象保持不变

