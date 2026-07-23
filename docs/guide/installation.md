---
description: 下载并安装 Transfer Genie，在 Windows 或 macOS 上配置 WebDAV 后开始跨设备发送文本和文件。
---

# 下载安装

这份文档面向“我要把软件装起来并开始用”的场景，不涉及源码开发。

## 下载入口

- GitHub Releases：<https://github.com/yedsn/transfer-genie/releases/latest>
- 仓库主页：<https://github.com/yedsn/transfer-genie>
- Gitee 镜像：<https://gitee.com/hongxiaojian/transfer-genie>

## 安装建议

### macOS

- 优先下载最新的 `.dmg` 安装包
- 拖动应用到 `Applications`
- 如果首次打开遇到系统安全提示，可按发布说明中的建议处理

### Windows

- 优先下载最新的安装包（例如 NSIS 安装器）
- 安装完成后直接启动应用
- 如果系统拦截未知发布者，请确认来源是本仓库的 Release

## 首次打开后要做什么

安装完成后，真正决定能不能用的是 WebDAV 配置：

1. 打开设置页
2. 填写 WebDAV 地址、用户名、密码
3. 设为当前活动端点
4. 回到首页发送一条文本做连通性验证

## 如果没有安装包怎么办

如果某个版本暂时没有现成安装包，或者你想运行最新源码版本，可以改走源码运行路径：[`/develop/setup`](/develop/setup)
