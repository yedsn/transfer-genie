# Spec Delta

## ADDED Requirements

### Requirement: Bounded mobile startup waiting
移动端 SHALL 为每次启动初始化设置 10 秒等待上限；初始化失败时 SHALL 立即结束 loading，未完成时 SHALL 在上限到达后提供可操作的恢复页。计时 SHALL 从该次初始化开始，覆盖本地配置、账号检查及进入主界面前的必要加载；应用后台挂起时 SHALL 在恢复前台后检查截止时间。

#### Scenario: Server accepts connection but never responds
- **WHEN** 当前存储服务已建立连接但账号检查始终不返回
- **THEN** 初始化开始 10 秒后结束 loading，提示“连接超时，请检查网络或切换存储空间”
- **AND** 提供重试、切换存储空间和管理存储空间入口

#### Scenario: Connection fails before deadline
- **WHEN** 初始化在截止时间前返回网络或服务不可用错误
- **THEN** 立即结束 loading，显示“存储空间连不上”及可理解的原因，并提供恢复操作

#### Scenario: Local settings cannot be read
- **WHEN** 本地设置读取失败或超时且尚无已加载的连接列表
- **THEN** 显示本地配置读取失败或超时提示及重试入口，不将其误报为存储服务不可达，也不展示虚构的可切换连接

#### Scenario: Startup succeeds
- **WHEN** 初始化在截止时间前完成
- **THEN** 按现有账号和绑定状态进入主界面或相应配置页面，后续启动计时不得将页面改为超时状态

#### Scenario: App resumes after startup deadline
- **WHEN** 应用在初始化期间进入后台并在截止时间后回到前台，初始化仍未完成
- **THEN** 恢复前台后立即显示恢复页，不重新开始完整等待

### Requirement: Storage recovery actions during mobile startup
移动端 SHALL 在本地连接配置读取完成后于 loading 页面提供“切换存储空间”和“管理存储空间”入口，操作 MUST NOT 等待当前连接网络检查完成。恢复页 SHALL 复用相同入口并支持重试；连接选择和管理 SHALL 复用现有启用、登录、绑定及安全激活规则。

#### Scenario: Switch while current check hangs
- **WHEN** 已加载本地连接 A、B，A 的启动检查挂起，用户点击“切换存储空间”
- **THEN** 立即展示本地连接选择，用户可选择符合激活规则的 B，无需先修复 A

#### Scenario: Manage a single failed connection
- **WHEN** 仅保存一个连接且其检查失败或尚未返回
- **THEN** 用户仍可打开管理页并使用现有编辑或新增流程

#### Scenario: Session is explicitly invalid
- **WHEN** 检查明确返回会话失效
- **THEN** 展示重新登录指引并保留切换和管理入口，不将其标记为普通网络故障或允许未授权发送

### Requirement: Superseded mobile startup results are isolated
用户离开启动等待进入选择或管理页、重试、切换连接或启动超时后，旧初始化结果 MUST NOT 改变当前页面、账号、消息、草稿或错误状态。网络超时和切换 MUST NOT 删除原连接的凭据、本地历史、草稿或待同步队列；明确会话撤销仍 SHALL 遵循现有凭据失效规则。

#### Scenario: Old check finishes after opening manager
- **WHEN** 用户在等待中打开管理页，原启动检查随后成功或失败
- **THEN** 管理页保持打开，不自动跳转到主界面或错误页

#### Scenario: Old check finishes after switching or retrying
- **WHEN** 用户切换到 B 或重新发起初始化，旧检查随后返回
- **THEN** 仅新初始化可以更新当前界面，旧结果和旧超时均被忽略
- **AND** A 的本地数据和待同步工作保持原有归属

#### Scenario: Retry after timeout
- **WHEN** 用户在超时恢复页点击重试
- **THEN** 启动一轮具有独立 10 秒上限的初始化，成功后正常进入，失败后仍可恢复
