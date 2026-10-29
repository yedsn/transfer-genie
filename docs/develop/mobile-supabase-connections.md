# 移动端 Supabase 多连接开发与验收

本文记录移动端多 Supabase 连接管理的实现边界、可控测试夹具和设备验收方法。它不包含真实服务地址、公开 Key、密码、会话 Token、`.env` 真值或设备名称。

## 范围模型

- `StorageProfile` 是连接隔离单位。一个 profile 保存一个 Supabase 服务地址、一个已确认的 Space 和独立的安全会话作用域。
- 账号会话以 profile ID 存入系统凭据库。即使两个 profile 使用同一服务地址，也不能共享或覆盖会话。
- 消息、标记、附件、草稿、离线队列、镜像和 checkpoint 都继续按 profile、账号及 Space 归属。
- 管理页的一张卡片对应一个已保存 profile。当前账号能看到的远端 Space 只用于绑定或重绑，不能自动生成连接卡片。
- 普通连接切换只修改活动 profile ID，不清理原连接数据。更换同一 profile 的 Space 是独立危险操作，会经过权限、pending 工作及本地数据保护。

## 当前审计

### 已实现并有自动化证据

- Settings 能保存多个 Supabase profile；空 Space 保持为空并被标为 `unbound`，不会自动生成 UUID。
- `bound`、`unbound`、`needs_attention` 是后端持久化状态；旧的非空绑定缺少字段时按 `bound` 读取，再由远端访问验证。
- 临时 binding flow、显式取消、短期过期、连接测试、草稿登录、Space 只读列表、最终权限确认和正式 binding 已存在。
- 普通同步使用 `validate_space_access`，不会在同步路径隐式创建 Space。显式创建使用客户端预生成的 operation ID 与 Space ID；`003_space_create_idempotency.sql` 为已部署环境提供幂等 RPC。
- 活动连接通过窄化 `activate_storage_profile` 修改，不提交旧 settings 快照；禁用、未绑定、需处理或已删除目标不会替换当前连接。离线 pending 队列不阻止普通 profile 切换。
- `set_storage_profile_enabled` 只改变指定 profile。禁用当前连接会清空活动选择，但保留会话、本地数据及队列；重新启用不会自动激活。
- 移动控制器保留所有 Supabase profile，包括禁用项；WebDAV 不进入移动连接列表；启动和快捷切换不依赖远端 Space 列表。
- 移动端切换前先保存原范围草稿，保存失败不调用激活。

### 已实现但仍需扩大验证

- `save_storage_profile` 会保留稳定 ID，并在已有业务数据或 pending 工作时拒绝修改远端目的地。
- `remove_storage_profile` 默认拒绝活动连接或有 pending 工作的连接；移动端分别提交 `confirmActiveRemoval`（确认清空当前选择）和 `abandonWork`（再次确认放弃 pending、冲突或传输），保留本地历史且不删除远端数据。旧 `force` 只用于兼容桌面调用。
- 明确的 Space 不可访问会把匹配的 profile 标为 `needs_attention`。目前要继续覆盖 pull、历史、附件和 Realtime 等入口，并保证网络错误不被误分类。
- 管理页已有独立连接卡片、快捷切换、按需诊断和启停入口；新增/编辑四步向导、指定连接登录/退出、重绑与移除二次确认均已接入。真实服务、VPhone 和真机验收仍需完成。

### 关联变更中的待完成依赖

关联 OpenSpec 变更为 `defer-supabase-space-creation`：

