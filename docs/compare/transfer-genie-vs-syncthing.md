---
description: Transfer Genie 和 Syncthing 的差异对比，帮助用户理解“消息流传输”和“目录同步”分别适合什么场景。
---

# Transfer Genie vs Syncthing

Syncthing 更擅长目录级别的持续同步，Transfer Genie 更擅长把文本、文件和自动化结果做成一个可查的传输消息流。

## 什么时候更适合用 Transfer Genie

| 场景 | 原因 |
| --- | --- |
| 你传的不是整个目录，而是临时内容 | Transfer Genie 直接面向一条条文本、文件和说明。 |
| 你想要发送者、时间、标签和历史 | Transfer Genie 把这些信息保存在消息流里。 |
| 你要把脚本产物发给另一台设备 | Transfer Genie 有本机 HTTP API。 |
| 你想把 Telegram 也接进来 | Transfer Genie 支持 Telegram Bridge。 |

## 什么时候 Syncthing 更合适

| 场景 | 说明 |
| --- | --- |
| 目录长期双向同步 | 你要保持多个目录始终一致。 |
| 大量本地文件夹备份 | 主要目标是同步文件树，而不是单次传输。 |
| 不需要消息流语义 | 只要文件到达，不需要发送者、标签和文本上下文。 |

## 核心差异

| 对比项 | Transfer Genie | Syncthing |
| --- | --- | --- |
| 主模型 | 传输消息流 | 目录同步 |
| 适合内容 | 文本、Markdown、文件、脚本结果 | 文件夹和文件树 |
| 历史语义 | 有发送者、时间线、标签 | 重点是同步状态 |
| WebDAV | 直接作为存储层 | 不是核心模型 |
| 自动化入口 | 本机 HTTP API | 更偏同步守护进程 |

## 结论

如果你要的是“把两个设备的文件夹长期同步起来”，Syncthing 更对口。

如果你要的是“把临时文本、文件、脚本结果放进一个自己可控的收件箱”，Transfer Genie 更顺手。

## 继续阅读

- 跨设备文本同步：[`/use-cases/cross-device-text-sync`](/use-cases/cross-device-text-sync)
- HTTP API 自动化发送：[`/use-cases/local-http-api-automation`](/use-cases/local-http-api-automation)
