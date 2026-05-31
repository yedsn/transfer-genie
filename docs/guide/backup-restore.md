# 本地备份、恢复与冲突处理

Transfer Genie 支持两类备份：

- 本地数据备份：打包当前设置、SQLite 本地索引和本地工作区数据，用于恢复本机状态。
- WebDAV 备份：把当前 WebDAV 端点的 `files/`、`history.json` 和 manifest history 数据打包为 ZIP。

## 本地数据备份

默认备份目录是用户目录下的 `TransferGenie/backup`。可以在设置页修改备份目录、自动备份频率和保留规则。

本地数据备份是单个 ZIP 快照文件，包含：

- `settings.json`
- `messages.sqlite`
- `workspace/endpoints`
- `workspace/mirrors`
- `workspace/plugins`
- `manifest.json`

恢复本地数据会覆盖当前设置、本地消息索引和本地工作区数据。应用会要求二次确认，并在覆盖前创建一个 `transfer-genie-rollback-*.zip` 回滚快照。

## 快照保留规则

默认规则：

- 三天内的所有快照全部保留。
- 一周内每天保留一份快照。
- 超出保留窗口的旧快照可被自动清理。

设置页可以修改：

- 备份目录
- 自动备份间隔
- WebDAV 自动备份最少保留数量
- 全量保留天数
- 每日保留天数

## WebDAV 备份与恢复

WebDAV 备份仍生成 ZIP 文件，适合迁移或恢复远端端点数据。恢复 WebDAV 备份会覆盖当前远端 `files/` 与 history 数据，执行前必须确认。

## WebDAV 同步冲突

同步时，如果本地已有某条消息的远端版本记录，而远端同名文件的 `etag`、`mtime` 或大小发生变化，应用会暂停自动覆盖并返回冲突状态。

冲突处理有两个方向：

- 下载远端覆盖本地：以 WebDAV 上的内容和元数据更新本地索引/缓存。
- 上传本地覆盖远端：把本地消息内容或本地文件重新上传到 WebDAV，并更新远端 history。

未选择处理方向前，应用不会自动覆盖本地或远端数据。
