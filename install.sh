#!/bin/bash

set -Eeuo pipefail

DOTFILES_DIR=$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")

# Software/data management stays separate from Stow and its host-specific stages.
case ${1:-} in
    --arch-install|--arch-mount|--arch-post-install|--user-targets)
        action=${1#--}
        shift
        command -v python3 >/dev/null || { printf '此阶段需要 python（Arch ISO 上先准备 python）。\n' >&2; exit 1; }
        if [[ $action == user-targets ]]; then
            exec python3 -B "$DOTFILES_DIR/scripts/user-targets.py" "$@"
        fi
        exec python3 -B "$DOTFILES_DIR/scripts/arch_install.py" "$action" "$@"
        ;;
    --export|--restore)
        action=${1#--}
        shift
        command -v python3 >/dev/null || { printf '请先安装 python，或运行 --bootstrap。\n' >&2; exit 1; }
        exec python3 -B "$DOTFILES_DIR/scripts/manage.py" "$action" "$@"
        ;;
    --bootstrap)
        (($# == 1)) || { printf '%s\n' '--bootstrap 必须单独使用。' >&2; exit 1; }
        ((EUID != 0)) || { printf '请以目标普通用户运行。\n' >&2; exit 1; }
        exec run0 pacman -Syu --needed base-devel git stow python rustup npm flatpak
        ;;
esac

# backup and new top-level directories are never implicitly deployed.
HOME_STOW_PACKAGES=(fontconfig fish kitty chromium tools qt-plasma local nvim niri)
ALL_PACKAGES=("${HOME_STOW_PACKAGES[@]}" etc firefox systemd)

usage() {
    cat <<'EOF'
用法: ./install.sh [选项] [配置包 ...]

  --plan                 显示完整复现顺序，不修改文件
  --arch-install         从 Arch ISO 安装系统；默认只读，详见 docs/ARCH_INSTALL.md
  --arch-mount           打开并挂载已有系统，统一使用 /efi
  --arch-post-install    对已挂载的新系统生成启动配置和 UKI
  --user-targets         校验、部署用户 target/units 并 daemon-reload；先用 --restore npm 安装 ocx
                         可追加 --check
  --bootstrap            用已配置的软件源安装基础工具（含完整系统升级）
  --export STAGE ...      导出 pacman/rust/cargo/flatpak/codex/private/noctalia/kde 或 all
  --restore STAGE ...     恢复 firmware/pacman/pkgbuilds/rust/cargo/npm/flatpak/codex/private/kde/kde-plugins/diary 或 all
                         可追加 --check；详见 RESTORE.md
  --check, --dry-run      只检查所选配置包，不部署、不提权
  --all                  选择全部配置包，包括 etc、firefox 和 systemd
  --target DIR           用户配置目标，默认为当前 HOME；目录必须已存在
  --firefox-profile DIR   显式选择已存在的 Firefox profile
  --help, -h             显示帮助

默认包: fontconfig fish kitty chromium tools qt-plasma local nvim niri
其他包: etc firefox systemd（含服务启用链接，需显式选择）

示例:
  ./install.sh --check
  ./install.sh fish kitty
  ./install.sh --check firefox
  ./install.sh firefox --firefox-profile /path/to/profile
  ./install.sh --check --all

所有所选目标通过冲突检查后才开始部署。包的执行顺序固定为：
用户配置 → etc → Firefox → systemd，与参数排列顺序无关。
软件和私有数据使用 --restore 阶段；本配置操作不验证服务运行条件。
EOF
}

die() {
    printf '错误：%s\n' "$*" >&2
    exit 1
}

check_only=false
select_all=false
target_home=${HOME:?HOME 未设置}
firefox_profile=
requested=()
argument_count=$#

while (($#)); do
    case $1 in
        --plan|--help|-h)
            ((argument_count == 1)) || die '--plan 和 --help 必须单独使用。'
            if [[ $1 == --plan ]]; then
                cat -- "$DOTFILES_DIR/RESTORE.md"
            else
                usage
            fi
            exit 0
            ;;
        --check|--dry-run) check_only=true ;;
        --all) select_all=true ;;
        --target|--firefox-profile)
            (($# >= 2)) && [[ -n $2 && $2 != --* ]] || die "$1 需要目录参数。"
            if [[ $1 == --target ]]; then
                target_home=$2
            else
                firefox_profile=$2
            fi
            shift
            ;;
        -*) die "未知选项：$1；用 --help 查看用法。" ;;
        *) requested+=("$1") ;;
    esac
    shift
done

