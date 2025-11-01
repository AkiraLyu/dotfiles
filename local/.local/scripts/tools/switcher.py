#!/usr/bin/env python3
# niri_switcher.py
# 依赖: PyQt6
# 运行方式:
#   python niri_switcher.py
# 或传入文件:
#   python niri_switcher.py /path/to/niri_output.txt

import sys
import os
import subprocess
import re
from dataclasses import dataclass
from typing import List, Optional

from PyQt6.QtWidgets import (
    QApplication,
    QWidget,
    QHBoxLayout,
    QVBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QFrame,
)
from PyQt6.QtGui import QIcon, QKeyEvent, QFontMetrics, QFont
from PyQt6.QtCore import Qt, QSize, QTimer

# ---------- Config ----------
VISIBLE_COUNT = 4  # 横行可见图标数量（固定）
ICON_SIZE = 64  # 图标像素大小
TITLE_PIXEL_WIDTH = 240  # 标题显示区域宽度（像素），固定长度，按字体做裁剪
SCROLL_ANIMATE_STEPS = 6  # 滚动平滑步数（简单实现）
# ----------------------------


@dataclass
class WinEntry:
    window_id: str
    app_id: str
    title: str
    focused: bool = False


class NiriParser:
    @staticmethod
    def parse(text: str) -> List[WinEntry]:
        """
        解析 niri msg windows 命令输出文本，返回 WinEntry 列表
        """
        entries: List[WinEntry] = []
        # 切分成块，每块以 "Window ID" 开头
        blocks = re.split(r"\n(?=Window ID )", text)
        for block in blocks:
            if not block.strip():
                continue
            # Window ID 行
            m_id = re.search(r"Window ID\s+([0-9]+):", block)
            if not m_id:
                continue
            window_id = m_id.group(1)
            # (focused) 在 Window ID 行或下一行出现
            focused = "(focused)" in block.splitlines()[0] or "(focused)" in block
            # Title
            m_title = re.search(r'Title:\s*"(.*?)"', block, flags=re.S)
            title = m_title.group(1) if m_title else ""
            # App ID
            m_app = re.search(r'App ID:\s*"(.*?)"', block)
            app_id = m_app.group(1) if m_app else ""
            entries.append(
                WinEntry(
                    window_id=window_id, app_id=app_id, title=title, focused=focused
                )
            )
        return entries


class IconButton(QPushButton):
    def __init__(self, win: WinEntry, parent=None):
        super().__init__(parent)
        self.win = win
        self.setCheckable(True)
        self.setAutoExclusive(True)
        self.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.setFixedSize(ICON_SIZE + 20, ICON_SIZE + 20)  # padding for border
        self.setIconSize(QSize(ICON_SIZE, ICON_SIZE))
        icon = self._load_icon(win.app_id)
        self.setIcon(icon)
        # tooltip show title (optional)
        self.setToolTip(win.title)

    def _load_icon(self, app_id: str) -> QIcon:
        # Use get_icon_name to resolve .desktop file icon name
        icon_name = (
            self.parent().get_icon_name(app_id)
            if hasattr(self.parent(), "get_icon_name")
            else app_id
        )
        qicon = QIcon.fromTheme(icon_name)
        if qicon.isNull():
            # fallback: try app_id directly
            qicon = QIcon.fromTheme(app_id)
        if qicon.isNull():
            # final fallback: generic icon
            return (
                QApplication.instance()
                .style()
                .standardIcon(QApplication.style().StandardPixmap.SP_FileIcon)
            )
        return qicon


