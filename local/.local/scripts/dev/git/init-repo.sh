#!/usr/bin/env bash
# ==========================================================
# Git 仓库初始化脚本（双远程推送 + 参数版）
# 作者: Akira
# 用法: ./init-repo.sh <仓库名>
# ==========================================================

set -e  # 遇到错误退出

# === 检查参数 ===
if [ -z "$1" ]; then
    echo "用法: $0 <仓库名>"
    exit 1
fi

REPO_NAME="$1"

# === 配置区（根据仓库名自动替换） ===
GITHUB_USER="Akira-uestc"
GITEA_HOST="192.168.1.16:2222"
GITEA_USER="Akira"
BRANCH="main"

GITHUB_URL="git@github.com:${GITHUB_USER}/${REPO_NAME}.git"
GITEA_URL="ssh://git@${GITEA_HOST}/${GITEA_USER}/${REPO_NAME}.git"

# === 创建目录并进入 ===
if [ -d "$REPO_NAME" ]; then
    echo "⚠️ 目录 $REPO_NAME 已存在，跳过创建。"
else
    mkdir "$REPO_NAME"
    echo "📁 已创建目录: $REPO_NAME"
fi

cd "$REPO_NAME"

# === 初始化仓库 ===
if [ ! -d .git ]; then
    git init
    echo "✅ 已初始化新的 git 仓库。"
fi

# === 创建 README 并提交 ===
if [ ! -f README.md ]; then
    echo "# ${REPO_NAME}" > README.md
    git add README.md
    git commit -m "Initial commit"
fi

# === 配置默认分支 ===
git branch -M "$BRANCH"

# === 设置远程 ===
if git remote | grep -q '^origin$'; then
    echo "⚙️ 已存在 origin，更新远程 URL..."
    git remote set-url origin "$GITHUB_URL"
else
    echo "🔗 添加远程 origin..."
    git remote add origin "$GITHUB_URL"
fi

# === 添加双推送 URL ===
git remote set-url --add --push origin "$GITHUB_URL"
git remote set-url --add --push origin "$GITEA_URL"

# === 显示结果 ===
echo
echo "=== ✅ 当前远程配置 ==="
git remote -v
echo
echo "🎯 现在可以执行以下命令进行双推送："
echo "    git push origin $BRANCH"
echo
echo "（Git 将自动推送到：）"
echo "  1. $GITHUB_URL"
echo "  2. $GITEA_URL"
echo
echo "✨ 仓库初始化完成！"
