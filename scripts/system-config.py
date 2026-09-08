#!/usr/bin/env python3
"""Deploy /etc as independent files; preserve target-machine LUKS UUIDs."""

import argparse
import os
from pathlib import Path
import re
import subprocess
import sys

from restore_lib.common import atomic_write


def plan(repo, target):
    changes = []
    for source in sorted((repo / "etc").rglob("*")):
        if not source.is_file() or any(p.startswith(".") for p in source.relative_to(repo / "etc").parts):
            continue
        relative = source.relative_to(repo / "etc")
        destination = target / relative
        for parent in destination.parents:
            if parent == target:
                break
            if parent.is_symlink():
                raise ValueError(f"系统配置父目录是链接：{parent}")
        if destination.is_symlink() and destination.resolve() != source:
            raise ValueError(f"系统配置链接来源不同，未覆盖：{destination}")
        data = source.read_bytes()
        if relative.as_posix() == "cmdline.d/root.conf":
            if not destination.is_file():
                raise ValueError("请先运行 --arch-post-install，按目标分区生成 root.conf；不会复制旧磁盘 UUID")
            current = destination.read_text()
            text = data.decode()
            for name in ("cryptroot", "cryptswap"):
                matches = re.findall(r"rd\.luks\.name=([0-9a-fA-F-]{36})=" + name, current)
                if len(matches) != 1:
                    raise ValueError(f"目标 root.conf 缺少唯一的 {name} UUID")
                text, count = re.subn(r"rd\.luks\.name=[^\s=]+=" + name,
                                      f"rd.luks.name={matches[0]}={name}", text)
                if count != 1:
                    raise ValueError(f"仓库 root.conf 缺少唯一的 {name}")
            data = text.encode()
        if destination.exists():
            if not destination.is_file() or destination.read_bytes() != data:
                raise ValueError(f"系统配置内容不同，未覆盖：{destination}；请先比较并保存本机修改")
            if not destination.is_symlink():
                continue
        changes.append((destination, data, 0o755 if source.stat().st_mode & 0o111 else 0o644))
    return changes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, default=Path("/etc"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    target = args.target.absolute()
    if target.is_symlink() or target.resolve() != target or target == repo or target.is_relative_to(repo):
        parser.error("系统配置目标不能经过链接或位于仓库内")
    if args.apply and target == Path("/etc") and os.geteuid() != 0:
        parser.error("实际 /etc 写入需使用 run0")
    changes = plan(repo, target)
    for path, data, mode in changes:
        print(f"  系统配置独立副本：{path}")
        if args.apply:
            atomic_write(path, data, mode)
    if args.apply and target == Path("/etc") and any("hwdb.d" in path.parts for path, _, _ in changes):
        subprocess.run(["systemd-hwdb", "update"], check=True)
    print(f"系统配置检查通过；{len(changes)} 个文件{'已复制' if args.apply else '待复制'}，保留目标 UUID。")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"错误：{error}", file=sys.stderr)
        sys.exit(1)