class SwitcherWindow(QWidget):
    def __init__(self, entries: List[WinEntry]):
        super().__init__()
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setFocus()
        self.setWindowTitle("niri window switcher")
        self.entries = entries
        self.current_index = 0
        # if any is focused, pick first focused as current
        for i, e in enumerate(entries):
            if e.focused:
                self.current_index = i
                break

        # UI
        self.main_layout = QVBoxLayout(self)
        self.main_layout.setContentsMargins(12, 12, 12, 12)
        self.main_layout.setSpacing(8)

        # Title label (centered)
        self.title_label = QLabel("", self)
        self.title_label.setFixedWidth(TITLE_PIXEL_WIDTH)
        title_font = QFont()
        title_font.setPointSize(12)
        self.title_label.setFont(title_font)
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.main_layout.addWidget(
            self.title_label, alignment=Qt.AlignmentFlag.AlignHCenter
        )

        # Scroll area with a single horizontal row
        self.scroll = QScrollArea(self)
        self.scroll.setWidgetResizable(True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll.setFrameShape(QFrame.Shape.NoFrame)
        self.scroll.setFocusPolicy(Qt.FocusPolicy.NoFocus)

        container = QWidget()
        self.hbox = QHBoxLayout(container)
        self.hbox.setContentsMargins(0, 0, 0, 0)
        self.hbox.setSpacing(6)

        # Build buttons
        self.buttons: List[IconButton] = []
        for entry in self.entries:
            btn = IconButton(entry, parent=self)
            btn.clicked.connect(self._on_button_clicked_factory(len(self.buttons)))
            self.hbox.addWidget(btn)
            self.buttons.append(btn)

        self.hbox.addStretch()
        self.scroll.setWidget(container)
        self.main_layout.addWidget(self.scroll)

        self._update_selection(initial=True)
        self.resize(800, 200)

    def focusOutEvent(self, event):
        """
        当窗口失去焦点时，自动退出程序。
        这让切换器表现得像一个 Alt+Tab 弹出窗口。
        """
        # 调用 QApplication.quit() 退出应用程序
        QApplication.quit()
        # 确保调用基类的实现，尽管在这种情况下它不会做太多
        super().focusOutEvent(event)

    # -------- icon lookup function (user provided logic) ----------
    def get_icon_name(self, app_id: str) -> str:
        """
        根据 app_id 查找对应 .desktop 文件并返回 Icon 名称
        """
        import os

        icon_name = app_id  # 默认使用 app_id

        # 搜索路径
        desktop_dirs = [
            "/usr/share/applications",
            os.path.expanduser("~/.local/share/applications"),
        ]

        # 手动设置
        if app_id == "Code":
            return "code"
        if app_id == "Splayer":
            return "splayer"

        for ddir in desktop_dirs:
            desktop_file = os.path.join(ddir, f"{app_id}.desktop")
            if os.path.isfile(desktop_file):
                try:
                    with open(desktop_file, "r", encoding="utf-8") as f:
                        for line in f:
                            if line.startswith("Icon="):
                                icon_name = line.strip().split("=", 1)[1]
                                return icon_name
                except Exception as e:
                    print(f"读取 {desktop_file} 出错: {e}")
                    continue

        # 如果没有找到对应的 desktop 文件或 Icon，仍返回默认 app_id
        return icon_name

    # ----------------------------------------------------------------

    def _on_button_clicked_factory(self, idx):
        def handler():
            self.current_index = idx
            self._update_selection()
            self.activate_current()

        return handler

    def keyPressEvent(self, event: QKeyEvent):
        key = event.key()
        if key in (Qt.Key.Key_Right,):
            self._move(1)
        elif key in (Qt.Key.Key_Left,):
            self._move(-1)
        elif key in (Qt.Key.Key_Tab,):
            # Tab forward
            self._move(1)
        elif key in (Qt.Key.Key_Backtab,):
            # Shift+Tab backward
            self._move(-1)
        elif key in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            self.activate_current()
        elif key in (Qt.Key.Key_Escape,):
            sys.exit(0)
        else:
            super().keyPressEvent(event)

    def _move(self, delta: int):
        n = len(self.entries)
        if n == 0:
            return
        self.current_index = (self.current_index + delta) % n  # wrap-around
        self._update_selection()

    def _update_selection(self, initial: bool = False):
        # Update checked state
        for i, b in enumerate(self.buttons):
            b.setChecked(i == self.current_index)
            # highlight (border) for selected
            if i == self.current_index:
                b.setStyleSheet("border: 2px solid #4A90E2; border-radius: 6px;")
            else:
                b.setStyleSheet("border: none;")

        # Update centered title text with eliding (considering chinese/english width using QFontMetrics)
        fm = QFontMetrics(self.title_label.font())
        title = self.entries[self.current_index].title
        elided = fm.elidedText(title, Qt.TextElideMode.ElideRight, TITLE_PIXEL_WIDTH)
        self.title_label.setText(elided)

        # Ensure selected button is centered in the visible area
        QTimer.singleShot(0, self._scroll_to_current)  # defer to allow layout to settle

    def _scroll_to_current(self):
        if not self.buttons:
            return
        btn = self.buttons[self.current_index]
        # Compute the target scrollbar value such that btn is centered
        area_w = self.scroll.viewport().width()
        # get button center relative to container
        container = self.scroll.widget()
        btn_pos = btn.mapTo(container, btn.rect().topLeft())
        btn_center_x = btn_pos.x() + btn.width() // 2
        target_x = max(0, btn_center_x - area_w // 2)
        sb = self.scroll.horizontalScrollBar()
        # simple smooth scroll
        start = sb.value()
        diff = target_x - start
        if abs(diff) < 4:
            sb.setValue(target_x)
            return
        # do a few steps
        for step in range(1, SCROLL_ANIMATE_STEPS + 1):
            val = start + diff * step // SCROLL_ANIMATE_STEPS
            QTimer.singleShot(step * 12, lambda v=val: sb.setValue(int(v)))

    def activate_current(self):
        entry = self.entries[self.current_index]
        # call niri msg action focus-window --id [Window ID]
        cmd = ["niri", "msg", "action", "focus-window", "--id", entry.window_id]
        try:
            subprocess.run(cmd, check=True)
        except Exception as e:
            # fallback: print to stdout (useful for testing)
            print("执行切换命令失败，命令:", " ".join(cmd), "错误:", e)
        QApplication.quit()
        sys.exit(0)


# ---------- helper: obtain niri output ----------
def get_niri_output_from_cmd_or_file(path: Optional[str] = None) -> str:
    if path:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    # Try calling niri msg windows
    try:
        p = subprocess.run(
            ["niri", "msg", "windows"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            encoding="utf-8",
        )
        return p.stdout
    except Exception as e:
        # If command fails, try read from stdin (if piped)
        if not sys.stdin.isatty():
            return sys.stdin.read()
        # last resort: return example empty string
        print(
            "无法执行 'niri msg windows'，请传入输出文件路径或通过 stdin 提供输出。错误：",
            e,
            file=sys.stderr,
        )
        return ""


# ---------- main ----------
def main():
    path_arg = sys.argv[1] if len(sys.argv) > 1 else None
    raw = get_niri_output_from_cmd_or_file(path_arg)
    entries = NiriParser.parse(raw)

    if not entries:
        # as fallback, print a hint and exit
        print(
            "未解析到任何窗口条目，请确保 'niri msg windows' 输出正确或提供文件路径。"
        )
        sys.exit(1)

    app = QApplication(sys.argv)
    w = SwitcherWindow(entries)
    w.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
