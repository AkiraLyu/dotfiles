#!/bin/sh

rclone mount "google drive:" ~/drive/GoogleDrive/ \
  --vfs-cache-mode full \
  --cache-dir ~/drive/cache/ \
  --daemon
