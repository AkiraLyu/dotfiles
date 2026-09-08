"""Private data must round-trip without exposing or overwriting live credentials."""

from contextlib import redirect_stdout
import io
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from restore_lib import private
from restore_lib.common import Context, load_json, save_json


class PrivateTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="private-contract-")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.source = self.root / "source"
        self.target = self.root / "target"
        self.target.mkdir()
        for name in [".config/rclone/rclone.conf", ".config/mirador/config.toml",
                     ".local/share/kwalletd/kdewallet.kwl", ".local/share/kwalletd/kdewallet.salt",
                     ".local/share/kwalletd/kdewallet_attributes.json"]:
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"private fixture\0" + name.encode())
        (self.source / ".config/mirador/empty").mkdir()
        self.ctx = Context(self.root / "repo", self.root / "backup", self.source)
        self.enterContext(redirect_stdout(io.StringIO()))

    def snapshot(self):
        private.export(self.ctx)
        self.ctx.target = self.target
        return self.ctx.backup / "private"

    def test_round_trip_modes_empty_directories_and_idempotency(self):
        snapshot = self.snapshot()
        private.restore(self.ctx)
        self.assertEqual(private.inventory(self.target), private.inventory(self.source))
        for directory in (snapshot.resolve(), self.target):
            for path in directory.rglob("*"):
                if not path.is_symlink():
                    self.assertEqual(path.stat().st_mode & 0o777, 0o700 if path.is_dir() else 0o600)
        wallet = self.target / ".local/share/kwalletd/kdewallet.kwl"
        modified = wallet.stat().st_mtime_ns
        private.restore(self.ctx)
        self.assertEqual(wallet.stat().st_mtime_ns, modified)

    def test_conflict_in_last_root_blocks_every_write(self):
        self.snapshot()
        wallet = self.target / ".local/share/kwalletd/kdewallet.kwl"
        wallet.parent.mkdir(parents=True)
        wallet.write_bytes(b"existing wallet")
        with self.assertRaisesRegex(ValueError, "不同数据"):
            private.restore(self.ctx)
        self.assertEqual(wallet.read_bytes(), b"existing wallet")
        self.assertFalse((self.target / ".config").exists())

    def test_corrupted_data_and_manifest_paths_are_rejected(self):
        snapshot = self.snapshot()
        manifest = load_json(snapshot / "manifest.json")
        manifest["files"]["../../escape"] = {"type": "file", "sha256": "invalid"}
        save_json(snapshot / "manifest.json", manifest)
        with self.assertRaisesRegex(ValueError, "校验失败"):
            private.restore(self.ctx)
        del manifest["files"]["../../escape"]
        save_json(snapshot / "manifest.json", manifest)
        (snapshot / "home/.config/rclone/rclone.conf").write_text("tampered")
        with self.assertRaisesRegex(ValueError, "校验失败"):
            private.restore(self.ctx)
        self.assertEqual(list(self.target.iterdir()), [])

    def test_parent_symlink_and_unlisted_target_file_block_restore(self):
        self.snapshot()
        (self.target / ".config").symlink_to(self.source / ".config")
        with self.assertRaisesRegex(ValueError, "父目录"):
            private.restore(self.ctx)
        (self.target / ".config").unlink()
        private.restore(self.ctx)
        (self.target / ".config/mirador/new-secret").write_text("extra")
        with self.assertRaisesRegex(ValueError, "不同数据"):
            private.restore(self.ctx)

    def test_export_rewrites_directory_and_removes_retired_files(self):
        old = self.source / ".config/mirador/old-config"
        old.write_text("obsolete")
        private.export(self.ctx)
        old.unlink()
        (self.source / ".config/mirador/config.toml").write_text("current")
        private.export(self.ctx)
        snapshot = self.ctx.backup / "private"
        self.assertFalse(snapshot.is_symlink())
        self.assertEqual(private.inventory(snapshot / "home"), private.inventory(self.source))
        self.assertEqual({p.name for p in snapshot.iterdir()}, {"home", "manifest.json"})

    def test_export_rejects_links_and_overlapping_destination(self):
        self.ctx.backup = self.source / ".config/mirador/backup"
        with self.assertRaisesRegex(ValueError, "重叠"):
            private.export(self.ctx)
        self.ctx.backup = self.root / "backup"
        path = self.source / ".config/mirador/config.toml"
        path.unlink()
        path.symlink_to(self.source / ".config/rclone/rclone.conf")
        with self.assertRaisesRegex(ValueError, "符号链接"):
            private.export(self.ctx)

    def test_check_does_not_create_target_directories(self):
        self.snapshot()
        self.ctx.check = True
        private.restore(self.ctx)
        self.assertEqual(list(self.target.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
