## ADDED Requirements

### Requirement: Explicit instance targeting
聊天 SHALL 在消息输入框中输入 @ 时展示候选并通过选择保存目标实例 id，候选展示机器人、设备与可用状态，不单独设置输入框上方的机器人选择栏。删除已选提及 SHALL 解除目标。插件目录 SHALL 仅发布到用户启用的空间；移动端 SHALL 能调用桌面实例而不执行桌面代码。
所有平台的调用端 SHALL 展示当前账号/空间内所有机器已发布且启用的机器人，不按调用端平台、设备或本机插件安装状态过滤。调用端 SHALL 无需安装对应插件；机器人仍只在具备执行能力的目标机器运行。

#### Scenario: Caller has no local plugins
- **WHEN** 任意平台的客户端未安装本地插件，在当前空间输入 @
- **THEN** 候选仍包含其他所有机器已发布的启用实例，展示所属机器并按实例 id 路由

#### Scenario: Offline remote instance
- **WHEN** 已发布的远端机器人暂时离线
- **THEN** 候选仍展示该实例并标记离线，选中后按等待设备与到期规则投递

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

### Requirement: Live task feedback in chat
调用消息保存后，聊天 SHALL 立即在其后显示任务反馈。执行设备确认接单后显示正在处理，收到结果后在同一位置显示最终回复。缺少执行确认时区分目标设备离线、正在投递和暂未响应，离线任务按原有效期保留。发送失败时 SHALL 显示实际错误，不将调用显示为正在执行。

#### Scenario: Target is slow to acknowledge
- **WHEN** 调用已保存，但执行端尚未确认接单
- **THEN** 聊天立即显示等待反馈，目标离线时说明任务已排队，在线但迟迟未确认时明确提示尚未接单

#### Scenario: Task is accepted and finishes
- **WHEN** 执行端接单、上报进度并给出终态
- **THEN** 桌面和移动聊天依次更新同一处反馈，正式回复到达后收起临时反馈，重复同步不产生第二条回复

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
