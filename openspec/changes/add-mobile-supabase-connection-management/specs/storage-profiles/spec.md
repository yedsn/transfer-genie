# Spec Delta

## ADDED Requirements

### Requirement: Mobile saved connection quick selection
移动端 SHALL 在首页存储空间入口提供已保存 Supabase 连接的快捷选择，展示名称、当前标识及简短状态，并提供进入完整管理页的入口。选择对象 MUST 是稳定标识的已保存连接而非当前账号下的远端 Space；禁用连接 MUST NOT 可被激活，未绑定或失效绑定连接 SHALL 引导修复而非进入可发送状态。

#### Scenario: Select another saved connection
- **WHEN** 用户从首页选择已启用且有效绑定的连接 B
- **THEN** 系统将 B 设为当前连接，显示 B 自己的消息和标记，不修改 A 或 B 的远端 Space 绑定

#### Scenario: Disabled and invalid targets
- **WHEN** 用户打开快捷选择，其中包含禁用或绑定异常的连接
- **THEN** 禁用连接不可激活，异常连接可进入管理或修复但不能发送或同步
- **AND** 检查期间连接被删除或禁用时，过期选择不能成功激活它

#### Scenario: Signed-out target is recoverable
- **WHEN** 用户选择有效绑定但已退出登录的 B
- **THEN** 系统进入 B 的登录状态，仍保留选择其他连接和管理入口
- **AND** 不清除 A 的登录凭据或将 A 的账号信息显示为 B 的账号

### Requirement: Mobile connection switch preserves local work
切换已保存连接前，移动端 MUST 将当前编辑内容保存到原连接、账号及空间范围，并确保发送、文件选择等操作可安全结束。切换 SHALL 保留原范围的消息、标记、草稿、附件、同步队列和游标，不退出原账号、不重建旧镜像，不复制、合并或双写数据；无法保存草稿时 MUST 保持原活动连接。

#### Scenario: Switch away and return with a rich draft
- **WHEN** 用户在 A 中编辑 Markdown 草稿及附件后切换到 B，再返回 A
- **THEN** A 的完整草稿和附件恢复，B 不显示或发送该草稿
- **AND** A 的消息、标记及同步进度不因连接切换被重置

#### Scenario: Switch offline with queued work
- **WHEN** A 有已入队但未同步的消息，用户离线切换到已登录且有效绑定的 B
- **THEN** 允许切换，A 的队列保留在 A 的范围，B 显示本地缓存而非必须通过联网检查
- **AND** 返回 A 后可以继续处理原队列，不把待同步内容发往 B

#### Scenario: Unsafe active operation or draft save failure
- **WHEN** 用户切换时发送或系统文件选择尚不能安全结束，或当前草稿保存失败
- **THEN** 切换被阻止并说明原因，原活动连接及编辑上下文不变

### Requirement: Mobile active connection transition isolation
移动端 SHALL 在统一的安全转换中校验最新连接配置并提交活动连接，成功后仅当前连接作为业务同步目标。旧连接的在途操作和晚到结果 MUST 保持原范围或被安全丢弃，不能覆盖新连接界面、账号或同步目标；提交失败 MUST 保留原活动状态，不能覆盖同时发生的无关设置修改。

#### Scenario: Late result after switching
- **WHEN** A 的消息查询、登录检查、媒体预览或原生文件回调在切到 B 后返回
- **THEN** 结果不会覆盖 B 的列表、账号、草稿或附件
- **AND** 必须完成的原操作只影响 A 的原始范围，不改用 B 的目标

#### Scenario: Configuration changes during selection
- **WHEN** 用户选择 B 时，最新配置已改变其他连接名称，或 B 已被移除
- **THEN** 激活操作保留无关的新配置，且对不存在的 B 返回失败
- **AND** 失败时 A 仍为活动连接，不留下界面与持久配置不一致的状态

#### Scenario: Only the active connection schedules mobile sync
- **WHEN** 手机从 A 切到 B，A 尚有后台待处理工作
- **THEN** 不再为 A 调度新的业务同步，原工作保留或安全结束于 A 的范围
- **AND** 不因管理页检查 A 状态而把 A 重新设为同步目标

### Requirement: Mobile connection enable and disable safety
移动端 SHALL 将启用状态与当前选择分开管理。启用连接 MUST NOT 自动激活；禁用当前连接前 MUST 安全保存草稿并暂停其新业务同步，成功后清除当前选择并进入可管理的选择状态，不自动选择其他连接或 WebDAV。禁用 MUST 保留登录状态及本地数据。

#### Scenario: Disable the current connection
- **WHEN** 用户确认禁用 A，且草稿及在途操作已安全处理
- **THEN** A 显示为禁用且仍可管理，当前选择清空，A 的队列和本地数据保留
- **AND** 不自动激活 B 或任意桌面 Provider

#### Scenario: Enable a connection without switching
- **WHEN** 用户启用 B
- **THEN** B 可被快捷选择，当前连接保持原样

#### Scenario: Disable cannot preserve current work
- **WHEN** 禁用当前连接时草稿无法保存或在途操作无法安全结束
- **THEN** 禁用失败，原启用状态和当前选择保持不变，并提示先处理当前操作

### Requirement: Mobile connection removal confirmation
移动端移除连接 MUST 经确认，默认不得强制放弃待处理工作；移除当前连接 SHALL 引导先切换，或在清空最后/当前选择时要求明确确认。若用户选择放弃待同步、冲突或传输工作，MUST 再次说明具体后果后确认。移除 SHALL 删除连接配置和对应安全会话，不删除远端数据；保留的本地历史 MUST NOT 自动归入其他连接。

#### Scenario: Remove an inactive idle connection
- **WHEN** 用户确认移除无待处理工作的非活动连接 B
- **THEN** B 从配置和选择列表消失，其登录凭据被移除，当前 A 不变
- **AND** 远端数据不被删除，B 的保留本地历史不会出现在 A 中

#### Scenario: Refuse silent abandonment
- **WHEN** B 有待同步、冲突或传输工作，用户执行普通移除
- **THEN** 操作被阻止并展示原因，可取消或先处理工作
- **AND** 只有独立的再次确认才能放弃所说明的工作并继续移除，不能默认强制

#### Scenario: Remove the last or active connection
- **WHEN** 用户试图移除当前连接或最后一个连接
- **THEN** 用户可先切换其他连接，或明确确认清空当前选择
- **AND** 执行前保存可保留的草稿、处理在途操作及待处理工作保护，成功后进入可新增和管理的状态，不自动激活其他 Provider
