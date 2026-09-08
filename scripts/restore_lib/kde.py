"""KDE settings are snapshots restored as files, never application-writable links."""

import hashlib
from pathlib import Path, PurePosixPath
import shutil

from .common import atomic_write, load_json, save_json, timestamp


CONFIGS = (
    "kdeglobals", "kwinrc", "kwinrulesrc", "kglobalshortcutsrc",
    "plasma-org.kde.plasma.desktop-appletsrc", "plasmarc", "plasmashellrc",
    "kxkbrc", "kcminputrc", "mimeapps.list", "kwalletrc", "kscreenlockerrc",
    "ksmserverrc", "krunnerrc", "dolphinrc", "plasma-localerc", "plasmanotifyrc",
    "kded5rc", "kded6rc", "breezerc", "powerdevilrc", "kactivitymanagerdrc",
)
DESKTOP = ".local/share/applications/org.kde.kate.desktop"
THEME = ".local/share/plasma/desktoptheme/darkly-translucent"
THEME_STATE = (".local/state/theme/mode", ".local/state/theme/preset")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def clean_desktop(text):
    """Kate's generated session actions belong to the runtime copy only."""
    lines = []
    in_action = False
    for line in text.splitlines():
        if line.startswith("["):
            in_action = line.startswith("[Desktop Action ")
        if not in_action and not line.startswith("Actions="):
            lines.append(line)
    return "\n".join(lines).rstrip() + "\n"


def export(ctx):
    root = ctx.repo / "qt-plasma/state"
    files = {}
    for relative in [f".config/{name}" for name in CONFIGS] + list(THEME_STATE):
        path = ctx.target / relative
        if path.is_file():
            files[relative] = path.read_bytes()
    theme = ctx.target / THEME
    if theme.is_dir():
        for path in sorted(theme.rglob("*")):
            if path.is_symlink():
                raise ValueError(f"KDE 主题快照不接收链接：{path}")
            if path.is_file():
                files[str(path.relative_to(ctx.target))] = path.read_bytes()
    if not files:
        raise ValueError("没有找到 KDE 配置")
    if root.exists():
        shutil.rmtree(root)
    for relative, data in files.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    save_json(root / "manifest.json", {
        "schema_version": 1, "exported_at": timestamp(), "home": str(ctx.target),
        "files": {name: digest(data) for name, data in sorted(files.items())},
    })
    desktop = ctx.target / DESKTOP
    if desktop.is_file():
        template = ctx.repo / "qt-plasma/templates/org.kde.kate.desktop"
        template.parent.mkdir(parents=True, exist_ok=True)
        template.write_text(clean_desktop(desktop.read_text()))
    print(f"已保存 {len(files)} 份 KDE 设置：{root}")


def inputs(ctx):
    root = ctx.repo / "qt-plasma/state"
    manifest = load_json(root / "manifest.json")
    allowed = {f".config/{name}" for name in CONFIGS} | set(THEME_STATE)
    def valid(name):
        path = PurePosixPath(name)
        return (not path.is_absolute() and ".." not in path.parts and str(path) == name
                and (name in allowed or name.startswith(THEME + "/")))
    if manifest.get("schema_version") != 1 or not manifest.get("files") \
            or not all(valid(name) for name in manifest["files"]):
        raise ValueError("KDE 快照清单无效")
    old_home = manifest["home"]
    if not isinstance(old_home, str) or not old_home.startswith("/") or old_home == "/":
        raise ValueError("KDE 快照 HOME 无效")
    result = {}
    for relative, expected in manifest["files"].items():
        path = root / relative
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"KDE 快照必须是独立文件：{relative}")
        data = path.read_bytes()
        if digest(data) != expected:
            raise ValueError(f"KDE 快照摘要不匹配：{relative}")
        result[relative] = (data.decode().replace(old_home + "/", str(ctx.target) + "/").encode()
                            if relative.startswith(".config/") else data)
    template = ctx.repo / "qt-plasma/templates/org.kde.kate.desktop"
    result[DESKTOP] = clean_desktop(template.read_text()).encode()
    return result


def plan(ctx, *, desktop_only=False):
    desired = inputs(ctx) if not desktop_only else {
        DESKTOP: clean_desktop((ctx.repo / "qt-plasma/templates/org.kde.kate.desktop").read_text()).encode()
    }
    result = []
    for relative, data in desired.items():
        path = ctx.target / relative
        for parent in path.parents:
            if parent == ctx.target:
                break
            if parent.is_symlink():
                raise ValueError(f"KDE 目标父目录是链接：{parent}")
        if path.is_symlink():
            raise ValueError(f"KDE 目标必须是独立文件，未覆盖：{path}")
        elif path.exists():
            if not path.is_file():
                raise ValueError(f"KDE 目标不是普通文件：{path}")
            if relative == DESKTOP:
                # Once a runtime copy exists, preserve Kate's new session actions.
                continue
            if path.read_bytes() != data:
                raise ValueError(f"KDE 设置已不同，未覆盖：{path}；请先导出或移开后再恢复")
            continue
        result.append((path, data))
    return result


def preflight(ctx):
    changes = plan(ctx)
    print(f"  KDE：桌面设置、主题选择、派生主题及 Kate 入口，{len(changes)} 个独立文件待恢复")


def restore(ctx, *, desktop_only=False):
    changes = plan(ctx, desktop_only=desktop_only)
    for path, data in changes:
        print(f"  复制 KDE 文件：{path}")
        if not ctx.check:
            atomic_write(path, data)
    print("KDE 配置计划检查完成。" if ctx.check else "KDE 配置复制完成；在下次登录时读取，不重载当前桌面。")
