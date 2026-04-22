# Transfer Genie

基于 WebDAV 的跨平台文件与文本传输助手（Tauri + Rust）。

## 功能
- WebDAV 目录作为共享消息存储
- 聊天式消息列表（显示发送者、时间、大小）
- 发送文本与文件（支持拖拽、粘贴上传）
- 自动同步与刷新
- 本地 SQLite 索引
- 多 WebDAV 端点管理
- 配置导入/导出
- 可选的 Telegram 双向桥接服务

## 开发环境
请参考：`docs/setup.md`

## 启动开发

安装 Tauri CLI：

```
cargo install tauri-cli --locked
```

启动开发（在项目根目录）：

```
cargo tauri dev
```

如果出现 `no such command: tauri`：
- 确认已安装 Tauri CLI：`cargo --list | rg tauri`
- 重开终端后再运行命令

## Telegram Bridge

Telegram bridge 现在可以直接由主程序托管：

- 在“设置 -> Telegram Bridge”中填写 `Bot Token`、`Chat ID` 和轮询间隔
- 如 Telegram 访问需要代理，可勾选“启用 Telegram 代理”，默认地址预填 `http://127.0.0.1:7890`，也支持改成 `socks5://127.0.0.1:1080`
- 可在“启动服务”旁勾选“自启动服务”
- bridge 会始终跟随当前活动的 WebDAV 端点；切换活动端点时，运行中的 bridge 会自动重启
- 可在设置页直接自动获取 `Chat ID`、启动/停止 bridge，并查看 bridge 运行状态和最近错误

仍然保留独立运行方式，便于单独调试：

- 启动：`cargo run --bin telegram_bridge -- .\telegram-bridge.json`
- 配置示例：`examples/telegram-bridge.json`
- 详细说明：`docs/telegram-bridge.md`

## 打包发布

### 方法一：使用打包脚本（推荐）

Windows 用户可以直接运行打包脚本：

```batch
scripts\update_local_exe.bat
```

脚本功能：
- 可选择是否重新编译
- 自动查找生成的 exe 文件
- 复制到指定目录（默认：`D:\Program Files\TransferGenie文件传输助手`）
- 自动打开安装目录

自定义安装目录：

```batch
scripts\update_local_exe.bat "C:\你的自定义路径"
```

### 方法二：手动打包

打包前准备：
- 已安装 Rust/Cargo
- 已安装 Tauri CLI：`cargo install tauri-cli --locked`

在项目根目录运行：

```
cargo tauri build
```

说明：
- 需要在对应平台打包（Windows 产出 .exe，macOS 产出 .dmg）
- Windows 编译后的文件位于 `target\release\` 目录

### 方法三：GitHub Release 发版脚本

如果你已经接好了 GitHub Actions 自动发布工作流，推荐直接使用：

```bash
scripts/release/release_github.sh 0.1.2 --push
```

如果不传版本号，脚本会先读取当前版本，再提示你选择版本类型：

- `patch`：例如 `0.1.1 -> 0.1.2`
- `minor`：例如 `0.1.1 -> 0.2.0`
- `major`：例如 `0.1.1 -> 1.0.0`
- `custom`：手动输入版本号

脚本会自动：

- 更新 `Cargo.toml` 和 `tauri.conf.json` 版本号
- 创建 `release: v0.1.2` 提交
- 创建 `v0.1.2` tag
- 推送当前分支和 tag 到 `github` 远端

更多参数见：

```bash
scripts/release/release_github.sh --help
```

如果 GitHub Release 已经发好，还想同步一份到 Gitee Release，可执行：

```bash
export GITEE_ACCESS_TOKEN="你的 Gitee Access Token"
python3 scripts/release/release_sync_gitee.py --tag v0.1.2
```

如果你在 GitHub 仓库 Secrets 中配置了 `GITEE_ACCESS_TOKEN`，`.github/workflows/release.yml` 也会在 GitHub Release 发布成功后自动执行一次 Gitee 同步。

Gitee 同步脚本会同时维护两套 Release：

- 真实版本号 Release，例如 `v0.1.4`
- 固定的 `latest` Release，供程序稳定访问 `latest.json`

如果你只想把当前 GitHub 最新 Release 手动同步到 Gitee，不做打包，可以直接在 GitHub Actions 里运行：

- `.github/workflows/sync-gitee-release.yml`

这个 workflow 默认同步 GitHub 最新 Release，也支持在手动触发时额外填写一个指定 tag。

## 目录结构

```
transfer-genie/
├── src/                 # Rust 后端源码
│   ├── main.rs          # 应用入口与 Tauri 命令
│   ├── db.rs            # SQLite 数据库操作
│   ├── types.rs         # 数据类型定义
│   ├── webdav.rs        # WebDAV 客户端
│   └── filenames.rs     # 文件名解析
├── frontend/            # 前端页面
│   ├── index.html
│   ├── main.js
│   └── styles.css
├── capabilities/        # Tauri 权限配置
├── icons/               # 应用图标
├── docs/                # 项目文档
├── openspec/            # 规格与变更提案
├── Cargo.toml           # Rust 依赖配置
├── tauri.conf.json      # Tauri 配置
└── build.rs             # 构建脚本
```



## 常见代码位置
### 关闭窗口重置
- frontend\main.js - prepareWindowForHide
