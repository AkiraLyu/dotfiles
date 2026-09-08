"""Small shared helpers; command arguments are always passed without a shell."""

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile


def capture(*args, env=None, empty_ok=False):
    result = subprocess.run(list(map(str, args)), text=True, capture_output=True, env=env)
    if result.returncode and not (empty_ok and result.returncode == 1 and not result.stdout.strip()):
        raise RuntimeError(f"{args[0]} 读取失败：{result.stderr.strip()}")
    return result.stdout.strip()


def load_json(path):
    return json.loads(path.read_text())


def timestamp():
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")


def atomic_write(path, data, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data.encode() if isinstance(data, str) else data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, mode)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def save_json(path, value, mode=0o644):
    atomic_write(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n", mode)


@dataclass
class Context:
    repo: Path
    backup: Path
    target: Path
    check: bool = False

    def run(self, *args, env=None, cwd=None):
        command = list(map(str, args))
        display = shlex.join(command if len(command) <= 24 else command[:12])
        if len(command) > 24:
            display += f" …（另有 {len(command) - 12} 项，完整内容见清单）"
        print("  " + display, flush=True)
        if not self.check:
            subprocess.run(list(map(str, args)), env=env, cwd=cwd, check=True)
