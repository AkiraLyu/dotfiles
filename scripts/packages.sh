#!/usr/bin/env bash
# 只管理 pacman 包名和安装原因，不做版本锁定、源码下载缓存或通用插件调度。
# 自有配方统一由远端 pkgbuilds 管理，其他 foreign 包交给 AUR。
set -euo pipefail
((EUID != 0)) || { echo '请以普通用户运行；安装阶段会单独调用 run0。' >&2; exit 1; }
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
list_dir="$repo_dir/packages"

if [[ ${1:-} == export ]]; then
    # -e：用户显式安装；-d：作为依赖安装；-n：当前软件源包；-m：foreign。
    # 四份普通文本各保存一种安装原因，方便直接阅读和手动增删包名。
    mkdir -p "$list_dir"
    # pacman 查询没有匹配的包时返回 1；空的 foreign 清单是正常情况。
    { pacman -Qqen || test $? -eq 1; } | sort > "$list_dir/repo.txt"
    { pacman -Qqdn || test $? -eq 1; } | sort > "$list_dir/repo-deps.txt"
    { pacman -Qqem || test $? -eq 1; } | sort > "$list_dir/foreign.txt"
    { pacman -Qqdm || test $? -eq 1; } | sort > "$list_dir/foreign-deps.txt"
    # 合并后必须等于完整包清单；读取失败或重复分类不能当成成功导出。
    installed=$(pacman -Qq | sort)
    saved=$(sort "$list_dir/repo.txt" "$list_dir/repo-deps.txt" \
        "$list_dir/foreign.txt" "$list_dir/foreign-deps.txt")
    [[ $installed == "$saved" ]] || { echo '包清单不完整，请检查上面的 pacman 错误。' >&2; exit 1; }
    echo '已更新 packages/ 中的四份包清单。'
    exit 0
fi

# 每行一个包名。版本由软件源提供；不把机器上的旧二进制当作安装来源。
mapfile -t repo_packages < "$list_dir/repo.txt"
mapfile -t repo_dependencies < "$list_dir/repo-deps.txt"
mapfile -t foreign_packages < "$list_dir/foreign.txt"
mapfile -t foreign_dependencies < "$list_dir/foreign-deps.txt"

case ${1:-} in
    check)
        # 只比较本机已安装的包名，不更新数据库，也不安装缺失的软件。
        missing=$(comm -23 \
            <(printf '%s\n' "${repo_packages[@]}" "${repo_dependencies[@]}" \
                "${foreign_packages[@]}" "${foreign_dependencies[@]}" | sort -u) \
            <(pacman -Qq | sort))
        if [[ -n $missing ]]; then
            printf '清单中尚未安装的包：\n%s\n' "$missing"
        else
            echo '包清单检查通过：所有已记录的包均已安装。'
        fi
        ;;
    install)
        # 第一步：完整升级后安装软件源中的显式包，再补齐依赖包。
        # 新系统需先配置 archlinuxcn 源及 keyring，详见 README.md。
        run0 pacman -Syu --needed -- "${repo_packages[@]}"
        if ((${#repo_dependencies[@]})); then
            run0 pacman -S --needed --asdeps -- "${repo_dependencies[@]}"
        fi

        # 第二步：刷新自有配方，再通过 Paru 安装 GitHub/AUR 包。
        paru_config="$repo_dir/local/.config/paru/paru.conf"
        paru --config "$paru_config" --sudo run0 -Sy --pkgbuilds
        if ((${#foreign_packages[@]} + ${#foreign_dependencies[@]})); then
            paru --config "$paru_config" --sudo run0 -S --needed -- \
                "${foreign_packages[@]}" "${foreign_dependencies[@]}"
        fi

        # --needed 跳过已有包时可能保留旧的安装原因，最后明确恢复清单记录。
        run0 pacman -D --asexplicit -- "${repo_packages[@]}" "${foreign_packages[@]}"
        if ((${#repo_dependencies[@]} + ${#foreign_dependencies[@]})); then
            run0 pacman -D --asdeps -- "${repo_dependencies[@]}" "${foreign_dependencies[@]}"
        fi
        ;;
    *)
        echo '用法：./scripts/packages.sh export|check|install' >&2
        exit 1
        ;;
esac
