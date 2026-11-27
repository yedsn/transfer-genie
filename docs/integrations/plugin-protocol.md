# 插件协议与本地开发

本文记录开发中的 v1 接口。完整跨设备流程仍在验收，不能视为已发布版本的功能保证。

## 来源与安装

插件管理采用统一安装列表，支持名称、ID 搜索及分页，默认每页 10 项，可切换 20 或 50 项；市场列表同样支持搜索和分页。仅已启用插件在设置侧栏的“插件设置”分组出现独立菜单，停用或卸载后移除菜单和设置页。未启用插件可从列表打开配置，先填写目录、凭据等启用条件。下载目录、名称、空间授权、日志和生命周期操作在对应插件设置中管理。

内置插件随应用登记，可以启停；外置插件从目录或 ZIP 导入。包根目录必须有 plugin.json 和实际入口。来源由宿主确定，包不能自称内置或覆盖内置 ID。外部进程以当前用户权限执行，manifest 不提供操作系统沙箱。

示例位于 tests/fixtures/plugins/echo-bot，需要 Node.js。内置图片程序有独立的 Cargo 工程，发行前执行 node scripts/build-image-bot.mjs，复制本机程序和 manifest 到 tools/image-bot，作为应用资源发布，不需要另外安装解释器。桌面发行版拒绝在缺少资源时静默回退；开发调试版可使用应用的图片子进程入口。

## JSON Lines 协议

插件启动后首先输出一行 JSON，protocol_version 为 1、kind 为 ready。宿主通过 stdin 发送 invoke，包含 request_id、task_id、text、config、inputs、state_dir。

输入项包含稳定 item_id、name，以及 local_path 或 url。附件准备失败时包含 error。插件必须返回相同 request_id 和 task_id 的 result，items 必须与输入一一对应，不可缺项、重复或使用未知标识。状态为 succeeded、failed 或 cancelled；失败附带 error。

进度使用 kind 为 progress 的消息，包含相同请求和任务标识，以及 item。日志写到 stderr，stdout 仅用于协议。oneshot 返回结果后正常退出；service 保留进程接收后续任务。宿主支持超时与取消。

下载中的 `item` 可用 `status: "downloading"` 和 `transfer` 报告 `received_bytes`、`total_bytes`（未知时为 `null`）与 `bytes_per_second`。宿主按任务项采样并以 `payload.transfer_item` 同步。已完成的逐项结果继续使用 `payload.item`。

## 本地市场样例

执行 python scripts/build-plugin-market-fixture.py --output target/plugin-market-fixture --base-url http://127.0.0.1:18761 可生成完整 ZIP 和索引，不会启动服务器或发布内容。

索引包含 schema_version、plugins；插件包含 id、name、version、host_api_version、artifacts。产物声明 platform、arch、url、size 和 sha256。平台使用 windows、macos 等 Rust 系统名，架构使用 x86_64、aarch64。

插件可声明 min_app_version（语义版本号）和 versions_url。版本清单包含 schema_version: 1、plugin_id、versions 数组；每个版本包含 version 和 artifacts。当前样例生成独立 versions.json，旧内联 artifacts 仍可读取。离线使用上次成功获取的完整索引和版本产物信息，页面显示缓存状态及刷新失败原因。镜像可通过替换索引地址配置。

输出目录通过给定 HTTP 地址提供服务后，可将 index.json 地址配置到客户端。市场安装验证完整包大小、SHA-256、manifest 身份和平台。哈希仅证明包与索引一致，不代表作者认证。无市场地址时可以直接导入 ZIP。

## 图片机器人

默认保存到执行电脑的系统下载目录，可修改。机器人支持引用图片原件和图片直链，验证实际图片内容，清洗文件名且不覆盖不同内容文件。暂存完成后发布文件，记录路径与哈希以便恢复。返回的本机路径不能当作其他设备可下载的附件。

在“设置 → 插件管理”启用图片下载插件，并勾选“允许当前存储空间调用”。每个账号/空间单独授权，未授权时不发布可调用实例，也不消费该空间的任务。其他设备在相同空间中引用一张或多张图片，选择目标电脑的图片机器人后发送。

