set Start_Env none

# do not use this function

function switch_font
    if test "$Start_Env" = "kde"
        sed -i 's/Noto Sans CJK SC,/Noto Sans,/' ~/.config/qt6ct/qt6ct.conf
    else if test "$Start_Env" = "niri"
        sed -i 's/Noto Sans,/Noto Sans CJK SC,/' ~/.config/qt6ct/qt6ct.conf
    end
end


set TTY1 (tty)

if test "$TTY1" = "/dev/tty1"

    if test "$Start_Env" = "hypr"
        exec Hyprland
    else if test "$Start_Env" = "sway"
        exec sway
    else if test "$Start_Env" = "kde"
        switch_font
        exec /usr/lib/plasma-dbus-run-session-if-needed /usr/bin/startplasma-wayland
    else if test "$Start_Env" = "niri"
        switch_font
        exec niri --session
    end

end
