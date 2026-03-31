# Change: 简化本机 HTTP 标签名称接口

## Why
当前本机 HTTP API 在 `markedOptions` 中暴露了 `selectedTagIds`、`createdTags`、`deletedTagIds` 这类更偏内部实现的字段。对外部调用方来说，这要求它们先知道标签 id，还要理解“选中已有标签”和“新建标签”这两类不同操作，接入成本偏高。更直接的方式是只让调用方传标签名称，由后端负责匹配已有标签并自动创建缺失标签。

## What Changes
- 将本机 HTTP API 的标签选择方式简化为单一的 `markedOptions.tagNames`
- 后端按标签名称解析已有标签，缺失时自动创建，再应用到本次发送的消息
- 移除本机 HTTP API 对 `selectedTagIds`、`createdTags`、`deletedTagIds` 的支持
- 对传入的标签名称做标准化和去重
- 对旧字段输入返回明确的 4xx 错误，避免静默兼容

## Impact
- Affected specs: `http-ingest`
- Affected code: `src/main.rs`, `tests/test_local_http_api.js`
- Breaking change: 已接入本机 HTTP API 的调用方需要从旧的 id/创建/删除字段切换到 `markedOptions.tagNames`
