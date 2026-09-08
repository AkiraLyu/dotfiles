#!/usr/bin/env bash
set -euo pipefail

DATA_UUID="b6c62f44-c0c8-41da-8550-5d54ecfbe964"
DATA_MOUNT="/mnt/data"
CONTAINER_PATH="$DATA_MOUNT/backup_container.img"
MAPPER_NAME="securebackup"
MOUNT_POINT="/mnt/backup"

# These identify the external backup disk, not the system's root partition.
if ! mountpoint -q "$DATA_MOUNT"; then
    run0 mount -t btrfs -o rw,noatime,compress=zstd:3 "UUID=$DATA_UUID" "$DATA_MOUNT"
fi
if [[ $(findmnt -nr -o UUID --mountpoint "$DATA_MOUNT") != "$DATA_UUID" ]]; then
    printf '备份数据盘不匹配：%s\n' "$DATA_MOUNT" >&2
    exit 1
fi

if [[ ! -e /dev/mapper/$MAPPER_NAME ]]; then
    run0 cryptsetup open "$CONTAINER_PATH" "$MAPPER_NAME"
fi
if ! mountpoint -q "$MOUNT_POINT"; then
    run0 mount "/dev/mapper/$MAPPER_NAME" "$MOUNT_POINT"
fi
if [[ $(findmnt -nr --nofsroot -o SOURCE --mountpoint "$MOUNT_POINT") != "/dev/mapper/$MAPPER_NAME" ]]; then
    printf '备份容器未正确挂载：%s\n' "$MOUNT_POINT" >&2
    exit 1
fi

printf '容器已挂载：%s\n' "$MOUNT_POINT"
