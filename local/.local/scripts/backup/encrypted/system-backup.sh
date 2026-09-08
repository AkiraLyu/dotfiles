#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
"$SCRIPT_DIR/mount.sh"

BACKUP_SOURCES=(
    "$HOME/Desktop"
    "/data"
    "$HOME/Documents/AliceSoft"
    "$HOME/Documents/AliceInCradle"
    "$HOME/Documents/FAVORITE"
    "$HOME/dotfiles"
    "$HOME/Downloads"
    "$HOME/Pictures"
    "$HOME/Projects"
    "$HOME/Templates"
    "$HOME/Zotero"
    "$HOME/.gnupg"
    "$HOME/.ssh"
    "$HOME/.thunderbird"
    "$HOME/.zotero"
    "$HOME/.codex"
)
BACKUP_DEST="/mnt/backup/BackUp"
LOG_FILE="$BACKUP_DEST/backup.log"

mkdir -p "$BACKUP_DEST"
printf '开始备份：%s → %s\n' "$(date)" "$BACKUP_DEST" | tee "$LOG_FILE"

for source in "${BACKUP_SOURCES[@]}"; do
    if [[ ! -d $source ]]; then
        printf '跳过不存在的目录：%s\n' "$source" | tee -a "$LOG_FILE"
        continue
    fi
    printf '备份目录：%s\n' "$source" | tee -a "$LOG_FILE"
    rsync -aAXHv --delete \
        --exclude={"/dev/*","/proc/*","/sys/*","/tmp/*","/run/*","/mnt/*","/media/*","/lost+found"} \
        "$source/" "$BACKUP_DEST/${source##*/}/" >> "$LOG_FILE" 2>&1
done

printf '备份完成：%s\n' "$BACKUP_DEST" | tee -a "$LOG_FILE"
