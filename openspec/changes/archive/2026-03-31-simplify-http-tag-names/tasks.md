## 1. 实现
- [x] 1.1 更新本机 HTTP API 请求契约，使 `markedOptions` 使用 `tagNames` 替代 `selectedTagIds`、`createdTags`、`deletedTagIds`
- [x] 1.2 对标签名称做标准化处理，按名称解析已有标签，并在缺失时自动创建后再持久化发送结果
- [x] 1.3 对旧 HTTP 标签字段返回 4xx 校验错误
- [x] 1.4 更新 `tests/test_local_http_api.js`，让文件和文本接口都使用 `tagNames` 构造请求
- [x] 1.5 增加或更新 Rust 测试，覆盖标签名称解析、标准化、自动创建和旧字段拒绝逻辑
- [x] 1.6 运行 `cargo test`、`node --check tests/test_local_http_api.js` 和 `openspec validate simplify-http-tag-names --strict`
