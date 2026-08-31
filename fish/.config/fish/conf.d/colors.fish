# 根据 GNOME 配色统一管理 GTK、Qt、Kitty、Fish 和 Neovim 主题。
begin
    set -l data_dirs \
        "$HOME/.local/share/flatpak/exports/share" \
        /var/lib/flatpak/exports/share \
        /usr/local/share \
        /usr/share

    # 保留自定义数据目录，并避免嵌套 Fish 重复追加。
    if set -q XDG_DATA_DIRS
        for data_dir in (string split : -- "$XDG_DATA_DIRS")
            if test -n "$data_dir"; and not contains -- "$data_dir" $data_dirs
                set -a data_dirs "$data_dir"
            end
        end
    end
    set -gx XDG_DATA_DIRS (string join : -- $data_dirs)

    # 设置默认值；gsettings 不可用或读取失败时使用浅色主题。
    set -l theme light
    set -l gtk_theme Breeze
    set -l icon_theme Papirus-Light
    set -l qt_style Breeze
    set -l qt_color_scheme /usr/share/color-schemes/LayanLight.colors

    if command -sq gsettings
        set -l detected_theme (command gsettings get org.gnome.desktop.interface color-scheme 2>/dev/null | string trim --chars="'")

        if test "$detected_theme" = prefer-dark
            set theme dark
            set gtk_theme Breeze-Dark
            set icon_theme Papirus-Dark
            set qt_color_scheme /usr/share/color-schemes/BreezeDark.colors
        end

        command gsettings set org.gnome.desktop.interface gtk-theme "$gtk_theme" 2>/dev/null
        command gsettings set org.gnome.desktop.interface icon-theme "$icon_theme" 2>/dev/null
    end

    set -gx TERTHEME "$theme"

    # 集中同步 Qt6ct 外观，仅在配置变化时写入一次。
    set -l qt6ct_config "$HOME/.config/qt6ct/qt6ct.conf"
    if test -f "$qt6ct_config"; and test -w "$qt6ct_config"
        set -l qt6ct_settings \
            "icon_theme=$icon_theme" \
            "style=$qt_style" \
            "color_scheme_path=$qt_color_scheme"
        set -l qt6ct_needs_update false

        for setting in $qt6ct_settings
            if not grep -qxF -- "$setting" "$qt6ct_config"
                set qt6ct_needs_update true
                break
            end
        end

        if test "$qt6ct_needs_update" = true
            sed -i \
                -e "s|^icon_theme=.*|icon_theme=$icon_theme|" \
                -e "s|^style=.*|style=$qt_style|" \
                -e "s|^color_scheme_path=.*|color_scheme_path=$qt_color_scheme|" \
                "$qt6ct_config"
        end
    end

    # 加载与当前配色对应的 Fish prompt 和 LS_COLORS。
    for theme_file in \
        "$HOME/.config/fish/functions/themes/fish_prompt.fish.$theme" \
        "$HOME/.config/fish/conf.d/colors/ls_colors.$theme.fish"
        if test -f "$theme_file"; and test -r "$theme_file"
            source "$theme_file"
        end
    end
end
