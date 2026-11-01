# Spec Delta

## ADDED Requirements

### Requirement: Daily install attempt budget
保活任务 SHALL 在本地时间同一天内最多只记录一次成功安装；一旦当天安装成功，后续计划轮次 SHALL 直接跳过且不重复连接设备。

#### Scenario: First successful install of the day
- **WHEN** 保活任务在某轮将缓存包成功安装到已配置设备
- **THEN** 任务写入包含当天日期、版本号、构建号和 profile 到期时间的成功状态
- **AND** 同一天后续轮次跳过设备连接

#### Scenario: Scheduled run after a success
- **WHEN** 任务启动时已完成当天成功的状态记录
- **THEN** 任务输出跳过原因并以退出码 0 结束

### Requirement: Unattended failures never surface as task errors
无人值守模式下的可恢复失败（设备离线、锁屏、通道未连接、缓存缺失、安装被拒绝）SHALL 输出结构化的 `attempt-result: skipped <reason>` 并以退出码 0 结束。

#### Scenario: Phone unreachable over Wi-Fi
- **WHEN** 保活任务无法读取设备信息或 Wi-Fi 调试通道未连接
- **THEN** 输出 `attempt-result: skipped <reason>`
- **AND** 任务退出码为 0，TaskTick 不显示失败

#### Scenario: Interactive update still reports errors
- **WHEN** 用户手动执行不带 `--attempt` 的更新命令
- **THEN** 前置条件失败仍然以非零退出码结束并给出错误说明

### Requirement: Cache freshness governs renewal
保活任务 SHALL 在缓存缺失、缓存不是当天构建、或嵌入 profile 剩余有效期低于阈值时重新构建，再执行安装；SHALL NOT 仅重复安装即将过期的缓存来当作续期。

#### Scenario: Cache built on an earlier day
- **WHEN** 当天的第一次保活执行发现缓存构建日期不是今天
- **THEN** 任务先重新构建签名缓存，再执行安装

#### Scenario: Rebuild fails
- **WHEN** 重建缓存失败
- **THEN** 任务停止本轮安装、保持当天未成功状态、记录构建日志，并以退出码 0 结束

#### Scenario: Cached profile expired
- **WHEN** 安装器报告 `skipped profile-expired`
- **THEN** 任务重建缓存并重试安装一次

### Requirement: Draft safety in unattended mode
保活任务 SHALL 在能读到移动端草稿数据且存在已保存草稿时跳过安装；锁屏导致草稿数据不可读时 SHALL 继续原位安装，并记录门禁不可用。

#### Scenario: Saved draft blocks update
- **WHEN** 安装前检测到已保存的移动端草稿
- **THEN** 任务跳过安装、保留草稿，并发送当天一次的提醒

#### Scenario: Locked phone
- **WHEN** 设备锁屏导致无法读取应用数据容器
- **THEN** 任务继续执行原位安装，并在日志中标记草稿门禁不可用

### Requirement: Install verification
保活任务 SHALL 在安装后回读设备上已安装的 bundle 版本，只有与候选缓存包版本一致时才记录当天成功。

#### Scenario: Version mismatch after install
- **WHEN** 安装命令报告成功但回读版本与候选包不一致
- **THEN** 任务输出 `attempt-result: skipped version-mismatch`
- **AND** 不写入当天成功状态

### Requirement: Actionable alerts only
保活任务 SHALL 只在构建失败、App 剩余有效期低于告警阈值、或存在未发送草稿时发出提醒，且每种提醒每天最多一次。

#### Scenario: Profile about to expire without a successful install
- **WHEN** 当天没有成功安装且 profile 剩余有效期低于告警阈值
- **THEN** 任务发送一条 macOS 通知说明剩余时间

#### Scenario: Routine offline attempt
- **WHEN** 手机离线导致本轮跳过，且 profile 剩余有效期充足
- **THEN** 任务不发送任何通知

### Requirement: Renewal status is reported honestly
保活任务 SHALL 用缓存包内 provisioning profile 的到期时间作为剩余寿命，SHALL NOT 把成功安装视为有效期已延长。告警 SHALL 说明当前 Mac 能否自动换发新 profile（取决于 Xcode 是否已登录 Apple ID）。

#### Scenario: Reinstalling the same cache
- **WHEN** 缓存中的 profile 到期时间未变化
- **THEN** 任务仍按该到期时间计算剩余寿命，并在成功安装后记录同一个到期时间

#### Scenario: Xcode has no signed-in Apple ID
- **WHEN** 剩余寿命低于告警阈值且 Xcode 账号列表为空
- **THEN** 通知内容说明无法自动续签，需要登录 Apple ID 或使用付费分发方式

#### Scenario: Build fails repeatedly
- **WHEN** 构建失败后冷却时间内的下一轮执行发现仍需要构建
- **THEN** 任务跳过本轮构建并说明处于冷却期，不重复刷新增量失败日志

