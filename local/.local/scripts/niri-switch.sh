#!/bin/bash

# 获取 niri 窗口列表，并格式化为 "ID - Title"
windows=$(niri msg windows | awk '
/Window ID/ { id=$3 }
/Title:/ { 
    gsub(/^"/,"",$2)
    gsub(/"$/,"",$0)
    title=substr($0,index($0,$2))
    print id " - " title
}')

# 如果没有窗口，直接退出
[[ -z "$windows" ]] && exit 0

choice=$(echo "$windows" | rofi -dmenu -p "切换窗口:")

# 获取选择的窗口 ID
win_id=$(echo "$choice" | awk '{print $1}')

# 切换到该窗口
if [[ -n "$win_id" ]]; then
    niri msg action focus-window --id ${win_id%?}
fi

