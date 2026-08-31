# 主题状态由 `theme` 命令管理；Fish 只读取，不修改桌面配置。
begin
    set -l theme light
    set -l state_home "$HOME/.local/state"

    if set -q XDG_STATE_HOME; and test -n "$XDG_STATE_HOME"
        set state_home "$XDG_STATE_HOME"
    end

    set -l mode_file "$state_home/theme/mode"
    if test -r "$mode_file"
        read -l saved_theme <"$mode_file"
        if contains -- "$saved_theme" light dark
            set theme "$saved_theme"
        end
    else if contains -- "$TERTHEME" light dark
        # 兼容尚未执行首次迁移的会话。
        set theme "$TERTHEME"
    end

    set -gx TERTHEME "$theme"

    for theme_file in \
        "$HOME/.config/fish/functions/themes/fish_prompt.fish.$theme" \
        "$HOME/.config/fish/conf.d/colors/ls_colors.$theme.fish"
        if test -r "$theme_file"
            source "$theme_file"
        end
    end
end
