# 快速开始

如果你想最快把 Transfer Genie 跑起来，按下面 3 步走即可。

## 1. 准备开发环境

先安装 Rust 和 Tauri 所需依赖：

- 详细步骤：[`/guide/setup`](/guide/setup)
- 重点命令：`cargo install tauri-cli --locked`

## 2. 启动桌面应用

在仓库根目录执行：

```bash
cargo tauri dev
```

如果提示缺少 `tauri` 命令，重新执行：

```bash
cargo install tauri-cli --locked
```

## 3. 配置一个 WebDAV 端点

启动应用后，在设置页完成：

1. 添加可用的 WebDAV 地址、用户名和密码
2. 设为当前活动端点
3. 返回首页发送一条文本或上传一个文件

当 WebDAV 配置可用后，你就已经拥有一个跨设备消息流。

## 下一步该看什么

- 想做自动化投递：[`/integrations/http-api`](/integrations/http-api)
- 想接 Telegram：[`/integrations/telegram-bridge`](/integrations/telegram-bridge)
- 想打包应用：[`/guide/build-and-release`](/guide/build-and-release)
