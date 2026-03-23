#!/bin/sh

rclone mount "onedrive:" /mnt/network/google \
  --vfs-cache-mode full \
  --cache-dir /mnt/network/cache/google \
  --daemon
