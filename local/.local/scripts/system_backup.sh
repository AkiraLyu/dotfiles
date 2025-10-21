#!/usr/bin/env bash
# ==========================================================
# 系统备份脚本 - 使用 rsync 增量同步（无硬链接）
# 作者: Akira
# ==========================================================

/home/akira/.local/scripts/mount_backup.sh

# === 可自定义区域 ===
BACKUP_SOURCES=(
    /home/akira/dotfiles
    /home/akira/Docs
    /home/akira/Pictures
    /home/akira/.ssh
    /home/akira/.gnupg
    /home/akira/.thunderbird
    /home/akira/codespace
    /home/akira/Desktop
    /home/akira/Downloads
    /home/akira/Zotero
    /home/akira/.zotero
    /home/akira/Documents/AliceSoft
    /home/akira/Documents/FAVORITE
)

BACKUP_DEST="/mnt/backup/BackUp/"
ENABLE_LOG=true
LOG_DIR="$BACKUP_DEST/logs"

# === 时间戳逻辑 ===
FORCE_FULL=${1:-false}   # 可选参数: "true" 表示强制创建新全量备份
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

# 获取上一次备份目录（按时间排序）
LAST_BACKUP=$(ls -1dt "$BACKUP_DEST"/*/ 2>/dev/null | grep -v "/logs/" | head -n 1)

if [ "$FORCE_FULL" = true ] || [ ! -d "$LAST_BACKUP" ]; then
    TARGET_DIR="$BACKUP_DEST/$TIMESTAMP"
    echo "未检测到上次备份或强制创建全量备份。"
else
    TARGET_DIR="$LAST_BACKUP"
    echo "检测到上次备份，将增量更新至: $TARGET_DIR"
fi

# 创建必要目录
mkdir -p "$TARGET_DIR"
if [ "$ENABLE_LOG" = true ]; then
    mkdir -p "$LOG_DIR"
    LOG_FILE="$LOG_DIR/backup_$(basename "$TARGET_DIR").log"
else
    LOG_FILE="/dev/null"
fi

echo "=== 系统备份开始: $(date) ===" | tee -a "$LOG_FILE"
echo "目标目录: $TARGET_DIR" | tee -a "$LOG_FILE"

# === 执行 rsync ===
for SRC in "${BACKUP_SOURCES[@]}"; do
    if [ -d "$SRC" ]; then
        echo "→ 备份目录: $SRC" | tee -a "$LOG_FILE"
        rsync -aAXHv --delete \
            --exclude={"/dev/*","/proc/*","/sys/*","/tmp/*","/run/*","/mnt/*","/media/*","/lost+found"} \
            "$SRC" "$TARGET_DIR" >> "$LOG_FILE" 2>&1
    else
        echo "⚠️  跳过不存在的路径: $SRC" | tee -a "$LOG_FILE"
    fi
done

echo "=== 系统备份完成: $(date) ===" | tee -a "$LOG_FILE"
echo "备份结果已保存到: $TARGET_DIR"

