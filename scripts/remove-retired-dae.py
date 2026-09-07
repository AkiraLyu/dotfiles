#!/usr/bin/env python3
"""Remove only the two retired dae symlinks; preserve the running daed service."""

import argparse
import os
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="run with run0 to remove the verified links")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    unit = Path("/etc/systemd/system/dae.service")
    enabled = unit.parent / "multi-user.target.wants/dae.service"
    expected = {unit: repo / "etc/systemd/system/dae.service", enabled: unit}
    pending = []
    for path, target in expected.items():
        if not path.exists() and not path.is_symlink():
            continue
        if not path.is_symlink() or path.exists() or path.resolve() != target.resolve():
            parser.error(f"refusing changed or independently managed path: {path}")
        pending.append(path)
    if not pending:
        print("Retired dae links are already absent.")
        return
    state = subprocess.check_output(["systemctl", "show", "dae.service", "-p", "ActiveState", "--value"], text=True).strip()
    if state != "inactive":
        parser.error(f"dae.service must be inactive, got {state}")
    for path in pending:
        print(f"Remove retired symlink: {path}")
    if not args.apply:
        print(f"Preview only. Apply: run0 python3 {Path(__file__).resolve()} --apply")
        return
    if os.geteuid() != 0:
        parser.error("--apply requires run0")
    before = subprocess.check_output(["systemctl", "show", "daed.service", "-p", "ActiveState", "-p", "MainPID"], text=True)
    for path in pending:
        path.unlink()
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    after = subprocess.check_output(["systemctl", "show", "daed.service", "-p", "ActiveState", "-p", "MainPID"], text=True)
    if before != after:
        raise RuntimeError("daed state changed during verification; check systemctl status daed")
    print("Removed retired dae links; daed state and process ID unchanged.")


if __name__ == "__main__":
    main()