if $select_all; then
    ((${#requested[@]} == 0)) || die '--all 不能与配置包名一起使用。'
    requested=("${ALL_PACKAGES[@]}")
elif ((${#requested[@]} == 0)); then
    requested=("${HOME_STOW_PACKAGES[@]}")
fi

declare -A selected=()
for package in "${requested[@]}"; do
    case $package in
        fontconfig|fish|kitty|chromium|tools|qt-plasma|local|nvim|niri|etc|firefox|systemd)
            selected[$package]=1
            ;;
        *) die "不在部署白名单中的配置包：$package" ;;
    esac
done
[[ -z $firefox_profile || -n ${selected[firefox]:-} ]] \
    || die '--firefox-profile 需要同时选择 firefox 包或 --all。'
if [[ -n $firefox_profile ]]; then
    # Interpret explicit relative paths in the caller's directory, before cd.
    firefox_profile=$(realpath -m -- "$firefox_profile")
fi

# A different caller working directory must not affect Stow or profile discovery.
target_home=$(realpath -e -- "$target_home") || die '用户配置目标不存在。'
[[ -d $target_home && -w $target_home ]] || die "用户配置目标不是可写目录：$target_home"
case $target_home in
    /|/etc|"$DOTFILES_DIR"|"$DOTFILES_DIR"/*)
        die "不能将用户配置部署到此目录：$target_home" ;;
esac
if ! $check_only && ((EUID == 0)); then
    die '请以目标普通用户运行；只有 etc 阶段通过 run0 提权。'
fi

stow_bin=$(type -P stow) || die '缺少 stow；请先安装 GNU Stow。'
[[ -z ${selected[etc]:-} ]] || command -v run0 >/dev/null \
    || die '选择 etc 需要 run0。'
for package in "${!selected[@]}"; do
    [[ -d $DOTFILES_DIR/$package ]] || die "缺少配置包目录：$package"
done

home_packages=()
for package in "${HOME_STOW_PACKAGES[@]}"; do
    [[ -z ${selected[$package]:-} ]] || home_packages+=("$package")
done
home_check_packages=("${home_packages[@]}")
[[ -z ${selected[systemd]:-} ]] || home_check_packages+=(systemd)

# Keep existing directories as directories, so runtime files are not created in
# the checkout through newly folded directory links. No adopt/override is used.
stow_args=(--dir "$DOTFILES_DIR" --no-folding)
cd -- "$DOTFILES_DIR"
failed=false

# Paru requires an absolute local-repository path. Keep its generated runtime
# config independent of Stow, so moving the checkout can regenerate that path.
if [[ -n ${selected[tools]:-} ]]; then
    if ! python3 -B "$DOTFILES_DIR/scripts/configure-paru.py" --target "$target_home" --check; then
        failed=true
    fi
fi

printf '检查所选配置；用户目标：%s\n' "$target_home"
if ((${#home_check_packages[@]})); then
    # Check systemd together with other HOME packages for cross-package conflicts.
    printf '检查用户配置包：%s\n' "${home_check_packages[*]}"
    if ! "$stow_bin" "${stow_args[@]}" --simulate \
        --target "$target_home" "${home_check_packages[@]}"; then
        failed=true
    fi
fi
if [[ -n ${selected[etc]:-} ]]; then
    printf '检查系统配置：/etc（磁盘 UUID、驱动等仍需按目标机器确认）\n'
    if ! python3 -B "$DOTFILES_DIR/scripts/system-config.py"; then
        failed=true
    fi
fi
if [[ -n ${selected[firefox]:-} ]]; then
    if ! command -v python3 >/dev/null; then
        printf '错误：解析 Firefox profile 需要 python3（Arch 的 python 包）。\n' >&2
        failed=true
    else
        profile_args=(--home "$target_home")
        [[ -z $firefox_profile ]] || profile_args+=(--profile "$firefox_profile")
        if firefox_profile=$(python3 "$DOTFILES_DIR/scripts/firefox-profile.py" "${profile_args[@]}"); then
            case $firefox_profile in
                "$DOTFILES_DIR"|"$DOTFILES_DIR"/*)
                    printf '错误：Firefox profile 不能位于配置仓库中。\n' >&2
                    failed=true
                    ;;
                *)
                    printf '检查 Firefox profile：%s\n' "$firefox_profile"
                    if ! "$stow_bin" "${stow_args[@]}" --simulate \
                        --target "$firefox_profile" firefox; then
                        failed=true
                    fi
                    ;;
            esac
        else
            failed=true
        fi
    fi
fi

if $failed; then
    die '预检未通过，未执行部署。请处理上面的冲突或缺失项后重试；也可指定配置包分阶段部署。'
fi
if $check_only; then
    printf '所选配置的路径、独立副本与 Stow 检查通过；未修改文件。软件和服务功能仍需按 --plan 验证。\n'
    exit 0
fi

phase=部署
trap 'printf "错误：%s 失败（第 %s 行），已停止后续步骤；此前完成的链接未自动回滚。\n" "$phase" "$LINENO" >&2' ERR

if ((${#home_packages[@]})); then
    phase=用户配置部署
    printf '部署用户配置 → %s\n' "$target_home"
    "$stow_bin" "${stow_args[@]}" --target "$target_home" "${home_packages[@]}"
    if [[ -n ${selected[tools]:-} ]]; then
        python3 -B "$DOTFILES_DIR/scripts/configure-paru.py" --target "$target_home"
    fi
fi
if [[ -n ${selected[etc]:-} ]]; then
    phase=系统配置部署
    printf '部署系统配置 → /etc\n'
    run0 python3 -B "$DOTFILES_DIR/scripts/system-config.py" --apply
fi
if [[ -n ${selected[firefox]:-} ]]; then
    phase=Firefox配置部署
    printf '部署 Firefox 配置 → %s\n' "$firefox_profile"
    "$stow_bin" "${stow_args[@]}" --target "$firefox_profile" firefox
fi
if [[ -n ${selected[systemd]:-} ]]; then
    phase=用户服务链接部署
    printf '部署用户服务定义和启用链接 → %s\n' "$target_home"
    "$stow_bin" "${stow_args[@]}" --target "$target_home" systemd
    printf '已部署服务链接；未启动或重启服务，仍需验证依赖并在目标用户会话中重新加载。\n'
fi

printf '所选配置链接部署完成；完整复现的其他阶段见 ./install.sh --plan。\n'
