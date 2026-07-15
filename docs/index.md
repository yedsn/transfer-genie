---
layout: home
description: Transfer Genie 是基于 WebDAV 的跨设备文件传输与文本同步工具，支持 Windows、macOS、本机 HTTP API 自动化和 Telegram Bridge。
hero:
  name: Transfer Genie
  text: 基于 WebDAV 的跨设备文件传输与文本同步工具
  tagline: 面向 Windows 和 macOS 的 Tauri + Rust 桌面应用，像聊天一样发送文本、Markdown 和文件，也能通过本机 HTTP API 与 Telegram Bridge 接入自动化流程。
  image:
    src: /logo.png
    alt: Transfer Genie
  actions:
    - theme: brand
      text: 立即下载
      link: https://github.com/yedsn/transfer-genie/releases/latest
    - theme: alt
      text: 安装指南
      link: /guide/installation
    - theme: alt
      text: GitHub 仓库
      link: https://github.com/yedsn/transfer-genie
features:
  - icon: "🗂️"
    title: WebDAV 消息中心
    details: 用一个 WebDAV 目录统一接收文本、文件和跨设备同步历史，不依赖中心化 IM 平台。
  - icon: "⚙️"
    title: 自动化友好
    details: 桌面应用内置本机 HTTP API，可直接被脚本、定时任务或本地工具调用。
  - icon: "📨"
    title: Telegram Bridge
    details: 支持 Telegram 与 WebDAV 双向同步，用桌面端统一配置与托管 bridge 生命周期。
  - icon: "🏷️"
    title: 标记与历史
    details: 消息流支持标签、筛选、下载和历史索引，适合做长期可检索的传输工作台。
  - icon: "✍️"
    title: 面向日常使用优化
    details: 支持 Markdown 输入、长消息高度控制、文件预览与更顺手的传输细节，而不是只有“能传就行”。
  - icon: "🖥️"
    title: 桌面端原生体验
    details: 基于 Tauri 2 + Rust 构建，面向 macOS 与 Windows 的桌面工作流而不是网页聊天框。
---

<div class="tg-home-section">

## 界面预览

<div class="tg-preview-grid">
  <div>
    <img src="https://picbed.hxj.life/images/2026/05/04/PixPin_2026-05-04_13-25-44.png" alt="Transfer Genie 消息流首页" />
    <p><strong>消息流首页</strong>：文本、文件、发送者与时间线集中呈现。</p>
  </div>
  <div>
    <img src="https://picbed.hxj.life/images/2026/05/04/PixPin_2026-05-04_13-33-21.png" alt="Transfer Genie 传输任务面板" />
    <p><strong>传输任务面板</strong>：统一查看上传、下载、断点续传与进度状态。</p>
  </div>
  <div>
    <img src="https://picbed.hxj.life/images/2026/05/04/PixPin_2026-05-04_13-33-04.png" alt="Transfer Genie 标记与筛选" />
    <p><strong>标记与筛选</strong>：适合做标签管理、批量整理和重点消息回看。</p>
  </div>
  <div>
    <img src="https://picbed.hxj.life/images/2026/05/04/PixPin_2026-05-04_13-33-56.png" alt="Transfer Genie 设置中心" />
    <p><strong>设置中心</strong>：集中管理 WebDAV、HTTP API、Telegram Bridge 和更新配置。</p>
  </div>
</div>

</div>

<div class="tg-home-section">

## 它解决什么问题

Transfer Genie（传输小精灵）适合需要自托管跨设备传输的人：用一个 WebDAV 端点作为共享收件箱，在多台电脑之间发送文本、链接、Markdown、文件和自动化消息。

| 你想做什么 | 推荐入口 |
| --- | --- |
| 下载 Transfer Genie 安装包 | [`Transfer Genie 下载`](/download) |
| 用 WebDAV 在 Windows 和 macOS 之间传文件 | [`WebDAV 跨设备传文件`](/use-cases/webdav-file-transfer) |
| 用 NAS 或自建 WebDAV 做传输收件箱 | [`NAS WebDAV 传输`](/use-cases/nas-webdav-transfer) |
| 在多台设备之间同步文字、链接和命令片段 | [`跨设备文本同步`](/use-cases/cross-device-text-sync) |
| 让脚本把文本或文件发进传输消息流 | [`HTTP API 自动化发送`](/use-cases/local-http-api-automation) |
| 把 Telegram 消息和文件同步到 WebDAV | [`Telegram 与 WebDAV 同步`](/use-cases/telegram-webdav-bridge) |
| 找微信文件传输助手替代方案 | [`对比微信文件传输助手`](/compare/transfer-genie-vs-wechat-file-transfer) |

</div>

<div class="tg-home-section">

## 从这里开始

- 想下载软件：去 [`/download`](/download)
- 想安装并开始使用：去 [`/guide/installation`](/guide/installation)
- 想完成第一次真实传输：看 [`/guide/first-sync`](/guide/first-sync)
- 想接脚本：看 [`/integrations/http-api`](/integrations/http-api)
- 想接 Telegram：看 [`/integrations/telegram-bridge`](/integrations/telegram-bridge)
- 想按场景了解：看 [`/use-cases/webdav-file-transfer`](/use-cases/webdav-file-transfer)
- 想用 NAS/WebDAV 做自托管传输：看 [`/use-cases/nas-webdav-transfer`](/use-cases/nas-webdav-transfer)
- 想快速看问题答案：看 [`/faq`](/faq)
- 想参与开发或自己构建：看 [`/develop/setup`](/develop/setup)

</div>
