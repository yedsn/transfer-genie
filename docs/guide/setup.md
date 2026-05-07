# 开发环境

本文档用于在本项目本地开发与运行 Tauri 应用。

## 1. 安装 Rust

### Windows

- 推荐使用 `winget install Rustlang.Rustup`
- 或前往 <https://rustup.rs>
- 安装完成后重新打开终端，并确认：`cargo --version`

### macOS

执行：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

安装完成后重新打开终端，并确认：`cargo --version`

## 2. 安装 Tauri CLI

```bash
cargo install tauri-cli --locked
```

## 3. 系统依赖

### Windows

- 安装 Visual Studio 2022 Build Tools
- 选择 `Desktop development with C++`
- 安装 WebView2 Runtime（Windows 11 通常已自带）

### macOS

```bash
xcode-select --install
```

## 4. 启动项目

```bash
cargo tauri dev
```

## 5. 打包发布

```bash
cargo tauri build
```

默认产物位于 `target/release/bundle/`。

## 6. 常见问题

- **提示找不到 cargo**：Rust 工具链未安装或终端未重启
- **构建失败（Windows）**：检查 VS Build Tools 是否完整安装
- **无法启动窗口**：确认 WebView2 Runtime 是否可用
- **构建缓存异常**：尝试 `cargo clean` 后重新构建
