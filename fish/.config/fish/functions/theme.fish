function theme --description '切换 Darkly 的亮暗配色'
    # discount 包也提供 /usr/bin/theme；明确调用本仓库部署的脚本。
    command "$HOME/.local/bin/theme" $argv
    set -l command_status $status

    if test $command_status -eq 0; and contains -- "$argv[-1]" light dark toggle apply
        source "$HOME/.config/fish/conf.d/colors.fish"
    end

    return $command_status
end
