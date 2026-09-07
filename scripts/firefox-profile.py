#!/usr/bin/env python3
"""Resolve an existing Firefox profile without starting Firefox or writing state."""

import argparse
import configparser
import os
from pathlib import Path
import sys


def read_ini(path):
    parser = configparser.ConfigParser(interpolation=None)
    if path.exists():
        with path.open(encoding="utf-8-sig") as stream:
            parser.read_file(stream)
    return parser


def profile_path(root, value, relative=True):
    path = Path(value)
    if not relative and not path.is_absolute():
        raise ValueError(f"IsRelative=0 却不是绝对路径：{root / 'profiles.ini'}：{value}")
    return (root / path).resolve()


def candidates(root):
    profiles = read_ini(root / "profiles.ini")
    installs = read_ini(root / "installs.ini")

    # Install-specific defaults take priority over the legacy Profile Default=1.
    defaults = set()
    for parser, sections in (
        (installs, installs.sections()),
        (profiles, [s for s in profiles.sections() if s.startswith("Install")]),
    ):
        for section in sections:
            value = parser.get(section, "Default", fallback="").strip()
            if value:
                defaults.add(profile_path(root, value))
    if defaults:
        return defaults

    registered = set()
    for section in profiles.sections():
        if not section.startswith("Profile"):
            continue
        value = profiles.get(section, "Path", fallback="").strip()
        if not value:
            raise ValueError(f"{root / 'profiles.ini'}：{section} 缺少 Path")
        relative = profiles.get(section, "IsRelative", fallback="1")
        if relative not in ("0", "1"):
            raise ValueError(f"{root / 'profiles.ini'}：{section} 的 IsRelative 无效")
        path = profile_path(root, value, relative == "1")
        registered.add(path)
        if profiles.get(section, "Default", fallback="0") == "1":
            defaults.add(path)
    # A single registered profile is unambiguous; never guess by directory name.
    return defaults or registered


def resolve_profile(home, explicit=None):
    if explicit is not None:
        profile = Path(explicit).expanduser().resolve()
    else:
        config_home = home / ".config"
        if home == Path.home().resolve() and os.environ.get("XDG_CONFIG_HOME"):
            config_home = Path(os.environ["XDG_CONFIG_HOME"])
            if not config_home.is_absolute():
                raise ValueError("XDG_CONFIG_HOME 必须是绝对路径")
        roots = {config_home / "mozilla/firefox", home / ".mozilla/firefox"}
        found = set()
        for root in sorted(roots):
            found.update(candidates(root))
        if not found:
            raise ValueError("没有已登记的 Firefox profile；请先恢复 profile，或用 --firefox-profile 指定已有目录")
        if len(found) != 1:
            listing = "\n  ".join(str(path) for path in sorted(found))
            raise ValueError(f"Firefox profile 选择不唯一，请用 --firefox-profile 指定：\n  {listing}")
        profile = found.pop()

    if not profile.is_dir():
        raise ValueError(f"Firefox profile 目录不存在：{profile}；请先恢复它或显式选择其他目录")
    if not os.access(profile, os.R_OK | os.W_OK | os.X_OK):
        raise ValueError(f"Firefox profile 目录不可读写：{profile}")
    return profile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", required=True, type=Path)
    parser.add_argument("--profile")
    args = parser.parse_args()
    try:
        print(resolve_profile(args.home.resolve(), args.profile))
    except (OSError, ValueError, configparser.Error) as error:
        print(f"错误：{error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
