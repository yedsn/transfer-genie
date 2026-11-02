# Spec Delta

## ADDED Requirements

### Requirement: Daily install attempt budget
无线部署任务 SHALL 对每个 artifactId 最多记录一次成功安装；一旦当前 artifactId 安装成功，后续计划轮次 SHALL 直接跳过且不重复连接设备。新的 artifactId 即使在同一天生成，也 SHALL 重新触发安装尝试。

#### Scenario: First successful install of an artifact
- **WHEN** 保活任务在某轮将缓存包成功安装到已配置设备
- **THEN** 任务写入包含 artifactId、安装时间、版本号、构建号和 profile 到期时间的成功状态
- **AND** 当前 artifactId 的后续轮次跳过设备连接

#### Scenario: Scheduled run after current artifact succeeds
- **WHEN** 任务启动时 lastInstalledArtifactId 与最新 manifest.artifactId 一致
- **THEN** 任务输出跳过原因并以退出码 0 结束

#### Scenario: A new artifact is created on the same day
- **WHEN** 每日任务在同一天发布了不同的 artifactId
- **THEN** 无线部署任务忽略当天已有的旧成功记录，并尝试安装新产物

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
每日续签构建任务 SHALL 独立于无线部署任务，每天强制换发当前 Team 与 Bundle ID 对应的 provisioning profile，再构建和发布缓存。无线部署任务 SHALL NOT 构建、删除或移动 profile。

#### Scenario: Cache built on an earlier day
- **WHEN** 每日续签构建任务运行
- **THEN** 任务备份并移走当前应用的旧 profile，构建包含新 profile 的签名缓存

#### Scenario: Rebuild fails
- **WHEN** 重建缓存失败
- **THEN** 任务恢复旧 profile、保留上一份成功缓存、记录构建日志，并以非零退出码结束

#### Scenario: Cached profile expired
- **WHEN** 无线部署任务发现缓存 profile 已过期
- **THEN** 任务静默跳过并等待下一次每日续签构建，不在安装任务中触发构建

### Requirement: Signed artifact identity
每日续签构建任务 SHALL 在 manifest 中发布 profileUuid、profileCreatedAt、deviceUdids 和 artifactId。artifactId SHALL 由 profile UUID 与 executable UUID 组成，并唯一标识实际签名产物。

#### Scenario: Same app version gets a new profile
- **WHEN** 版本号不变但 Xcode 签发了新的 provisioning profile
- **THEN** 新 manifest.artifactId 与旧产物不同

#### Scenario: Failed staging build
- **WHEN** 新包在 Team、Bundle ID、设备 UDID、到期时间或 strict codesign 校验中失败
- **THEN** latest manifest 和 app bundle 保持上一份成功内容
- **AND** 本轮移走的 profile 被恢复

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

