# message-list-infinite-scroll Specification

## Purpose

定义首页消息列表的无限滚动分页能力，支持首屏仅加载最新一页、滚动到顶部自动加载历史消息。

## Requirements

### Requirement: Initial page load

首页消息列表 SHALL 在首次加载、刷新或切换 WebDAV 端点时，仅请求并展示最新的一页消息，默认页大小为 10 条。

#### Scenario: First open home page

- **WHEN** 用户首次打开首页且存在消息
- **THEN** 客户端只请求最新的一页消息（最多 10 条）
- **AND** 消息列表按时间升序展示，最新消息位于底部
- **AND** 若消息总数超过一页，客户端提示存在更早消息

#### Scenario: Refresh home page

- **WHEN** 用户手动刷新首页
- **THEN** 客户端重新加载最新一页消息
- **AND** 重置消息窗口边界状态

#### Scenario: Switch WebDAV endpoint

- **WHEN** 用户切换到另一个已启用的 WebDAV 端点
- **THEN** 客户端清空当前消息列表
- **AND** 仅加载新端点的最新一页消息

### Requirement: Scroll-triggered history loading

当用户向上滚动消息列表接近顶部时，客户端 SHALL 自动请求更早的消息页并在列表头部插入。

#### Scenario: Scroll near top with more history

- **GIVEN** 消息总数超过已加载数量
- **WHEN** 用户向上滚动使 scrollTop 小于阈值 50px
- **THEN** 客户端向 WebDAV 请求更早的一页消息
- **AND** 新加载的消息插入列表头部
- **AND** 调整 scrollTop 使当前阅读位置保持不变

#### Scenario: No more history

- **GIVEN** 已加载最早的消息页
- **WHEN** 用户继续向上滚动
- **THEN** 客户端不发起额外请求
- **AND** 提示已加载全部消息或隐藏加载指示器

### Requirement: Loading state indication

在加载历史消息期间，客户端 SHALL 在消息列表顶部显示加载状态指示器。

#### Scenario: Show loading indicator

- **WHEN** 客户端正在加载历史消息
- **THEN** 消息列表顶部显示“加载中...”或等效状态指示
- **AND** 禁止重复触发同一批次的加载请求

#### Scenario: Hide loading indicator

- **WHEN** 历史消息加载完成或失败
- **THEN** 移除或更新顶部加载状态指示器

### Requirement: Scroll position preservation

加载历史消息后，客户端 SHALL 保持用户当前阅读的消息可见，避免列表跳动。

#### Scenario: Preserve reading position after prepend

- **GIVEN** 用户正在查看某条消息
- **WHEN** 客户端在列表头部插入更早的消息
- **THEN** 调整 scrollTop 使当前消息仍位于可见区域
- **AND** 不发生视觉跳动或突然滚动

### Requirement: Concurrency and deduplication

客户端 SHALL 防止滚动触发导致的并发或重复历史加载请求。

#### Scenario: Prevent duplicate load while loading

- **GIVEN** 正在加载历史消息
- **WHEN** 用户继续向上滚动
- **THEN** 客户端忽略新的加载触发直到当前请求完成
