#!/bin/bash

set -e

DOTFILES_DIR="$HOME/dotfiles"

declare -A TARGET_PATHS=(
    ["etc"]="/etc"
)

cd "$DOTFILES_DIR" || {
    echo "找不到目录 $DOTFILES_DIR"
    exit 1
}

for dir in */; do
    dir=${dir%/}

    [[ "$dir" == ".git" || "$dir" == "README.md" || "$dir" == ".gitignore" || "$dir" == "install.sh" || "$dir" == "firefox" || "$dir" == "pkgs"]] && continue

    target=${TARGET_PATHS[$dir]:-$HOME}

    echo "正在 stow $dir → $target"

    if [[ "$target" == "/etc" ]]; then
        sudo stow -t "$target" "$dir"
    else
        stow -t "$target" "$dir"
    fi
done

$HOME/.local/scripts/firefox.sh

echo "所有 dotfiles 已成功部署"
