#!/bin/bash

# 自动找出 Firefox 的默认 profile 目录
profile_dir=$(find ~/.config/mozilla/firefox -maxdepth 1 -type d -name "*.default-release" | head -n 1)

if [ -z "$profile_dir" ]; then
    echo "未找到 Firefox profile 目录"
    exit 1
fi

stow -d ~/dotfiles -t "$profile_dir" firefox
