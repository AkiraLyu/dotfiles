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
home_packages=(fish fontconfig chromium local)

# 按 /etc 下的相对路径登记文件；部署、比较和导出共用这份清单。
# 新增系统配置时在这里登记，文件权限直接取自源文件。
system_files=(
    environment
    pacman.conf
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
        run paru --config "$repo_dir/local/.config/paru/paru.conf" --sudo run0 -Sy --pkgbuilds
        run paru --config "$repo_dir/local/.config/paru/paru.conf" --sudo run0 \
            -S --needed kde-config chatgpt-translucent-bars
        run kde-config
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
  home              链接 fish、fontconfig、chromium 和 local 到 HOME
  kde               从远端安装 KDE 插件、主题与 ChatGPT 补丁，再应用设置
  systemd           链接用户 unit 并重读配置，不启动服务
  firefox PROFILE   链接 Firefox 配置到明确指定的已有 profile
  etc [操作] [文件…]  install：部署（默认）；diff：比较；export：实机同步回仓库
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
