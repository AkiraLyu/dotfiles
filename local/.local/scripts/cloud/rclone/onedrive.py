#!/usr/bin/env python3
"""OneDrive rclone mount + system tray (merged from onedrive.sh and onedrive-tray.py)."""

import argparse
import fcntl
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

MOUNTPOINT = Path("/mnt/network/onedrive")
CACHE_DIR = Path("/mnt/network/cache/onedrive")
REMOTE = "onedrive:"
ICON_PATH = Path(
    "/home/akira/.local/share/icons/Microsoft_OneDrive_Icon_(2025_-_present).svg"
)

MOUNT_TIMEOUT = 10.0
MOUNT_POLL_INTERVAL = 0.5


def is_mounted() -> bool:
    return (
        subprocess.run(
            ["mountpoint", "-q", str(MOUNTPOINT)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        ).returncode
        == 0
    )


def mount_onedrive() -> bool:
    if is_mounted():
        return True

    result = subprocess.run(
        [
            "rclone",
            "mount",
            REMOTE,
            str(MOUNTPOINT),
            "--vfs-cache-mode",
            "full",
            "--cache-dir",
            str(CACHE_DIR),
            "--daemon",
        ],
        check=False,
    )
    if result.returncode != 0:
        return False

    deadline = time.monotonic() + MOUNT_TIMEOUT
    while time.monotonic() < deadline:
        if is_mounted():
            return True
        time.sleep(MOUNT_POLL_INTERVAL)
    return False


def unmount_onedrive() -> bool:
    if not is_mounted():
        return True

    for cmd in (
        ["fusermount3", "-uz", str(MOUNTPOINT)],
        ["fusermount", "-uz", str(MOUNTPOINT)],
        ["umount", str(MOUNTPOINT)],
    ):
        if shutil.which(cmd[0]) is None:
            continue
        result = subprocess.run(cmd, check=False)
        if result.returncode == 0:
            return True
        break
    return False


def open_mountpoint() -> None:
    subprocess.Popen(["xdg-open", str(MOUNTPOINT)])


def acquire_lock():
    lock_dirs = []
    if os.environ.get("XDG_RUNTIME_DIR"):
        lock_dirs.append(Path(os.environ["XDG_RUNTIME_DIR"]))
    lock_dirs.append(Path("/tmp"))

    for lock_dir in lock_dirs:
        try:
            lock_dir.mkdir(parents=True, exist_ok=True)
            lock_file = (lock_dir / f"onedrive-tray-{os.getuid()}.lock").open("w")
            fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return lock_file
        except BlockingIOError:
            return None
        except OSError:
            continue
    return None


def load_qt():
    try:
        from PyQt6.QtCore import QTimer
        from PyQt6.QtGui import QAction, QIcon
        from PyQt6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

        return {
            "QApplication": QApplication,
            "QTimer": QTimer,
            "QAction": QAction,
            "QIcon": QIcon,
            "QMenu": QMenu,
            "QSystemTrayIcon": QSystemTrayIcon,
            "activation_trigger": QSystemTrayIcon.ActivationReason.Trigger,
            "message_information": QSystemTrayIcon.MessageIcon.Information,
        }
    except ImportError:
        pass

    try:
        from PySide6.QtCore import QTimer
        from PySide6.QtGui import QAction, QIcon
        from PySide6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

        return {
            "QApplication": QApplication,
            "QTimer": QTimer,
            "QAction": QAction,
            "QIcon": QIcon,
            "QMenu": QMenu,
            "QSystemTrayIcon": QSystemTrayIcon,
            "activation_trigger": QSystemTrayIcon.ActivationReason.Trigger,
            "message_information": QSystemTrayIcon.MessageIcon.Information,
        }
    except ImportError:
        pass

    try:
        from PyQt5.QtCore import QTimer
        from PyQt5.QtGui import QIcon
        from PyQt5.QtWidgets import QAction, QApplication, QMenu, QSystemTrayIcon

        return {
            "QApplication": QApplication,
            "QTimer": QTimer,
            "QAction": QAction,
            "QIcon": QIcon,
            "QMenu": QMenu,
            "QSystemTrayIcon": QSystemTrayIcon,
            "activation_trigger": QSystemTrayIcon.Trigger,
            "message_information": QSystemTrayIcon.Information,
        }
    except ImportError:
        return None


def icon_from_theme(QIcon):
    icon = QIcon(str(ICON_PATH))
    if icon.isNull():
        icon = QIcon.fromTheme("folder-cloud")
    if icon.isNull():
        icon = QIcon.fromTheme("folder-remote")
    return icon


def run_tray() -> int:
    if not os.environ.get("DISPLAY") and not os.environ.get("WAYLAND_DISPLAY"):
        return 0

    qt = load_qt()
    if qt is None:
        return 0

    QApplication = qt["QApplication"]
    QTimer = qt["QTimer"]
    QAction = qt["QAction"]
    QIcon = qt["QIcon"]
    QMenu = qt["QMenu"]
    QSystemTrayIcon = qt["QSystemTrayIcon"]
    ACTIVATION_TRIGGER = qt["activation_trigger"]
    MESSAGE_INFORMATION = qt["message_information"]

    lock_file = acquire_lock()
    if lock_file is None:
        return 0

    app = QApplication(sys.argv)
    QApplication.setQuitOnLastWindowClosed(False)

    tray_icon = QSystemTrayIcon(icon_from_theme(QIcon), app)

    def notify(title, message):
        if QSystemTrayIcon.supportsMessages():
            tray_icon.showMessage(title, message, MESSAGE_INFORMATION, 3000)

    def tray_open():
        if not is_mounted():
            notify("OneDrive", "尚未挂载")
            return
        open_mountpoint()

    def tray_mount():
        ok = mount_onedrive()
        update_status()
        notify("OneDrive", "已挂载" if ok else "挂载失败")

    def tray_unmount():
        ok = unmount_onedrive()
        update_status()
        notify("OneDrive", "已卸载" if ok else "卸载失败")

    def tray_remount():
        ok = unmount_onedrive() and mount_onedrive()
        update_status()
        notify("OneDrive", "已重新挂载" if ok else "重新挂载失败")

    def tray_unmount_and_quit():
        tray_unmount()
        app.quit()

    menu = QMenu()

    status_action = QAction("状态: 检查中")
    status_action.setEnabled(False)
    menu.addAction(status_action)
    menu.addSeparator()

    open_action = menu.addAction("打开 OneDrive", tray_open)
    mount_action = menu.addAction("挂载 OneDrive", tray_mount)
    unmount_action = menu.addAction("卸载 OneDrive", tray_unmount)
    remount_action = menu.addAction("重新挂载", tray_remount)
    menu.addSeparator()
    menu.addAction("卸载并退出托盘", tray_unmount_and_quit)
    menu.addAction("退出托盘", app.quit)

    def update_status():
        mounted = is_mounted()
        status_action.setText("状态: 已挂载" if mounted else "状态: 未挂载")
        tray_icon.setToolTip("OneDrive - 已挂载" if mounted else "OneDrive - 未挂载")
        open_action.setEnabled(mounted)
        mount_action.setEnabled(not mounted)
        unmount_action.setEnabled(mounted)
        remount_action.setEnabled(True)

    menu.aboutToShow.connect(update_status)
    tray_icon.setContextMenu(menu)
    tray_icon.activated.connect(
        lambda reason: (
            tray_open() if reason == ACTIVATION_TRIGGER and is_mounted() else None
        )
    )
    tray_icon.show()

    timer = QTimer()
    timer.timeout.connect(update_status)
    timer.start(5000)
    update_status()

    return app.exec()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="OneDrive rclone mount and system tray")
    parser.add_argument("--tray", action="store_true", help="start tray only")
    parser.add_argument("--autostart", action="store_true", help="mount and start tray, do not open")
    parser.add_argument("--mount-only", action="store_true", help="mount only")
    parser.add_argument("--unmount", action="store_true", help="unmount")
    parser.add_argument("--remount", action="store_true", help="remount")
    parser.add_argument("--no-tray", action="store_true", help="do not start tray")
    args = parser.parse_args(argv)

    if args.tray:
        if args.no_tray:
            return 0
        return run_tray()

    if args.unmount:
        return 0 if unmount_onedrive() else 1

    if args.remount:
        ok = unmount_onedrive() and mount_onedrive()
        if not ok:
            return 1
        if not args.no_tray:
            return run_tray()
        return 0

    ok = mount_onedrive()
    if not ok:
        return 1

    if not args.mount_only and not args.autostart:
        open_mountpoint()

    if not args.no_tray:
        return run_tray()
    return 0


if __name__ == "__main__":
    sys.exit(main())