机器人选择直接在聊天输入框完成：输入 @ 后按名称筛选，点击候选或用上下方向键和 Enter/Tab 选择。输入框显示 @机器人名称（设备名称），删除该提及即解除调用目标；普通粘贴的同名文字不会自行创建任务。外置插件可在管理页从 ZIP、目录或市场安装，卸载可选择保留数据或删除配置、凭据与日志；内置插件随应用维护，支持启停。

桌面 Markdown 使用 CodeMirror 内容变化与光标接口触发候选，手机富文本使用选区定位。打开 @ 候选会刷新目录；已启用但未获当前空间授权的本机机器人显示授权提示和“允许当前空间调用”按钮，授权后才能选择和执行。引用采用紧凑灰色摘要块，显示发送者、内容或附件名称，保留多选移除与原消息定位。

@ 候选使用紧凑头像列表展示机器人名称、设备和状态，整行可点击，选择时保留输入光标；键盘选择同样可用。输入区和已发送消息中的引用均支持点击定位，手机会关闭编辑页并返回原消息，定位后短暂高亮；原消息不可用时保留引用摘要并显示提示。

选中的机器人提及显示为绿色整体标记。桌面 Markdown 使用原子文本标记，纯文本保留底层可读内容并绘制标记；退格或 Delete 命中提及范围时整块删除，同时解除目标。提及显示文字随引用草稿按账号、空间和编辑标签保存。机器人回复根据任务上下文识别，显示“机器人回复”身份及淡绿色消息背景，不依靠发送者名称匹配。

任务列表支持取消和失败项重试。重试创建关联任务，仅选择原结果中明确失败的项目；未知副作用不能静默重做。

Supabase 控制记录需要部署 supabase/migrations/004_bot_plugin_records.sql，当前尚需完成真实实例验证。手机作为调用端，不执行外部桌面程序。

## 当前验证记录

本地完整 Rust 检查通过：主库 445 项通过、2 项忽略，Telegram 辅助程序 43 项通过。后续增量检查覆盖每插件独立进程锁、运行中状态、取消、自动恢复上限、注册表并发配置、市场 HTTP ZIP 安装及哈希不匹配时保留旧安装。图片批量处理默认并发 2，逐项失败不阻止其他项，同名内容复用并保留原始字节。

引用草稿检查可执行 `node --test tests/test_plugin_drafts.mjs`，覆盖去重排序、数量上限、移动字段映射、发送期间修改及账号/空间隔离。草稿存储键由后端根据当前配置、账号和空间生成，不保存 Provider 密钥。

界面检查可执行 `npx playwright test -c tests/browser/playwright.plugins.config.mjs --workers=1`，使用模拟的 Tauri 接口检查真实 Vue 页面，覆盖插件管理、多选引用、机器人实例选择和发送载荷。截图保存于 `target/playwright/plugins/plugin-management.png`、`multiple-references.png` 与 `mobile-multiple-references.png`。该检查不代表已经完成手机到另一台 PC 的 Provider 端到端验收。

结果终态、同步事件和聊天回复在同一个 SQLite 事务内提交；重放使用稳定回复标识。长任务持续发布心跳并同步取消请求，账号或空间切换后请求取消正在执行的旧任务。常驻插件可用 `runtime.auto_start` 声明自动启动，最多进行三次退避启动，手动停止后暂停自动拉起，手动启动重置恢复次数。

密钥字段通过独立凭据入口保存到本机系统凭据库，按插件实例隔离，不写入注册表或同步目录。宿主在调用时只注入该插件声明的字段，对日志及结果中的已知密钥做脱敏。选择删除插件数据时同时删除凭据，保留数据时保留凭据。

内置模块统一展示和 Windows 独立二进制安装包已完成。本地双 Provider fixture 验证两设备任务传递、两张引用原件保存、结果回传和重复同步去重；不代表真实手机、远端 Supabase RLS 或 macOS 的实机验收。

## 构建与验收补充

Windows 安装包构建已验证。正式更新产物需要 TAURI_SIGNING_PRIVATE_KEY；无签名密钥的本地验证可用临时配置关闭 bundle.createUpdaterArtifacts，不修改正式发布设置。macOS 的目标架构和资源复制由同一构建脚本处理，尚未在 Mac 上构建验证。

