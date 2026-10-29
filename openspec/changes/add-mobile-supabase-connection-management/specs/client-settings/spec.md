# Spec Delta

## ADDED Requirements

### Requirement: Mobile Supabase connection management page
移动端 SHALL 在「我的 → 存储空间」提供全屏管理页，以独立卡片展示全部已保存的 Supabase 连接，包括禁用、未登录和异常连接。卡片 SHALL 展示名称、服务地址、当前标识、启用状态及账号/绑定状态，提供新增、编辑、启停、移除和选择当前连接的操作。移动端 MUST NOT 提供 WebDAV 配置入口或显示会话凭据。

#### Scenario: List saved connections rather than remote spaces
- **WHEN** 用户保存了两个 Supabase 连接，其中一个已禁用，当前账号下另有多个远端 Space
- **THEN** 管理页分别展示两个连接卡片，禁用连接仍可编辑或启用
- **AND** 远端 Space 不被当成额外连接卡片，当前连接标识只对应实际活动连接

#### Scenario: Manage locally while offline
- **WHEN** 用户离线打开管理页
- **THEN** 页面根据本地配置立即展示连接，不以成功列出远端 Space 为前提
- **AND** 无法确认的远端状态显示为待检查或检查失败，不把网络错误误报为账号已退出

#### Scenario: Preserve desktop-only settings
- **WHEN** 用户在移动端保存 Supabase 连接配置，既有设置包含 WebDAV 和桌面专用字段
- **THEN** 移动端不展示 WebDAV 管理入口，保存操作也不删除或覆盖无关配置

### Requirement: Cancellable mobile connection setup
移动端 SHALL 为首次配置和新增连接提供「连接 → 账号 → 空间 → 确认」流程，支持返回和取消。最终确认前 MUST NOT 持久化新连接或改变当前活动连接；返回修改上游信息后 MUST 使依赖该信息的验证和空间选择失效。已有连接时 SHALL 提供「保存」及「保存并切换」，首次配置 SHALL 默认保存并切换。

#### Scenario: Cancel adding another connection
- **WHEN** 当前连接 A 已就绪，用户新增 B 并在登录或空间选择后取消
- **THEN** 不保存 B，不改变 A 的账号、消息、草稿、活动状态或同步目标
- **AND** 清理新增流程的临时凭据并返回原管理界面

#### Scenario: Change upstream connection information
- **WHEN** 用户完成测试和登录后返回修改服务地址或公开 Key
- **THEN** 原连接测试、临时登录和空间选择失效，不能使用旧结果完成保存

#### Scenario: Save without activation
- **WHEN** 用户完成 B 的确认并选择「保存」
- **THEN** B 成为可管理的已保存连接，A 仍为当前连接且界面数据不变

#### Scenario: First connection and duplicate destination
- **WHEN** 用户首次完成配置，或重试保存已存在的同一服务及 Space
- **THEN** 首次配置成功后激活连接；重试不生成重复连接，使用已验证且账号兼容的现有配置
- **AND** 如不能安全复用现有配置，显示原因且不覆盖其会话或数据

### Requirement: Mobile connection edit destination safety
移动端 SHALL 允许编辑连接名称和启用状态，并保持连接标识及现有会话。修改地址、公开 Key 或绑定空间 MUST 遵守目标变更安全检查；已有业务数据或待处理工作时 MUST NOT 直接覆盖目标。更换远端 Space SHALL 使用独立的重绑操作及确认，而不是快捷连接切换。

#### Scenario: Rename an existing connection
- **WHEN** 用户修改连接名称并保存
- **THEN** 名称更新，连接标识、登录状态、绑定空间、缓存和草稿不变

#### Scenario: Reject unsafe endpoint replacement
- **WHEN** 用户尝试修改已有业务数据或待处理工作的连接地址或公开 Key
- **THEN** 操作被拒绝，原配置及数据不变，并引导新增连接而非直接覆盖

#### Scenario: Rebind a remote space deliberately
- **WHEN** 用户在连接设置中选择更换远端 Space
- **THEN** 页面明确说明该操作与连接切换不同，检查权限及待处理工作，并在重建旧本地镜像前要求单独确认
- **AND** 草稿或附件不能安全保留时阻止操作并提示先处理，不静默丢弃

### Requirement: Mobile connection recovery access
移动端 SHALL 在无配置、无可用活动连接、未登录、绑定异常和初始化失败状态下提供管理、新增或选择其他已保存连接的入口。未登录连接 SHALL 支持针对该连接登录；未绑定或失效绑定的连接 MUST NOT 开放发送或业务同步，并 SHALL 提供修复指引。

#### Scenario: Recover from a signed-out or failed active connection
- **WHEN** 当前连接 A 未登录或初始化失败，而已保存连接 B 可用
- **THEN** 用户无需修复 A 即可打开管理或选择 B
- **AND** 选择 B 不自动移除 A 或清除 A 的本地数据

#### Scenario: No enabled connection or invalid binding
- **WHEN** 所有连接均禁用，或当前连接没有有效的远端 Space 绑定
- **THEN** 用户仍可查看和编辑已保存连接或新增连接
- **AND** 未完成有效绑定前不允许发送或同步，不隐式创建远端 Space

### Requirement: Mobile connection settings usability and privacy
连接管理和配置界面 SHALL 支持 iOS 安全区域、键盘、大字号及长地址显示，主要操作触点 MUST 至少为 44pt。公开 Key 输入 SHALL 默认遮蔽；会话 Token、密码及敏感配置 MUST NOT 出现在卡片、错误信息或日志中。嵌套弹层 SHALL 保持正确焦点和背景不可交互状态。

#### Scenario: Keyboard and long configuration values
- **WHEN** 用户在小屏设备或大字号下输入长服务地址和公开 Key，并打开键盘
- **THEN** 字段和当前步骤操作可滚动到达，内容不撑破页面或被安全区域遮挡
- **AND** 公开 Key 默认遮蔽，错误提示不回显密码或 Token

#### Scenario: Return from a nested confirmation
- **WHEN** 用户关闭连接管理内的确认弹层
- **THEN** 返回原管理上下文和触发位置，未关闭弹层时背景不能被误触操作
