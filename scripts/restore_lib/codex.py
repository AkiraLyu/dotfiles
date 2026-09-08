"""Private Codex snapshots, including consistent SQLite backups, outside Git."""

import hashlib
from contextlib import closing
import os
from pathlib import Path
import shutil
import sqlite3
import stat
import tempfile

from .common import load_json, save_json, timestamp


# These contain process identity, sockets and temporary execution state.
RUNTIME_DIRS = {"ipc", "tmp", ".tmp", "thread-writer-locks", "process_manager", "node_repl",
                "computer-use", "shell_snapshots", "log", "cache"}


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def sqlite_backup(source, target):
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=5)) as src:
        with closing(sqlite3.connect(target)) as dst:
            src.backup(dst)
            # A backup is one standalone file, including when the source uses WAL.
            dst.execute("PRAGMA journal_mode=DELETE")
            if dst.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise ValueError(f"数据库校验失败：{source.name}")
    shutil.copystat(source, target)


def export(ctx, source=None):
    source = Path(source or os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))).resolve()
    if not (source / "config.toml").is_file():
        raise ValueError(f"Codex 配置不存在：{source}")
    root = ctx.backup / "codex"
    if root.resolve().is_relative_to(source) or source.is_relative_to(root.resolve()):
        raise ValueError("Codex 备份目标不能与正在备份的 .codex 重叠")
    if root.is_symlink():
        raise ValueError("backup/codex 必须是普通目录")
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, mode=0o700)
    data = root / "home"
    data.mkdir(mode=0o700)
    records = {}
    skipped = []
    for directory, dirs, files in os.walk(source, followlinks=False):
        relative_dir = Path(directory).relative_to(source)
        if "__pycache__" in dirs:
            dirs.remove("__pycache__")
            skipped.append(str(relative_dir / "__pycache__"))
        if relative_dir == Path("."):
            dirs[:] = [name for name in dirs if name not in RUNTIME_DIRS]
            skipped.extend(sorted(RUNTIME_DIRS))
        for name in list(dirs):
            path = Path(directory) / name
            if path.is_symlink():
                files.append(name)
                dirs.remove(name)
            else:
                target_dir = data / relative_dir / name
                target_dir.mkdir(parents=True, exist_ok=True)
                shutil.copystat(path, target_dir)
        for name in files:
            path = Path(directory) / name
            relative = relative_dir / name
            if relative_dir == Path('.') and (name.startswith('logs_') or name.endswith('.bak')
                                              or '.tmp-' in name or name == 'models_cache.json'):
                skipped.append(str(relative))
                continue
            # SQLite journals are incorporated by backup(), never copied raw.
            if name.endswith(("-wal", "-shm", "-journal", ".pyc")) or ".lock.sqlite" in name \
                    or ".owner.sqlite" in name or ".claim.sqlite" in name:
                skipped.append(str(relative))
                continue
            target = data / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            mode = path.lstat().st_mode
            if stat.S_ISLNK(mode):
                link = os.readlink(path)
                resolved = (path.parent / link).resolve()
                if resolved.is_relative_to(source):
                    link = os.path.relpath(data / resolved.relative_to(source), target.parent)
                target.symlink_to(link)
                records[str(relative)] = {"type": "symlink", "target": link}
            elif stat.S_ISREG(mode):
                with path.open("rb") as stream:
                    database = stream.read(16) == b"SQLite format 3\x00"
                if database:
                    sqlite_backup(path, target)
                else:
                    shutil.copy2(path, target)
                records[str(relative)] = {"type": "sqlite" if database else "file", "sha256": digest(target)}
            else:
                skipped.append(str(relative))
    save_json(root / "manifest.json", {"source_home": str(source.parent), "created_at": timestamp(),
                                       "files": records, "excluded_runtime": sorted(skipped)}, 0o600)
    print(f"Codex 备份完成：{len(records)} 个文件/链接，"
          f"{sum(r['type'] == 'sqlite' for r in records.values())} 个 SQLite 快照 → {root}")


def preflight(ctx):
    snapshot = ctx.backup / "codex"
    if snapshot.parent.is_symlink() or snapshot.is_symlink() or not snapshot.is_dir():
        raise ValueError("Codex 备份必须是 backup/codex 独立目录")
    data = snapshot / "home"
    manifest = load_json(snapshot / "manifest.json")
    destination = ctx.target / ".codex"
    if destination.is_symlink() or (destination.exists() and (not destination.is_dir() or any(destination.iterdir()))):
        raise ValueError(f"Codex 恢复目标必须不存在或为空；现有数据未覆盖：{destination}")
    for name, record in manifest["files"].items():
        relative = Path(name)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Codex 备份包含无效相对路径")
        path = data / relative
        if record["type"] == "symlink":
            if not path.is_symlink() or os.readlink(path) != record["target"]:
                raise ValueError(f"Codex 备份链接校验失败：{name}")
        elif not path.is_file() or path.is_symlink() or digest(path) != record["sha256"]:
            raise ValueError(f"Codex 备份文件校验失败：{name}")
    return data


def restore(ctx):
    source = preflight(ctx)
    destination = ctx.target / ".codex"
    print(f"  恢复 Codex 私有状态：{source} → {destination}")
    if not ctx.check:
        staging = Path(tempfile.mkdtemp(prefix=".codex-restore-", dir=ctx.target))
        try:
            shutil.copytree(source, staging / "home", symlinks=True)
            if destination.exists():
                destination.rmdir()
            (staging / "home").rename(destination)
            destination.chmod(0o700)
        finally:
            shutil.rmtree(staging)
