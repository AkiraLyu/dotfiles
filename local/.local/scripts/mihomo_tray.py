import sys
from PyQt5.QtWidgets import QApplication, QSystemTrayIcon, QMenu, QAction
from PyQt5.QtGui import QIcon
import subprocess


def start_mihomo():
    subprocess.run(["systemctl", "start", "mihomo"])


def stop_mihomo():
    subprocess.run(["systemctl", "stop", "mihomo"])


def restart_mihomo():
    subprocess.run(["systemctl", "restart", "mihomo"])


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

tray_icon.setContextMenu(menu)
tray_icon.setToolTip("Mihomo")
tray_icon.show()

sys.exit(app.exec_())
