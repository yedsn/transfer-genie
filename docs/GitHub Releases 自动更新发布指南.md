# GitHub Releases 自动更新发布指南

本文档是 `docs/自动更新方案.md` 的落地版操作清单，专门说明 Transfer Genie 如何把更新信息和更新包发布到 GitHub Releases，供当前已经接入的 Tauri 自动更新能力使用。

## 1. 适用范围

当前项目已经完成了应用内自动更新接入，包含以下能力：

- 设置页可保存 `自动更新` 开关
- 主窗口显示后会在后台静默检查更新
- 发现新版本后会弹框确认是否安装
- 前端通过 Rust command 调用 updater，避免前端直接操作插件

当前还需要你补齐的是发布侧配置，也就是：

- 真实的 GitHub 仓库地址
- updater 公钥
- 每个版本的 GitHub Release 资产
- `latest.json` 更新元数据

## 2. 当前项目里已经预留的位置

当前仓库已经在 `tauri.conf.json` 中接好了 updater 公钥，并预留了 `Gitee -> GitHub Releases` 双更新源，结构如下：

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "当前项目的 minisign updater 公钥",
      "endpoints": [
        "https://gitee.com/hongxiaojian/transfer-genie/releases/latest/download/latest.json",
        "https://github.com/yedsn/transfer-genie/releases/latest/download/latest.json"
      ],
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

这意味着应用内自动更新现在已经具备检查配置，后续真正发版时你只需要保证：

- Gitee Release 中真的上传了 `latest.json`
- GitHub Release 中真的上传了 `latest.json`
- 发布产物由与当前公钥匹配的私钥签名

如果私钥和这里的公钥不匹配，客户端会在下载后验签失败。

说明：

- 当前配置把 Gitee 放在第一个 endpoint，GitHub 放在第二个 endpoint
- Tauri Updater 只有在前一个 endpoint 返回非 `2xx` 时才会尝试下一个
- 所以只有当 Gitee 上的 `latest.json` 不存在、返回 `404` 或服务异常时，才会回退到 GitHub
- 如果 Gitee 仓库尚未创建或未发布对应资产，客户端会自动继续尝试 GitHub

## 3. 一次性准备

### 3.1 准备 GitHub 仓库

建议使用公开仓库，并开启 Releases。

推荐结构：

- Gitee 仓库：`https://gitee.com/hongxiaojian/transfer-genie`
- GitHub 仓库：`https://github.com/yedsn/transfer-genie`
- 最新版本元数据地址：

```text
https://gitee.com/hongxiaojian/transfer-genie/releases/latest/download/latest.json
https://github.com/yedsn/transfer-genie/releases/latest/download/latest.json
```

推荐实践：

- 国内优先访问 Gitee
- GitHub 作为备用源
- 两边的 `latest.json`、安装包和 `.sig` 必须来自同一批构建产物

注意：

- Gitee 社区版 Release 附件有配额和大小限制，较大的安装包可能放不下
- 如果后续 Windows / macOS 产物超出限制，更建议把主源切到对象存储或自有静态服务，再保留 GitHub 作为备用源

当前第二个备用地址仍然是：

```text
https://github.com/yedsn/transfer-genie/releases/latest/download/latest.json
```

第一版不建议使用私有仓库，因为自动更新下载会涉及鉴权，客户端处理会更复杂。

### 3.2 生成 updater 签名密钥

Tauri updater 依赖签名校验，必须先生成一对密钥。

建议先升级本机 Tauri CLI 到 `2.10.1` 或更高版本后再生成密钥。

原因：Tauri 官方在 `tauri-cli 2.10.1` 发布说明里明确提到，`2.9.3` 到 `2.10.0` 之间生成的“空密码” updater 私钥有问题，需要重新生成。当前本机环境是 `tauri-cli 2.9.6`，正好落在这个区间内。

生成命令：

```bash
cargo tauri signer generate -w ~/.tauri/transfer-genie-updater.key
```

执行后会得到：

- 私钥文件：例如 `~/.tauri/transfer-genie-updater.key`
- 公钥内容：命令行里会输出一段可公开保存的公钥文本

建议：

- 私钥只保存在你自己的安全机器或 CI Secret 中
- 公钥写入 `tauri.conf.json`
- 不要把私钥提交进仓库

### 3.3 回填 `tauri.conf.json`

把上一步输出的公钥内容直接填到 `tauri.conf.json` 的 `plugins.updater.pubkey`。

同时把 endpoint 改成你的真实仓库：

```json
{
  "plugins": {
    "updater": {
      "pubkey": "-----BEGIN PUBLIC KEY-----...-----END PUBLIC KEY-----",
      "endpoints": [
        "https://gitee.com/hongxiaojian/transfer-genie/releases/latest/download/latest.json",
        "https://github.com/yedsn/transfer-genie/releases/latest/download/latest.json"
      ]
    }
  }
}
```

