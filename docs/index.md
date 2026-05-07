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
      text: 快速开始
      link: /guide/quick-start
    - theme: alt
      text: 阅读文档
      link: /integrations/http-api
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
  - icon: "🖥️"
    title: 桌面端原生体验
    details: 基于 Tauri 2 + Rust 构建，面向 macOS 与 Windows 的桌面工作流而不是网页聊天框。
  - icon: "🚀"
    title: GitHub Pages 文档站
    details: 官网与文档统一由 Markdown 驱动，便于发布、维护和持续更新。
---

<div class="tg-home-section">

## 为什么不是再做一个聊天工具？

Transfer Genie 不是新的社交平台，而是把你已经掌控的 **WebDAV 存储** 变成一个低心智负担的传输中枢：

<ul class="tg-inline-list">
  <li>传文本</li>
  <li>传文件</li>
  <li>接脚本</li>
  <li>接 Bot</li>
  <li>保留历史</li>
  <li>自托管数据</li>
</ul>

</div>

<div class="tg-home-section">

## 三类典型用法

<div class="tg-home-grid">
  <div class="tg-home-card">
    <h3>个人跨设备收件箱</h3>
    <p>把手机、桌面机、工作机之间临时传输的文本和文件都收束到同一条消息流里。</p>
  </div>
  <div class="tg-home-card">
    <h3>自动化投递入口</h3>
    <p>脚本通过本机 HTTP API 推送文本或文件，最终仍然进入统一的 WebDAV 消息流。</p>
  </div>
  <div class="tg-home-card">
    <h3>IM 桥接工作台</h3>
    <p>用 Telegram Bridge 把外部聊天会话拉进桌面端，不必手写独立同步守护进程。</p>
  </div>
  <div class="tg-home-card">
    <h3>可回溯的传输记录</h3>
    <p>标签、已标记消息、历史索引和下载记录，让传输过程不再只是一闪而过的临时动作。</p>
  </div>
</div>

</div>

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

- 想先跑起来：去 [`/guide/quick-start`](/guide/quick-start)
- 想接脚本：看 [`/integrations/http-api`](/integrations/http-api)
- 想接 Telegram：看 [`/integrations/telegram-bridge`](/integrations/telegram-bridge)
- 想了解站点如何部署到 GitHub Pages：看 [`/reference/site-deployment`](/reference/site-deployment)

</div>
