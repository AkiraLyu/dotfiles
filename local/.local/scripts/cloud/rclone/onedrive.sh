#!/bin/sh

MOUNTPOINT="/mnt/network/onedrive"
IS_AUTOSTART=0

# 判断是否传入了后台自启参数
if [ "$1" = "--autostart" ]; then
    IS_AUTOSTART=1
fi

# 如果已经挂载
if mountpoint -q "$MOUNTPOINT"; then
    # 如果不是开机自启，则打开目录
    if [ "$IS_AUTOSTART" -eq 0 ]; then
        xdg-open "$MOUNTPOINT"
    fi
    exit 0
fi

# 执行挂载
rclone mount "onedrive:" "$MOUNTPOINT" \
  --vfs-cache-mode full \
  --cache-dir /mnt/network/cache/onedrive \
  --daemon

# 如果是开机自启，挂载命令发出后直接退出，不等待也不执行 xdg-open
if [ "$IS_AUTOSTART" -eq 1 ]; then
    exit 0
fi

# ================= 以下为手动运行时的逻辑 =================

# 等待挂载完成
for i in $(seq 1 20); do
    if mountpoint -q "$MOUNTPOINT"; then
        break
    fi
    sleep 0.5
done

xdg-open "$MOUNTPOINT"
