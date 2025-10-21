#!/usr/bin/env bash
# ==========================================================
# 自动挂载加密备份容器
# 支持自动扩容检测（LUKS + Btrfs）
# 作者: Akira
# ==========================================================

set -euo pipefail

CONTAINER_PATH="/mnt/data/backup_container.img"
MAPPER_NAME="securebackup"
MOUNT_POINT="/mnt/backup"
DATA_MOUNT="/mnt/data"

# === 函数定义 ===

# 检查 /mnt/data 是否挂载
check_data_mount() {
    if ! mountpoint -q "$DATA_MOUNT"; then
        echo "⚠️  检测到 $DATA_MOUNT 未挂载！"
        echo "开始挂载数据分区"
        sudo mount -t btrfs -o rw,noatime,nofail,compress=zstd:3 UUID=df70ec07-eb3a-42e2-aa6b-e16e8df01d9a /mnt/data

    fi
}

# 打开加密容器
open_container() {
    if [ ! -e "/dev/mapper/$MAPPER_NAME" ]; then
        echo "🔐 打开加密容器..."
        sudo cryptsetup open "$CONTAINER_PATH" "$MAPPER_NAME"
    else
        echo "✅ 容器已打开: /dev/mapper/$MAPPER_NAME"
    fi
}

# 自动扩容函数
auto_resize() {
    echo "🔍 检查容器大小变化..."
    sudo cryptsetup resize "$MAPPER_NAME" || true

    if mountpoint -q "$MOUNT_POINT"; then
        echo "📦 扩展 Btrfs 文件系统至最大..."
        sudo btrfs filesystem resize max "$MOUNT_POINT" || true
    else
        echo "⚠️ $MOUNT_POINT 未挂载，跳过 Btrfs 扩展。"
    fi
}

# 挂载文件系统
mount_container() {
    if ! mountpoint -q "$MOUNT_POINT"; then
        echo "📂 挂载加密容器..."
        sudo mount "/dev/mapper/$MAPPER_NAME" "$MOUNT_POINT"
    else
        echo "✅ 已挂载: $MOUNT_POINT"
    fi
}

# === 主流程 ===
check_data_mount
open_container
mount_container
# auto_resize

echo "✅ 容器挂载完成 -> $MOUNT_POINT"
echo ""