注意：

- `pubkey` 必须是公钥内容本身，不是文件路径
- `endpoints` 必须使用 HTTPS
- Gitee / GitHub Release 中必须真的存在 `latest.json`

### 3.4 平台产物补充说明

当前 `tauri.conf.json` 的 `bundle.targets` 是：

```json
["app", "dmg"]
```

这对 macOS 手动分发是够的，但如果你后续要支持 Windows 自动更新，还需要在 Windows 构建时产出 installer 类型包，例如：

- `nsis`
- 或 `msi`

原因是 Tauri 官方 updater 在 Windows 上依赖安装包产物，而不是单独一个裸 `exe`。

如果你当前只准备先做 macOS 自动更新，可以先沿用现在的配置。

### 3.5 GitHub Actions 自动发布工作流

仓库里已经补了一版初始工作流：

- `.github/workflows/release.yml`
- `scripts/release_github.sh`

当前工作流默认支持：

- 推送 `v*` tag 时自动发布
- 在 GitHub Actions 页面手动触发 `workflow_dispatch`
- 自动创建或更新对应版本的 GitHub Release
- 自动上传 updater 产物与 `latest.json`
- 可通过 `scripts/sync_gitee_release.py` 把同一版 Release 资产同步到 Gitee

当前矩阵包含：

- `macos-latest` + `aarch64-apple-darwin`
- `macos-latest` + `x86_64-apple-darwin`
- `windows-latest` + `nsis`

说明：

- macOS 两个目标用于覆盖 Apple Silicon 和 Intel Mac
- Windows 当前使用 `nsis` installer，以匹配 updater 对安装包产物的要求
- 工作流会在真正构建前检查 `tauri.conf.json` 是否仍保留占位公钥和占位仓库地址
- 发版脚本会先更新版本号、创建提交和 tag，再按需推送到 `github` 远端

### 3.6 需要配置的 GitHub Secrets

在仓库 `Settings -> Secrets and variables -> Actions` 中，至少配置：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

说明：

- `TAURI_SIGNING_PRIVATE_KEY` 可以直接保存私钥内容，Tauri 官方文档允许这里传“文件路径或私钥内容本身”
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 建议始终使用非空密码
- 工作流使用内置的 `GITHUB_TOKEN` 创建 Release 并上传资产，不需要你额外配置

推荐做法：

- 本地用 `cargo tauri signer generate` 生成一把带密码的 updater 私钥
- 公钥写入 `tauri.conf.json`
- 私钥内容和密码分别写入 GitHub Secrets

## 4. 每次发版的操作流程

下面是推荐的最小手工发布流程。

如果你准备直接用仓库里的 GitHub Actions 工作流发版，推荐优先使用发版脚本：

```bash
scripts/release_github.sh 0.1.1 --push
```

脚本默认会：

- 更新 `Cargo.toml` 和 `tauri.conf.json` 里的版本号
- 创建 `release: v0.1.1` 提交
- 创建 `v0.1.1` tag
- 推送当前分支和 tag 到 `github` 远端

如果你不传版本号，脚本会读取当前 `Cargo.toml` 里的版本，并提示你选择版本类型：

- `patch`：补丁版本加一
- `minor`：次版本加一并重置补丁号
- `major`：主版本加一并重置次版本和补丁号
- `custom`：手动输入版本号

这样会触发 `.github/workflows/release.yml`，由 GitHub 自动创建 Release 并上传资产。

如果你只想先本地创建提交和 tag，不立刻推送，也可以：

```bash
scripts/release_github.sh 0.1.1
```

查看帮助：

```bash
scripts/release_github.sh --help
```

如果 GitHub Release 已经成功发布，再执行下面这个同步脚本，就可以把同一版资产同步到 Gitee：

```bash
export GITEE_ACCESS_TOKEN="你的 Gitee Access Token"
python3 scripts/sync_gitee_release.py --tag v0.1.1
```

这个脚本会：

- 从 GitHub Release 拉取指定 tag 的元数据和附件
- 在 Gitee 仓库里查找同 tag 的 Release，没有则自动创建
- 删除 Gitee 上同名旧附件后重新上传
- 把 `latest.json`、安装包和 `.sig` 一并同步过去

查看帮助：

```bash
python3 scripts/sync_gitee_release.py --help
```

### 4.1 更新应用版本号

先修改 `Cargo.toml` 中的版本，例如：

```toml
version = "0.1.1"
```

建议 Git tag 与 Release tag 使用相同版本号，例如：

```text
v0.1.1
```

### 4.2 配置签名环境变量

Tauri 官方 updater 文档要求在构建时通过环境变量提供私钥；`.env` 文件不生效。

macOS / Linux：

