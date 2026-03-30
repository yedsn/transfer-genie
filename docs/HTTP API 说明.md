# 本机 HTTP API 说明

本文档描述 Transfer Genie 当前内置的本机 HTTP API，供外部自动化脚本、命令行工具或其他程序调用。

## 概览

- 服务类型：应用内嵌本机 HTTP 服务，不是独立后台进程
- 默认地址：`127.0.0.1`
- 默认端口：`6011`
- 可用接口：
  - `POST /api/send-file`
  - `POST /api/send-text`
- 返回格式：
  - 成功：JSON
  - 失败：JSON，结构为 `{ "error": "..." }`

## 使用前提

调用前需要满足以下条件：

- Transfer Genie 应用正在运行
- 设置页中已经启用“API 接口”
- 应用里存在当前活动的 WebDAV 端点
- 脚本访问的地址和端口与设置页显示的实际监听地址一致

说明：

- 该服务随应用进程启动和停止
- 仅“保存设置”不会在应用退出后继续提供 HTTP 服务
- 如果脚本报 `fetch failed`，通常表示服务未监听、地址/端口不对，或应用未启动

## 统一响应格式

### 成功响应

两个发送接口成功时都返回：

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

字段说明：

- `status`：固定为 `ok`
- `result.markedTagIds`：最终应用到这条消息上的标签 id 列表
- `result.filename`：远端保存后的消息文件名
- `result.originalName`：原始文件名或文本消息对应的逻辑名称
- `result.endpointId`：本次发送使用的 WebDAV 端点 id

### 失败响应

失败时返回：

```json
{
  "error": "错误说明"
}
```

常见失败原因：

- 请求体格式不正确
- 文本格式不是 `text` 或 `markdown`
- `markedOptions` 不是合法 JSON
- `markedOptions` 里仍然使用了旧字段
- 当前没有活动 WebDAV 端点
- WebDAV 上传失败

## 标记参数 `markedOptions`

两个发送接口都支持可选的 `markedOptions`。

当前支持的结构：

```json
{
  "marked": true,
  "tagNames": ["urgent", "follow-up"]
}
```

规则如下：

- `tagNames` 是标签名称列表
- 后端会先按标签名称匹配已有标签
- 若标签不存在，会自动创建
- 标签名称会做 `trim`
- 标签名称按大小写不敏感去重
- 当 `tagNames` 非空时，即使 `marked` 没写或写成 `false`，本次消息也会按“已标记”处理
- 当未提供 `markedOptions` 时，本次发送按未标记处理

以下旧字段已不再支持，传入会返回 4xx：

- `selectedTagIds`
- `createdTags`
- `deletedTagIds`

## 接口一：发送文件

### `POST /api/send-file`

请求类型：

- `multipart/form-data`

表单字段：

- `file`：必填，文件内容
- `markedOptions`：可选，文本字段，值为 JSON 字符串

### `curl` 示例

```bash
curl -X POST "http://127.0.0.1:6011/api/send-file" \
  -F "file=@C:/temp/demo.txt" \
  -F "markedOptions={\"marked\":true,\"tagNames\":[\"test\"]}"
```

### Node `fetch` 示例

```js
const fs = require('fs/promises');

const data = await fs.readFile('C:/temp/demo.txt');
const form = new FormData();
form.append('file', new Blob([data], { type: 'application/octet-stream' }), 'demo.txt');
form.append('markedOptions', JSON.stringify({
  marked: true,
  tagNames: ['test']
}));

const response = await fetch('http://127.0.0.1:6011/api/send-file', {
  method: 'POST',
  body: form,
});

console.log(await response.text());
```

## 接口二：发送文本

### `POST /api/send-text`

请求类型：

- `application/json`

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
- `format`：可选，仅支持：
  - `text`
  - `markdown`
- `markedOptions`：可选，见上文

### `curl` 示例

```bash
curl -X POST "http://127.0.0.1:6011/api/send-text" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"hello world\",\"format\":\"text\",\"markedOptions\":{\"marked\":true,\"tagNames\":[\"test\"]}}"
```

### Node `fetch` 示例

```js
const response = await fetch('http://127.0.0.1:6011/api/send-text', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    text: 'hello world',
    format: 'text',
    markedOptions: {
      marked: true,
      tagNames: ['test'],
    },
  }),
});

console.log(await response.text());
```

## 测试脚本

项目内置了一个 Node 测试脚本：

- [tests/test_local_http_api.js](E:/Workspaces/git/my/transfer-genie/tests/test_local_http_api.js)

示例：

```bash
node tests/test_local_http_api.js --mode text --text "hello world" --tag test
node tests/test_local_http_api.js --file C:\temp\demo.txt --tag urgent --tag follow-up
node tests/test_local_http_api.js --dry-run --mode text --text "hello" --format markdown --tag doc
```

脚本会输出：

- 请求地址
- 请求体摘要
- 接口返回结果
- 若连接失败，还会输出底层网络原因，例如 `ECONNREFUSED`

## 排查建议

### 1. 脚本报 `fetch failed`

优先检查：

- 应用是否正在运行
- 设置里是否启用了 API 接口
- 设置页显示的运行地址是否就是脚本当前访问的地址
- 端口是否被改过
- HTTP 状态是否是“启动失败”

### 2. 调用返回 4xx

优先检查：

- `/api/send-file` 是否用了 `multipart/form-data`
- `/api/send-text` 是否传了合法 JSON
- `format` 是否是 `text` 或 `markdown`
- `markedOptions` 是否仍然包含旧字段

### 3. 调用返回 5xx 或上传失败

优先检查：

- 当前是否存在活动 WebDAV 端点
- WebDAV 凭据是否有效
- 远端目录是否可写
- 应用日志中是否有上传错误
