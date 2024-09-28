#!/bin/bash
# 检测进程是否存在
if pgrep -x "swaybg" >/dev/null; then
	# 进程存在，杀死进程
	pkill -x "swaybg"
	echo "进程已被杀死"
else
	# 进程不存在，不做任何事
	echo "进程不存在，无需杀死"
fi
# nohup swaybg -i $(find /home/akira/Pictures/swaybg/ -type f | shuf -n 1) -m fill >/dev/null 2>&1 &
nohup wallpaper $(find /home/akira/Pictures/ -type f | shuf -n 1) >/dev/null 2>&1 &
