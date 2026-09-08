#!/usr/bin/env python3
"""Resolve Paru's local recipe path for this checkout and target user."""

import argparse
from pathlib import Path
import sys

from restore_lib import pkgbuilds
from restore_lib.common import Context


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, default=Path.home())
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    try:
        target = args.target.resolve(strict=True)
        if target == repo or target.is_relative_to(repo) or not target.is_dir():
            raise ValueError("Paru 配置目标必须是仓库之外的用户目录")
        pkgbuilds.configure(Context(repo, repo / "backup", target, args.check))
    except (OSError, ValueError) as error:
        print(f"错误：{error}", file=sys.stderr)
        sys.exit(1)
