# 开发环境安装说明（Windows / macOS）

本文档用于在本项目本地开发与运行 Tauri 应用。

## 1. 安装 Rust（含 cargo）

### Windows
- 推荐使用 winget：
  - `winget install Rustlang.Rustup`
- 或使用官方安装器：
  - https://rustup.rs
- 安装完成后重开终端并确认：
  - `cargo --version`

### macOS
- 运行：
  - `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- 安装完成后重开终端并确认：
  - `cargo --version`

## 2. 安装 Tauri CLI

- 安装命令：
  - `cargo install tauri-cli --locked`

## 3. 系统依赖

### Windows
- 安装 Visual Studio 2022 Build Tools
  - 组件：`Desktop development with C++`
- WebView2 Runtime
  - Windows 11 默认自带
  - 若缺失可安装：`winget install Microsoft.EdgeWebView2Runtime`

### macOS
- 安装 Xcode（含命令行工具）
  - `xcode-select --install`

## 4. 启动项目

### Windows

在项目根目录运行：

```
cargo tauri dev --manifest-path src-tauri/Cargo.toml
```

### macOS

在项目根目录运行：

```
cargo tauri dev --manifest-path src-tauri/Cargo.toml
```

如果提示找不到 `tauri` 命令，请先执行 `cargo install tauri-cli --locked`，并重开终端。

## 5. 常见问题

- **提示找不到 cargo**：Rust 工具链未安装或终端未重启。
- **构建失败（Windows）**：检查 VS Build Tools 是否安装并勾选 C++ 桌面开发组件。
- **无法启动窗口**：确认 WebView2 Runtime 是否可用。