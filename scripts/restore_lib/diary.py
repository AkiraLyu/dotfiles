"""Build the saved diary worktree without personal data or development caches."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile

from .common import capture, save_json


NAME = "shiguang-diary"
SOURCE = "local/.local/src/diary"
FILES = ("PKGBUILD", "package.json", "package-lock.json", "README.md", "server.mjs",
         "build/icon.png", "build/icon.ico")
DIRECTORIES = ("electron", "public", "native", "packaging", "scripts", "test", "test-fixtures")
EXCLUDED = {"build", "node_modules", "__pycache__", ".git"}
DEPENDENCIES = ("electron>=43", "xdg-desktop-portal", "wayland", "nodejs>=24", "npm", "gcc")
METADATA = Path("/usr/share/doc/shiguang-diary/source-manifest.json")


def source_files(ctx):
    root = ctx.repo / SOURCE
    if root.is_symlink() or not root.is_dir():
        raise ValueError(f"拾光日记源码目录无效：{root}")
    paths = [root / name for name in FILES]
    for name in DIRECTORIES:
        directory = root / name
        if directory.is_symlink() or not directory.is_dir():
            raise ValueError(f"拾光日记缺少独立源码目录：{directory}")
        for base, dirs, files in os.walk(directory, followlinks=False):
            dirs[:] = sorted(d for d in dirs if d not in EXCLUDED)
            if any((Path(base) / d).is_symlink() for d in dirs):
                raise ValueError(f"拾光日记源码不能包含目录链接：{base}")
            paths.extend(Path(base) / f for f in files if not f.endswith((".pyc", ".log")))
    result = {}
    for path in sorted(paths):
        if path.is_symlink() or not path.is_file() or any(
                parent.is_symlink() for parent in path.parents if parent.is_relative_to(root)):
            raise ValueError(f"拾光日记缺少独立源文件：{path}")
        result[str(path.relative_to(root))] = path.read_bytes()
    return result


def preflight(ctx):
    files = source_files(ctx)
    package = json.loads(files["package.json"])
    if package.get("name") != "daylight-diary" or not re.fullmatch(
            r"\d+\.\d+\.\d+", package.get("version", "")):
        raise ValueError("diary 目录不是受管理的拾光日记 Electron 源码")
    recipe = files["PKGBUILD"].decode()
    version = re.search(r"^pkgver=(\S+)$", recipe, re.M)
    if not version or version[1] != package["version"] or "pkgname=shiguang-diary\n" not in recipe:
        raise ValueError("拾光日记 PKGBUILD 与 package.json 的名称/版本不一致")
    return files


def source_manifest(files):
    sums = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
    return {"files": sums, "source_id": hashlib.sha256(
        json.dumps(sums, sort_keys=True).encode()).hexdigest()}


def is_current(manifest):
    if not METADATA.is_file():
        return False
    saved = json.loads(METADATA.read_text())
    if not isinstance(saved, dict) or saved.get("files") != manifest["files"]:
        return False
    versions = capture("pacman", "-Q", "electron", "wayland").splitlines()
    return saved.get("built_against") == versions and subprocess.run(
        ["pacman", "-Qkk", NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def prepare(directory, files, manifest):
    for name, data in files.items():
        path = directory / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        path.chmod(0o755 if name in ("packaging/shiguang-diary", "native/linux-wayland-blur/build.sh") else 0o644)
    save_json(directory / "source-manifest.json", manifest)
    # The archive can be unpacked and passed directly to makepkg. Only the
    # explicit source set and build metadata are included, before any tests run.
    with tarfile.open(directory / "source.tar.gz", "w:gz") as archive:
        for name in sorted([*files, "source-manifest.json"]):
            archive.add(directory / name, arcname=name, recursive=False)


def cached_package(ctx, manifest):
    root = ctx.backup / "packages" / NAME
    record = root / "manifest.json"
    metadata = root / "source-manifest.json"
    if not record.is_file() or not metadata.is_file() or json.loads(metadata.read_text()) != manifest:
        return None
    saved = json.loads(record.read_text())
    name = saved["package"]
    if Path(name).name != name or not name.startswith(NAME + "-") or not name.endswith(".pkg.tar.zst"):
        raise ValueError(f"拾光日记归档包路径无效：{record}")
    package = root / name
    if package.is_symlink() or hashlib.sha256(package.read_bytes()).hexdigest() != saved["sha256"]:
        raise ValueError(f"拾光日记归档包校验失败：{package}")
    return package


def restore(ctx):
    files = preflight(ctx)
    manifest = source_manifest(files)
    if is_current(manifest):
        print("  拾光日记源码、Electron/Wayland 版本和包文件一致，保留现有安装")
        return
    if ctx.check:
        print("  拾光日记：补齐构建依赖 → 隔离复制源码 → npm test/原生桥接测试 → makepkg → pacman -U")
        return
    missing = subprocess.run(["pacman", "-T", *DEPENDENCIES], text=True, capture_output=True)
    if missing.returncode not in (0, 127):
        raise RuntimeError("不能查询拾光日记构建依赖")
    if missing.stdout.strip():
        ctx.run("run0", "pacman", "-S", "--needed", "--asdeps", *missing.stdout.splitlines())
    manifest["built_against"] = capture("pacman", "-Q", "electron", "wayland").splitlines()
    package = cached_package(ctx, manifest)
    if package is not None:
        print("  使用源码、系统库版本及 SHA256 均匹配的已构建拾光日记包")
        ctx.run("run0", "pacman", "-U", package)
        return
    ctx.backup.mkdir(parents=True, exist_ok=True)
    # Keep work and tests inside the workspace, as required by diary/AGENTS.md.
    # A short path also fits the Wayland protocol test's Unix socket limit.
    with tempfile.TemporaryDirectory(prefix=".diary-", dir=ctx.repo) as temporary:
        work = Path(temporary)
        prepare(work, files, manifest)
        env = dict(os.environ, PKGDEST=str(work), SRCDEST=str(work), BUILDDIR=str(work),
                   LOGDEST=str(work), PKGEXT=".pkg.tar.zst")
        ctx.run("makepkg", "--cleanbuild", "--force", "--noconfirm", cwd=work, env=env)
        packages = list(work.glob(f"{NAME}-*.pkg.tar.zst"))
        if len(packages) != 1:
            raise ValueError("拾光日记构建未生成唯一软件包")
        output = ctx.backup / "packages" / NAME
        if output.exists():
            shutil.rmtree(output)
        output.mkdir(parents=True)
        for path in (packages[0], work / "PKGBUILD", work / "source.tar.gz", work / "source-manifest.json"):
            shutil.copy2(path, output / path.name)
        save_json(output / "manifest.json", {
            "package": packages[0].name, "sha256": hashlib.sha256(packages[0].read_bytes()).hexdigest(),
            "source_archive_sha256": hashlib.sha256((output / "source.tar.gz").read_bytes()).hexdigest(),
            "tests": "PKGBUILD check() passed", "source_id": manifest["source_id"]})
        package = output / packages[0].name
    # Let pacman reject independently owned/conflicting paths normally.
    ctx.run("run0", "pacman", "-U", package)
    print(f"拾光日记已由 pacman 管理：{package}；日记内容与用户设置保持原位。")
