## MODIFIED Requirements

### Requirement: Message composition and sending

客户端 SHALL 提供一个文本输入框用于撰写消息。用户点击“发送”按钮后，消息内容（包括文本和/或选定的文件）应被发送。

#### Scenario: Select an image file to send
- **GIVEN** 用户没有选择任何文件
- **WHEN** 用户点击“附件”按钮
- **AND** 用户在文件选择对话框中选择了一个图片文件（例如 `photo.jpg`）
- **THEN** 该图片文件的缩略图应显示在文本输入框下方的待发送文件列表中
- **AND** 旁边都有一个“移除”按钮。
- **WHEN** 用户点击“发送”按钮
- **THEN** 客户端应上传该图片文件。
- **AND** 上传完成后，待发送文件列表应被清空。

#### Scenario: Select a non-image file to send
- **GIVEN** 用户没有选择任何文件
- **WHEN** 用户点击“附件”按钮
- **AND** 用户在文件选择对话框中选择了一个非图片文件（例如 `document.pdf`）
- **THEN** 该文件的文件名 "document.pdf" 应显示在文本输入框下方的待发送文件列表中，不���示图片预览。
- **AND** 旁边都有一个“移除”按钮。
