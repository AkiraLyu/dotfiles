#!/usr/bin/env python3

import fcntl
import os
import subprocess
import sys
from pathlib import Path

if not os.environ.get("DISPLAY") and not os.environ.get("WAYLAND_DISPLAY"):
    sys.exit(0)

try:
    from PyQt6.QtCore import QTimer
    from PyQt6.QtGui import QAction, QIcon
    from PyQt6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

    ACTIVATION_TRIGGER = QSystemTrayIcon.ActivationReason.Trigger
    MESSAGE_INFORMATION = QSystemTrayIcon.MessageIcon.Information

    def exec_app(qapp):
        return qapp.exec()

except ImportError:
    try:
        from PySide6.QtCore import QTimer
        from PySide6.QtGui import QAction, QIcon
        from PySide6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

        ACTIVATION_TRIGGER = QSystemTrayIcon.ActivationReason.Trigger
        MESSAGE_INFORMATION = QSystemTrayIcon.MessageIcon.Information

        def exec_app(qapp):
            return qapp.exec()

    except ImportError:
        try:
            from PyQt5.QtCore import QTimer
            from PyQt5.QtGui import QIcon
            from PyQt5.QtWidgets import QAction, QApplication, QMenu, QSystemTrayIcon

            ACTIVATION_TRIGGER = QSystemTrayIcon.Trigger
            MESSAGE_INFORMATION = QSystemTrayIcon.Information

            def exec_app(qapp):
                return qapp.exec_()

        except ImportError:
            sys.exit(0)


SCRIPT = Path(__file__).with_name("onedrive.sh")
MOUNTPOINT = Path("/mnt/network/onedrive")


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
            sys.exit(0)
        except OSError:
            continue

    sys.exit(0)


def icon_from_theme():
    icon = QIcon.fromTheme("ms-onedrive")
    if icon.isNull():
        icon = QIcon.fromTheme("folder-cloud")
    if icon.isNull():
        icon = QIcon.fromTheme("folder-remote")
    return icon


def is_mounted():
    return subprocess.run(
        ["mountpoint", "-q", str(MOUNTPOINT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode == 0


def run_script(*args):
    return subprocess.run([str(SCRIPT), *args], check=False)


def notify(title, message):
    if QSystemTrayIcon.supportsMessages():
        tray_icon.showMessage(title, message, MESSAGE_INFORMATION, 3000)


def open_mountpoint():
    if not is_mounted():
        notify("OneDrive", "尚未挂载")
        return
    subprocess.Popen(["xdg-open", str(MOUNTPOINT)])


def mount_onedrive():
    result = run_script("--mount-only", "--no-tray")
    update_status()
    if result.returncode == 0:
        notify("OneDrive", "已挂载")
    else:
        notify("OneDrive", "挂载失败")


def unmount_onedrive():
    result = run_script("--unmount")
    update_status()
    if result.returncode == 0:
        notify("OneDrive", "已卸载")
    else:
        notify("OneDrive", "卸载失败")


def remount_onedrive():
    result = run_script("--remount", "--no-tray")
    update_status()
    if result.returncode == 0:
        notify("OneDrive", "已重新挂载")
    else:
        notify("OneDrive", "重新挂载失败")


def unmount_and_quit():
    unmount_onedrive()
    app.quit()


def update_status():
    mounted = is_mounted()
    status_action.setText("状态: 已挂载" if mounted else "状态: 未挂载")
    tray_icon.setToolTip("OneDrive - 已挂载" if mounted else "OneDrive - 未挂载")
    open_action.setEnabled(mounted)
    mount_action.setEnabled(not mounted)
    unmount_action.setEnabled(mounted)
    remount_action.setEnabled(True)


lock_handle = acquire_lock()

app = QApplication(sys.argv)
QApplication.setQuitOnLastWindowClosed(False)

tray_icon = QSystemTrayIcon(icon_from_theme(), app)

menu = QMenu()

status_action = QAction("状态: 检查中")
status_action.setEnabled(False)
menu.addAction(status_action)
menu.addSeparator()

open_action = menu.addAction("打开 OneDrive", open_mountpoint)
mount_action = menu.addAction("挂载 OneDrive", mount_onedrive)
unmount_action = menu.addAction("卸载 OneDrive", unmount_onedrive)
remount_action = menu.addAction("重新挂载", remount_onedrive)
menu.addSeparator()
menu.addAction("卸载并退出托盘", unmount_and_quit)
menu.addAction("退出托盘", app.quit)

menu.aboutToShow.connect(update_status)

tray_icon.setContextMenu(menu)
tray_icon.activated.connect(
    lambda reason: open_mountpoint()
    if reason == ACTIVATION_TRIGGER and is_mounted()
    else None
)
tray_icon.show()

timer = QTimer()
timer.timeout.connect(update_status)
timer.start(5000)
update_status()

sys.exit(exec_app(app))
