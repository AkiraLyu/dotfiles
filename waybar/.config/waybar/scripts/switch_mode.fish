#!/bin/fish

if test "$TERTHEME" = "dark"
    sed -i '1,1s/dark/light/g' $HOME/.config/fish/conf.d/colors.fish
else if test "$TERTHEME" = "light"
    sed -i '1,1s/light/dark/g' $HOME/.config/fish/conf.d/colors.fish
end

source $HOME/.config/fish/conf.d/colors.fish

switch_color
