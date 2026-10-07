function theme --description '切换 Darkly 的亮暗配色'
    # 使用 kde-config 包提供的主题命令。
    command darkly-theme $argv
    set -l command_status $status

    if test $command_status -eq 0; and contains -- "$argv[-1]" light dark toggle apply
        source "$HOME/.config/fish/conf.d/colors.fish"
    end

    return $command_status
end
