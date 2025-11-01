#!/bin/sh

rclone mount "google drive:" /mnt/network/google \
  --vfs-cache-mode full \
  --cache-dir /mnt/network/cache/google \
  --daemon
