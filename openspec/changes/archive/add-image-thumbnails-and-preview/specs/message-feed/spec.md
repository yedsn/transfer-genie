## ADDED Requirements

### Requirement: Image Thumbnails
客户端 SHALL 在上传图片文件时，自动生成缩略图并上传至 WebDAV 服务器的隐藏目录（如 `files/.thumbs/`）。
消息列表 SHALL 能够加载并显示图片消息的缩略图。

#### Scenario: Upload image creates thumbnail
- **WHEN** 用户发送图片文件 (jpg, png, etc.)
- **THEN** 客户端生成缩略图
- **AND** 客户端将原图上传至 `files/`
- **AND** 客户端将缩略图上传至 `files/.thumbs/`

#### Scenario: Display thumbnail in list
- **GIVEN** 消息列表中包含图片消息
- **WHEN** 列表渲染时
- **THEN** 客户端获取该消息的缩略图（如果存在）
- **AND** 在消息卡片中显示缩略图

### Requirement: Fullscreen Image Preview
客户端 SHALL 提供全屏预览功能，支持查看图片的原始大图。
该预览功能 SHALL 可通过双击消息列表中的缩略图或上传预览区的图片触发。

#### Scenario: Preview from message list
- **WHEN** 用户双击消息列表中的图片缩略图
- **THEN** 打开全屏预览模态框
- **AND** 显示原始图片（如果本地不存在则自动下载或使用缓存）

#### Scenario: Preview from upload list
- **WHEN** 用户在上传前的附件列表中双击图片
- **THEN** 打开全屏预览模态框
- **AND** 显示选中的本地图片
