#!/bin/sh

if pgrep -x Hyprland >/dev/null; then
    windows=$(hyprctl clients -j | jq -r '
        .[] | "\(.class // ""): \(.title // "")###\(.address)"' | grep -E '.+: .+'
    )

    selected_entry=$(echo "$windows" | sed 's/###.*//' | rofi -dmenu -i -p "Switch to:")

    selected_address=$(echo "$windows" | grep "^$selected_entry###" | sed 's/^.*###//')

    [ -n "$selected_address" ] && hyprctl dispatch focuswindow address:"$selected_address"

elif pgrep -x sway >/dev/null; then
    windows=$(swaymsg -t get_tree | jq -r '
        recurse(.nodes[]?) |
        recurse(.floating_nodes[]?) |
        select(.type=="con" or .type=="floating_con") |
        (.id | tostring) + " " + (.app_id // "") + ": " + (.name // "")' | grep -E '.+: .+'
    )

    selected=$(echo "$windows" | rofi -dmenu -i -p "Switch to:" | awk '{print $1}')

    [ -n "$selected" ] && swaymsg [con_id="$selected"] focus
else
    echo "Neither Hyprland nor Sway is running." >&2
    exit 1
fi

