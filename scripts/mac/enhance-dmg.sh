#!/bin/bash

# 构建脚本：在 DMG 中包含修复脚本
# 在 GitHub Actions 中运行，直接修改原 DMG

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DMG_DIR="$PROJECT_ROOT/target/release/bundle/dmg"
FIX_SCRIPT="$PROJECT_ROOT/scripts/mac/fix-quarantine.sh"
README_FILE="$PROJECT_ROOT/scripts/mac/README.md"

echo "========================================"
echo "Transfer Genie DMG 增强脚本"
echo "========================================"
echo ""

# 查找 DMG 文件
echo "🔍 查找 DMG 文件..."
DMG_FILE=$(find "$DMG_DIR" -name "*.dmg" -type f | head -1)

if [ -z "$DMG_FILE" ]; then
    echo "❌ 未找到 DMG 文件"
    exit 1
fi

echo "📦 找到 DMG: $DMG_FILE"
echo ""

# 创建临时目录
TEMP_DIR=$(mktemp -d)
echo "🔧 创建临时目录：$TEMP_DIR"

# 挂载 DMG
echo "📀 挂载 DMG..."
hdiutil attach "$DMG_FILE" -mountpoint "$TEMP_DIR/mount" -nobrowse -quiet || {
    echo "❌ 挂载 DMG 失败"
    rm -rf "$TEMP_DIR"
    exit 1
}

# 复制修复脚本
echo "📋 复制修复脚本和说明..."
cp "$FIX_SCRIPT" "$TEMP_DIR/mount/"
cp "$README_FILE" "$TEMP_DIR/mount/"

# 重新创建 DMG
echo "💿 重新创建 DMG..."
NEW_DMG="${DMG_FILE%.dmg}.fixed.dmg"
hdiutil create "$NEW_DMG" \
    -volname "Transfer Genie" \
    -srcfolder "$TEMP_DIR/mount" \
    -ov \
    -format UDZO \
    -quiet

# 替换原 DMG
echo "🔄 替换原 DMG..."
mv "$NEW_DMG" "$DMG_FILE"

# 卸载
echo "📤 卸载 DMG..."
hdiutil detach "$TEMP_DIR/mount" -quiet

# 清理
rm -rf "$TEMP_DIR"

echo ""
echo "========================================"
echo "✅ DMG 增强完成！"
echo "========================================"
echo ""
echo "修复后的 DMG: $DMG_FILE"
echo ""

# 等待 DMG 构建完成
echo "🔍 查找 DMG 文件..."
DMG_FILE=$(find "$DMG_DIR" -name "*.dmg" -type f | head -1)

if [ -z "$DMG_FILE" ]; then
    echo "❌ 未找到 DMG 文件"
    echo "请先运行：cargo tauri build"
    exit 1
fi

echo "📦 找到 DMG: $DMG_FILE"
echo ""

# 创建临时目录
TEMP_DIR=$(mktemp -d)
echo "🔧 创建临时目录：$TEMP_DIR"

# 挂载 DMG
echo "📀 挂载 DMG..."
hdiutil attach "$DMG_FILE" -mountpoint "$TEMP_DIR/mount" -nobrowse -quiet || {
    echo "❌ 挂载 DMG 失败"
    rm -rf "$TEMP_DIR"
    exit 1
}

# 复制修复脚本
echo "📋 复制修复脚本..."
cp "$FIX_SCRIPT" "$TEMP_DIR/mount/"
if [ -f "$README_FILE" ]; then
    cp "$README_FILE" "$TEMP_DIR/mount/"
fi

# 重新创建 DMG
echo "💿 重新创建 DMG..."
NEW_DMG="${DMG_FILE%.dmg}.fixed.dmg"
hdiutil create "$NEW_DMG" \
    -volname "Transfer Genie" \
    -srcfolder "$TEMP_DIR/mount" \
    -ov \
    -format UDZO \
    -quiet

# 替换原 DMG
echo "🔄 替换原 DMG..."
mv "$NEW_DMG" "$DMG_FILE"

# 卸载
echo "📤 卸载 DMG..."
hdiutil detach "$TEMP_DIR/mount" -quiet

# 清理
rm -rf "$TEMP_DIR"

echo ""
echo "========================================"
echo "✅ DMG 增强完成！"
echo "========================================"
echo ""
echo "修复后的 DMG 已保存为：$DMG_FILE"
echo ""
echo "用户打开 DMG 后将看到："
echo "  - Transfer Genie.app"
echo "  - fix-quarantine.sh (修复脚本)"
echo "  - README.md (使用说明)"
echo ""