- 1.3：旧 profile 分类迁移尚未覆盖“有本地消息、outbox 或冲突时保留为 needs-attention”。
- 2.1、2.2：binding flow 的过期、取消、参数不匹配、登录失败和敏感信息隔离已有本地回归；晚到登录会清理临时会话，最终提交会再次核对 flow。完整共享契约尚需和所有业务入口保护一起复核。
- 2.4：幂等创建协议与正式 `003` 迁移已补，仍需真实 Supabase 验证重复请求结果。
- 3.2：统一 guard 已通过未绑定业务入口回归；3.3 的完整撤权、Realtime 停止与恢复路径仍需扩大验证。
- 4.1、4.4、4.5、5.3：共享向导、显式创建 UI、取消清理和修复 UI 尚未全部完成；5.2 的 pending、冲突、传输保护及成功原位切换已经通过本地测试。
- 6.2、6.3：真实服务验收和最终用户说明尚未完成。

因此，不得把存在 API 等同于共享绑定契约全部完成，也不得开始真实设备最终验收前跳过这些依赖。

## 可控双地址夹具

`tests/test_mobile_storage_connections.js` 在 Node VM 中载入真实移动控制器，并提供两个不同的 `.invalid` fixture endpoint。它不发出网络请求，也不读取环境变量：

- A：已启用、已绑定、当前连接，有独立账号和 Space；
- B：不同服务地址、不同 Space、已禁用，仍应显示但不能激活；
- 额外状态覆盖未登录、绑定异常、离线 pending 和延迟诊断；
- 远端 Space 列表包含一个不存在于 settings 的条目，用于证明它不会生成连接卡片；
- 草稿保存失败时必须保持 A，不能调用 B 的激活操作；
- 晚到诊断结果必须按 profile ID 和请求代次归属，已编辑或移除目标不能被旧结果复活。

运行：

```bash
node tests/test_mobile_storage_connections.js
node tests/test_mobile_draft_persistence.js
node tests/test_mobile_ui_shell.js
```

Rust 侧重点：

```bash
cargo test --lib storage_profile_ --offline
cargo test --lib supabase_ --offline
```

2026-10-29 首轮本地完整回归：`npm run typecheck`、`npm run build`、上述三个移动端 Node 测试、共享 Playwright/Edge 浏览器测试、`cargo test --offline`、`openspec validate add-mobile-supabase-connection-management --strict` 和 `git diff --check` 均通过。该轮 Cargo lib 为 394 passed、2 个明确需要授权真实环境的测试 ignored；Telegram bridge 为 43 passed。随后用 `npm run ios:simulator:deploy` 在现有 Simulator 数据上原位安装并打开 0.5.4。

异常恢复入口也已完成自动化覆盖：无活动连接、当前连接未登录、绑定异常和初始化错误页面均可打开完整连接管理或新增连接；管理页打开时底层恢复页不可交互，关闭后返回原状态。绑定异常时发送会在调用业务 API 前终止；当前连接异常或未登录时可直接选择另一个有效连接，原配置和本地范围数据不会被移除。对应证据为 `node tests/test_mobile_storage_connections.js` 与 `node tests/test_mobile_connections_browser.js`。

绑定最终确认的故障路径已覆盖：配置保存失败时向导保留 flow、Space 选择和确认草稿，可直接重试；系统凭据写入失败时，新 profile 会被撤销，已有 profile 会恢复原配置及原会话，临时 flow 保留可重试。补偿只撤销本次仍匹配的 profile 写入，不覆盖并发产生的较新配置。仅保存不会改变活动连接；保存成功后重新读取权威 settings；保存成功但可选激活失败时保留新连接并提示稍后重试。

隐私与凭据边界已有自动化证据：公开 Key 输入使用密码型控件，连接卡片及浏览器可见文本不回显 Key；URL 不接受内嵌用户名、密码、query 或 fragment，`sb_secret_*` 及 JWT `service_role` Key 会在保存前被拒绝。Auth、Realtime 和网络错误使用固定脱敏文案，不拼接远端任意 message 或含 Key 的请求 URL；临时 binding flow 序列化到前端的只有账号摘要，不含 access token、refresh token 或密码。iOS settings 视图还会剔除 WebDAV 密码、Telegram Token、AI Key 和语音 Key，同时移动端合并设置不会删除权威桌面配置。对应 Rust、Node 和浏览器测试均通过，完整 `cargo test --offline` 为 0 failed。

