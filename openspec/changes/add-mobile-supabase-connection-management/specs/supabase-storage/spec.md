# Spec Delta

## ADDED Requirements

### Requirement: Mobile per-connection Supabase sessions
移动端 SHALL 分别保存和恢复每个 Supabase 连接的普通用户会话，会话 MUST 存于操作系统凭据库。针对某连接登录、刷新或退出 MUST NOT 改变其他连接的会话；账号更换 SHALL 遵守本地数据隔离和待处理工作保护，不将旧账号数据提交给新账号。客户端 MUST NOT 接受 service-role 或 secret Key 作为公开连接 Key。

#### Scenario: Retain two independently signed-in connections
- **WHEN** 用户分别登录不同服务地址的 A 和 B，切换连接后重启应用
- **THEN** 各连接从自己的安全会话恢复账号状态，不以最后一次登录覆盖其他连接

#### Scenario: Logout affects only the selected connection
- **WHEN** 用户在管理页退出 B 的账号，而 A 是当前连接
- **THEN** B 变为未登录，A 的账号和业务同步保持原样
- **AND** B 的本地数据不被归入 A，B 再次登录前不发送业务数据

#### Scenario: Account replacement cannot reuse old pending work
- **WHEN** 某连接尝试登录不同账号，原账号仍有待同步或冲突工作
- **THEN** 系统阻止不安全的账号替换并说明原因，或要求先通过明确的处理流程完成原工作
- **AND** 原账号本地数据始终保持原账号范围，不上传到新账号

#### Scenario: Reject privileged credentials
- **WHEN** 用户在连接向导输入 service-role 或 secret Key
- **THEN** 客户端拒绝将其保存为连接配置并提示使用公开 Key，错误和日志不回显 Key 内容

### Requirement: Mobile non-active connection diagnostics
移动端 SHALL 支持针对指定已保存连接执行连接及账号/绑定状态检查。检查 MUST NOT 激活被检查连接、替换当前账号界面或调度其业务同步，结果 MUST 按连接归属。检查失败 SHALL 区分网络不可达、明确的会话失效和绑定不可用，不把未知状态直接视为退出登录。

#### Scenario: Check an inactive connection
- **WHEN** 当前连接 A 正常使用，用户检查 B 的服务连通性、账号或绑定状态
- **THEN** 结果仅更新 B 的管理状态，不切换 A、不读取 B 的消息用于当前列表、不触发 B 的上传或下载队列

#### Scenario: Check result arrives after editing or removal
- **WHEN** B 的检查未完成，用户修改其连接目标或移除 B
- **THEN** 旧结果不覆盖新目标状态，也不让已移除连接重新出现

#### Scenario: Network failure differs from explicit session expiry
- **WHEN** 状态检查因网络断开失败，或服务明确拒绝已失效会话
- **THEN** 前者显示无法确认并保留可恢复会话，后者显示需登录或修复
- **AND** 两者均不影响其他连接的凭据

### Requirement: Mobile binding flow session isolation
移动端新增连接 SHALL 使用独立临时绑定流程，临时会话 MUST NOT 替换当前连接账号或暴露给界面。最终保存 MUST 验证连接参数、账号及选中 Space 一致且有访问权限；取消、过期或参数失效 SHALL 清理临时凭据。失败或重试 MUST NOT 留下重复连接或将临时会话写入错误连接。

#### Scenario: Temporary login remains separate
- **WHEN** A 活动期间用户在新增 B 的流程中完成登录和空间查询
- **THEN** 向导展示 B 的临时账号和空间结果，主界面的 A 账号、草稿和同步目标不变
- **AND** 前端仅获得必要的流程标识和账号摘要，不获得临时会话 Token

#### Scenario: Cancel or reject stale binding flow
- **WHEN** 用户取消流程，流程过期，或使用与已登录流程不同的地址、Key 或失效 Space 完成保存
- **THEN** 取消时清理临时凭据，失效或不匹配请求被拒绝且不能写入活动连接

#### Scenario: Binding failure and retry
- **WHEN** 最终验证、配置保存或安全会话持久化失败后用户重试
- **THEN** 页面报告实际保存结果，可安全重试或清理未完成结果，不误报绑定成功
- **AND** 不产生重复目标配置、不替换其他连接会话，也不影响原活动连接

### Requirement: Mobile explicit accessible space binding
移动端连接向导 SHALL 展示该临时账号有权访问的远端 Space，并在最终确认中展示选择结果。登录和列出空间 MUST NOT 隐式创建 Space；创建 SHALL 由独立明确操作触发。更换绑定 SHALL 校验访问权限及旧范围的待处理工作，不能通过新增或快捷切换绕过绑定安全检查。

#### Scenario: No accessible space
- **WHEN** 登录成功但没有可访问的 Space
- **THEN** 显示空状态及显式创建或取消入口，不自动创建，不将连接标记为可发送

#### Scenario: Permission revoked before confirmation
- **WHEN** 用户选择的 Space 在确认前失去访问权限
- **THEN** 最终保存被拒绝并引导重新选择，不保存不可用绑定或改变当前连接

#### Scenario: Unsafe rebind is rejected
- **WHEN** 用户尝试更换绑定 Space，而旧范围存在待同步、冲突或传输工作
- **THEN** 重绑被阻止且原绑定、会话和本地工作不变，不通过普通连接切换清空旧镜像
