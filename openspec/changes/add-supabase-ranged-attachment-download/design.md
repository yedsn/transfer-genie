## Context

Supabase Storage authenticated object download 当前由 reqwest 单条响应流完成。现有 partial_downloads 只保存一个整体字节计数，恢复时仍然从头请求全量对象并截断 .part 文件，不能利用已经下载的字节。目标是同时覆盖桌面端和 iOS，并在不支持 Range 的服务端上保持可用。

## Goals / Non-Goals

- Goals:
  - 大于 16MB 的附件默认采用 4 段并发下载。
  - 网络 EOF、短暂断网和应用重启后可按分段恢复。
  - 分段结果只能在大小和 SHA-256 校验通过后发布。
  - 账号、空间和对象版本严格隔离。
  - 普通保存、预览、媒体缓存复用同一下载策略。
- Non-Goals:
  - 不改变 Supabase bucket、RLS 或对象路径规则。
  - 不要求服务端新增 RPC 或 Edge Function。
  - 不保证后台运行期间绕过 iOS 系统挂起限制。

## Decisions

### 1. Range 能力探测与回退

新增带显式字节区间的 Storage GET 封装，要求服务端对有效 Range 返回 206 和匹配的 Content-Range。首次探测或任一分段收到 200、缺失或错误 Content-Range、416 等不可用响应时，放弃分段模式并回退到单流下载器。单流下载器优先从持久化偏移发送 Range: bytes=<offset>-，服务端仍不支持时才从头完整下载。

### 2. 分段布局

大于 16MB 的对象按总大小切分为 4 个连续、无重叠区间；小于等于 16MB 的对象保持单流。每个分段写入独立临时文件，避免多个异步任务随机写同一个文件。分段大小和并发数集中定义为常量，后续可在不改变数据格式的情况下调整。

### 3. 持久化模型

保留 partial_downloads 作为下载任务主记录，并新增 partial_download_segments：

- endpoint_id, owner_scope, filename
- segment_index, start_offset, end_offset
- downloaded_bytes, status, retry_count
- temp_path, object_path, expected_size, expected_sha256
- updated_at_ms

主键使用 endpoint_id、owner_scope、filename、segment_index。恢复前必须同时匹配目标路径、对象路径、预期大小和摘要；不匹配则删除整个旧任务及分段文件。

### 4. 重试与并发

每个分段最多重试 3 次，使用有限递增退避。EOF、连接重置、超时、408、429 和 5xx 可重试；认证、权限、对象不存在和非法 Range 错误不可盲目重试。并发上限固定为 4，并通过共享信号量限制同一附件的请求数。

### 5. 合并和发布

所有分段状态为完成后，按 segment_index 顺序合并到任务 .part 文件；合并过程先写临时合并文件并 sync_all，然后校验总大小和 SHA-256。校验失败保留分段状态供重试，不创建或替换正式缓存。校验通过后使用原子 rename 或替换发布正式缓存，并清理数据库状态和分段文件。

### 6. 入口统一

普通附件保存、图片或文档预览、媒体播放缓存和移动端前台恢复均调用统一的 Supabase 下载协调器。协调器对外提供进度、取消和错误信息，内部根据对象大小选择分段或单流模式。

## Risks / Trade-offs

- Range 支持可能由 CDN 或 Storage 配置决定；回退路径保证兼容，但速度和恢复粒度会下降。
- 分段临时文件会增加磁盘占用；完成后清理，异常退出时由恢复流程和显式清理任务回收。
- 并发请求可能增加服务端压力；固定上限为 4，且只对大文件启用。
- 对象在下载过程中被替换会导致摘要校验失败；失败时不发布缓存并清理不匹配任务。

## Migration Plan

1. 启动时创建 partial_download_segments 表和必要索引。
2. 已存在的旧 partial_downloads 记录保留；首次恢复时按单流 Range 逻辑处理，并在成功后清理旧记录。
3. 新下载使用分段模型；迁移失败不影响已有消息和缓存读取，只禁用分段并回退单流。

## Open Questions

- 是否需要在设置页暴露并发数和分段大小；本变更默认不暴露，先使用固定安全值。
- 是否将下载吞吐、重试次数写入诊断日志；建议只记录非敏感统计，不记录访问令牌或完整对象路径。
