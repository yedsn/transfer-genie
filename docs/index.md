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

## 快速下载与安装

<div class="tg-home-grid">
  <div class="tg-home-card">
    <h3>下载最新版本</h3>
    <p>直接前往 GitHub Releases 获取最新的 macOS 与 Windows 安装包。</p>
    <p><a href="https://github.com/yedsn/transfer-genie/releases/latest"><strong>打开下载页</strong></a></p>
  </div>
  <div class="tg-home-card">
    <h3>看安装步骤</h3>
    <p>如果你只是要把应用装起来并开始传输，先看安装说明和第一次传输指南；开发相关文档已经单独拆到开发说明。</p>
    <p><a href="/guide/installation"><strong>查看安装指南</strong></a></p>
  </div>
</div>

</div>

<div class="tg-home-section">

## 不只是能传，还更顺手

<div class="tg-home-grid">
  <div class="tg-home-card">
    <h3>Markdown 输入</h3>
    <p>除了普通文本，还可以直接输入 Markdown，把结构化说明、命令片段、待办清单一起发出去，阅读体验比纯文本更清晰。</p>
  </div>
  <div class="tg-home-card">
    <h3>长消息不撑爆界面</h3>
    <p>针对长文本消息做了高度限制和展开式阅读体验，消息流更干净，日常浏览不会被超长内容打断节奏。</p>
  </div>
  <div class="tg-home-card">
    <h3>传输列表单独管理</h3>
    <p>上传、下载、重试、断点续传和进度状态集中放在传输列表里，不需要在聊天流里翻找每一次文件动作。</p>
  </div>
  <div class="tg-home-card">
    <h3>更像桌面工具而不是 demo</h3>
    <p>消息标记、筛选、历史恢复、文件下载和多入口配置都围绕真实使用场景优化，适合长期挂在桌面上使用。</p>
  </div>
</div>

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

- 想安装并开始使用：去 [`/guide/installation`](/guide/installation)
- 想完成第一次真实传输：看 [`/guide/first-sync`](/guide/first-sync)
- 想接脚本：看 [`/integrations/http-api`](/integrations/http-api)
- 想接 Telegram：看 [`/integrations/telegram-bridge`](/integrations/telegram-bridge)
- 想参与开发或自己构建：看 [`/develop/setup`](/develop/setup)

</div>