## 共用操作契约

### 共享绑定与切换补充验证（2026-10-29）

| 场景 | 实际证据 | 结果与边界 |
| --- | --- | --- |
| 临时登录、列表、取消、过期 | `supabase_binding_flow_lifecycle_is_temporary_and_read_only` | 0/1/2 个 Space 列表不调用创建，不落正式会话；取消幂等，30 分钟空闲过期清理 |
| 参数变化、权限撤销、查询期间取消 | `supabase_binding_rejects_changed_parameters_revoked_permission_and_late_cancel` | 拒绝提交，正式设置和凭据不变；最终本地提交与 flow 取消串行化 |
| 明确创建后重试与取消 | `supabase_binding_explicit_create_retries_keep_one_space_and_cancel_keeps_remote` | 同 operation ID 只建一个 Space，改参数拒绝，取消保留明确创建的远端结果；这是本地协议夹具，不代表真实 SQL/RLS 验收 |
| A 请求已提交、响应未返回时切 B | `storage_profile_activation_preserves_old_inflight_scope_and_only_syncs_new_target` | 两个独立本地 HTTP 地址；B 只调度 B，A 队列、缓存和 checkpoint 保留，回 A 后原操作 ID 重试完成 |
| 跨地址消息、标记、标签和附件隔离 | `storage_profile_switch_keeps_messages_marks_tags_and_uploads_on_two_services` | A/B 使用不同地址、账号及 Space；同名标签、Markdown 标记消息、同名文件各归原范围，B 不处理 A 队列，回 A 可继续，无复制或双写 |
| 未绑定业务入口与缺失 Space | `supabase_binding_guards_reject_unbound_business_entries_without_remote_creation` | 发送、历史、outbox、Realtime、媒体和传输拒绝未绑定状态，无业务写入或隐式创建；缺失 Space 保留本地消息及队列并提示处理 |
| Space 重绑保护及稳定会话 | `supabase_account_spaces_switch_in_place_without_adding_profiles` | 草稿、pending、独立未解决冲突及传输均阻止重绑；成功重绑保留 profile ID 与会话，不创建额外 profile 或删除远端 Space |
| 激活前失败和激活后加载失败 | `tests/test_mobile_storage_connections.js` | 前者保持原 ID/草稿；后者保持已提交目标 ID 并进入目标恢复页，不展示旧账号或草稿 |
| 发送、文件选择及离线 pending | `tests/test_mobile_storage_connections.js` | 不能安全结束的操作阻止调用激活并提示等待；已入队的离线 pending 不阻止切换 |
| 旧异步查询/登录/草稿/Realtime 晚到 | `tests/test_mobile_storage_connections.js` 与 `tests/test_mobile_ui_shell.js` | 设置、账号、消息、标记、标签、草稿、媒体和系统 picker 按代次拒收旧结果；草稿保存捕获原 profile/账号/Space，旧 finally 不解锁新操作 |

登录结果晚到或 Space 列表尚未返回时取消，移动端会清理该 flow，旧结果不会重新打开向导。双地址附件/标记及共享绑定重绑保护本地集成测试已通过，任务 1.2、5.4 完成。关联变更的 2.3、2.5、3.1、3.2、5.2 同步更新为完成；其真实 Supabase 幂等/RLS 验收、旧数据分类迁移及完整修复 UI 仍未完成，不能由本地夹具代替。

最新补充后的 `cargo test --offline` 全量为 400 passed、2 ignored（授权真实环境），辅助程序为 43 passed，0 failed；随后 `cargo test --lib --offline` 同样为 400 passed、2 ignored。最后的重绑断言调整也通过定向回归。`npm run typecheck`、`npm run build`、三个移动端 Node 测试、Playwright/Edge 连接管理回归及 `tests/test_ios_virtual_deploy.mjs` 均通过；这些本地结果不代表完整设备或真实服务验收。

