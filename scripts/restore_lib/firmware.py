"""Restore the captured AVS firmware before generating the new machine's UKI."""

import hashlib
from pathlib import Path

from .common import atomic_write, load_json


RELATIVE = "usr/lib/firmware/intel/avs/tgl/dsp_basefw.bin"
SOURCE = "firmware/intel/avs/tgl/dsp_basefw.bin"


def payload(repo, backup):
    manifest = load_json(repo / "hardware/avs-firmware.json")
    if manifest.get("path") != RELATIVE or manifest.get("backup_path") != SOURCE:
        raise ValueError("AVS 固件清单路径无效")
    source = backup / SOURCE
    if source.is_symlink() or not source.is_file():
        raise ValueError(f"缺少 AVS 固件独立副本；需一起迁移 backup：{source}")
    data = source.read_bytes()
    if len(data) != manifest["size"] or hashlib.sha256(data).hexdigest() != manifest["sha256"]:
        raise ValueError("AVS 固件大小或 SHA256 不匹配")
    return data


def deploy(repo, backup, target, *, apply=False):
    data = payload(repo, backup)
    path = target / RELATIVE
    for parent in (path, *path.parents):
        if parent == target:
            break
        if parent.is_symlink():
            raise ValueError(f"AVS 固件目标包含链接：{parent}")
    if path.exists():
        if not path.is_file() or path.read_bytes() != data:
            raise ValueError(f"AVS 目标已有不同固件，未覆盖：{path}")
        print(f"  AVS 固件已一致：{path}")
        return False
    print(f"  恢复 AVS 固件：{path}")
    if apply:
        atomic_write(path, data)
    return True


def preflight(ctx):
    deploy(ctx.repo, ctx.backup, Path("/"))


def restore(ctx):
    if deploy(ctx.repo, ctx.backup, Path("/")):
        ctx.run("run0", "python3", "-B", ctx.repo / "scripts/restore-firmware.py",
                "--backup-dir", ctx.backup, "--apply")
