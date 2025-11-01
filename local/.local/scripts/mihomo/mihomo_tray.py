#!/bin/python

import sys
from PyQt5.QtWidgets import QApplication, QSystemTrayIcon, QMenu, QAction
from PyQt5.QtGui import QIcon
import subprocess


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
    subprocess.run(["/home/akira/.local/scripts/mihomo/auto_update.sh"])
    check_cap()
    restart_mihomo()


def check_cap():
    subprocess.run(["/home/akira/.local/scripts/mihomo/check_cap.sh"])


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
