#!/bin/fish


if test "$TERTHEME" = "dark"
    echo "include themes/kitty.conf.dark"
else if test "$TERTHEME" = "light"
    echo "include themes/kitty.conf.light"
else
    echo "No valid TERMTHEME found. Please set TERM_THEME to 'dark' or 'light'."
end

