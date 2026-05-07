# 项目结构

```text
transfer-genie/
├── src/                 # Rust 后端与 Tauri 命令
├── frontend/            # 当前桌面应用前端资源
├── docs/                # 官网源码与项目文档
├── scripts/             # 打包与发布辅助脚本
├── capabilities/        # Tauri 权限配置
├── icons/               # 应用图标与资源
├── openspec/            # 规格与变更提案
├── Cargo.toml           # Rust 依赖与版本信息
└── tauri.conf.json      # Tauri 应用配置
```

## 核心模块

- `src/main.rs`：主窗口、命令处理、本机 HTTP 服务、配置入口
- `src/webdav.rs`：WebDAV 读写、上传下载与同步逻辑
- `src/db.rs`：SQLite 配置与状态持久化
- `src/history.rs`：消息历史与归档辅助
- `src/telegram_bridge.rs`：Telegram bridge 核心逻辑
- `tests/`：HTTP API 等集成检查脚本

## 官网源码

文档站基于 VitePress，核心目录包括：

- `docs/index.md`：产品首页
- `docs/.vitepress/`：站点配置与主题样式
- `docs/guide/`：快速开始、环境与构建文档
- `docs/integrations/`：HTTP API 与 Telegram Bridge 文档
- `docs/reference/`：项目结构、站点部署说明
