# 验证记录

日期：2026-11-07。未操作真实 Supabase 服务或真实 iPhone。

## 已通过

- `node tests/test_mobile_startup_recovery.js`：可控时钟覆盖配置/账号/草稿挂起、10 秒边界、后台截止时间检查、重试、切换 B、晚到成功/失败、登录失效及错误信息不暴露原始凭据。
- `node tests/test_mobile_startup_recovery_browser.js`：320×568 页面验证 loading 恢复按钮、管理页不被晚到结果关闭、返回选择、切换 B、禁用项不可激活、真实 10 秒超时及重试；按钮至少 44px，页面无横向溢出。截图：`test-results/mobile-startup-recovery/timeout.png`。
- `node tests/test_mobile_connections_browser.js`：原有连接管理、焦点、卡片、小屏、大字号及模拟键盘回归通过。
- `node tests/test_mobile_storage_connections.js`：连接隔离、激活与错误恢复通过；修正已过期的 notice 字段断言为 toast.message，并采用新的配置错误文案。
- `node tests/test_mobile_draft_persistence.js`、`node tests/test_mobile_share_import.js`：草稿与分享导入回归通过。
- `npm run typecheck`、`npm run build`：通过。构建仍提示部分 chunk 超过 500 kB。
- `cargo test`：退出码 0；`cargo test --lib startup_auth -- --nocapture` 单独确认新增挂起响应头、响应体及刷新测试通过，凭据和会话保留，刷新互斥锁释放。现有会话刷新与撤销测试通过。编译存在已有 mobile_share dead_code 警告。
- `openspec validate fix-mobile-storage-startup-recovery --strict`：通过。

## 未通过或未完成

- `node tests/test_mobile_navigation_loading_browser.js`：Markdown 场景期望 contenteditable=false，实际为 null。调查发现该组件支持初始化失败时回退到 textarea；临时兼容该断言后，仍因 Markdown 工具栏不可见超时。未修改编辑器或削弱原测试，保留原测试文件，未宣称该回归通过。其他专用启动恢复与连接管理浏览器测试已通过；4.1 保持未完成。
- 官方 Simulator：Xcode 27.2 可用，已启动现有 QA Simulator。执行项目 `simulator deploy --check-only` 时，保护检查返回 `Installed Simulator app database cannot be verified; refusing replacement`。未绕过保护、未卸载或替换已有应用；未完成安装及业务验收，4.2 保持未完成。

## 实现边界

认证预算仅由移动端启动显式传入 startup=true，缺省调用维持原行为，共享 HTTP 客户端和附件传输超时配置未改。后端总预算超时返回网络错误且不主动删除会话；现有已完成请求的网络回退策略保留。前端以独立代次隔离旧初始化，超时或主动离开会释放等待调用者，原生请求可在其预算内结束。
