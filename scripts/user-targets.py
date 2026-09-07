#!/usr/bin/env python3
"""Deploy owned user units with portable links and reload only the user manager."""

import argparse
import os
from pathlib import Path
import subprocess
import sys


def plan(repo, target):
    source_root = repo / 'systemd/.config/systemd/user'
    if not source_root.is_dir():
        raise ValueError('缺少用户 systemd 配置')
    links = []
    for source in sorted(source_root.rglob('*')):
        if source.is_dir() and not source.is_symlink():
            continue
        if not source.is_file() or not source.resolve().is_relative_to(source_root.resolve()):
            raise ValueError(f'无效的仓库 unit/启用链接：{source}')
        destination = target / '.config/systemd/user' / source.relative_to(source_root)
        for parent in destination.parents:
            if parent == target:
                break
            if parent.is_symlink() or (parent.exists() and not parent.is_dir()):
                raise ValueError(f'用户 unit 的父目录不是普通目录：{parent}')
        if destination.is_symlink():
            if destination.resolve() != source.resolve():
                raise ValueError(f'已有不同来源的用户 unit：{destination}')
        elif destination.exists():
            raise ValueError(f'已有独立用户 unit，未覆盖：{destination}')
        relative = os.path.relpath(source, destination.parent)
        if not destination.is_symlink() or str(destination.readlink()) != relative:
            links.append((destination, relative))
    return source_root, links


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', '--dry-run', action='store_true')
    parser.add_argument('--target', type=Path, default=Path.home())
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    target = args.target.resolve(strict=True)
    if not target.is_dir() or target == repo or target.is_relative_to(repo) or target in (Path('/'), Path('/etc')):
        parser.error('目标必须是仓库之外已有的普通用户目录')
    if not args.check and os.geteuid() == 0:
        parser.error('用户 target 阶段必须以普通用户运行')
    source_root, links = plan(repo, target)
    # Reading unit definitions does not start units or contact the system manager.
    subprocess.run(['systemd-analyze', '--user', 'verify', *map(str, sorted(source_root.glob('*.target'))),
                    *map(str, sorted(source_root.glob('*.service')))], check=True)
    for destination, relative in links:
        print(f'  用户链接：{destination} → {relative}')
    if args.check:
        print(f'校验通过，{len(links)} 个链接待建立/规范化；未写入或重载。')
        return
    for destination, relative in links:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.is_symlink():
            destination.unlink()
        destination.symlink_to(relative)
    if target == Path.home().resolve():
        subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
        print('用户 target/units 已部署并重载；未启动或重启应用。')
    else:
        print('用户 target/units 已部署到指定目录；请在对应用户会话中 daemon-reload。')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'错误：{error}', file=sys.stderr)
        sys.exit(1)
