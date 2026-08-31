function theme --description '统一管理 KDE、Niri 和应用配色'
    command theme $argv
    set -l command_status $status

    if test $command_status -eq 0
        set -l action
        for argument in $argv
            if not string match -qr '^-' -- "$argument"
                set action "$argument"
                break
            end
        end

        if contains -- "$action" light dark set toggle apply sync
            source "$HOME/.config/fish/conf.d/colors.fish"
        end
    end

    return $command_status
end
