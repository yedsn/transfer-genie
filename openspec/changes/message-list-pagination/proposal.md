## Why

首页打开时加载全部消息导致性能问题和不良用户体验。用户期望分页加载：初始只加载最后一页（最新消息），滚动到列表最上方时自动加载上一页（更早的消息）。

当前问题：
- 首次加载时一次性加载所有消息（可能远超10条）
- 缺少滚动触发的自动分页加载
- 大量消息时首屏渲染慢、内存占用高

## What Changes

- **初始加载行为**：首次打开首页时只加载最新的一页消息（默认10条），而非全部消息
- **无限滚动**：当用户滚动到消息列表顶部时，自动加载更早的消息（上一页）
- **加载指示器**：在列表顶部显示"加载更多"状态指示器
- **滚动位置保持**：加载历史消息后保持当前阅读位置，避免跳动

## Capabilities

### New Capabilities

- message-list-infinite-scroll: 消息列表无限滚动分页能力，支持滚动到顶部自动加载历史消息

### Modified Capabilities

- message-feed: 修改消息列表加载逻辑，从一次性全量加载改为按需分页加载

## Impact

- **前端代码**：rontend/main.js、rontend/vue-app.js、rontend/components/home-page.js
- **Rust 后端**：src/main.rs 的 list_messages_window 命令已支持分页，无需修改
- **用户体验**：显著提升大消息量场景下的首屏加载速度
