## ADDED Requirements

### Requirement: Explicit instance targeting
聊天 SHALL 通过 @ 候选选择保存目标实例 id，候选展示机器人、设备与可用状态。插件目录 SHALL 仅发布到用户启用的空间；移动端 SHALL 能调用桌面实例而不执行桌面代码。

#### Scenario: Same plugin installed on two computers
- **WHEN** 用户选择家里 PC 的图片实例
- **THEN** 任务只由该实例接收，另一台电脑不执行

#### Scenario: Incidental mention text
- **WHEN** 普通文本或机器人结果包含相同 @ 名称但没有结构化目标
- **THEN** 不创建任务

### Requirement: Durable provider independent task delivery
客户端 SHALL 原子保存调用消息和任务快照，以稳定 task_id 经 WebDAV/Supabase 可靠同步；执行端 SHALL 验证空间权限与目标并去重，普通引用回复不得触发任务。

#### Scenario: Target device offline
- **WHEN** 调用目标未在线
- **THEN** 显示等待设备，保留任务，24 小时有效期内目标恢复可接收，超期不执行

#### Scenario: Duplicate sync or process restart
- **WHEN** 同一任务被重复同步或应用重启后重放
- **THEN** 不重复创建任务、回复或重新执行已确认完成项

### Requirement: Per item results and controlled recovery
任务 SHALL 保存每项状态并报告进度、部分成功、失败、取消及中断，显式重试 SHALL 仅处理选定失败项；未知副作用 SHALL 不被静默自动重试。

#### Scenario: One image fails
- **WHEN** 五个任务项中四个成功一个失败
- **THEN** 回复逐项结果及部分失败，重试失败项不重复保存四个成功项

#### Scenario: Application exits during a generic plugin operation
- **WHEN** 已开始执行但无法确认结果时应用退出
- **THEN** 重启显示中断并按插件恢复协议核实结果，无恢复能力时要求显式重试

#### Scenario: Unauthorized task access
- **WHEN** 其他账号或空间请求读取或操作任务
- **THEN** 按 Provider 权限规则拒绝，不返回附件或本机配置
