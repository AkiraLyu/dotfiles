set Start_Env sway

set TTY1 (tty)
if [ "$TTY1" = /dev/tty1 ]

    if [ "$Start_Env" = hypr ]
        exec Hyprland
    else if [ "$Start_Env" = sway ]
        exec sway
    end

end
