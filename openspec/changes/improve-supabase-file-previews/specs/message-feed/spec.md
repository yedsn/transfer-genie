# Spec Delta

## ADDED Requirements

### Requirement: File message preview presentation
客户端 SHALL 为所有文件消息提供稳定的列表预览卡片和详情预览状态。图片和视频 SHALL 显示真实视觉缩略图；音频 SHALL 显示可播放的媒体卡片；文档、压缩包及未知文件 SHALL 显示包含文件类型、文件名、大小和可用操作的类型卡片。加载真实缩略图时 MUST 保持卡片尺寸稳定，且加载失败 MUST 显示可理解的失败状态和重试入口，而不是隐藏预览区域。

#### Scenario: Display image thumbnail
- **WHEN** 图片文件消息具有本地或云端预览
- **THEN** 消息列表显示保持原始比例的缩略图
- **AND** 用户打开详情时先看到可用预览，不必先下载完整原图

#### Scenario: Display video poster
- **WHEN** 视频文件消息具有本地或云端封面预览
- **THEN** 消息列表显示封面帧和播放标识
- **AND** 只有用户请求播放时才按需准备完整视频内容

#### Scenario: Display non-visual file card
- **WHEN** 文件是音频、文档、压缩包或不支持视觉缩略图的类型
- **THEN** 消息列表显示与文件类型对应的稳定预览卡片
- **AND** 详情中继续提供播放、下载或使用系统程序打开的可用操作

#### Scenario: Preview is loading
- **WHEN** 远端预览正在获取或生成
- **THEN** 客户端显示不会引发布局跳动的加载占位
- **AND** 同一消息仍可执行下载、标记和更多操作

#### Scenario: Preview loading fails
- **WHEN** 预览获取、解码或生成失败
- **THEN** 客户端保留文件类型卡片并显示失败原因或可理解的失败提示
- **AND** 用户可以重试预览或继续下载原文件

### Requirement: Lightweight feed preview loading
消息列表 SHALL 懒加载当前可视区域附近的真实缩略图，并 MUST 优先读取本地预览缓存。获取列表缩略图 MUST NOT 以下载完整原附件作为常规路径；完整原附件 SHALL 仅在用户播放、打开、下载或历史预览补全确有需要时按需获取。

#### Scenario: Scroll through attachment history
- **WHEN** 用户滚动包含大量文件消息的历史列表
- **THEN** 客户端只为当前可视区域附近的项目请求真实缩略图
- **AND** 离开可视范围且尚未开始的预览请求不占用下载并发

#### Scenario: Reuse cached preview
- **WHEN** 用户再次浏览已经缓存缩略图的消息
- **THEN** 客户端直接显示本地缓存
- **AND** 不重复下载相同预览对象或完整原附件

