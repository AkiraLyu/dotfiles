"""Keep repository/foreign packages and explicit/dependency reasons separate."""

import os
import platform
import re

from .common import atomic_write, capture, load_json, save_json, timestamp
from . import pkgbuilds


LISTS = {
    "pkglist.txt": "-Qqen",
    "pkglist_aur.txt": "-Qqem",
    "pkglist_deps.txt": "-Qqdn",
    "pkglist_aur_deps.txt": "-Qqdm",
}


def export(ctx):
    # Read all inputs before replacing any list, so a failed query cannot empty it.
    lists = {name: sorted(capture("pacman", query, empty_ok=True).splitlines())
             for name, query in LISTS.items()}
    versions = capture("pacman", "-Q")
    repos = capture("pacman-conf", "--repo-list").splitlines()
    root = ctx.backup / "pacman"
    for name, packages in lists.items():
        atomic_write(root / name, "".join(f"{package}\n" for package in packages))
    atomic_write(root / "versions.txt", versions + "\n")
    save_json(root / "snapshot.json", {"exported_at": timestamp(), "architecture": platform.machine(),
                                      "repositories": repos, "counts": {k: len(v) for k, v in lists.items()}})
    print(f"已导出四类包清单：{sum(map(len, lists.values()))} 个包 → {root}")


def read_lists(ctx):
    root = ctx.backup / "pacman"
    result = {}
    seen = set()
    for name in LISTS:
        packages = [line.strip() for line in (root / name).read_text().splitlines()
                    if line.strip() and not line.lstrip().startswith("#")]
        for package in packages:
            if not re.fullmatch(r"[a-zA-Z0-9@_+][a-zA-Z0-9@_.+\-]*", package):
                raise ValueError(f"无效包名：{name}: {package}")
            if package in seen:
                raise ValueError(f"包名重复或安装原因冲突：{package}")
            seen.add(package)
        result[name] = packages
    metadata = load_json(root / "snapshot.json")
    if metadata["architecture"] != platform.machine():
        raise ValueError("pacman 清单架构与当前机器不同，请先整理适合目标机器的清单")
    return result


def preflight(ctx):
    lists = read_lists(ctx)
    rules = pkgbuilds.policy(ctx)
    available = set(capture("pacman", "-Slq").splitlines())
    native = lists["pkglist.txt"] + lists["pkglist_deps.txt"]
    missing = sorted(set(native) - set(rules["replacements"]) - set(rules.get("built_packages", [])) - available)
    if missing:
        raise RuntimeError("当前软件源找不到以下仓库包；先准备适合目标 CPU 的软件源并刷新数据库：\n  "
                           + " ".join(missing))
    print(f"  pacman 清单：{len(native)} 个仓库包，"
          f"{len(lists['pkglist_aur.txt']) + len(lists['pkglist_aur_deps.txt'])} 个 foreign 包")


def restore_repo(ctx):
    lists = read_lists(ctx)
    rules = pkgbuilds.policy(ctx)
    for name in lists:
        lists[name] = [p for p in lists[name] if p not in rules["replacements"]
                       and p not in rules["local_packages"] and p not in rules.get("built_packages", [])]
    ctx.run("run0", "pacman", "-Syu", "--needed", *lists["pkglist.txt"])
    if lists["pkglist_deps.txt"]:
        ctx.run("run0", "pacman", "-S", "--needed", "--asdeps", *lists["pkglist_deps.txt"])


def restore_foreign(ctx):
    lists = read_lists(ctx)
    rules = pkgbuilds.policy(ctx)
    for name in lists:
        lists[name] = [rules["replacements"].get(p, p) for p in lists[name] if p not in rules["deferred"]]
    for package, reason in rules["deferred"].items():
        print(f"  暂不恢复 {package}：{reason}")
    # PARU_CONF controls Paru's config; --config instead controls pacman.conf.
    env = dict(os.environ, PARU_CONF=str(ctx.target / ".config/paru/paru.conf"))
    for name, reason in (("pkglist_aur.txt", "--asexplicit"), ("pkglist_aur_deps.txt", "--asdeps")):
        packages = [p for p in lists[name] if p not in rules["local_packages"] and p not in rules.get("built_packages", [])]
        if packages:
            ctx.run("paru", "--sudo", "run0", "-S", "--needed", reason, *packages, env=env)
    # --needed may skip installed packages, so explicitly restore their reasons.
    for names, reason in ((("pkglist_deps.txt", "pkglist_aur_deps.txt"), "--asdeps"),
                          (("pkglist.txt", "pkglist_aur.txt"), "--asexplicit")):
        packages = sum((lists[name] for name in names), [])
        if packages:
            ctx.run("run0", "pacman", "-D", reason, *packages)