```bash
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/transfer-genie-updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="你的私钥密码"
```

如果你的私钥没有设置密码，第二行可以留空字符串，但前提是你生成密钥时没有踩到上面提到的旧版 CLI 问题。

### 4.3 构建发布产物

在项目根目录执行：

```bash
cargo tauri build
```

Tauri 官方文档说明，`createUpdaterArtifacts: true` 时会自动生成 updater 所需产物和签名。

当前项目重点关注以下目录：

- `target/release/bundle/macos/`
- `target/release/bundle/dmg/`

常见需要上传的自动更新资产通常是：

- `Transfer Genie.app.tar.gz`
- `Transfer Genie.app.tar.gz.sig`
- 供手动下载的 `.dmg`

说明：

- `.dmg` 适合给用户手动下载安装
- `.app.tar.gz` 才是 macOS updater 使用的更新包
- `.sig` 文件必须和本次构建出来的更新包严格匹配

如果后续支持 Windows，则额外上传：

- Windows installer 产物
- 对应 `.sig`

### 4.4 生成 `latest.json`

你需要在每次发版时生成一个 `latest.json`，并把它一起上传到 GitHub Release。

示例：

```json
{
  "version": "v0.1.1",
  "notes": "修复自动刷新与设置保存问题，增加自动更新能力。",
  "pub_date": "2026-04-20T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "这里填写 .sig 文件内容本身，不是链接",
      "url": "https://github.com/yedsn/transfer-genie/releases/download/v0.1.1/Transfer%20Genie.app.tar.gz"
    }
  }
}
```

关键要求：

- `version` 必须是合法 SemVer，可带 `v`
- `pub_date` 必须是 RFC 3339 格式
- `platforms` 的 key 默认是 `OS-ARCH`
- `signature` 必须是 `.sig` 文件内容本身，不是 `.sig` 下载地址
- `url` 必须指向实际可下载的 Release asset

如果以后同时支持 Intel Mac，可以再补：

- `darwin-x86_64`

如果以后支持 Windows，可以再补：

- `windows-x86_64`

注意：Tauri 会先校验整个 `latest.json`，再判断当前平台是否有更新。所以文件里出现的每个平台条目都必须完整有效。

### 4.5 创建 GitHub Release 并上传资产

每个版本的 Release 建议至少上传：

- 自动更新用的 `latest.json`
- 自动更新用的 `.app.tar.gz`
- 自动更新用的 `.app.tar.gz.sig`
- 手动下载用的 `.dmg`

推荐 Release tag：

```text
v0.1.1
```

推荐 Release 标题：

```text
Transfer Genie v0.1.1
```

上传完成后，理论上这条地址应能直接访问：

```text
https://github.com/yedsn/transfer-genie/releases/latest/download/latest.json
```

如果这条地址打不开，应用内自动更新就不会成功。

## 5. 发版后的验收

每次新版本发布后，建议至少做一次手工验收：

1. 打开旧版本应用
2. 在设置里勾选 `自动更新`
3. 显示主窗口并等待几秒
4. 确认应用会静默检查更新
5. 确认发现新版本后会弹出确认框
6. 确认点击更新后能够下载、安装，并提示重启

也建议额外验证：

- 手动点击 `检查更新` 按钮
- `latest.json` 中的版本号和 Release tag 是否一致
- `.sig` 是否来自同一次构建
- 下载链接是否都能匿名访问

## 6. 常见问题

### 6.1 为什么已经上传了 `.dmg`，但更新还是失败？

因为 macOS 自动更新真正使用的是 `.app.tar.gz` 更新包，而不是仅靠 `.dmg`。

### 6.2 为什么 `signature` 不能写 `.sig` 文件链接？

因为 Tauri 官方静态 JSON 格式要求 `signature` 字段直接写入签名内容本身。

### 6.3 为什么我改了 `latest.json` 但应用还是没更新？

优先检查：

- `version` 是否真的比当前版本高
- GitHub `latest` 是否指向你刚发布的 Release
- `latest.json` 是否是合法 JSON
- `url` 和 `signature` 是否匹配本次构建产物

### 6.4 私钥放哪里最合适？

推荐两种方式：

- 本地手工发版时，放在当前开发机的安全目录
- CI 自动发版时，放到 GitHub Actions Secret

不要：

- 提交到仓库
- 发给其他人
- 放进公开文档

## 7. 推荐的下一步

当前最实用的下一步是：

- 先完成一版手工 GitHub Release 发布
- 用真实仓库地址和公钥替换 `tauri.conf.json` 占位值
- 用一个测试版本验证完整更新链路
- 验证通过后，再把这套流程收敛到 GitHub Actions

如果你愿意，我下一步可以继续直接帮你补第 2 步：把这个项目的 GitHub Releases 自动发布工作流也起一个初版。
