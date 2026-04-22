#!/bin/bash

# Transfer Genie 修复脚本
# 用于解决 macOS 提示"应用已损坏"的问题

set -e

APP_NAME="Transfer Genie"
APP_DIR="/Applications"
APP_PATH="$APP_DIR/$APP_NAME.app"

echo "========================================"
echo "Transfer Genie 修复脚本"
echo "========================================"
echo ""

# 检查应用是否存在
if [ ! -d "$APP_PATH" ]; then
    echo "❌ 错误：在 $APP_PATH 未找到应用"
    echo ""
    echo "请先将 Transfer Genie.app 拖拽到 /Applications 文件夹"
    exit 1
fi

echo "📍 找到应用：$APP_PATH"
echo ""

# 步骤 1: 移除隔离属性
echo "🔧 步骤 1/2: 移除 quarantine 属性..."
xattr -cr "$APP_PATH" 2>/dev/null || {
    echo "⚠️  移除隔离属性失败，可能需要输入密码"
    sudo xattr -cr "$APP_PATH"
}
echo "✅ 完成"
echo ""

# 步骤 2: 重新签名
echo "🔧 步骤 2/2: 重新签名应用..."
codesign --force --deep --sign - "$APP_PATH" 2>/dev/null || {
    echo "⚠️  重新签名失败，可能需要输入密码"
    sudo codesign --force --deep --sign - "$APP_PATH"
}
echo "✅ 完成"
echo ""

echo "========================================"
echo "✅ 修复完成！"
echo "========================================"
echo ""
echo "现在可以打开 Transfer Genie 应用了"
echo ""
echo "如果仍然无法打开，请尝试："
echo "1. 完全退出应用（Cmd+Q）"
echo "2. 从 系统设置 > 隐私与安全性 中允许打开"
echo ""
