#!/bin/bash

# 杀死现有的 mpvpaper 进程
killall -9 mpvpaper

# 获取 Thunar 传递的文件路径
VIDEO_FILE="$1"

# 检查是否有文件路径参数
if [ -z "$VIDEO_FILE" ]; then
    echo "Error: No video file provided."
    exit 1
fi

# 使用 mpvpaper 播放视频，设置输出屏幕为 eDP-1，不带音频
nohup mpvpaper -vs -o "no-audio loop" eDP-1 "$VIDEO_FILE" >/dev/null 2>&1 &
