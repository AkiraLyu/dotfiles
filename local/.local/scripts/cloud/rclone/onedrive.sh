#!/bin/sh

MOUNTPOINT="/mnt/network/onedrive"
CACHE_DIR="/mnt/network/cache/onedrive"
REMOTE="onedrive:"
TRAY_SCRIPT="$(dirname "$0")/onedrive-tray.py"

ACTION="mount"
OPEN_AFTER=1
START_TRAY=1

while [ "$#" -gt 0 ]; do
    case "$1" in
        --autostart)
            OPEN_AFTER=0
            ;;
        --mount-only)
            OPEN_AFTER=0
            ;;
        --unmount)
            ACTION="unmount"
            OPEN_AFTER=0
            START_TRAY=0
            ;;
        --remount)
            ACTION="remount"
            OPEN_AFTER=0
            ;;
        --tray)
            ACTION="tray"
            OPEN_AFTER=0
            ;;
        --no-tray)
            START_TRAY=0
            ;;
    esac
    shift
done

is_mounted() {
    mountpoint -q "$MOUNTPOINT"
}

wait_for_mount() {
    for _ in $(seq 1 20); do
        if is_mounted; then
            return 0
        fi
        sleep 0.5
    done

    return 1
}

start_tray() {
    if [ "$START_TRAY" -eq 0 ]; then
        return 0
    fi

    if [ -z "$DISPLAY$WAYLAND_DISPLAY" ]; then
        return 0
    fi

    if [ -x "$TRAY_SCRIPT" ]; then
        nohup "$TRAY_SCRIPT" >/dev/null 2>&1 &
    elif command -v python3 >/dev/null 2>&1; then
        nohup python3 "$TRAY_SCRIPT" >/dev/null 2>&1 &
    fi
}

open_mountpoint() {
    if [ "$OPEN_AFTER" -eq 1 ]; then
        xdg-open "$MOUNTPOINT"
    fi
}

mount_onedrive() {
    if is_mounted; then
        start_tray
        open_mountpoint
        return 0
    fi

    rclone mount "$REMOTE" "$MOUNTPOINT" \
        --vfs-cache-mode full \
        --cache-dir "$CACHE_DIR" \
        --daemon || return $?

    if wait_for_mount; then
        start_tray
        open_mountpoint
        return 0
    fi

    return 1
}

unmount_onedrive() {
    if ! is_mounted; then
        return 0
    fi

    if command -v fusermount3 >/dev/null 2>&1; then
        fusermount3 -uz "$MOUNTPOINT"
    elif command -v fusermount >/dev/null 2>&1; then
        fusermount -uz "$MOUNTPOINT"
    else
        umount "$MOUNTPOINT"
    fi
}

case "$ACTION" in
    tray)
        start_tray
        ;;
    unmount)
        unmount_onedrive
        ;;
    remount)
        unmount_onedrive && mount_onedrive
        ;;
    *)
        mount_onedrive
        ;;
esac
