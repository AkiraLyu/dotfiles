#!/usr/bin/env python3

import os
import signal
import subprocess
import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, GLib, Gdk

APP_PID = "/tmp/brightness-control.pid"


class BrightnessApp:
    def __init__(self):
        self.check_single_instance()
        self.main_window = None
        self.build_ui()

    def check_single_instance(self):
        if os.path.exists(APP_PID):
            with open(APP_PID, "r") as f:
                pid = f.read().strip()
            try:
                os.kill(int(pid), signal.SIGTERM)
            except ProcessLookupError:
                pass
        with open(APP_PID, "w") as f:
            f.write(str(os.getpid()))

    def get_brightness(self):
        try:
            current = int(
                subprocess.check_output(["brightnessctl", "get"]).decode().strip()
            )
            max_val = int(
                subprocess.check_output(["brightnessctl", "max"]).decode().strip()
            )
            return (current / max_val) * 100
        except Exception as e:
            print(f"Error getting brightness: {e}")
            return 50

    def set_brightness(self, percent):
        try:
            subprocess.run(["brightnessctl", "set", f"{int(percent)}%"], check=True)
            return True
        except subprocess.CalledProcessError as e:
            self.show_error(f"亮度设置失败: {e}")
            return False
        except FileNotFoundError:
            self.show_error("未找到brightnessctl命令")
            return False

    def show_error(self, message):
        dialog = Gtk.MessageDialog(
            transient_for=self.main_window,
            message_type=Gtk.MessageType.ERROR,
            buttons=Gtk.ButtonsType.OK,
            text=message,
        )
        dialog.run()
        dialog.destroy()

    def build_controls(self):
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        box.set_margin_top(10)
        box.set_margin_bottom(10)
        box.set_margin_start(10)
        box.set_margin_end(10)

        # 亮度标签
        self.brightness_label = Gtk.Label(
            label=f"当前亮度: {self.get_brightness():.0f}%"
        )
        box.pack_start(self.brightness_label, False, False, 0)

        # 亮度滑动条
        self.brightness_scale = Gtk.Scale.new_with_range(
            Gtk.Orientation.HORIZONTAL, 0, 100, 1
        )
        self.brightness_scale.set_value(self.get_brightness())
        self.brightness_scale.connect("value-changed", self.on_brightness_changed)
        box.pack_start(self.brightness_scale, False, False, 0)

        # 按钮栏
        button_box = Gtk.Box(spacing=6)

        presets = [10, 25, 50, 75, 100]
        for p in presets:
            btn = Gtk.Button(label=f"{p}%")
            btn.connect("clicked", self.on_preset_clicked, p)
            button_box.pack_start(btn, True, True, 0)

        box.pack_start(button_box, False, False, 5)

        return box

    def on_brightness_changed(self, scale):
        percent = scale.get_value()
        if self.set_brightness(percent):
            self.brightness_label.set_label(f"当前亮度: {percent:.0f}%")

    def on_preset_clicked(self, button, percent):
        self.brightness_scale.set_value(percent)

    def build_ui(self):
        self.main_window = Gtk.Window(title="亮度控制")
        self.main_window.set_default_size(400, 200)
        self.main_window.connect("destroy", Gtk.main_quit)

        main_box = self.build_controls()
        self.main_window.add(main_box)
        self.main_window.show_all()

    def cleanup(self):
        if os.path.exists(APP_PID):
            os.remove(APP_PID)


if __name__ == "__main__":
    app = BrightnessApp()
    signal.signal(signal.SIGINT, lambda s, f: Gtk.main_quit())
    Gtk.main()
    app.cleanup()
