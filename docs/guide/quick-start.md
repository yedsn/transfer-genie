---
description: Transfer Genie 快速开始指南，帮助用户下载安装、配置 WebDAV，并完成第一次跨设备文本或文件传输。
---

# 快速开始

如果你只是想把 Transfer Genie 用起来，优先按这条路径操作，不需要先看开发环境。

## 路线 1：直接下载安装包

- 下载地址：<https://github.com/yedsn/transfer-genie/releases/latest>
- 如果你在国内网络环境使用，也可以关注 Gitee Release 同步页

安装后首次打开应用，直接进入下方“首次配置 WebDAV”步骤即可。

## 路线 2：从源码运行

如果你还没有可用安装包，或者想先本地体验最新版本：

1. 准备开发运行环境：[`/develop/setup`](/develop/setup)
2. 在仓库根目录执行：

```bash
cargo tauri dev
```

## 首次配置 WebDAV

启动应用后，在设置页完成：

1. 添加可用的 WebDAV 地址、用户名和密码
2. 设为当前活动端点
3. 返回首页发送一条文本或上传一个文件

当 WebDAV 配置可用后，你就已经拥有一个跨设备消息流。

## 下一步建议

- 想看更细的安装与平台说明：[`/guide/installation`](/guide/installation)
- 想完成第一次真实传输：[`/guide/first-sync`](/guide/first-sync)
- 想接脚本自动化：[`/integrations/http-api`](/integrations/http-api)
- 想接 Telegram：[`/integrations/telegram-bridge`](/integrations/telegram-bridge)
- 想参与开发：[`/develop/setup`](/develop/setup)
