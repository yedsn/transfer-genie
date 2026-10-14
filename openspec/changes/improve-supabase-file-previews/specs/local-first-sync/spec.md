# Spec Delta

## ADDED Requirements

### Requirement: Isolated recoverable preview cache
客户端 SHALL 将附件预览缓存按存储空间、远端账号和附件稳定 ID 隔离。读取缓存时 MUST 验证当前活动上下文与缓存归属一致；切换空间或账号不得显示其他上下文的预览。已缓存预览 SHALL 可离线显示，清除消息或附件本地缓存时 SHALL 同步清理其预览缓存。

#### Scenario: Switch between Supabase accounts
- **WHEN** 用户从一个 Supabase 账号切换到另一个账号
- **THEN** 消息列表只读取新账号所属的预览缓存
- **AND** 不显示前一账号的图片或视频封面

#### Scenario: Browse cached previews offline
- **WHEN** 用户离线打开曾经加载过预览的存储空间
- **THEN** 客户端从隔离缓存显示已有预览
- **AND** 未缓存的附件显示类型卡片和需要联网的状态

#### Scenario: Remove local attachment data
- **WHEN** 用户删除消息或清除对应附件的本地缓存
- **THEN** 客户端清除该附件的本地预览缓存
- **AND** 不影响其他空间、账号或附件的预览缓存

### Requirement: Bounded and deduplicated preview work
客户端 SHALL 对预览生成和远端预览下载设置有界并发，并 SHALL 合并同一存储空间、账号和附件的并发请求。同一预览任务完成后，所有仍然有效的请求方 SHALL 复用同一结果；失败 SHALL 进入可重试状态，且 MUST NOT 阻塞消息列表、原附件上传或其他同步操作。

#### Scenario: Same thumbnail requested by multiple views
- **WHEN** 消息列表和详情弹窗同时请求同一附件预览
- **THEN** 客户端只执行一次有效的下载或生成任务
- **AND** 两个界面复用同一缓存结果

#### Scenario: Many thumbnails become visible
- **WHEN** 大量带缩略图的历史消息同时进入可视范围
- **THEN** 客户端按照有界并发处理预览任务
- **AND** 消息同步、手动刷新和界面交互仍可继续

#### Scenario: Preview task fails
- **WHEN** 某个预览任务因网络、解码或磁盘错误失败
- **THEN** 失败只影响对应附件的预览状态
- **AND** 用户可以稍后重试，原附件及其他同步任务不受阻塞

