---
layout: home
hero:
  name: Transfer Genie
  text: 把 WebDAV 变成你的跨设备传输收件箱
  tagline: 一个基于 Tauri + Rust + WebDAV 的桌面工具，像聊天一样传文字、传文件，也能接本机 HTTP API 和 Telegram Bridge。
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

## 从这里开始

- 想安装并开始使用：去 [`/guide/installation`](/guide/installation)
- 想完成第一次真实传输：看 [`/guide/first-sync`](/guide/first-sync)
- 想接脚本：看 [`/integrations/http-api`](/integrations/http-api)
- 想接 Telegram：看 [`/integrations/telegram-bridge`](/integrations/telegram-bridge)
- 想参与开发或自己构建：看 [`/develop/setup`](/develop/setup)

</div>
