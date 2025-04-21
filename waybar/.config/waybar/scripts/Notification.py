#!/usr/bin/env python3

import os
import re
import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, GLib, Gdk

MAKO_FILE = "/tmp/mako.txt"
REFRESH_INTERVAL = 2000  # 2秒刷新间隔


class Notification:
    def __init__(self):
        self.id = ""
        self.message = ""
        self.app_name = ""
        self.urgency = ""
        self.timestamp = ""


class MakoHistoryViewer:
    def __init__(self):
        self.window = Gtk.Window()
        self.setup_ui()
        self.last_mtime = 0
        self.update_notifications()
        GLib.timeout_add(REFRESH_INTERVAL, self.check_updates)

    def setup_ui(self):
        self.window.set_title("通知历史记录")
        self.window.set_default_size(600, 400)
        self.window.connect("destroy", Gtk.main_quit)

        # 主容器
        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        main_box.set_margin_top(10)
        main_box.set_margin_bottom(10)
        main_box.set_margin_start(10)
        main_box.set_margin_end(10)

        # 工具栏
        toolbar = Gtk.Box(spacing=6)
        self.refresh_btn = Gtk.Button(label="手动刷新")
        self.refresh_btn.connect("clicked", self.update_notifications)
        toolbar.pack_start(self.refresh_btn, False, False, 0)
        main_box.pack_start(toolbar, False, False, 0)

        # 通知列表
        self.listbox = Gtk.ListBox()
        self.listbox.set_selection_mode(Gtk.SelectionMode.NONE)
        scrolled = Gtk.ScrolledWindow()
        scrolled.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        scrolled.add(self.listbox)
        main_box.pack_start(scrolled, True, True, 0)

        self.window.add(main_box)
        self.window.show_all()

    def parse_mako_file(self):
        notifications = []
        current_noti = None

        try:
            with open(MAKO_FILE, "r") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue

                    # 匹配通知头
                    header_match = re.match(r"^Notification (\d+): (.+)$", line)
                    if header_match:
                        if current_noti:
                            notifications.append(current_noti)
                        current_noti = Notification()
                        current_noti.id = header_match.group(1)
                        current_noti.message = header_match.group(2)
                        continue

                    # 匹配属性
                    prop_match = re.match(r"^\s*([\w\s]+):\s*(.+)$", line)
                    if prop_match and current_noti:
                        key = prop_match.group(1).strip().lower()
                        value = prop_match.group(2).strip()
                        if key == "app name":
                            current_noti.app_name = value
                        elif key == "urgency":
                            current_noti.urgency = value
                        elif key == "timestamp":
                            current_noti.timestamp = value

                if current_noti:
                    notifications.append(current_noti)
        except Exception as e:
            print(f"解析错误: {e}")

        return notifications

    def create_noti_row(self, noti):
        row = Gtk.ListBoxRow()
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=5)
        box.set_margin_top(10)
        box.set_margin_bottom(10)
        box.set_margin_start(10)
        box.set_margin_end(10)

        # 标题行
        header = Gtk.Box(spacing=10)
        icon = self.get_urgency_icon(noti.urgency)
        title_label = Gtk.Label(label=f"#{noti.id} - {noti.message}")
        title_label.set_xalign(0)
        header.pack_start(icon, False, False, 0)
        header.pack_start(title_label, True, True, 0)

        # 详细信息
        details = Gtk.Label(label=f"应用: {noti.app_name} | 优先级: {noti.urgency}")
        details.set_xalign(0)
        details.get_style_context().add_class("dim-label")

        box.pack_start(header, True, True, 0)
        box.pack_start(details, True, True, 0)
        row.add(box)
        return row

    def get_urgency_icon(self, urgency):
        icon_name = "dialog-information-symbolic"
        if urgency == "critical":
            icon_name = "dialog-error-symbolic"
        elif urgency == "low":
            icon_name = "dialog-warning-symbolic"
        return Gtk.Image.new_from_icon_name(icon_name, Gtk.IconSize.BUTTON)

    def update_list(self, notifications):
        # 清空现有内容
        for child in self.listbox.get_children():
            self.listbox.remove(child)

        # 添加新条目
        for noti in notifications:
            self.listbox.add(self.create_noti_row(noti))
        self.listbox.show_all()

    def check_updates(self):
        try:
            mtime = os.path.getmtime(MAKO_FILE)
            if mtime > self.last_mtime:
                self.update_notifications()
                self.last_mtime = mtime
        except Exception as e:
            print(f"检查更新失败: {e}")
        return True

    def update_notifications(self, widget=None):
        os.system("makoctl history > /tmp/mako.txt")
        notifications = self.parse_mako_file()
        self.update_list(notifications)


if __name__ == "__main__":
    os.system("makoctl history > /tmp/mako.txt")
    css = b"""
    .dim-label { opacity: 0.6; }
    list row { border-bottom: 1px solid @borders; }
    """
    css_provider = Gtk.CssProvider()
    css_provider.load_from_data(css)
    Gtk.StyleContext.add_provider_for_screen(
        Gdk.Screen.get_default(), css_provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    )

    viewer = MakoHistoryViewer()
    Gtk.main()
