#!/bin/sh

rclone mount "WebDAV:" /mnt/network/webdav/ \
  --vfs-cache-mode full \
  --poll-interval 10s \
  --cache-dir /mnt/network/cache/webdav \
  --daemon
