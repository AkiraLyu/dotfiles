"""Local recipes take precedence over the moving personal PKGBUILD repository."""

import os
import re

from .common import atomic_write, load_json


def policy(ctx):
    data = load_json(ctx.repo / "packages/pacman-policy.json")
    names = [*data["local_packages"], *data.get("built_packages", []), *data["replacements"],
             *data["replacements"].values(), *data["deferred"]]
    if any(not isinstance(n, str) or not re.fullmatch(r"[a-zA-Z0-9@_+][a-zA-Z0-9@_.+\-]*", n) for n in names) \
            or not set(data["replacements"].values()) <= set(data["local_packages"]):
        raise ValueError("本地包策略中的包名或替换关系无效")
    return data


def config_text(ctx):
    template = (ctx.repo / "packages/paru.conf").read_text()
    if len(re.findall(r"^\[pkgbuilds\]$", template, re.M)) != 1:
        raise ValueError("Paru 模板缺少唯一的个人仓库段")
    local = f"[dotfiles]\nPath = {ctx.repo / 'packages/pkgbuilds'}\n\n"
    if "\n" in str(ctx.repo):
        raise ValueError("Paru 本地来源路径不能包含换行")
    return "# Managed by dotfiles scripts/configure-paru.py\n" + template.replace("[pkgbuilds]", local + "[pkgbuilds]", 1)


def config_plan(ctx):
    path = ctx.target / ".config/paru/paru.conf"
    desired = config_text(ctx)
    for parent in path.parents:
        if parent == ctx.target:
            break
        if parent.is_symlink():
            raise ValueError(f"Paru 配置父目录是链接：{parent}")
    if path.is_symlink():
        raise ValueError(f"Paru 配置必须是独立文件，未覆盖：{path}")
    elif path.exists():
        current = path.read_text()
        if current == desired:
            return path, desired, False
        # A moved checkout changes only Path. Preserve any actual user edits by
        # refusing them, rather than silently replacing unrelated configuration.
        normalize = lambda s: re.sub(r"^Path = .*?$", "Path = <checkout>", s, flags=re.M)
        if normalize(current) != normalize(desired):
            raise ValueError(f"Paru 配置有独立修改，未覆盖：{path}")
    return path, desired, True


def configure(ctx):
    path, text, changed = config_plan(ctx)
    print(f"  Paru 本地优先来源：{ctx.repo / 'packages/pkgbuilds'}")
    if changed and not ctx.check:
        atomic_write(path, text)
    return path


def preflight(ctx):
    data = policy(ctx)
    for name in data["local_packages"]:
        recipe = ctx.repo / "packages/pkgbuilds" / name
        if not (recipe / "PKGBUILD").is_file() or not (recipe / ".SRCINFO").is_file():
            raise ValueError(f"本地包缺少 PKGBUILD/.SRCINFO：{name}")
    config_plan(ctx)
    return data


def restore(ctx):
    data = preflight(ctx)
    config = configure(ctx)
    env = dict(os.environ, PARU_CONF=str(config))
    ctx.run("paru", "--sudo", "run0", "-S", "--needed",
            *(f"dotfiles/{name}" for name in data["local_packages"]), env=env)
