set Start_Env null
#export XDG_CURRENT_DESKTOP=$Start_Env

set TTY1 (tty)
if [ "$TTY1" = /dev/tty1 ]

    if [ "$Start_Env" = hypr ]
        exec Hyprland
    else if [ "$Start_Env" = sway ]
        # exec sway
        export XDG_MENU_PREFIX=arch-
    else if [ "$Start_Env" = wf ]
        exec wayfire
    else if [ "$Start_Env" = kde ]
        exec /usr/lib/plasma-dbus-run-session-if-needed /usr/bin/startplasma-wayland
    else if [ "$Start_Env" = cosmic ]
        exec start-cosmic
    end

end
