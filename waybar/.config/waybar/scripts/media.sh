#!/usr/bin/env bash

status=$(playerctl status 2>/dev/null)

if [[ "$status" == "Playing" || "$status" == "Paused" ]]; then
    # 输出格式为 playing-title-artist
    output=$(playerctl metadata --format '{{lc(status)}}-{{title}}-{{artist}}' 2>/dev/null)
    echo "{\"text\": \"$output\", \"tooltip\": \"Now Playing\"}"
else
    echo "{\"text\": \"No Media Playing\", \"tooltip\": \"No active player\"}"
fi

