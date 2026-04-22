# Self-hosted Runner 配置指南

本文档说明如何为 transfer-genie 项目配置 GitHub Self-hosted Runner，用于加速 Gitee 同步任务。

## 为什么需要 Self-hosted Runner

GitHub Actions 默认运行在国外服务器，上传文件到国内 Gitee 速度很慢。使用国内服务器作为 Self-hosted Runner 可以显著提升同步速度。

## 前置条件

- 一台国内 Linux 服务器（推荐 Ubuntu 20.04+）
- 服务器能访问 GitHub 和 Gitee
- 已安装：`curl`、`git`、`python3`

## 配置步骤

### 1. 获取 Runner Token

1. 访问 GitHub 仓库：`https://github.com/yedsn/transfer-genie`
2. 进入 **Settings** → **Actions** → **Runners**
3. 点击 **New self-hosted runner**
4. 选择 **Linux**
5. 记下显示的 token（类似 `AAAA...` 的字符串）

### 2. 在服务器上安装 Runner

```bash
# 创建专用用户
sudo useradd -m -s /bin/bash github-runner

# 切换到该用户
sudo su - github-runner

# 创建目录并下载
mkdir transfer-genie && cd transfer-genie

# 下载 runner（国内如果下载慢，可以配置代理或使用镜像）
curl -o actions-runner-linux-x64-2.321.0.tar.gz \
  https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz

# 解压
tar xzf actions-runner-linux-x64-2.321.0.tar.gz

# 配置（替换 <YOUR_TOKEN> 为第1步获取的 token）
./config.sh --url https://github.com/yedsn/transfer-genie --token <YOUR_TOKEN> --labels transfer-genie

# 退出用户
exit
```

### 3. 安装为系统服务

```bash
cd /home/github-runner/transfer-genie

# 安装服务
sudo ./svc.sh install github-runner

# 启动服务
sudo ./svc.sh start github-runner

# 查看状态
sudo ./svc.sh status github-runner

# 设置开机自启
sudo systemctl enable actions.runner.yedsn-transfer-genie.transfer-genie.service
```

### 4. 验证

回到 GitHub 仓库的 **Settings** → **Actions** → **Runners**，应该能看到 runner 状态为 **Online**（绿色）。

## 常用命令

```bash
# 查看服务状态
sudo ./svc.sh status github-runner

# 停止服务
sudo ./svc.sh stop github-runner

# 重启服务
sudo ./svc.sh stop github-runner && sudo ./svc.sh start github-runner

# 卸载服务
sudo ./svc.sh uninstall github-runner

# 查看日志
sudo journalctl -u actions.runner.yedsn.transfer-genie.github-runner -f
```

## 更新 Runner

```bash
sudo ./svc.sh stop github-runner
cd /home/github-runner/actions-runner

# 下载最新版本
curl -o actions-runner-linux-x64-2.321.0.tar.gz \
  https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz

# 解压覆盖
tar xzf actions-runner-linux-x64-2.321.0.tar.gz

sudo ./svc.sh start github-runner
```

## 故障排查

### Runner 无法连接到 GitHub

检查服务器是否能访问 GitHub：

```bash
curl -I https://github.com
```

如果无法访问，可能需要配置代理。

### 服务启动失败

查看详细日志：

```bash
sudo journalctl -u actions.runner.yedsn.transfer-genie.github-runner -n 100
```

### 重新注册 Runner

如果 token 过期或需要重新配置：

```bash
sudo ./svc.sh stop github-runner
sudo ./svc.sh uninstall github-runner
cd /home/github-runner/actions-runner
rm -f .runner .credentials .credentials_rsaparams .service
# 重新运行 ./config.sh ...
sudo ./svc.sh install github-runner
sudo ./svc.sh start github-runner
```

## 相关文件

- Workflow 配置：`.github/workflows/sync-gitee-release.yml`
- 同步脚本：`scripts/release/release_sync_gitee.py`