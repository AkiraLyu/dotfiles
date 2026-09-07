"""Flatpak applications, remotes, public signing keys and user overrides."""

from pathlib import Path
import shutil

from .common import atomic_write, capture, load_json, save_json


def export(ctx):
    root = ctx.repo / "packages/flatpak"
    remotes = []
    apps = []
    for scope, data_home in (("system", Path("/var/lib/flatpak")),
                             ("user", Path.home() / ".local/share/flatpak")):
        for line in capture("flatpak", "remotes", f"--{scope}", "--columns=name,url").splitlines():
            name, url = line.split("\t")
            key = data_home / "repo" / f"{name}.trustedkeys.gpg"
            if not key.is_file():
                raise ValueError(f"缺少 Flatpak remote 公钥：{name}；请先补齐可验证的软件源")
            key_name = f"{scope}-{name}.gpg"
            atomic_write(root / key_name, key.read_bytes())
            remotes.append({"name": name, "url": url, "scope": scope, "key": key_name})
        for line in capture("flatpak", "list", "--app", f"--{scope}", "--columns=ref,origin").splitlines():
            ref, origin = line.split("\t")
            apps.append({"ref": ref, "origin": origin, "scope": scope})
    source = Path.home() / ".local/share/flatpak/overrides"
    overrides = {}
    if source.is_dir():
        for path in sorted(source.iterdir()):
            if path.is_file():
                overrides[path.name] = path.read_text()
    save_json(root / "manifest.json", {"remotes": remotes, "apps": apps, "user_overrides": overrides})
    print(f"已记录 {len(apps)} 个 Flatpak 应用、{len(remotes)} 个 remote 和 {len(overrides)} 份用户 override")


def preflight(ctx):
    root = ctx.repo / "packages/flatpak"
    data = load_json(root / "manifest.json")
    existing = {}
    if shutil.which("flatpak"):
        for scope in ("system", "user"):
            existing[scope] = dict(line.split("\t", 1) for line in capture(
                "flatpak", "remotes", f"--{scope}", "--columns=name,url").splitlines())
    remotes = set()
    for remote in data["remotes"]:
        if remote["scope"] not in ("system", "user") or Path(remote["key"]).name != remote["key"]:
            raise ValueError("无效的 Flatpak remote 范围或公钥路径")
        if not (root / remote["key"]).is_file():
            raise ValueError(f"缺少 remote 公钥：{remote['name']}")
        current_url = existing.get(remote["scope"], {}).get(remote["name"])
        if current_url is not None and current_url.rstrip("/") != remote["url"].rstrip("/"):
            raise ValueError(f"Flatpak 同名 remote 指向不同地址：{remote['scope']}/{remote['name']}")
        remotes.add((remote["scope"], remote["name"]))
    for app in data["apps"]:
        if (app["scope"], app["origin"]) not in remotes:
            raise ValueError(f"Flatpak 应用没有来源：{app['ref']}")
    for name, content in data["user_overrides"].items():
        if Path(name).name != name:
            raise ValueError("无效的 Flatpak override 文件名")
        target = ctx.target / ".local/share/flatpak/overrides" / name
        if target.exists() and target.read_text() != content:
            raise ValueError(f"目标已有不同的 Flatpak override：{target}")
    return data


def restore(ctx):
    data = preflight(ctx)
    for remote in data["remotes"]:
        prefix = ["run0"] if remote["scope"] == "system" else []
        ctx.run(*prefix, "flatpak", "remote-add", f"--{remote['scope']}", "--if-not-exists",
                "--gpg-import=" + str(ctx.repo / "packages/flatpak" / remote["key"]),
                remote["name"], remote["url"])
    installed = {}
    if shutil.which("flatpak"):
        for scope in ("system", "user"):
            installed[scope] = set(capture("flatpak", "list", "--app", f"--{scope}", "--columns=ref").splitlines())
    for app in data["apps"]:
        if app["ref"] in installed.get(app["scope"], set()):
            print(f"  保留已安装的 Flatpak：{app['ref']}")
            continue
        prefix = ["run0"] if app["scope"] == "system" else []
        ctx.run(*prefix, "flatpak", "install", f"--{app['scope']}", "--assumeyes", app["origin"], app["ref"])
    for name, content in data["user_overrides"].items():
        target = ctx.target / ".local/share/flatpak/overrides" / name
        print(f"  恢复 Flatpak override：{name}")
        if not ctx.check and not target.exists():
            atomic_write(target, content)
