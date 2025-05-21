#!/bin/bash

swaymsg -t subscribe '[ "window" ]' | \
while read -r line; do
    if echo "$line" | grep -q '"change":"new"'; then
        window_id=$(echo "$line" | jq -r '.container.id')
        floating=$(swaymsg -t get_tree | jq ".. | objects | select(.id? == $window_id) | .floating_nodes | length")
        if [ "$floating" -gt 0 ]; then
            swaymsg "[con_id=$window_id]" resize set 800 600
        fi
    fi
done

