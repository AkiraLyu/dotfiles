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

# 明确列出默认部署包；Firefox、用户服务和桌面配置由独立步骤管理。
# 不遍历目录，避免把保留的 Niri 配置自动部署到 HOME。
user_packages=(chromium fish fontconfig foxvault kitty local mpv paru wireplumber yazi yt-dlp zathura)
dev_packages=(clang-format code git nvim scripts)

# 按 /etc 下的相对路径登记文件；部署、比较和导出共用这份清单。
# 新增系统配置时在这里登记，文件权限直接取自源文件。
system_files=(
    environment
    pacman.conf
    opt/chrome/policies/managed/webrtc.json
    makepkg.conf.d/90-local.conf
    tlp.conf
    security/limits.d/90-memlock.conf
    modprobe.d/sound.conf
    cmdline.d/root.conf
    mkinitcpio.conf
    mkinitcpio.d/linux.preset
    initcpio/install/block
    udev/hwdb.d/90-swap-caps-esc.hwdb
)

# 需要写入的普通命令会先显示；检查模式不会执行它们。
run() {
    printf '+ '
    printf '%q ' "$@"
    printf '\n'
    if ! $check_only; then "$@"; fi
}

# --no-folding 不会展开源包中的目录符号链接，部署前必须单独排除。
# .local/share 及其子目录只使用真实目录，符号链接只能指向普通文件。
check_share_sources() {
    local group=$1 package directory share invalid_link
    shift
    for package in "$@"; do
        share="$repo_dir/$group/$package/.local/share"
        for directory in "${share%/share}" "$share"; do
            if [[ -L $directory || ( -e $directory && ! -d $directory ) ]]; then
                printf '部署源必须是真实目录：%s\n' "$directory" >&2
                return 1
            fi
        done
        [[ -d $share ]] || continue
        invalid_link=$(find "$share" -type l ! -xtype f -print -quit) || return 1
        if [[ -n $invalid_link ]]; then
            printf '.local/share 下的源符号链接必须指向普通文件：%s\n' "$invalid_link" >&2
            return 1
        fi
    done
}

# Stow 逐文件建立相对链接；--restow 配合 --no-folding 将已有的
# Stow 目录链接展开成真实目录。已有不同文件会报冲突，不使用 --adopt。
stow_configs() {
    local group=$1 target=$2
    shift 2
    check_share_sources "$group" "$@"
    local options=(
        --dir "$repo_dir/$group" --target "$target" --no-folding --restow
        '--ignore=(^|/)(fish_history|fish_variables|lazy-lock\.json|__pycache__)(/.*)?'
        '--ignore=(^|/)\.config/fish/conf\.d/chromium\.fish'
    )
    if $check_only; then options+=(--simulate); fi
    stow "${options[@]}" "$@"
}

