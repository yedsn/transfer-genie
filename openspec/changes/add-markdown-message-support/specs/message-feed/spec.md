## MODIFIED Requirements

### Requirement: 消息文件存储
客户端 SHALL 将每条外发消息存储为 WebDAV 根目录下 `files/` 子目录中的单个文件。
文本消息 MUST 使用 UTF-8 `.txt` 文件；文件消息 MUST 保留原始字节与扩展名。
**Markdown 消息 MUST 使用 UTF-8 `.md` 文件。**

#### Scenario: 文本消息上传
- **WHEN** 用户发送文本消息
- **THEN** 客户端向 WebDAV `files/` 目录上传单个 `.txt` 文件
- **AND** 本地消息索引记录发送者、时间戳、大小与内容

#### Scenario: 文件消息上传
- **WHEN** 用户发送文件
- **THEN** 客户端向 WebDAV `files/` 目录上传原始文件字节
- **AND** 保存的文件保留原始扩展名

#### Scenario: Markdown 消息上传
- **WHEN** 用户发送 Markdown 消息
- **THEN** 客户端向 WebDAV `files/` 目录上传单个 `.md` 文件
- **AND** 本地消息索引记录发送者、时间戳、大小与内容

## ADDED Requirements

### Requirement: 消息格式选择
客户端 SHALL 允许用户在发送消息时选择格式：纯文本或 Markdown。
客户端 SHALL 在消息元数据中记录所选格式。

#### Scenario: 选择消息格式
- **WHEN** 用户撰写新消息
- **THEN** 可以选择消息格式为“纯文本”或“Markdown”

### Requirement: 动态编辑器切换
客户端 SHALL 根据用户选择的消息格式动态切换输入编辑器。

#### Scenario: 切换到 Markdown 编辑器
- **WHEN** 用户选择“Markdown”格式
- **THEN** 消息输入框 SHALL 替换为 `editormd`（或同等功能的）富文本编辑器
- **AND** 编辑器 SHALL 支持实时预览和常用 Markdown 快捷键

#### Scenario: 切换回纯文本编辑器
- **WHEN** 用户选择“纯文本”格式
- **THEN** 消息输入框 SHALL 恢复为标准文本输入框

### Requirement: Markdown 消息渲染
客户端 SHALL 使用 `editormd` 插件或兼容的库来渲染消息列表中的 Markdown 消息。
纯文本消息 SHALL 保持原有渲染方式。

#### Scenario: 渲染 Markdown 消息
- **WHEN** 消息列表中有 Markdown 格式的消息
- **THEN** 该消息应作为富文本正确渲染
- **AND** 消息中的 Markdown 语法（如标题、列表、代码块）应正确显示

#### Scenario: 渲染纯文本消息
- **WHEN** 消息列表中有纯文本格式的消息
- **THEN** 该消息应按原样显示，不进行 Markdown 渲染
