#!/bin/fish


if test "$TERTHEME" = "dark"
    echo "include themes/kitty.conf.dark"
else if test "$TERTHEME" = "light"
    echo "include themes/kitty.conf.light"
else
    echo "No valid TERMTHEME found. Please set TERM_THEME to 'dark' or 'light'."
end

# different opacity for niri and kde
if test "$XDG_CURRENT_DEKSTOP" = "niri"
    echo "background_opacity 0.8"
else if test "$XDG_CURRENT_DEKSTOP" = "KDE"
    echo "background_opacity 1.0"
end
