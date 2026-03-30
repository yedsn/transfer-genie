## ADDED Requirements
### Requirement: Local HTTP API settings
客户端 SHALL 在设置中提供本机 HTTP API 的启用开关、监听地址和监听端口，并持久化保存这些设置。该设置默认值 SHALL 为关闭、监听地址 `127.0.0.1`、监听端口 `6011`。当用户保存变更后，系统 SHALL 在当前运行期间立即应用新的 HTTP API 配置。

#### Scenario: Default local HTTP API settings
- **WHEN** 用户首次启动应用且尚未保存过相关设置
- **THEN** 设置中的本机 HTTP API 开关显示为关闭
- **AND** 设置中的监听地址显示为 `127.0.0.1`
- **AND** 设置中的监听端口显示为 `6011`

#### Scenario: Enable local HTTP API from settings
- **WHEN** 用户在设置中启用本机 HTTP API 并保存
- **THEN** 系统持久化启用状态、监听地址和监听端口
- **AND** 系统立即按该配置尝试启动本机 HTTP 服务

#### Scenario: Change local HTTP API binding while enabled
- **GIVEN** 本机 HTTP API 当前正在运行
- **WHEN** 用户修改监听地址或监听端口并保存
- **THEN** 系统持久化新的监听配置
- **AND** 系统立即按新配置重启本机 HTTP 服务

### Requirement: Dedicated local HTTP API settings section
客户端 SHALL 在设置页提供独立的本机 HTTP API 配置区块，集中展示该服务的配置与运行状态。该区块 SHALL 至少展示启用开关、监听地址、监听端口、当前运行状态、当前调用地址和最近一次错误信息。

#### Scenario: Show HTTP API status in dedicated settings section
- **GIVEN** 用户打开设置页
- **WHEN** 本机 HTTP API 配置区块加载完成
- **THEN** 用户可以在同一区块中看到启用状态、监听参数和服务状态

#### Scenario: Show HTTP API startup error in dedicated settings section
- **GIVEN** 用户已启用本机 HTTP API
- **AND** 服务启动失败
- **WHEN** 用户打开设置页
- **THEN** 用户可以看到启动失败状态和最近一次错误信息
