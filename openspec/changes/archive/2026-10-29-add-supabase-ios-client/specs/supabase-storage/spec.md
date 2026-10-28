# Spec Delta

## ADDED Requirements

### Requirement: Cross-platform preview interoperability
Supabase 图片与视频预览 SHALL 使用平台无关的稳定 JPEG 派生对象和 `preview_object_path` 元数据。任何受支持客户端生成的预览 MUST 可被同一账号的其他客户端读取，生成实现差异 MUST NOT 改变对象归属、路径隔离或删除语义。

#### Scenario: iOS reads a desktop-generated poster
- **WHEN** 桌面客户端为视频发布 `preview.jpg` 并同步附件元数据
- **THEN** iOS 客户端使用普通用户 Session 下载并缓存该预览
- **AND** 无需先下载完整视频

#### Scenario: Desktop reads an iOS-generated poster
- **WHEN** iOS 客户端为图片或视频发布 `preview.jpg`
- **THEN** 桌面客户端拉取变化后显示同一预览对象

### Requirement: iOS credential persistence
iOS 客户端 SHALL 将 Supabase 持久 Session 保存在 iOS Keychain 等系统凭据库中。Refresh token、访问令牌和敏感账号数据 MUST NOT 写入普通设置、前端本地存储、日志或可分享的配置文件。

#### Scenario: Restore session after restart
- **WHEN** 用户成功登录后终止并重新启动 iOS 应用
- **THEN** 客户端从系统凭据库恢复或刷新 Session
- **AND** 无需在有效会话期间重复输入密码

#### Scenario: Sign out on iOS
- **WHEN** 用户在 iOS 执行退出登录
- **THEN** 客户端删除对应系统凭据条目并停止该账号同步
- **AND** 下一次启动不会自动恢复已退出的 Session

### Requirement: Foreground-scoped Realtime on iOS
iOS 客户端 SHALL 在可运行的前台会话中维护 Supabase Realtime，并 SHALL 在订阅建立或重建后执行 checkpoint 补拉。应用进入后台时 MUST NOT 依赖 Realtime 持续连接；恢复前台后 SHALL 重新鉴权、订阅并补拉。

#### Scenario: Realtime disconnects in background
- **WHEN** iOS 暂停应用并断开 WebSocket
- **THEN** 本地数据与 checkpoint 保持有效
- **AND** 恢复前台后的增量补拉获取暂停期间的全部变化

#### Scenario: Session refresh changes Realtime token
- **WHEN** 客户端刷新 Supabase Session
- **THEN** 后续 Realtime 连接使用新的有效令牌
- **AND** 重新订阅后执行补偿拉取

### Requirement: iOS attachment transfer truthfulness
iOS 客户端 SHALL 仅在 Supabase 确认原附件对象和权威附件元数据后标记为云端可用。应用暂停、网络切换、超时或响应未知时 SHALL 保留可恢复状态，预览上传失败 MUST NOT 将原附件误标记失败或成功。

#### Scenario: Original succeeds and preview fails
- **WHEN** 原附件和元数据已确认但预览生成或上传失败
- **THEN** 原附件保持可下载
- **AND** 预览显示待补全或失败状态

#### Scenario: App suspends before upload confirmation
- **WHEN** iOS 在附件上传响应确认前暂停应用
- **THEN** 客户端保持附件为未确认状态
- **AND** 恢复后核对或重试，不误报云端完成
