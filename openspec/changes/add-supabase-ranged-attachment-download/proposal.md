# Change: 稳定 Supabase 附件下载并支持断点续传

## Why

当前 Supabase 附件下载依赖单条长连接。连接在大文件传输中途提前 EOF 时，客户端虽然保存了临时文件和下载进度，但恢复会重新从头请求并截断临时文件，导致大附件反复失败或浪费已传输数据。

## What Changes

- 为桌面端和 iOS 的 Supabase 附件下载增加 HTTP Range 分段下载能力。
- 对大于 16MB 的附件默认使用 4 段并发下载；每段独立重试，单段连接失败不影响其他已完成分段。
- 持久化整体下载任务和每个分段的状态，应用重启、网络中断或 iOS 前后台切换后只恢复未完成分段。
- 合并前校验对象大小和 SHA-256，校验通过后再原子发布正式缓存文件。
- 当 Supabase Storage/CDN 不支持或不正确响应 Range 时，自动回退到单流 HTTP Range 断点续传；必要时再回退到完整单流下载。
- 统一普通附件保存、预览和媒体缓存的 Supabase 下载行为，避免不同入口稳定性不一致。

## Impact

- Affected specs: supabase-storage
- Affected code: src/supabase_sync.rs, src/lib.rs, src/db.rs
- Affected tests: Supabase storage mock、下载恢复和完整性校验测试
- Database: 新增按账号/空间隔离的下载分段状态表，并提供兼容已有 partial_downloads 数据的迁移
