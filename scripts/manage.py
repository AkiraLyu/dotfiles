#!/usr/bin/env python3
"""Software and private-state stages dispatched by install.sh."""

import argparse
import os
from pathlib import Path
import re
import subprocess
import sys

from restore_lib import codex, flatpak, pacman, private, rust
from restore_lib.common import Context, atomic_write, capture, load_json


EXPORTS = ("pacman", "rust", "cargo", "flatpak", "codex", "private", "noctalia")
RESTORES = ("pacman", "rust", "cargo", "npm", "flatpak", "codex", "private")


def export_noctalia(ctx):
    config = capture("noctalia", "config", "export", "merged") + "\n"
    destination = ctx.repo / "niri/.config/noctalia/config.toml"
    atomic_write(destination, config)
    print(f"已保存 Noctalia v5 合并用户配置：{destination}")


def preflight_npm(ctx):
    data = load_json(ctx.repo / "packages/npm.json")
    if data.get("prefix", ".local") != ".local" or not isinstance(data["packages"], dict):
        raise ValueError("npm 清单必须使用 .local prefix 和包名/版本映射")
    prefix = ctx.target / ".local"
    installed = {}
    for name, version in data["packages"].items():
        if not re.fullmatch(r"(?:@[a-z0-9._-]+/)?[a-z0-9][a-z0-9._-]*", name) \
                or not isinstance(version, str) or not re.fullmatch(
                    r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?", version):
            raise ValueError(f"npm 包名或固定版本无效：{name}")
        metadata = prefix / "lib/node_modules" / name / "package.json"
        if metadata.is_file():
            installed[name] = load_json(metadata)["version"]
    return data, installed


def restore_npm(ctx):
    data, installed = preflight_npm(ctx)
    prefix = ctx.target / ".local"
    ctx.run("npm", "config", "set", "prefix", prefix, "--location=user", "--userconfig", ctx.target / ".npmrc")
    for name, version in data["packages"].items():
        if name in installed:
            print(f"  保留现有 npm 包：{name}@{installed[name]}")
        else:
            ctx.run("npm", "install", "--global", "--prefix", prefix, f"{name}@{version}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("export", "restore"))
    parser.add_argument("stages", nargs="+", help="pacman rust cargo npm flatpak codex private；export 另支持 noctalia；all 全选")
    parser.add_argument("--check", "--dry-run", action="store_true", dest="check")
    parser.add_argument("--target", type=Path, default=Path.home())
    parser.add_argument("--backup-dir", type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    available = EXPORTS if args.action == "export" else RESTORES
    selected = set(available if args.stages == ["all"] else args.stages)
    if selected - set(available):
        parser.error("不支持的阶段：" + ", ".join(sorted(selected - set(available))))
    target = args.target.resolve(strict=True)
    if not target.is_dir() or not os.access(target, os.W_OK) or target == repo or target.is_relative_to(repo):
        parser.error("--target 必须是仓库之外已有的可写用户目录")
    if not args.check and os.geteuid() == 0:
        parser.error("请以目标普通用户运行，只有系统包操作使用 run0")
    if args.action == "export" and (args.check or target != Path.home().resolve()):
        parser.error("导出读取当前用户状态；不支持 --check 或其他 --target")
    if args.action == "restore" and selected - {"codex", "private"} and target != Path.home().resolve() and not args.check:
        parser.error("软件安装必须以目标用户运行；另一个 --target 仅用于只读计划或私有数据恢复演练")
    ctx = Context(repo, (args.backup_dir or repo / "backup").resolve(), target, args.check)
    if args.action == "export":
        handlers = {"pacman": pacman.export, "rust": rust.export_rust, "cargo": rust.export_cargo,
                    "flatpak": flatpak.export, "codex": codex.export, "private": private.export,
                    "noctalia": export_noctalia}
        for stage in EXPORTS:
            if stage in selected:
                handlers[stage](ctx)
        return 0

    # Validate every selected input before any package or configuration writes.
    errors = []
    for stage in RESTORES:
        if stage not in selected:
            continue
        try:
            if stage == "pacman":
                pacman.preflight(ctx)
                rust.preflight(ctx)
            elif stage == "rust":
                rust.preflight(ctx)
            elif stage == "cargo":
                rust.preflight_cargo(ctx)
            elif stage == "npm":
                preflight_npm(ctx)
            elif stage == "flatpak":
                flatpak.preflight(ctx)
            elif stage == "codex":
                codex.preflight(ctx)
            elif stage == "private":
                private.preflight(ctx)
        except (OSError, ValueError, RuntimeError, KeyError, TypeError, subprocess.CalledProcessError) as error:
            errors.append(f"{stage}: {error}")
    if errors:
        raise ValueError("恢复预检未通过，未执行安装：\n" + "\n".join(errors))

    if "pacman" in selected:
        pacman.restore_repo(ctx)
    if selected & {"pacman", "rust", "cargo"}:
        rust.restore_rust(ctx)
    if "pacman" in selected:
        pacman.restore_foreign(ctx)
    for stage, handler in (("cargo", rust.restore_cargo), ("npm", restore_npm),
                           ("flatpak", flatpak.restore), ("codex", codex.restore), ("private", private.restore)):
        if stage in selected:
            handler(ctx)
    print("恢复计划检查完成，未执行写入。" if args.check else "所选软件/数据阶段完成；配置部署与会话验收按 RESTORE.md 继续。")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        print(f"错误：{error}", file=sys.stderr)
        sys.exit(1)
