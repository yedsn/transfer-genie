# Spec Delta

## MODIFIED Requirements

### Requirement: Supabase connection and account settings
客户端 SHALL 在新增或编辑 Supabase 存储空间时提供分步骤绑定向导，依次处理 API 根地址与公开 Key、分层连接测试、普通用户邮箱密码登录、账号 Space 选择或显式创建以及最终绑定确认。Schema 与 bucket SHALL 由应用版本管理，普通设置界面只展示其用途和就绪状态。新增流程在最终确认前 MUST 使用独立草稿，登录密码与临时 Session MUST NOT 写入普通设置、日志或配置导出文件。

#### Scenario: Test incomplete Supabase environment
- **WHEN** 用户在第一步测试一个网络与 Key 可用但业务结构尚未部署的 Supabase 项目
- **THEN** 客户端明确显示缺少 Schema、RPC、RLS、Realtime 或 bucket 的层级
- **AND** 不得把首页可达误报为接入完成
- **AND** 不创建远端 Space

#### Scenario: Continue after a successful connection test
- **WHEN** API 根地址、公开 Key 和所需服务检查通过
- **THEN** 向导允许用户进入账号登录步骤
- **AND** 尚不创建正式 profile 或远端 Space

#### Scenario: Sign in with ordinary user
- **WHEN** 用户在登录步骤使用有效 Supabase Auth 邮箱和密码登录
- **THEN** 向导显示脱敏账号和会话状态并允许继续加载账号 Space
- **AND** 客户端不要求数据库密码、service-role 或管理密钥

#### Scenario: Change the Supabase project after sign-in
- **WHEN** 用户返回第一步并修改 API 根地址或公开 Key
- **THEN** 向导清除原项目的临时登录状态和已选 Space
- **AND** 要求重新测试连接和登录

#### Scenario: Choose an existing account Space
- **WHEN** 登录账号可访问一个或多个 Space
- **THEN** 向导展示可选择的 Space 列表及可用统计信息
- **AND** 用户选择并确认前不得自动绑定任何 Space

#### Scenario: Account has no Space
- **WHEN** 登录账号没有可访问 Space
- **THEN** 向导显示空状态和明确的“新建空间”操作
- **AND** 不因进入该步骤自动创建 Space

#### Scenario: Explicitly create an account Space
- **WHEN** 用户点击“新建空间”、填写必要信息并确认创建
- **THEN** 客户端创建远端 Space 并把它作为当前待确认选择
- **AND** 用户仍可在最终确认前取消整个新增流程

#### Scenario: Confirm the binding summary
- **WHEN** 用户在最终步骤核对本地名称、Supabase 项目、登录账号和所选 Space 后点击“完成绑定”
- **THEN** 客户端一次性保存正式 profile 与安全 Session
- **AND** 返回存储空间列表并展示新绑定空间

#### Scenario: Close the new-profile wizard
- **WHEN** 用户在完成绑定前关闭新增向导
- **THEN** 客户端丢弃向导草稿和临时登录 Session
- **AND** 不新增正式本地 profile

#### Scenario: Resume editing a bound profile
- **WHEN** 用户打开已绑定 Supabase profile 的编辑向导
- **THEN** 向导展示当前连接、脱敏账号和 Space，并允许按需返回相应步骤修改
- **AND** 未确认的修改不得改变当前正式绑定
