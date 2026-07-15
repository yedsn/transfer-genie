---
description: Transfer Genie 本机 HTTP API 文档，说明如何通过 POST /api/send-text 和 POST /api/send-file 从脚本发送文本和文件。
---

# 本机 HTTP API

Transfer Genie 内置本机 HTTP 服务，适合给自动化脚本、命令行工具或其他本地程序调用。

## 概览

- 默认地址：`127.0.0.1`
- 默认端口：`6011`
- 可用接口：
  - `POST /api/send-file`
  - `POST /api/send-text`
- 返回格式：成功和失败都返回 JSON

## 使用前提

调用前需要满足：

- Transfer Genie 正在运行
- 设置页中已经启用 API 接口
- 应用中存在当前活动 WebDAV 端点
- 脚本访问的地址和端口与设置页显示一致

## 成功响应示例

```json
{
  "status": "ok",
  "result": {
    "markedTagIds": ["tag-xxx"],
    "filename": "sender-xxx.message.txt",
    "originalName": "message.txt",
    "endpointId": "endpoint-xxx"
  }
}
```

## 失败响应示例

```json
{
  "error": "错误说明"
}
```

## 标记参数 `markedOptions`

两个发送接口都支持可选的 `markedOptions`：

```json
{
  "marked": true,
  "tagNames": ["urgent", "follow-up"]
}
```

规则：

- `tagNames` 是标签名称列表
- 不存在的标签会自动创建
- 标签名称会做 `trim`
- 标签名称按大小写不敏感去重
- 当 `tagNames` 非空时，本次消息自动按“已标记”处理

以下旧字段已不再支持：

- `selectedTagIds`
- `createdTags`
- `deletedTagIds`

## `POST /api/send-file`

请求类型：`multipart/form-data`

表单字段：

- `file`：必填，文件内容
- `markedOptions`：可选，JSON 字符串

### `curl` 示例

```bash
curl -X POST "http://127.0.0.1:6011/api/send-file" \
  -F "file=@C:/temp/demo.txt" \
  -F "markedOptions={\"marked\":true,\"tagNames\":[\"test\"]}"
```

## `POST /api/send-text`

请求类型：`application/json`

请求体：

```json
{
  "text": "hello world",
  "format": "text",
  "markedOptions": {
    "marked": true,
    "tagNames": ["test"]
  }
}
```

字段说明：

- `text`：必填，文本内容
- `format`：可选，仅支持 `text` 或 `markdown`
- `markedOptions`：可选，见上文

### `curl` 示例

```bash
curl -X POST "http://127.0.0.1:6011/api/send-text" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "hello world",
    "format": "text",
    "markedOptions": {
      "marked": true,
      "tagNames": ["test"]
    }
  }'
```

## 测试脚本

项目内置了一个 Node smoke test：[`tests/test_local_http_api.js`](../../tests/test_local_http_api.js)

```bash
node tests/test_local_http_api.js --mode text --text "hello world" --tag test
node tests/test_local_http_api.js --file C:\temp\demo.txt --tag urgent --tag follow-up
node tests/test_local_http_api.js --dry-run --mode text --text "hello" --format markdown --tag doc
```

## 排查建议

### `fetch failed`

优先检查：

- 应用是否正在运行
- 设置里是否启用了 API 接口
- 地址和端口是否匹配设置页
- 当前端口是否被改过

### 4xx 错误

优先检查：

- `/api/send-file` 是否使用了 `multipart/form-data`
- `/api/send-text` 是否传了合法 JSON
- `format` 是否是 `text` 或 `markdown`
- `markedOptions` 是否仍然包含旧字段

### 5xx 或上传失败

优先检查：

- 当前是否存在活动 WebDAV 端点
- WebDAV 凭据是否有效
- 远端目录是否可写
- 应用日志中是否有上传错误
