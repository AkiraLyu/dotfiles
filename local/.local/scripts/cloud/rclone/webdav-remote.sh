#!/bin/sh
set -eu

mkdir -p /mnt/network/webdav-remote /mnt/network/cache/webdav-remote
mountpoint -q /mnt/network/webdav-remote && exit 0
exec rclone mount "WebDAV-remote:" /mnt/network/webdav-remote \
  --vfs-cache-mode full \
  --cache-dir /mnt/network/cache/webdav-remote \
  --daemon