case "$step" in
    user|dev)
        if [[ $step == user ]]; then
            selected_packages=("${user_packages[@]}")
        else
            selected_packages=("${dev_packages[@]}")
        fi
        # 可按包名选择子集；先检查全部参数，再执行任何链接操作。
        for package in "$@"; do
            known=false
            for managed in "${selected_packages[@]}"; do
                if [[ $package == "$managed" ]]; then known=true; break; fi
            done
            $known || { printf '不支持的 %s 配置包：%s\n' "$step" "$package" >&2; exit 1; }
        done
        if (($#)); then selected_packages=("$@"); fi
        stow_configs "$step" "$HOME" "${selected_packages[@]}"
        ;;
    de-wm)
        [[ $# == 1 && $1 == kde ]] || {
            echo '用法：./install.sh [--check] de-wm kde；Niri 配置仅保留，不部署。' >&2
            exit 1
        }
        stow_configs de-wm "$HOME" kde
        ;;
    kde)
        (($# == 0)) || { echo '用法：./install.sh [--check] kde' >&2; exit 1; }
        stow_configs de-wm "$HOME" kde
        run env PARU_CONF="$repo_dir/user/paru/.config/paru/paru.conf" paru --sudo run0 -Sy --pkgbuilds
        run env PARU_CONF="$repo_dir/user/paru/.config/paru/paru.conf" paru --sudo run0 \
            -S --needed kde-config chatgpt-translucent-bars kde-mimeapps-export
        run kde-config
        ;;
    systemd)
        (($# == 0)) || { echo '用法：./install.sh [--check] systemd' >&2; exit 1; }
        # 各 target 的 Wants 决定下次会话启动哪些服务；此处只重读文件。
        stow_configs user "$HOME" systemd
        run systemctl --user daemon-reload
        ;;
    firefox)
        # Profile 名每台机器不同，直接使用 about:profiles 中的根目录。
        # 不猜默认 profile，也不启动浏览器或接管账户、历史和扩展数据库。
        (($# == 1)) || { echo '用法：./install.sh [--check] firefox PROFILE目录' >&2; exit 1; }
        profile=$(realpath -e -- "$1")
        [[ -f $profile/prefs.js ]] || { echo '请选择已有 Firefox profile 的根目录。' >&2; exit 1; }
        stow_configs user "$profile" firefox
        ;;
    etc)
        action=${1:-install}
        if (($#)); then shift; fi
        case "$action" in
            install|diff|export) ;;
            *) echo '用法：./install.sh [--check] etc [install|diff|export] [相对文件路径…]' >&2; exit 1 ;;
        esac

        # 可以只处理指定文件，例如 etc export pacman.conf；省略时处理全部。
        # 先核对所有参数，避免拼错路径后只执行了半批操作。
        for file in "$@"; do
            known=false
            for managed in "${system_files[@]}"; do
                if [[ $file == "$managed" ]]; then known=true; break; fi
            done
            $known || { printf '未纳入管理的 /etc 文件：%s\n' "$file" >&2; exit 1; }
        done
        if (($#)); then system_files=("$@"); fi

        refresh_hwdb=false
        for file in "${system_files[@]}"; do
            repo_file="$repo_dir/etc/$file"
            system_file="/etc/$file"
            if [[ $action == install ]]; then
                case "$file" in
                    environment|makepkg.conf.d/90-local.conf)
                        # 保留现有的环境变量链接；编译参数也在 HOME 挂载后读取。
                        # 只链接文件，父目录仍由系统维护。
                        run run0 mkdir -p -- "$(dirname -- "$system_file")"
                        run run0 ln -sfnrT -- "$repo_file" "$system_file"
                        ;;
                    *)
                        # 引导、包管理、PAM 限制和 udev 使用独立文件。
                        # TLP 设置了 ProtectHome=yes，也不能读取 HOME 内的链接。
                        run run0 install -D -m "$(stat -Lc '%a' "$repo_file")" "$repo_file" "$system_file"
                        ;;
                esac
                if [[ $file == udev/hwdb.d/90-swap-caps-esc.hwdb ]]; then refresh_hwdb=true; fi
                continue
            fi

            # 尚未部署的配置留在仓库；已链接的文件本来就是同一份，无需导出。
            if [[ ! -e $system_file ]]; then
                printf '尚未部署，保留仓库文件：%s\n' "$file"
                continue
            fi
            if [[ $repo_file -ef $system_file ]]; then
                printf '已链接到仓库：%s\n' "$file"
                continue
            fi
            if [[ $action == diff ]]; then
                # diff 返回 1 仅表示内容不同；读取错误仍应使脚本失败。
                diff -u --label "仓库/etc/$file" --label "/etc/$file" \
                    "$repo_file" "$system_file" || test $? -eq 1
                repo_mode=$(stat -Lc '%a' "$repo_file")
                system_mode=$(stat -Lc '%a' "$system_file")
                if [[ $repo_mode != "$system_mode" ]]; then
                    printf '%s 权限不同：仓库 %s，实机 %s\n' "$file" "$repo_mode" "$system_mode"
                fi
            else
                # 导出只写仓库，以当前用户身份复制，避免产生 root 所有的文件。
                run install -D -m "$(stat -Lc '%a' "$system_file")" "$system_file" "$repo_file"
            fi
        done
        if $refresh_hwdb; then run run0 systemd-hwdb update; fi
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
  user [包…]        链接 user/ 的日常配置；省略包名时部署默认清单
  dev [包…]         链接 dev/ 的开发配置；省略包名时部署默认清单
  de-wm kde         只链接 de-wm/kde/ 的本地桌面配置
  kde               链接本地 KDE 配置，安装远端组件，再应用设置
  systemd           链接 user/systemd/ 的用户 unit 并重读配置，不启动服务
  firefox PROFILE   链接 Firefox 配置到明确指定的已有 profile
  etc [操作] [文件…]  install：部署（默认）；diff：比较；export：实机同步回仓库
  firmware          用 run0 将 private/ 中的 AVS 固件复制到 /usr/lib/firmware
  private           从手动迁移的 backup/ 复制私密 Fish 配置

导出当前包清单：./scripts/packages.sh export
Niri 配置保留在 de-wm/niri/，不参与任何安装步骤。
先用 --check 查看；每个步骤独立运行。详细顺序见 README.md。
USAGE
        ;;
    *)
        printf '未知步骤：%s；用 ./install.sh --help 查看用法。\n' "$step" >&2
        exit 1
        ;;
esac
