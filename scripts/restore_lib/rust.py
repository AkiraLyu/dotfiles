"""Export actual Rust releases and Cargo sources, then restore those versions."""

import os
from pathlib import Path
import re
import tomllib

from .common import capture, load_json, save_json


def export_rust(ctx):
    root = Path(os.environ.get("RUSTUP_HOME", str(Path.home() / ".rustup")))
    settings = tomllib.loads((root / "settings.toml").read_text())
    records = []
    mapping = {}
    for name in capture("rustup", "toolchain", "list").splitlines():
        name = name.split()[0]
        manifest = tomllib.loads((root / "toolchains" / name / "lib/rustlib/multirust-channel-manifest.toml").read_text())
        host = capture("rustc", f"+{name}", "-vV").split("host: ", 1)[1].splitlines()[0]
        version = manifest["pkg"]["rust"]["version"].split()[0]
        release = f"nightly-{manifest['date']}" if "nightly" in version else version
        install = f"{release}-{host}"
        mapping[name] = install
        components = capture("rustup", "component", "list", "--toolchain", name, "--installed").splitlines()
        targets = capture("rustup", "target", "list", "--toolchain", name, "--installed").splitlines()
        # rust-std is selected by --target; other host suffixes are implied.
        components = [c.removesuffix("-" + host) for c in components if not c.startswith("rust-std-")]
        records.append({"source_name": name, "install": install, "components": components, "targets": targets})
    overrides = settings.get("overrides", {})
    if overrides:
        raise ValueError("存在项目路径专属 Rust override，请先在项目 rust-toolchain.toml 中声明后再导出")
    save_json(ctx.repo / "packages/rust.json", {"default": mapping[settings["default_toolchain"]], "toolchains": records})
    print(f"已记录 {len(records)} 套 Rust 工具链的具体版本、components 和 targets")


def export_cargo(ctx):
    root = Path(os.environ.get("CARGO_HOME", str(Path.home() / ".cargo")))
    data = load_json(root / ".crates2.json")["installs"]
    default = load_json(ctx.repo / "packages/rust.json")["default"]
    records = []
    for key, options in data.items():
        name, version, source = re.fullmatch(r"(\S+) (\S+) \((.*)\)", key).groups()
        if source.startswith("path+"):
            raise ValueError(f"{name} 来自本地路径，需要先保存源码并声明稳定来源")
        record = {"name": name, "version": version, "toolchain": default,
                  "bins": options["bins"], "features": options.get("features", []),
                  "all_features": options.get("all_features", False),
                  "no_default_features": options.get("no_default_features", False),
                  "profile": options.get("profile", "release"), "target": options["target"]}
        if source.startswith("git+"):
            url, revision = source[4:].rsplit("#", 1)
            record.update(git=url.split("?", 1)[0], rev=revision)
        elif not source.startswith("registry+"):
            raise ValueError(f"不支持的 Cargo 来源：{name}")
        records.append(record)
    save_json(ctx.repo / "packages/cargo.json", {"root": ".cargo", "packages": records})
    print(f"已记录 {len(records)} 个 Cargo 工具")


def preflight(ctx):
    rust = load_json(ctx.repo / "packages/rust.json")
    names = {record["install"] for record in rust["toolchains"]}
    if rust["default"] not in names:
        raise ValueError("Rust 默认工具链不在安装清单中")
    for record in rust["toolchains"]:
        if not record["components"] or not record["targets"]:
            raise ValueError("Rust 工具链缺少 components 或 targets")
    return rust


def preflight_cargo(ctx):
    rust = preflight(ctx)
    names = {record["install"] for record in rust["toolchains"]}
    data = load_json(ctx.repo / "packages/cargo.json")
    for record in data["packages"]:
        if record["toolchain"] not in names:
            raise ValueError(f"Cargo 工具链未声明：{record['name']}")
        if not record["bins"] or not record["name"] or not record["version"]:
            raise ValueError("Cargo 清单缺少包名、版本或可执行文件")
        if "git" in record and not re.fullmatch(r"[0-9a-f]{40}", record["rev"]):
            raise ValueError("Cargo Git 来源必须固定到完整 commit")
        for field in ("features", "all_features", "no_default_features", "profile", "target"):
            if field not in record:
                raise ValueError(f"Cargo 清单缺少 {field}")
    return data


def restore_rust(ctx):
    data = preflight(ctx)
    for record in data["toolchains"]:
        ctx.run("rustup", "toolchain", "install", record["install"], "--profile", "minimal",
                "--component", ",".join(record["components"]), "--target", ",".join(record["targets"]))
    ctx.run("rustup", "default", data["default"])


def restore_cargo(ctx):
    data = preflight_cargo(ctx)
    for record in data["packages"]:
        args = ["cargo", f"+{record['toolchain']}", "install", "--locked", "--root", str(ctx.target / ".cargo"),
                "--profile", record["profile"], "--target", record["target"]]
        if "git" in record:
            args += ["--git", record["git"], "--rev", record["rev"]]
        else:
            args += ["--version", "=" + record["version"]]
        if record["features"]:
            args += ["--features", ",".join(record["features"])]
        for flag, enabled in (("--all-features", record["all_features"]),
                              ("--no-default-features", record["no_default_features"])):
            if enabled:
                args.append(flag)
        for binary in record["bins"]:
            args += ["--bin", binary]
        ctx.run(*args, record["name"])
