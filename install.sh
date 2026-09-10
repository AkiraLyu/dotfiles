#!/usr/bin/env bash
# 新系统装好 Arch、软件源和基础工具后，再运行本脚本。
# 每次明确选择一个步骤；默认显示用法。--check 只检查或显示命令。
set -euo pipefail

# 整个脚本以目标用户运行；需要系统权限的命令会单独调用 run0。
((EUID != 0)) || { echo '请以普通用户运行本脚本。' >&2; exit 1; }

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
check_only=false
if [[ ${1:-} == --check ]]; then
    check_only=true
    shift
fi
step=${1:-help}
if (($#)); then shift; fi

# 已经整理好的 HOME 配置。以后增加同样的目录，只需修改这一行。
home_packages=(fish fontconfig chromium kde local)

# /etc 只部署已经手动核对的三个文件，不扫描目录、不接入旧启动脚本。
system_files=(environment tlp.conf udev/hwdb.d/90-swap-caps-esc.hwdb)

# 需要写入的普通命令会先显示；检查模式不会执行它们。
run() {
    printf '+ '
    printf '%q ' "$@"
    printf '\n'
    if ! $check_only; then "$@"; fi
}

# Stow 负责建立相对链接。--no-folding 保持真实目录，防止应用运行数据
# 顺着整个目录的链接写进仓库。已有不同文件会报冲突，不使用 --adopt。
stow_configs() {
    local target=$1
    shift
    local options=(--dir "$repo_dir" --target "$target" --no-folding --restow)
    if $check_only; then options+=(--simulate); fi
    stow "${options[@]}" "$@"
}

case "$step" in
    home)
        (($# == 0)) || { echo '用法：./install.sh [--check] home' >&2; exit 1; }
        stow_configs "$HOME" "${home_packages[@]}"
        ;;
    kde)
        (($# == 0)) || { echo '用法：./install.sh [--check] kde' >&2; exit 1; }
        stow_configs "$HOME" kde local
        # Kate 会在自己的 desktop 文件中添加会话 Actions，保留它的运行文件。
        # 仅首次复制模板；后续只更新主入口，让它经过启用插件的用户包装脚本。
        kate_desktop="$HOME/.local/share/applications/org.kde.kate.desktop"
        if [[ ! -e $kate_desktop ]]; then
            run install -D -m 0644 "$repo_dir/kde/org.kde.kate.desktop" "$kate_desktop"
        fi
        run desktop-file-edit --set-key=Exec \
            --set-value="\"$HOME/.local/bin/kate\" -b %U" "$kate_desktop"
        # KDE 会自行改写配置，因此 kwinrc、darklyrc 不建立链接。
        # 这两份文件只是选定设置的片段：逐个写入键，保留新系统的其他设置。
        # 格式限于单层 [分组]、键=值和整行注释；无需完整 INI 解析器。
        for file in kwinrc darklyrc; do
            group=
            while IFS= read -r line || [[ -n $line ]]; do
                case "$line" in
                    ''|\#*) continue ;;
                    \[*\]) group=${line:1:${#line}-2} ;;
                    *=*)
                        run kwriteconfig6 --file "$file" --group "$group" \
                            --key "${line%%=*}" --notify "${line#*=}"
                        ;;
                    *) printf '无法读取 %s 中的行：%s\n' "$file" "$line" >&2; exit 1 ;;
                esac
            done < "$repo_dir/kde/$file"
        done
        # 在 Plasma 会话中应用外观并通知 KWin 重读插件配置。
        run "$repo_dir/kde/.local/bin/theme" apply
        ;;
    kde-plugins)
        (($# == 0)) || { echo '用法：./install.sh [--check] kde-plugins' >&2; exit 1; }
        # 直接从 local/.local/src/ 构建两个插件，用 pacman 管理安装文件。
        # 不使用旧仓库的源码打包、摘要清单和 App Grid 构建调度。
        cd -- "$repo_dir/packages/local/dotfiles-kde-plugins"
        run makepkg --force --clean
        mapfile -t built_packages < <(makepkg --packagelist)
        # KWin 更新后的重编译可能仍用相同包版本，也必须装入新产物。
        run run0 pacman -U -- "${built_packages[@]}"
        # 此特效匹配 XWayland 微信；只设置当前用户的应用权限与 Qt 后端。
        run flatpak override --user --nosocket=wayland --socket=x11 \
            --env=QT_QPA_PLATFORM=xcb com.tencent.WeChat
        run "$repo_dir/install.sh" kde
        run python3 "$repo_dir/local/.local/src/wechat-glass-live/control.py" enable
        ;;
    systemd)
        (($# == 0)) || { echo '用法：./install.sh [--check] systemd' >&2; exit 1; }
        # 各 target 的 Wants 决定下次会话启动哪些服务；此处只重读文件。
        stow_configs "$HOME" systemd
        run systemctl --user daemon-reload
        ;;
    firefox)
        # Profile 名每台机器不同，直接使用 about:profiles 中的根目录。
        # 不猜默认 profile，也不启动浏览器或接管账户、历史和扩展数据库。
        (($# == 1)) || { echo '用法：./install.sh [--check] firefox PROFILE目录' >&2; exit 1; }
        profile=$(realpath -e -- "$1")
        [[ -f $profile/prefs.js ]] || { echo '请选择已有 Firefox profile 的根目录。' >&2; exit 1; }
        stow_configs "$profile" firefox
        ;;
    etc)
        (($# == 0)) || { echo '用法：./install.sh [--check] etc' >&2; exit 1; }
        # /etc 使用独立文件，供无法访问 HOME 的系统服务读取。
        # install -D 会创建缺少的父目录，并把旧链接替换成独立文件。
        for file in "${system_files[@]}"; do
            run run0 install -D -m 0644 "$repo_dir/etc/$file" "/etc/$file"
        done
        run run0 systemd-hwdb update
        ;;
    firmware)
        (($# == 0)) || { echo '用法：./install.sh [--check] firmware' >&2; exit 1; }
        # 将手动迁入 private/ 的 AVS 固件直接复制到内核读取的位置。
        run run0 install -D -m 0644 \
            "$repo_dir/private/firmware/intel/avs/tgl/dsp_basefw.bin" \
            /usr/lib/firmware/intel/avs/tgl/dsp_basefw.bin
        ;;
    private)
        (($# == 0)) || { echo '用法：./install.sh [--check] private' >&2; exit 1; }
        # 此文件含 Chromium/API 凭据，随 backup/ 手动迁移，不进入 Git。
        source_file="$repo_dir/backup/private/chromium.fish"
        [[ -f $source_file ]] || { echo '请先迁入 backup/private/chromium.fish。' >&2; exit 1; }
        run install -D -m 0600 "$source_file" "$HOME/.config/fish/conf.d/chromium.fish"
        ;;
    packages)
        (($# == 0)) || { echo '用法：./install.sh [--check] packages' >&2; exit 1; }
        if $check_only; then
            "$repo_dir/scripts/packages.sh" check
        else
            "$repo_dir/scripts/packages.sh" install
        fi
        ;;
    help|--help|-h)
        cat <<'USAGE'
用法：./install.sh [--check] 步骤 [参数]

  packages          按 packages/ 的当前包清单安装软件
  home              链接 fish、fontconfig、chromium、kde 和 local 到 HOME
  kde               合并 KWin 与 Darkly 设置，部署 Kate 入口并应用明暗模式
  kde-plugins       构建 Kate / WeChat 插件，经 run0 pacman 安装后应用 KDE 设置
  systemd           链接用户 unit 并重读配置，不启动服务
  firefox PROFILE   链接 Firefox 配置到明确指定的已有 profile
  etc               用 run0 复制三个已整理的 /etc 文件并更新 hwdb
  firmware          用 run0 将 private/ 中的 AVS 固件复制到 /usr/lib/firmware
  private           从手动迁移的 backup/ 复制私密 Fish 配置

导出当前包清单：./scripts/packages.sh export
先用 --check 查看；每个步骤独立运行。详细顺序见 README.md。
USAGE
        ;;
    *)
        printf '未知步骤：%s；用 ./install.sh --help 查看用法。\n' "$step" >&2
        exit 1
        ;;
esac
