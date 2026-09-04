#!/bin/fish

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
    set theme "$TERTHEME"
end

if test "$theme" = dark
    echo "include themes/kitty.conf.dark"
else
    echo "include themes/kitty.conf.light"
end

# different opacity for niri and kde
if test "$XDG_CURRENT_DESKTOP" = "niri"
    echo "background_opacity 0.8"
    echo "background_blur 0"
else if test "$XDG_CURRENT_DESKTOP" = "KDE"
    echo "background_opacity 0.9"
    echo "background_blur 1"
end
