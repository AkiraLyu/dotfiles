"""Small private configuration snapshots; never overwrite different live data."""

import os
from pathlib import Path
import shutil
import tempfile

from .codex import digest
from .common import load_json, save_json, timestamp


ROOTS = {".config/rclone/rclone.conf": "file", ".config/mirador": "directory",
         ".local/share/kwalletd": "directory"}


def check_parents(base, relative):
    for parent in reversed(Path(relative).parents):
        path = base / parent
        if path.is_symlink() or (path.exists() and not path.is_dir()):
            raise ValueError(f"私有数据路径的父目录必须是普通目录：{path}")


def inventory(base):
    records = {}

    def visit(relative):
        path = base / relative
        if path.is_symlink():
            raise ValueError(f"私有配置不接受符号链接：{relative}")
        if path.is_dir():
            records[str(relative)] = {"type": "directory"}
            for child in sorted(path.iterdir()):
                visit(child.relative_to(base))
        elif path.is_file():
            records[str(relative)] = {"type": "file", "sha256": digest(path)}
        else:
            raise ValueError(f"私有配置缺失或不是普通文件/目录：{relative}")

    for name, kind in ROOTS.items():
        check_parents(base, name)
        visit(Path(name))
        if records[name]["type"] != kind:
            raise ValueError(f"私有配置类型不符：{name}")
    return records


def copy_records(source, target, records):
    for name, record in sorted(records.items()):
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if record["type"] == "directory":
            path.mkdir(exist_ok=True, mode=0o700)
        else:
            shutil.copyfile(source / name, path)
            path.chmod(0o600)
    # mkdir(parents=True) otherwise uses the process umask for intermediate dirs.
    for directory, _, _ in os.walk(target):
        Path(directory).chmod(0o700)


def export(ctx):
    root = ctx.backup / "private"
    if any(root.resolve().is_relative_to(ctx.target / name)
           or (ctx.target / name).is_relative_to(root.resolve()) for name in ROOTS):
        raise ValueError("私有备份目标不能与正在备份的配置重叠")
    if root.is_symlink():
        raise ValueError("backup/private 必须是普通目录")
    records = inventory(ctx.target)
    if root.exists():
        shutil.rmtree(root)
    data = root / "home"
    data.mkdir(parents=True, mode=0o700)
    root.chmod(0o700)
    copy_records(ctx.target, data, records)
    records = inventory(data)
    save_json(root / "manifest.json", {"version": 1, "created_at": timestamp(),
                                       "files": records}, 0o600)
    print(f"私有备份完成：{sum(r['type'] == 'file' for r in records.values())} 个文件 → {root}")


def target_state(base, name, records):
    check_parents(base, name)
    path = base / name
    if path.is_symlink():
        raise ValueError(f"私有配置恢复目标不能是符号链接：{path}")
    if not path.exists():
        return "missing"
    record = records[name]
    if record["type"] == "file":
        if path.is_file() and digest(path) == record["sha256"]:
            return "identical"
    elif path.is_dir():
        if not any(path.iterdir()):
            return "empty"
        expected = {n for n in records if n == name or n.startswith(name + "/")}
        actual = {name}
        for directory, dirs, files in os.walk(path, followlinks=False):
            for item in dirs + files:
                child = Path(directory) / item
                relative = str(child.relative_to(base))
                actual.add(relative)
                item_record = records.get(relative)
                if child.is_symlink() or item_record is None:
                    raise ValueError(f"私有配置目标已有不同数据，未覆盖：{path}")
                if item_record["type"] == "directory":
                    same = child.is_dir()
                else:
                    same = child.is_file() and digest(child) == item_record["sha256"]
                if not same:
                    raise ValueError(f"私有配置目标已有不同数据，未覆盖：{path}")
        if actual == expected:
            return "identical"
    raise ValueError(f"私有配置目标已有不同数据，未覆盖：{path}")


def preflight(ctx):
    snapshot = ctx.backup / "private"
    if snapshot.is_symlink() or not snapshot.is_dir():
        raise ValueError("私有备份必须是 backup/private 独立目录")
    manifest_path = snapshot / "manifest.json"
    if manifest_path.is_symlink():
        raise ValueError("私有备份清单不能是符号链接")
    manifest = load_json(manifest_path)
    if manifest["version"] != 1 or not isinstance(manifest["files"], dict):
        raise ValueError("私有备份清单版本/格式不符")
    records = manifest["files"]
    # inventory reads only the fixed allowlist and rejects symlink traversal.
    # Exact equality also rejects extra or malformed manifest paths/entries.
    data = snapshot / "home"
    if data.is_symlink() or inventory(data) != records:
        raise ValueError("私有备份文件校验失败")
    states = {name: target_state(ctx.target, name, records) for name in ROOTS}
    return data, records, states


def restore(ctx):
    source, records, states = preflight(ctx)
    for name, state in states.items():
        print(f"  {'保留相同' if state == 'identical' else '恢复'}私有配置：{ctx.target / name}")
    if ctx.check or all(state == "identical" for state in states.values()):
        return
    staging = Path(tempfile.mkdtemp(prefix=".private-restore-", dir=ctx.target))
    try:
        copy_records(source, staging, records)
        if inventory(staging) != records:
            raise ValueError("私有备份复制校验失败，未写入目标")
        # Recheck all destinations after copying, before installing any root.
        _, _, states = preflight(ctx)
        for name, state in states.items():
            if state == "identical":
                continue
            destination = ctx.target / name
            for parent in reversed(Path(name).parents):
                (ctx.target / parent).mkdir(exist_ok=True, mode=0o700)
            if records[name]["type"] == "file":
                os.link(staging / name, destination)  # Fails if the target appeared.
            else:
                if state == "empty":
                    destination.rmdir()
                (staging / name).rename(destination)
    finally:
        shutil.rmtree(staging)
