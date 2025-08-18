#!/usr/bin/env python3

import json
import subprocess
import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, GLib, Gdk

# 直接调用 busctl 命令
MAKO_COMMAND = [
    "busctl",
    "--json=short",
    "--user",
    "call",
    "org.freedesktop.Notifications",
    "/fr/emersion/Mako",
    "fr.emersion.Mako",
    "ListHistory",
]
REFRESH_INTERVAL = 5000  # 5秒刷新间隔


class Notification:
    """用于存储单条通知信息的数据类"""

    def __init__(self):
        self.id = 0
        self.app_name = ""
        self.summary = ""  # 通知标题
        self.body = ""  # 通知正文
        self.urgency = ""  # low, normal, critical


class MakoHistoryViewer:
    def __init__(self):
        self.window = Gtk.Window()
        self.setup_ui()
        self.update_notifications()  # 初始加载
        # 设置定时器，定期调用 update_notifications 并保持定时器持续运行
        GLib.timeout_add(REFRESH_INTERVAL, lambda: self.update_notifications() or True)

    def setup_ui(self):
        self.window.set_title("Mako 通知历史")
        self.window.set_default_size(600, 500)
        self.window.connect("destroy", Gtk.main_quit)

        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        main_box.set_margin_top(10)
        main_box.set_margin_bottom(10)
        main_box.set_margin_start(10)
        main_box.set_margin_end(10)

        toolbar = Gtk.Box(spacing=6)
        self.refresh_btn = Gtk.Button(label="手动刷新")
        # 连接按钮点击事件到刷新函数
        self.refresh_btn.connect("clicked", self.update_notifications)
        toolbar.pack_start(self.refresh_btn, False, False, 0)
        main_box.pack_start(toolbar, False, False, 0)

        self.listbox = Gtk.ListBox()
        self.listbox.set_selection_mode(Gtk.SelectionMode.NONE)
        scrolled = Gtk.ScrolledWindow()
        scrolled.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        scrolled.add(self.listbox)
        main_box.pack_start(scrolled, True, True, 0)

        self.window.add(main_box)
        self.window.show_all()

    def fetch_and_parse_notifications(self):
        """执行命令获取并解析JSON格式的通知历史"""
        notifications = []
        try:
            # 使用 subprocess 运行命令并捕获输出
            result = subprocess.run(
                MAKO_COMMAND, capture_output=True, text=True, check=True
            )
            # 解析JSON数据
            json_data = json.loads(result.stdout)

            # 数据嵌套在 "data"[0] 中
            for item in json_data.get("data", [[]])[0]:
                noti = Notification()
                noti.id = item.get("id", {}).get("data", 0)
                noti.app_name = item.get("app-name", {}).get("data", "N/A")
                noti.summary = item.get("summary", {}).get("data", "")
                noti.body = item.get("body", {}).get("data", "")
                # 转换 urgency 的数字代码为可读字符串
                urgency_code = item.get("urgency", {}).get("data", 1)
                noti.urgency = self.map_urgency(urgency_code)
                notifications.append(noti)

        except FileNotFoundError:
            print("错误: 'busctl' 命令未找到，请确保已安装 systemd。")
            return []
        except subprocess.CalledProcessError as e:
            print(f"执行命令失败: {e}\n{e.stderr}")
            return []
        except json.JSONDecodeError as e:
            print(f"解析JSON失败: {e}")
            return []
        except Exception as e:
            print(f"发生未知错误: {e}")
            return []

        # 通知通常按ID降序排列，这里反转列表使其按时间顺序（旧->新）
        return list(notifications)

    def map_urgency(self, code):
        """将Freedesktop规范的urgency代码映射为字符串"""
        if code == 0:
            return "low"
        if code == 2:
            return "critical"
        return "normal"

    def create_noti_row(self, noti):
        """为单条通知创建Gtk列表行"""
        row = Gtk.ListBoxRow()
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        box.set_margin_top(12)
        box.set_margin_bottom(12)
        box.set_margin_start(12)
        box.set_margin_end(12)

        # 头部：图标 + 标题
        header_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        icon = self.get_urgency_icon(noti.urgency)
        # 使用 Pango 标记加粗标题
        summary_label = Gtk.Label()
        summary_label.set_markup(f"<b>{GLib.markup_escape_text(noti.summary)}</b>")
        summary_label.set_xalign(0)
        summary_label.set_line_wrap(True)
        header_box.pack_start(icon, False, False, 0)
        header_box.pack_start(summary_label, True, True, 0)
        box.pack_start(header_box, False, False, 0)

        # 正文
        if noti.body:
            body_label = Gtk.Label()
            # body 可能包含HTML/Pango标签，直接使用 set_markup
            body_label.set_markup(noti.body)
            body_label.set_xalign(0)
            body_label.set_line_wrap(True)
            body_label.get_style_context().add_class("body-label")
            box.pack_start(body_label, False, False, 0)

        # 底部信息：应用名 + 优先级
        details_label = Gtk.Label(
            label=f"来自: {noti.app_name} | ID: {noti.id} | 优先级: {noti.urgency}"
        )
        details_label.set_xalign(0)
        details_label.get_style_context().add_class("dim-label")
        box.pack_start(details_label, False, False, 0)

        row.add(box)
        return row

    def get_urgency_icon(self, urgency):
        """根据优先级返回不同的图标"""
        if urgency == "critical":
            icon_name = "dialog-error-symbolic"
        elif urgency == "low":
            icon_name = "dialog-warning-symbolic"
        else:  # normal
            icon_name = "dialog-information-symbolic"
        return Gtk.Image.new_from_icon_name(icon_name, Gtk.IconSize.BUTTON)

    def update_list(self, notifications):
        """清空并重新填充通知列表"""
        for child in self.listbox.get_children():
            self.listbox.remove(child)

        for noti in notifications:
            row = self.create_noti_row(noti)
            self.listbox.add(row)
        self.listbox.show_all()

    def update_notifications(self, widget=None):
        """刷新通知的主函数"""
        notifications = self.fetch_and_parse_notifications()
        self.update_list(notifications)


if __name__ == "__main__":
    # 首先，将CSS定义为常规字符串 (去掉了前面的 'b')
    # 这样字符串里就可以包含中文等非ASCII字符了
    css_string = """
    .dim-label { 
        opacity: 0.7; 
        font-size: small;
    }
    .body-label {
        margin-left: 26px; /* 与图标+间距对齐 */
    }
    list row { 
        border-bottom: 1px solid @borders; 
    }
    list {
        background-color: @base_color;
    }
    """
    css_provider = Gtk.CssProvider()

    # 在加载数据时，将字符串编码为bytes
    css_provider.load_from_data(css_string.encode("utf-8"))

    Gtk.StyleContext.add_provider_for_screen(
        Gdk.Screen.get_default(), css_provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    )

    viewer = MakoHistoryViewer()
    Gtk.main()
