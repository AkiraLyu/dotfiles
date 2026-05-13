#!/usr/bin/env python3

import sys
import subprocess
from pathlib import Path

from PyQt5.QtGui import QIcon
from PyQt5.QtWidgets import QAction, QApplication, QMenu, QSystemTrayIcon


SCRIPT_DIR = Path(__file__).resolve().parent
CHECK_CAPABILITY = SCRIPT_DIR / "check-capability.sh"
AUTO_UPDATE = SCRIPT_DIR / "auto-update.sh"


def start_mihomo():
    check_cap()
    subprocess.run(["systemctl", "--user", "start", "mihomo"])
    print("Start success")


def stop_mihomo():
    subprocess.run(["systemctl", "--user", "stop", "mihomo"])
    print("Stop success")


def restart_mihomo():
    check_cap()
    subprocess.run(["systemctl", "--user", "restart", "mihomo"])
    print("Restart success")


def update_sub():
    subprocess.run([str(AUTO_UPDATE)])
    check_cap()
    restart_mihomo()


def check_cap():
    subprocess.run([str(CHECK_CAPABILITY)])


def exit_app():
    stop_mihomo()
    app.quit()


app = QApplication(sys.argv)

start_mihomo()

# 创建托盘图标
tray_icon = QSystemTrayIcon(QIcon("/home/akira/.local/share/icons/clash.png"), app)

# 创建右键菜单
menu = QMenu()
exit_action = QAction("退出")
exit_action.triggered.connect(exit_app)  # 修改这里
menu.addAction(exit_action)

menu.addAction("启动Mihomo", start_mihomo)
menu.addAction("终止Mihomo", stop_mihomo)
menu.addAction("重启Mihomo", restart_mihomo)
menu.addAction("更新订阅", update_sub)
menu.addAction("检查capability", check_cap)

tray_icon.setContextMenu(menu)
tray_icon.setToolTip("Mihomo")
tray_icon.show()

sys.exit(app.exec_())
