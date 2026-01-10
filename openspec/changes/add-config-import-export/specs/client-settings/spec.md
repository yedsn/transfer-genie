## ADDED Requirements
### Requirement: Configuration import and export
客户端 SHALL 允许用户将当前配置导出为文件，并从配置文件导入设置以覆盖现有配置。导出文件中的敏感字段 MUST 经过基于用户密码的加密处理。导入失败时客户端 SHALL 保持当前配置不变并提示错误。

#### Scenario: Export configuration to file
- **WHEN** 用户在设置页触发导出并选择保存位置，输入导出密码
- **THEN** 系统生成包含当前配置的文件
- **AND** 导出内容中的敏感字段不以明文呈现

#### Scenario: Import configuration successfully
- **WHEN** 用户选择有效的配置文件导入并提供正确的解密密码
- **THEN** 客户端覆盖当前配置并立即生效

#### Scenario: Import configuration failed
- **WHEN** 用户选择无效或损坏的配置文件，或解密失败（包含密码错误）
- **THEN** 客户端提示错误
- **AND** 当前配置保持不变
