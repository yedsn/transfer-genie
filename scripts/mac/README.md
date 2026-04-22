# Transfer Genie for macOS

## ⚠️ 如果打开应用提示"已损坏"

这是 macOS 的安全机制导致的，并非应用真的损坏。请按照以下步骤修复：

### 方法一：运行修复脚本（推荐）

1. 打开 **终端** (Terminal)
2. 输入以下命令并回车：
   ```bash
   cd /Volumes/Transfer\ Genie
   ./fix-quarantine.sh
   ```
3. 输入你的 Mac 登录密码（输入时不会显示）
4. 等待修复完成后，即可打开应用

### 方法二：手动命令

在终端中依次执行：

```bash
# 移除隔离属性
xattr -cr /Applications/Transfer\ Genie.app

# 重新签名
codesign --force --deep --sign - /Applications/Transfer\ Genie.app
```

### 方法三：系统设置允许

1. 打开应用被阻止后
2. 进入 **系统设置 > 隐私与安全性**
3. 在底部找到安全提示
4. 点击 **仍要打开**

---

## 正常安装步骤

1. 将 `Transfer Genie.app` 拖拽到 **应用程序** 文件夹
2. 如果提示"已损坏"，按上述方法修复
3. 从 **应用程序** 文件夹打开应用

---

## 常见问题

**Q: 为什么会出现这个问题？**

A: 因为应用没有使用 Apple 开发者证书签名。这是个人开发者的常见限制，需要支付 $99/年 加入 Apple Developer Program 才能解决。

**Q: 修复脚本安全吗？**

A: 安全。脚本只是移除了 macOS 的隔离属性并重新签名，不会修改应用任何功能。

**Q: 每次更新都需要修复吗？**

A: 是的，每次安装新版本都需要重新运行修复脚本。

---

## 技术支持

如有问题，请提交 Issue：https://github.com/yedsn/transfer-genie/issues