### Simulator 布局与取消流程验证（2026-10-29）

最新 0.5.4 已通过 `npm run ios:simulator:deploy` 原位安装并打开，前端为嵌入式构建。安装前后未卸载、未重置，数据库 `PRAGMA quick_check` 为 `ok`，草稿数量为 0。

| 场景 | 证据 | 结果 |
| --- | --- | --- |
| 320×568 小屏、1.6 倍文字、长 URL、44pt、嵌套焦点/inert | `tests/test_mobile_connections_browser.js` | 无横向溢出，卡片及动作可滚动到达，关闭嵌套确认后恢复触发位置 |
| 300px 可视高度、Key 遮蔽与取消触控 | 同一浏览器测试 | 步骤按钮在可视区域可达，取消按钮阻止点击前输入框失焦 |
| 已安装 App 管理、新增取消、移除取消及快捷选择 | `testConnectionManagerCancelledOperationsPreserveCurrentConnection` | 正常及最大辅助字号通过，不提交新增或移除，不改变现有连接 |
| 实际软件键盘与最大辅助字号 | `testConnectionWizardControlsReachableWithSoftwareKeyboard` | 正常 `large` 及 `accessibility-extra-extra-extra-large` 均通过，步骤及取消按钮可滚动到胶囊上方并操作 |

初次原生测试暴露测试定位问题：快捷入口已改名为“切换 Supabase 连接”；XCTest 的 Keyboard frame 不包含浮动 Previous/Next/Done 胶囊，且 WebKit AX 可将胶囊下方的按钮报告为 hittable。测试已按 Toolbar 上边界限制点击，并从网页编辑区域拖动滚动。另为取消按钮增加 `pointerdown.prevent`，保持输入焦点直到 click 提交，避免键盘重排时序影响触控。最终正常和最大辅助字号复测均通过，测试后恢复原字号 `large`。

本轮证据位于 `/tmp/tg-mobile-connections-20261029.lgFJlp/`，包括小屏/大字号浏览器截图、`connection-manager-large-text.xcresult`、最终 `toolbar-aware-large.xcresult` 与 `toolbar-aware-accessibility-extra-extra-extra-large.xcresult`。早期失败结果保留供追溯，不计为通过。

### 仍未完成的验收

| 任务 | 当前状态与前置条件 |
| --- | --- |
| 7.2 Simulator 完整连接流程 | 当前只有一个已登录连接；管理、取消和布局已验，新增成功、双连接登录/退出、离线队列、启停及实际安全移除尚需专用测试连接，不能整项勾选 |
| 7.3 VPhone 补充测试 | CLI 只读检查确认主机/helper/bundle ready、外置盘虚拟机 running 且未 panic；项目 `.env` 的目标为空，传入已发现目标后 `--check-only` 通过。本轮未安装或执行完整连接流程 |
| 7.4 真实双地址 | 尚缺两个授权服务地址、普通 Auth 账号及专用测试 Space；本地两个 loopback HTTP 服务不替代真实 Auth/RLS/Realtime/Storage 验收 |
| 7.5 真机 | 未部署本轮改动至真实 iPhone；依照验收顺序，待虚拟环境完整流程通过后再执行 |

主变更目前 34/38，关联变更 9/22；两项 OpenSpec strict 校验均通过。未清理用户数据、未重置 Simulator/VPhone、未操作生产 Space，也未修改用户已暂存的 Xcode Team 变更。

## 移动端使用流程

「我的 → 存储空间」打开全屏连接管理页。一张卡片代表一个已保存连接，不代表当前账号远端的全部 Space。卡片显示名称、服务地址、当前标记、Space 摘要和简短状态；不显示公开 Key、密码或 Token。首页顶部只用于快速切换已保存连接。

状态含义：

