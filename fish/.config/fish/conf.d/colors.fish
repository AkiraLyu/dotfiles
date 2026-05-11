# 通过gsettings管理kitty & fish prompt & neovim theme
#
# 1. 设置默认主题，防止后面获取失败
set -gx TERTHEME light
set -l fish_prompt_theme_suffix ".light"

# 2. 使用 $HOME 变量代替硬编码路径，并且保留原有的 XDG_DATA_DIRS (如果存在)
set -l flatpak_dirs "$HOME/.local/share/flatpak/exports/share:/var/lib/flatpak/exports/share"
set -l system_dirs "/usr/local/share:/usr/share"
if set -q XDG_DATA_DIRS
    set -gx XDG_DATA_DIRS "$flatpak_dirs:$system_dirs:$XDG_DATA_DIRS"
else
    set -gx XDG_DATA_DIRS "$flatpak_dirs:$system_dirs"
end

# 定义一个帮助函数来安全地替换文本，避免重复写 sed
# 用法: replace_text "旧文本" "新文本" "文件路径"
function _safe_replace
    set -l target_file $argv[3]
    if test -f "$target_file"
        # 只有文件存在且内容真的包含旧文本时才执行替换，减少磁盘写入
        if grep -q "$argv[1]" "$target_file"
            sed -i "s/$argv[1]/$argv[2]/g" "$target_file"
        end
    end
end

if type -q gsettings
    # 获取主题并去除多余的引号
    set -l detected_theme (gsettings get org.gnome.desktop.interface color-scheme 2>/dev/null | string trim --chars="'")

    # 3. 默认为 Light 模式的参数
    set -l gtk_theme "Breeze"
    set -l icon_theme "Papirus-Light"
    set -l sed_from "Dark"
    set -l sed_to "Light"

    # 如果检测到是深色模式，切换变量
    if test "$detected_theme" = "prefer-dark"
        set -gx TERTHEME dark
        set fish_prompt_theme_suffix ".dark"
        set gtk_theme "Breeze-Dark"
        set icon_theme "Papirus-Dark"
        set sed_from "Light"
        set sed_to "Dark"
    end

    # 4. 执行变更
    # 应用 Gsettings (加了错误屏蔽，防止有些系统没有这个 schema 报错)
    gsettings set org.gnome.desktop.interface gtk-theme "$gtk_theme" 2>/dev/null
    gsettings set org.gnome.desktop.interface icon-theme "$icon_theme" 2>/dev/null

    # 5. 批量安全替换配置文件
    # 定义需要修改的文件列表
    set -l config_files \
        "$HOME/.config/qt6ct/qt6ct.conf" \
        "$HOME/.config/gtk-3.0/settings.ini" \
        "$HOME/.config/gtk-4.0/settings.ini" \
        "$HOME/.gtkrc-2.0"

    for file in $config_files
        # 针对 Breeze 和 Papirus 分别进行替换，使用上面的辅助函数
        _safe_replace "Breeze$sed_from" "Breeze$sed_to" "$file"
        _safe_replace "Papirus-$sed_from" "Papirus-$sed_to" "$file"
    end
end

functions -e _safe_replace

set -l fish_prompt_theme "$HOME/.config/fish/functions/themes/fish_prompt.fish$fish_prompt_theme_suffix"
if test -f "$fish_prompt_theme"
    source "$fish_prompt_theme"
end

# LS_COLORS 单独拆到 conf.d/colors/ 下，避免这个文件过长。
set -l ls_colors_theme "$HOME/.config/fish/conf.d/colors/ls_colors.$TERTHEME.fish"
if test -f "$ls_colors_theme"
    source "$ls_colors_theme"
end
