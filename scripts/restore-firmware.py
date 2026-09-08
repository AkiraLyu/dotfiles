#!/usr/bin/env python3
"""Install only the saved AVS file, then rebuild the running system's initramfs."""

import argparse
import os
from pathlib import Path
import subprocess
import sys

from restore_lib import firmware


def main():
    repo = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup-dir", type=Path, default=repo / "backup")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.apply and os.geteuid() != 0:
        parser.error("实际系统写入需使用 run0")
    changed = firmware.deploy(repo, args.backup_dir.resolve(), Path("/"), apply=args.apply)
    if changed and args.apply:
        subprocess.run(["mkinitcpio", "-P"], check=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f"错误：{error}", file=sys.stderr)
        sys.exit(1)
