---
description: 用 Transfer Genie 本机 HTTP API 从脚本、命令行工具或本地程序自动发送文本和文件到 WebDAV 消息流。
---

# 用本机 HTTP API 自动发送文本和文件

Transfer Genie 内置本机 HTTP API，适合让脚本、命令行工具或本地程序把文本和文件发送进同一条 WebDAV 消息流。

Local HTTP API 是 Transfer Genie 的本地自动化入口，适合搜索 `local HTTP API file transfer`、`send file from script to WebDAV`、`本地 HTTP API 发送文件` 这类问题的用户。

## 适合什么场景

| 场景 | 说明 |
| --- | --- |
| 脚本发送构建产物 | 构建完成后把压缩包、日志或报告发送到 WebDAV 消息流。 |
| 定时任务发送结果 | 任务结束后通过 `POST /api/send-text` 汇报状态。 |
| 本地工具集成 | 其他程序无需理解 WebDAV，只调用本机接口即可发送。 |
| 给消息加标签 | 通过 `markedOptions.tagNames` 标记自动化消息。 |

## 接口速查

| 项目 | 内容 |
| --- | --- |
| 默认地址 | `127.0.0.1` |
| 默认端口 | `6011` |
| 发送文本 | `POST /api/send-text` |
| 发送文件 | `POST /api/send-file` |
| 返回格式 | JSON |

## 发送文本示例

```bash
curl -X POST "http://127.0.0.1:6011/api/send-text" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "build finished",
    "format": "text",
    "markedOptions": {
      "marked": true,
      "tagNames": ["automation", "build"]
    }
  }'
```

## 发送文件示例

```bash
curl -X POST "http://127.0.0.1:6011/api/send-file" \
  -F "file=@./dist/report.zip" \
  -F "markedOptions={\"marked\":true,\"tagNames\":[\"report\"]}"
```

## 使用前提

- Transfer Genie 正在运行。
- 设置页已经启用 API 接口。
- 当前存在活动 WebDAV 端点。
- 脚本访问的地址和端口与设置页一致。

## 继续阅读

- 完整接口说明：[`/integrations/http-api`](/integrations/http-api)
- WebDAV 跨设备传文件：[`/use-cases/webdav-file-transfer`](/use-cases/webdav-file-transfer)
