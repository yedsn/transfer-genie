# Spec Delta

## ADDED Requirements

### Requirement: Platform-scoped settings surface
iOS 设置界面 SHALL 仅展示该平台支持的 Supabase、账号、同步、缓存和应用信息设置。客户端读取包含桌面或 WebDAV 字段的配置时 MUST 保留未知或不可编辑字段，并 MUST NOT 因 iOS 保存操作删除、重置或导出为无效值。

#### Scenario: Load desktop-originated settings on iOS
- **WHEN** iOS 客户端读取包含 WebDAV、快捷键或桌面集成字段的配置
- **THEN** iOS 界面隐藏这些不支持的设置
- **AND** 内存及持久化模型保留原字段

#### Scenario: Save iOS settings without damaging desktop configuration
- **WHEN** 用户在 iOS 修改发送者名称或 Supabase 设置并保存
- **THEN** 客户端只更新用户实际修改的受支持字段
- **AND** 已存在的 WebDAV 与桌面设置保持不变

### Requirement: iOS sandbox file destinations
iOS 客户端 SHALL 使用应用沙盒管理下载与预览缓存，并 SHALL 通过系统预览或分享动作把文件交给用户。iOS 设置界面 MUST NOT 要求用户配置桌面式固定下载目录或依赖长期有效的外部目录路径。

#### Scenario: Download attachment on iOS
- **WHEN** 用户在 iOS 下载附件
- **THEN** 客户端先将文件保存到应用管理的本地位置
- **AND** 用户可以预览或通过系统分享导出该文件

#### Scenario: Reopen cached attachment
- **WHEN** 已缓存附件仍存在且用户再次打开
- **THEN** 客户端复用本地缓存而不重复下载
