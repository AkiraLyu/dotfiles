if [ "$DESKTOP_SESSION" = "sway" ]
    set -gx XDG_CURRENT_DESKTOP sway
    set -gx XDG_SESSION_DESKTOP sway
    set -gx XDG_MENU_PREFIX arch-
    set -gx QT_QPA_PLATFORMTHEME qt6ct
    set -gx _JAVA_AWT_WM_NONREPARENTING 1
end
