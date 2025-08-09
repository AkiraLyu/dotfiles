#!/bin/fish

set CONFIG1 ~/.config/niri/config.kdl
set CONFIG2 ~/.config/niri/configs/execs.kdl
set QT6CT_CONF ~/.config/qt6ct/qt6ct.conf

if test "$TERTHEME" = "dark"
    sed -i '1s/dark/light/g' ~/.config/fish/conf.d/colors.fish

    gsettings set org.gnome.desktop.interface color-scheme 'default'
    gsettings set org.gnome.desktop.interface gtk-theme Breeze
    gsettings set org.gnome.desktop.interface icon-theme 'Tela-purple-light'

    # 修改niri配置文件，替换spawn主题为浅色
    sed -i "s#spawn-at-startup \"gsettings set org.gnome.desktop.interface gtk-theme '.*'\"#spawn-at-startup \"gsettings set org.gnome.desktop.interface gtk-theme 'Breeze'\"#g" $CONFIG1 $CONFIG2
    sed -i "s#spawn-at-startup \"gsettings set org.gnome.desktop.interface icon-theme '.*'\"#spawn-at-startup \"gsettings set org.gnome.desktop.interface icon-theme 'Tela-purple-light'\"#g" $CONFIG1 $CONFIG2

    # 修改 qt6ct 主题配色路径为浅色
    sed -i "s#^color_scheme_path=.*#color_scheme_path=/usr/share/color-schemes/BreezeLight.colors#g" $QT6CT_CONF

    cp $HOME/.config/waybar/style.css.light $HOME/.config/waybar/style.css
    killall waybar
    sleep 0.5
    nohup waybar -c $HOME/.config/waybar/config.niri -s $HOME/.config/waybar/style.css > /dev/null 2>&1 &

else if test "$TERTHEME" = "light"
    sed -i '1s/light/dark/g' ~/.config/fish/conf.d/colors.fish

    gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
    gsettings set org.gnome.desktop.interface gtk-theme Breeze-Dark
    gsettings set org.gnome.desktop.interface icon-theme 'Tela-purple-dark'

    # 修改niri配置文件，替换spawn主题为深色
    sed -i "s#spawn-at-startup \"gsettings set org.gnome.desktop.interface gtk-theme '.*'\"#spawn-at-startup \"gsettings set org.gnome.desktop.interface gtk-theme 'Breeze-Dark'\"#g" $CONFIG1 $CONFIG2
    sed -i "s#spawn-at-startup \"gsettings set org.gnome.desktop.interface icon-theme '.*'\"#spawn-at-startup \"gsettings set org.gnome.desktop.interface icon-theme 'Tela-purple-dark'\"#g" $CONFIG1 $CONFIG2

    # 修改 qt6ct 主题配色路径为深色
    sed -i "s#^color_scheme_path=.*#color_scheme_path=/usr/share/color-schemes/BreezeDark.colors#g" $QT6CT_CONF

    cp $HOME/.config/waybar/style.css.dark $HOME/.config/waybar/style.css
    killall waybar
    sleep 0.5
    nohup waybar -c $HOME/.config/waybar/config.niri -s $HOME/.config/waybar/style.css > /dev/null 2>&1 &

else
    echo "TERTHEME 变量不是 'dark' 或 'light'，当前值：$TERTHEME"
end

 source ~/.config/fish/conf.d/colors.fish
switch_color

