"""Build the saved KDE sources into one removable pacman package."""

import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

from .common import capture, save_json, timestamp


PROJECTS = ("appgrid", "kate-translucent-bars", "wechat-glass-live")
BUILD_DEPS = ("cmake", "ninja", "extra-cmake-modules", "qt6-base", "qt6-declarative",
              "qt6-wayland", "kcoreaddons", "ktexteditor", "kwidgetsaddons", "kconfig",
              "kwindowsystem", "kwin", "libxcb", "wayland")
NAME = "dotfiles-kde-plugins"


def source_files(ctx, project):
    prefix = Path("local/.local/src") / project
    result = subprocess.run(["git", "-C", str(ctx.repo), "ls-files", "-z", "--cached",
                             "--others", "--exclude-standard", "--", str(prefix)],
                            stdout=subprocess.PIPE, check=True)
    files = sorted(set(os.fsdecode(p) for p in result.stdout.split(b"\0") if p))
    if not files or str(prefix / "CMakeLists.txt") not in files:
        raise ValueError(f"KDE 源码不完整：{project}")
    for relative in files:
        path = ctx.repo / relative
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"KDE 构建源文件不是独立文件：{path}")
    return files


def preflight(ctx):
    for project in PROJECTS:
        source_files(ctx, project)
    (ctx.repo / "qt-plasma/packaging/PKGBUILD.in").read_text()


def prepare(ctx, directory):
    manifests = {}
    sums = []
    for project in PROJECTS:
        files = source_files(ctx, project)
        entries = {}
        archive = directory / f"{project}.tar"
        with tarfile.open(archive, "w", format=tarfile.PAX_FORMAT) as tar:
            for relative in files:
                path = ctx.repo / relative
                data = path.read_bytes()
                local = str(Path(relative).relative_to("local/.local/src"))
                entries[local] = hashlib.sha256(data).hexdigest()
                info = tar.gettarinfo(path, arcname=local)
                info.uid = info.gid = 0
                info.uname = info.gname = ""
                info.mtime = 0
                tar.addfile(info, io.BytesIO(data))
        manifests[project] = entries
        sums.append(hashlib.sha256(archive.read_bytes()).hexdigest())
    source_id = hashlib.sha256(json.dumps(manifests, sort_keys=True).encode()).hexdigest()[:12]
    metadata = directory / "source-manifest.json"
    recipe = (ctx.repo / "qt-plasma/packaging/PKGBUILD.in").read_text()
    save_json(metadata, {"source_id": source_id, "files": manifests,
                         "recipe_sha256": hashlib.sha256(recipe.encode()).hexdigest(),
                         "built_against": capture("pacman", "-Q", "qt6-base", "kwin", "ktexteditor").splitlines()})
    sums.append(hashlib.sha256(metadata.read_bytes()).hexdigest())
    # Time makes an explicit rebuild installable after a library upgrade even
    # when the plugin source itself did not change.
    version = timestamp().split(".")[0].replace("T", ".")
    (directory / "PKGBUILD").write_text(recipe.replace("@VERSION@", version)
                                        .replace("@SHA256SUMS@", " ".join(f"'{s}'" for s in sums)))


def is_current(ctx):
    metadata = Path("/usr/share/doc") / NAME / "source-manifest.json"
    if not metadata.is_file():
        return False
    saved = json.loads(metadata.read_text())
    if not isinstance(saved, dict):
        return False
    if saved.get("recipe_sha256") != hashlib.sha256(
            (ctx.repo / "qt-plasma/packaging/PKGBUILD.in").read_bytes()).hexdigest():
        return False
    if saved.get("built_against") != capture("pacman", "-Q", "qt6-base", "kwin", "ktexteditor").splitlines():
        return False
    current = {}
    for project in PROJECTS:
        current[project] = {str(Path(p).relative_to("local/.local/src")):
                            hashlib.sha256((ctx.repo / p).read_bytes()).hexdigest()
                            for p in source_files(ctx, project)}
    return saved.get("files") == current and subprocess.run(
        ["pacman", "-Qkk", NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def restore(ctx):
    preflight(ctx)
    if is_current(ctx):
        print("  KDE 插件包源码、Qt/KWin/KTextEditor 版本一致，保留现有安装")
        return
    if ctx.check:
        print("  KDE 原生插件：安装缺少的构建依赖 → 打包三个源码目录 → App Grid 测试 → pacman -U")
        return
    missing = subprocess.run(["pacman", "-T", *BUILD_DEPS], text=True, capture_output=True)
    if missing.returncode not in (0, 127):
        raise RuntimeError("不能查询 KDE 构建依赖")
    if missing.stdout.strip():
        ctx.run("run0", "pacman", "-S", "--needed", "--asdeps", *missing.stdout.splitlines())
    output = ctx.backup / "packages" / NAME
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".kde-build-", dir=output.parent) as temporary:
        work = Path(temporary)
        prepare(ctx, work)
        env = dict(os.environ, PKGDEST=str(work), SRCDEST=str(work), BUILDDIR=str(work), PKGEXT=".pkg.tar.zst")
        ctx.run("makepkg", "--cleanbuild", "--force", "--noconfirm", cwd=work, env=env)
        packages = list(work.glob(f"{NAME}-*.pkg.tar.zst"))
        if len(packages) != 1:
            raise ValueError("KDE 构建未生成唯一软件包")
        if output.exists():
            shutil.rmtree(output)
        output.mkdir()
        for path in (packages[0], work / "PKGBUILD", work / "source-manifest.json",
                     *(work / f"{project}.tar" for project in PROJECTS)):
            shutil.copy2(path, output / path.name)
        package = output / packages[0].name
    ctx.run("run0", "pacman", "-U", package)
    print("KDE 原生插件已由 pacman 管理；下次登录加载，未重启 Plasma/KWin/Kate。")
