## MODIFIED Requirements

### Requirement: Message composition and sending

客户端 SHALL 提供一个文本输入框用于撰写消息。用户点击“发送”按钮后，消息内容（包括文本和/或选定的文件）应被发送。

#### Scenario: Send a text message
- **WHEN** 用户在文本输入框中输入 "Hello, World!"
- **AND** 用户点击“发送”按钮
- **THEN** 客户端应发送一条内容为 "Hello, World!" 的文本消息。

#### Scenario: Select and send multiple files
- **GIVEN** 用户没有选择任何文件
- **WHEN** 用户点击“附件”按钮
- **AND** 用户在文件选择对话框中选择了 3 个文件
- **THEN** 这 3 个文件应显示在文本输入框下方的待发送文件列表中
- **AND** 每个文件旁边都有一个“移除”按钮。
- **WHEN** 用户点击“发送”按钮
- **THEN** 客户端应按顺序上传这 3 个文件。
- **AND** 上传完成后，待发送文件列表应被清空。

#### Scenario: Select files and add a text message
- **GIVEN** 用户已选择 2 个文件
- **WHEN** 用户在文本输入框中输入 "Here are the files"
- **AND** 用户点击“发送”按钮
- **THEN** 客户端应首先发送��条内容为 "Here are the files" 的文本消息
- **AND** 接着按顺序上传这 2 个文件。
- **AND** 发送完成后，文本输入框和待发送文件列表都应被清空。

#### Scenario: Remove a selected file before sending
- **GIVEN** 用户已选择 2 个文件，"file1.txt" 和 "file2.txt"
- **WHEN** 用户点击 "file1.txt" 旁边的“移除”按钮
- **THEN** "file1.txt" 应从待发送文件列表中移除
- **AND** 列表中只剩下 "file2.txt"。
- **WHEN** 用户点击“发送”按钮
- **THEN** 客户端应只上传 "file2.txt" 文件。
