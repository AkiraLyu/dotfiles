#!/bin/sh

rclone mount "WebDAV-remote:" /mnt/network/webdav/ \
  --vfs-cache-mode full \
  --cache-dir /mnt/network/cache/webdav \
  --daemon