- `连接正常`：最近一次按需诊断通过；
- `尚未检查`：本地配置可用，但本次打开管理页尚未主动联网诊断；
- `需要登录`：该 profile 没有有效会话，可以在卡片管理中登录，不需要先激活；
- `网络状态未知`：网络检查失败，本地绑定、会话和缓存不会因此被删除；
- `需要处理`：服务端明确拒绝绑定或配置不完整，业务发送会被阻止；
- `已停用`：卡片继续显示，但不能从首页激活。

新增与修复共用四步向导：连接服务、登录账号、选择空间、确认绑定。修改 URL 或公开 Key 会清除后续登录和 Space 结果；取消会使在途请求立即失效，并尝试清理 Rust 临时 flow。选择 Space 不会自动创建；只有点“新建 Space”并确认后才调用显式创建。创建成功后再取消不会删除远端 Space。已有连接可以“仅保存”或“保存并切换”；后者激活失败时，新连接仍保留并可稍后重试。

普通切换前会先保存原 profile/账号/Space 的 Markdown 草稿和附件引用。保存失败时保持原连接。切换只改变活动 ID；同一 profile 的“修改服务或更换 Space”属于重绑，可能重建镜像/checkpoint，并会被业务数据或 pending 保护阻止。

停用当前连接前同样先保存草稿。后端清空活动选择，但保留账号会话、本地历史、缓存和队列；重新启用不会自动激活。移除默认先走非强制检查，活动连接或有待上传、冲突、传输时会拒绝。只有用户再次选择“放弃未完成工作并移除”才进入强制路径。移除不删除远端 Space，本地历史不会自动归到其他连接。

### 激活已保存连接

前端调用：

```js
settings.activateStorageProfile(profileId)
```

它只提交 profile ID。后端读取最新 settings，校验目标存在、启用且已绑定，然后停止当前同步的新调度、写入活动 ID 并发出同步重置信号。它不要求目标已登录；未登录目标激活后进入登录恢复页。失败时旧活动 ID、缓存、队列、会话和 checkpoint 保持不变。

### 启用或停用连接

```js
settings.setStorageProfileEnabled(profileId, enabled)
```

启用会验证公开连接参数和 binding 状态，但不会自动激活。停用当前连接会清空活动 ID；移动端必须先保存草稿并处理不能安全结束的本地操作。

### 更换同一连接的 Space

```js
settings.switchSupabaseSpace({ sourceProfileId, spaceId })
```

这是重绑，不是普通连接切换。后端会验证账号访问权限，并在存在 pending 工作时拒绝；成功后沿用既有镜像/checkpoint 重建语义，因此 UI 必须单独说明和确认。

### 移除连接

```js
settings.removeStorageProfile(profileId, {
  confirmActiveRemoval: false,
  abandonWork: false,
})
```

默认两个确认位都为 `false`。活动连接会先要求 `confirmActiveRemoval: true`，它只允许清空当前选择；如果仍有 pending、冲突或传输，必须再次明确提交 `abandonWork: true`。两者互不替代。移除不会删除远端 Space，本地历史也不会自动归到后来新增的 profile。

## 分层验收

1. 自动化 fixture：两个假 endpoint，验证 profile、账号、Space 和异步结果不串范围。
2. 官方 Simulator：使用专用测试配置验证连接卡片、快捷切换、四步向导、离线草稿、诊断、启停和安全移除；保留脱敏截图。
3. VPhone：仅作为可选第二环境，验证完整 iOS/IPA 安装；不可用时记录跳过原因。
4. 两个真实 Supabase：必须由用户授权，使用普通 Auth 账号和专用测试 Space。记录连接数、请求目标、消息/标记/附件/草稿隔离和重启会话恢复，证据中只使用 A/B 代号。
5. 真实 iPhone：虚拟环境通过后，在当前用户选定设备验证安全区域、键盘、大字号、系统文件选择、重启与双连接核心流程。

真实验收不使用 service-role Key，不修改生产 Space，不把 Simulator 或 VPhone 结果当成真机结果。