发行包校验脚本 `scripts/verify_release_bundle.ps1` 现检查图片插件 manifest 和可执行资源；macOS 还检查程序架构、执行权限及打包前后的哈希。Windows NSIS 资源清单检查已通过，报告位于 `target/release-verification/windows-x64.json`。这项 Windows 检查核实生成的安装脚本包含资源，并未运行安装程序。验证工作流在图片插件源码或构建脚本变化时也会触发。当前会话的设备工具报告 Agent device access 关闭，无法进行真实手机验收。

图片设置支持 max_size_mib（默认 100，上限 100）、timeout_seconds（默认及上限 600）、idle_timeout_seconds（默认及上限 30）、concurrency（默认 2，上限 8）。HTTP fixture 已验证图片原件、伪图片、重定向、大小上限和无数据超时。图片恢复先核实已发布文件的路径及哈希，原件已删除时仍能报告原有成功项。

桌面编辑器各草稿标签分别保存引用和目标机器人，同时按账号/空间隔离。仅引用图片也能发送，输入框允许移除单项或取消全部引用；点击已发送引用可加载历史消息，原件不存在时保留摘要并提示不可用。

插件环境检查只验证入口、解释器、配置和凭据，不执行用户脚本。常驻服务可切换随应用自动启动；连续稳定运行一分钟后恢复自动重启预算。版本切换校验现存包及配置，切换后保持停用。普通插件中断展示未知结果提示，由用户核实外部操作后显式重新执行；图片程序按已有文件自动恢复。

本地验证命令：cargo test --offline -- --test-threads=1；cargo test --offline --manifest-path plugins/.system/image-downloader/Cargo.toml；node --test tests/test_plugin_drafts.mjs tests/test_image_bot_binary.mjs；npm run build。串行全量测试通过；并行全量曾出现一项系统凭据会话测试偶发失败，单独复跑及串行全量均通过。

控制记录会保存引用的版本摘要：哈希、大小、时间及可用的 ETag。执行时核实本地记录和远端 ETag/原件哈希，版本变化时逐项失败。旧资料缺少哈希和 ETag 时只能比较现有大小及时间，无法给出完整内容身份保证。

移动端浏览器 fixture 已通过多选、引用两条消息及选择目标 PC 的真实组件交互。双 Provider 控制记录检查覆盖网络失败后仍保留 pending、恢复后同步、重复去重、账号隔离和本地重启状态恢复；图片流程检查覆盖执行前取消。正式 Supabase 迁移未自动部署。


## 下载机器人与代理

内置图片插件原位升级为“下载机器人”，实例和空间授权继续有效。在“设置 → 插件管理”启用，再打开下载机器人的设置页。默认保存到执行电脑的系统下载目录，文件命名使用该电脑“基本设置 → 保存文件名规则”。

- 引用图片、视频或文件会保存附件原件。输入或引用纯文字会保存为 UTF-8 TXT，保留换行；文字附带 HTTP(S) 文件直链时，分别保存文字与链接文件。视频网站观看页需要提供文件直链。
- 外部链接可使用内置下载或执行电脑上的 aria2c。在插件设置选择程序的绝对路径，点击“检查 aria2c”查看版本，然后保存配置。
- 下载代理支持命名的 HTTP 代理，可保存可选认证、测试连接及选择默认出口。测试会使用当前已保存的引擎连接 example.com。代理凭据存于执行电脑的系统凭据库。
- 手机或桌面在输入框选中下载机器人，点击提及可选“跟随默认”“直连”或目标电脑上的代理。桌面键盘也可按 Alt+↓ 打开。只影响这一条调用中的外部直链，普通聊天和私有附件继续使用原存储连接。代理被删除或连接失败时对应链接项失败，用户可重新选择出口后发起新调用。

目录记录的 download_options 只发布默认出口与代理 ID、名称。升级版调用使用任务协议版本 2，在任务记录中保存 download_route 和去掉结构化提及的 download_body；重试沿用执行端首次解析的出口。旧调用继续使用版本 1，旧执行端跳过版本 2。插件进程的 ready、progress 和 result 信封仍使用协议版本 1；内置插件用 invoke 的版本区分两种输入语义。WebDAV 和 Supabase 的现有 JSON 记录可传递新增字段，沿用 004 迁移的空间权限和不可变任务规则。
