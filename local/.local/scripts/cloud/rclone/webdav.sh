#!/bin/sh
set -eu

mkdir -p /mnt/network/webdav /mnt/network/cache/webdav
mountpoint -q /mnt/network/webdav && exit 0
exec rclone mount "WebDAV:" /mnt/network/webdav \
  --vfs-cache-mode full \
  --poll-interval 10s \
  --cache-dir /mnt/network/cache/webdav \
  --daemon
