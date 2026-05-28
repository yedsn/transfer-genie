## 1. 前端消息加载逻辑收敛

- [ ] 1.1 检查并统一首页初始加载入口，确保所有 loadMessages() 无参数调用均以 { limit: PAGE_SIZE } 从最新窗口开始
- [ ] 1.2 在 rontend/main.js 中审查并修正以下入口：首次打开、刷新按钮、切换端点、同步完成回调、定时器触发
- [ ] 1.3 为所有首页消息加载入口添加注释，标注“仅加载最新一页，历史通过滚动续载”

## 2. 滚动自动加载历史消息

- [ ] 2.1 确认 rontend/main.js 中 LOAD_MORE_TRIGGER_TOP 阈值（当前 50px）与 hasMoreMessages 状态触发逻辑完整
- [ ] 2.2 复核 loadMessages({ loadMore: true }) 分支：正确使用 eforeTimestampMs / eforeFilename，并更新 oldestLoadedMessageRef
- [ ] 2.3 确保 preserveScroll: true 传参后 enderCurrentMessageView 正确补偿 scrollTop，避免列表跳动
- [ ] 2.4 添加边界保护：当 isLoadingMore 为 true 或 !hasMoreMessages 时拒绝重复触发

## 3. 加载状态指示器

- [ ] 3.1 确认消息列表顶部存在“加载中...”提示项（#feed-load-more-item），并正确更新文案与禁用状态
- [ ] 3.2 验证 Vue 壳层与原生 DOM 壳层均正确展示 isLoadingMore 和 hasMoreMessages 状态
- [ ] 3.3 确保加载失败或完成后正确移除禁用状态并更新提示文案

## 4. 规格与文档更新

- [ ] 4.1 在 openspec/specs/message-feed/spec.md 中追加或更新首页分页与滚动续载相关场景
- [ ] 4.2 将本次变更的 message-list-infinite-scroll 规格合并到主规格目录（openspec/specs/message-list-infinite-scroll/spec.md）

## 5. 验证与回归

- [ ] 5.1 首页首次打开：确认只显示最新 10 条，总数提示正确
- [ ] 5.2 滚动到顶部：自动加载上一页并保持阅读位置
- [ ] 5.3 切换端点：清空并重新加载最新一页
- [ ] 5.4 手动刷新：重新加载最新一页并滚动到底部
- [ ] 5.5 定时检查新消息：新消息追加到底部，不影响已加载历史
- [ ] 5.6 并发滚动：快速滚动不触发重复加载请求
