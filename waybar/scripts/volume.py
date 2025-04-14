#!/usr/bin/env python3

import os
import signal
import subprocess
import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, GLib, Gdk

APP_PID = "/tmp/bluetooth-control.pid"
ICON_MAP = {
    "phone": "phone-symbolic",
    "computer": "computer-symbolic",
    "audio-card": "audio-headphones-symbolic",
    "input-gaming": "input-gaming-symbolic",
    "dialog-error": "dialog-error-symbolic",
}


class BluetoothApp:
    def __init__(self):
        self.check_single_instance()
        self.scan_process = None
        self.main_window = None
        self.current_device = "未连接"
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

    def get_bt_device(self):
        try:
            info = subprocess.check_output(["bluetoothctl", "info"], timeout=2)
            for line in info.decode().split("\n"):
                if line.startswith("Name:"):
                    return line.split("Name: ")[1].strip()
        except Exception:
            pass
        return "未连接"

    def bt_connect(self, button):
        self.scan_devices()

    def scan_devices(self):
        dialog = Gtk.Dialog(title="扫描设备", transient_for=self.main_window, flags=0)
        dialog.add_button("取消", Gtk.ResponseType.CANCEL)

        content = dialog.get_content_area()
        progress = Gtk.ProgressBar(show_text=True)
        progress.set_text("正在搜索蓝牙设备...")
        content.add(progress)
        dialog.show_all()

        def update_progress():
            progress.pulse()
            return True

        progress_id = GLib.timeout_add(100, update_progress)

        def on_response(dialog, response):
            if response == Gtk.ResponseType.CANCEL:
                if self.scan_process:
                    self.scan_process.terminate()
            GLib.source_remove(progress_id)
            dialog.destroy()
            if response == Gtk.ResponseType.CANCEL:
                return
            self.show_device_list()

        dialog.connect("response", on_response)
        self.start_scan()

    def start_scan(self):
        self.scan_process = subprocess.Popen(
            ["bluetoothctl", "scan", "on"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        GLib.timeout_add_seconds(5, self.stop_scan)

    def stop_scan(self):
        if self.scan_process:
            self.scan_process.terminate()
            self.scan_process = None
        subprocess.run(["bluetoothctl", "scan", "off"], check=False)
        return False

    def show_device_list(self):
        devices = []
        output = subprocess.check_output(["bluetoothctl", "devices"]).decode()
        for line in output.split("\n"):
            if not line:
                continue
            parts = line.split()
            mac = parts[1]
            name = " ".join(parts[2:])
            devices.append((mac, name))

        dialog = Gtk.Dialog(title="选择设备", transient_for=self.main_window)
        dialog.add_button("连接", Gtk.ResponseType.OK)
        dialog.add_button("取消", Gtk.ResponseType.CANCEL)

        store = Gtk.ListStore(str, str, str)
        for mac, name in devices:
            icon = self.get_device_icon(mac)
            store.append([mac, icon, name])

        tree = Gtk.TreeView(model=store)
        renderer = Gtk.CellRendererPixbuf()
        column = Gtk.TreeViewColumn("类型", renderer, icon_name=1)
        tree.append_column(column)

        renderer = Gtk.CellRendererText()
        column = Gtk.TreeViewColumn("MAC", renderer, text=0)
        tree.append_column(column)

        column = Gtk.TreeViewColumn("名称", renderer, text=2)
        tree.append_column(column)

        dialog.get_content_area().add(tree)
        dialog.set_default_size(600, 400)
        dialog.show_all()

        if dialog.run() == Gtk.ResponseType.OK:
            selection = tree.get_selection()
            model, treeiter = selection.get_selected()
            if treeiter:
                mac = model[treeiter][0]
                self.connect_device(mac)

        dialog.destroy()

    def get_device_icon(self, mac):
        try:
            info = subprocess.check_output(["bluetoothctl", "info", mac], timeout=2)
            for line in info.decode().split("\n"):
                if line.startswith("Icon:"):
                    icon = line.split("Icon: ")[1].strip()
                    return ICON_MAP.get(icon, "dialog-question-symbolic")
        except Exception:
            pass
        return "dialog-question-symbolic"

    def connect_device(self, mac):
        dialog = Gtk.Dialog(title="正在连接", transient_for=self.main_window)
        progress = Gtk.ProgressBar(show_text=True)
        progress.set_text(f"尝试连接 {mac}...")
        dialog.get_content_area().add(progress)
        dialog.show_all()

        def update_progress():
            progress.pulse()
            return True

        progress_id = GLib.timeout_add(100, update_progress)

        try:
            result = subprocess.run(
                ["bluetoothctl", "connect", mac], timeout=10, capture_output=True
            )
            if "successful" in result.stdout.decode():
                message = "连接成功！"
                self.current_device = self.get_bt_device()
                self.update_device_info()
            else:
                message = "连接失败！请检查设备"
            GLib.source_remove(progress_id)
            dialog.destroy()
            self.show_message(message)
        except Exception as e:
            print(e)

    def show_message(self, text):
        dialog = Gtk.MessageDialog(
            transient_for=self.main_window,
            message_type=Gtk.MessageType.INFO,
            buttons=Gtk.ButtonsType.OK,
            text=text,
        )
        dialog.run()
        dialog.destroy()

    def update_device_info(self):
        self.device_label.set_label(self.get_bt_device())

    def build_audio_controls(self):
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)

        # 设备信息
        self.device_label = Gtk.Label(label=self.get_bt_device())
        box.pack_start(self.device_label, False, False, 0)

        # 连接按钮
        connect_btn = Gtk.Button(label="连接设备")
        connect_btn.connect("clicked", self.bt_connect)
        box.pack_start(connect_btn, False, False, 0)

        # 音量控制
        vol_label = Gtk.Label(label="播放音量")
        box.pack_start(vol_label, False, False, 0)
        self.vol_scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1)
        self.vol_scale.set_value(self.get_volume())
        self.vol_scale.connect("value-changed", self.on_volume_changed)
        box.pack_start(self.vol_scale, False, False, 0)

        # 麦克风控制
        mic_label = Gtk.Label(label="麦克风")
        box.pack_start(mic_label, False, False, 0)
        self.mic_scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1)
        self.mic_scale.set_value(self.get_mic_volume())
        self.mic_scale.connect("value-changed", self.on_mic_changed)
        box.pack_start(self.mic_scale, False, False, 0)

        return box

    def get_volume(self):
        try:
            return float(
                subprocess.check_output(["pamixer", "--get-volume"]).decode().strip()
            )
        except Exception:
            return 50

    def get_mic_volume(self):
        try:
            return float(
                subprocess.check_output(["pamixer", "--default-source", "--get-volume"])
                .decode()
                .strip()
            )
        except Exception:
            return 50

    def on_volume_changed(self, scale):
        vol = int(scale.get_value())
        subprocess.run(["pamixer", "--set-volume", str(vol)])

    def on_mic_changed(self, scale):
        vol = int(scale.get_value())
        subprocess.run(["pamixer", "--default-source", "--set-volume", str(vol)])

    def build_ui(self):
        self.main_window = Gtk.Window(title="蓝牙音频控制")
        self.main_window.set_default_size(350, 300)
        self.main_window.connect("destroy", Gtk.main_quit)

        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        main_box.set_margin_top(10)
        main_box.set_margin_bottom(10)
        main_box.set_margin_start(10)
        main_box.set_margin_end(10)

        # 音频控制部分
        audio_box = self.build_audio_controls()
        main_box.pack_start(audio_box, True, True, 0)

        # 按钮栏
        button_box = Gtk.Box(spacing=6)

        refresh_btn = Gtk.Button(label="刷新")
        refresh_btn.connect("clicked", lambda b: self.update_device_info())
        button_box.pack_start(refresh_btn, True, True, 0)

        pavu_btn = Gtk.Button(label="音频设置")
        pavu_btn.connect("clicked", lambda b: subprocess.Popen(["pavucontrol"]))
        button_box.pack_start(pavu_btn, True, True, 0)

        exit_btn = Gtk.Button(label="退出")
        exit_btn.connect("clicked", lambda b: Gtk.main_quit())
        button_box.pack_start(exit_btn, True, True, 0)

        main_box.pack_start(button_box, False, False, 0)

        self.main_window.add(main_box)
        self.main_window.show_all()

    def cleanup(self):
        if os.path.exists(APP_PID):
            os.remove(APP_PID)
        if self.scan_process:
            self.scan_process.terminate()


if __name__ == "__main__":
    app = BluetoothApp()
    signal.signal(signal.SIGINT, lambda s, f: Gtk.main_quit())
    Gtk.main()
    app.cleanup()
