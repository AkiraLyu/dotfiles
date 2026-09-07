"""Restore contracts tested with temporary data and command doubles."""

from contextlib import closing, redirect_stdout
import io
import json
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from restore_lib import codex, flatpak, pacman, rust
from restore_lib.common import Context, save_json
import manage


class ManagementTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="restore-contract-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.target = self.root / "home"
        self.target.mkdir()
        self.ctx = Context(self.repo, self.root / "backup", self.target)
        self.output = io.StringIO()
        self.redirect = redirect_stdout(self.output)
        self.redirect.__enter__()
        self.addCleanup(self.redirect.__exit__, None, None, None)

    def fixture_packages(self):
        root = self.ctx.backup / "pacman"
        root.mkdir(parents=True)
        for name, content in zip(pacman.LISTS, ("app\n", "foreign\n", "library\n", "foreign-library\n")):
            (root / name).write_text(content)
        save_json(root / "snapshot.json", {"architecture": __import__("platform").machine()})

    def fixture_rust(self):
        save_json(self.repo / "packages/rust.json", {"default": "nightly-2026-06-28", "toolchains": [
            {"install": "nightly-2026-06-28", "components": ["rust-src", "clippy"], "targets": ["x86_64-unknown-linux-gnu", "i686-unknown-linux-gnu"]}]})
        data = {"packages": [{"name": "example", "version": "1.2.3", "toolchain": "nightly-2026-06-28",
                               "git": "https://example.invalid/source", "rev": "a" * 40, "features": ["extra"],
                               "all_features": False, "no_default_features": True, "bins": ["example"],
                               "profile": "release", "target": "x86_64-unknown-linux-gnu"}]}
        save_json(self.repo / "packages/cargo.json", data)
        return data

    def test_four_package_lists_restore_install_reasons(self):
        self.fixture_packages()
        commands = []
        with patch.object(self.ctx, "run", side_effect=lambda *args, **kwargs: commands.append(args)):
            pacman.restore_repo(self.ctx)
            pacman.restore_foreign(self.ctx)
        self.assertEqual(commands[0], ("run0", "pacman", "-Syu", "--needed", "app"))
        self.assertIn(("run0", "pacman", "-D", "--asdeps", "library", "foreign-library"), commands)
        self.assertIn(("run0", "pacman", "-D", "--asexplicit", "app", "foreign"), commands)
        self.assertIn(("paru", "--sudo", "run0", "-S", "--needed", "--asdeps", "foreign-library"), commands)

    def test_duplicate_package_reasons_are_rejected(self):
        self.fixture_packages()
        (self.ctx.backup / "pacman/pkglist_deps.txt").write_text("app\n")
        with self.assertRaisesRegex(ValueError, "原因冲突"):
            pacman.read_lists(self.ctx)

    def test_failed_export_preserves_existing_lists(self):
        self.fixture_packages()
        path = self.ctx.backup / "pacman/pkglist.txt"
        with patch("restore_lib.pacman.capture", side_effect=["new-app", RuntimeError("query failed")]):
            with self.assertRaises(RuntimeError):
                pacman.export(self.ctx)
        self.assertEqual(path.read_text(), "app\n")

    def test_rust_and_cargo_preserve_versions_features_and_targets(self):
        self.fixture_rust()
        commands = []
        with patch.object(self.ctx, "run", side_effect=lambda *args, **kwargs: commands.append(args)):
            rust.restore_rust(self.ctx)
            rust.restore_cargo(self.ctx)
        self.assertIn("i686-unknown-linux-gnu", commands[0][-1])
        self.assertIn("--locked", commands[-1])
        self.assertIn("a" * 40, commands[-1])
        self.assertIn("--no-default-features", commands[-1])
        self.assertIn("extra", commands[-1])
        self.assertIn(str(self.target / ".cargo"), commands[-1])

    def test_cargo_requires_declared_toolchain_and_full_revision(self):
        data = self.fixture_rust()
        for field, value in (("toolchain", "unmanaged"), ("rev", "main")):
            changed = json.loads(json.dumps(data))
            changed["packages"][0][field] = value
            save_json(self.repo / "packages/cargo.json", changed)
            with self.subTest(field=field), self.assertRaises(ValueError):
                rust.preflight_cargo(self.ctx)

    def test_npm_keeps_installed_versions_and_installs_only_missing(self):
        save_json(self.repo / "packages/npm.json", {"packages": {"@scope/existing": "1.0.0", "missing": "2.0.0"}})
        save_json(self.target / ".local/lib/node_modules/@scope/existing/package.json", {"version": "9.0.0"})
        commands = []
        with patch.object(self.ctx, "run", side_effect=lambda *args, **kwargs: commands.append(args)):
            manage.restore_npm(self.ctx)
        self.assertEqual(len(commands), 2)
        self.assertEqual(commands[-1][-1], "missing@2.0.0")
        self.assertIn("保留现有 npm 包：@scope/existing@9.0.0", self.output.getvalue())

    def test_invalid_npm_manifest_stops_before_setting_prefix(self):
        save_json(self.repo / "packages/npm.json", {"packages": {"example": "latest"}})
        with patch.object(self.ctx, "run") as run:
            with self.assertRaisesRegex(ValueError, "固定版本"):
                manage.restore_npm(self.ctx)
            run.assert_not_called()

    def fixture_flatpak(self):
        root = self.repo / "packages/flatpak"
        root.mkdir(parents=True)
        (root / "key.gpg").write_bytes(b"public signing key")
        save_json(root / "manifest.json", {"remotes": [{"name": "test", "url": "https://example.invalid/", "key": "key.gpg", "scope": "system"}],
                                           "apps": [{"ref": "org.test.App/x86_64/stable", "origin": "test", "scope": "system"}],
                                           "user_overrides": {"org.test.App": "[Environment]\nSCALE=1.25\n"}})

    def test_flatpak_retains_scope_and_public_key(self):
        self.fixture_flatpak()
        commands = []
        with patch("restore_lib.flatpak.capture", return_value=""), patch.object(self.ctx, "run", side_effect=lambda *args, **kwargs: commands.append(args)):
            flatpak.restore(self.ctx)
        self.assertEqual(commands[0][:4], ("run0", "flatpak", "remote-add", "--system"))
        self.assertTrue(any(str(arg).startswith("--gpg-import=") for arg in commands[0]))
        self.assertIn("--system", commands[1])
        self.assertTrue((self.target / ".local/share/flatpak/overrides/org.test.App").is_file())

    def test_flatpak_conflicts_stop_before_commands(self):
        self.fixture_flatpak()
        path = self.target / ".local/share/flatpak/overrides/org.test.App"
        path.parent.mkdir(parents=True)
        path.write_text("keep")
        with patch.object(self.ctx, "run") as run:
            with self.assertRaises(ValueError):
                flatpak.restore(self.ctx)
            run.assert_not_called()

    def test_flatpak_skips_installed_ref_and_check_is_read_only(self):
        self.fixture_flatpak()
        self.ctx.check = True
        with patch("restore_lib.flatpak.shutil.which", return_value="/usr/bin/flatpak"), \
                patch("restore_lib.flatpak.capture", side_effect=lambda *args:
                   "org.test.App/x86_64/stable" if args[1] == "list" else ""):
            flatpak.restore(self.ctx)
        self.assertEqual(list(self.target.iterdir()), [])
        self.assertNotIn("flatpak install", self.output.getvalue())

    def test_flatpak_rejects_same_name_with_different_remote_url(self):
        self.fixture_flatpak()
        with patch("restore_lib.flatpak.shutil.which", return_value="/usr/bin/flatpak"), \
                patch("restore_lib.flatpak.capture", return_value="test\thttps://different.invalid/"), \
                patch.object(self.ctx, "run") as run:
            with self.assertRaisesRegex(ValueError, "不同地址"):
                flatpak.restore(self.ctx)
            run.assert_not_called()

    def test_later_stage_preflight_failure_prevents_earlier_install(self):
        with patch.object(sys, "argv", ["manage.py", "restore", "pacman", "flatpak"]), \
                patch("manage.Path.home", return_value=self.target), \
                patch("manage.pacman.preflight"), patch("manage.rust.preflight"), \
                patch("manage.flatpak.preflight", side_effect=ValueError("override conflict")), \
                patch("manage.pacman.restore_repo") as install:
            with self.assertRaisesRegex(ValueError, "未执行安装"):
                manage.main()
            install.assert_not_called()

    def fixture_codex(self):
        source = self.root / "codex-source"
        source.mkdir()
        (source / "config.toml").write_text('model = "fixture"\n')
        (source / "auth.json").write_text('{"fixture": true}\n')
        (source / "ipc").mkdir()
        (source / "ipc/runtime").write_text("temporary")
        (source / "link").symlink_to(source / "config.toml")
        connection = sqlite3.connect(source / "state.sqlite")
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("CREATE TABLE sample(value TEXT)")
        connection.execute("INSERT INTO sample VALUES ('committed in WAL')")
        connection.commit()
        self.addCleanup(connection.close)
        return source

    def test_codex_wal_backup_and_restore_with_checksum(self):
        source = self.fixture_codex()
        # Only the module's source lookup is mocked; SQLite backup is real.
        codex.export(self.ctx, source)
        self.assertFalse((self.ctx.backup / "codex/latest/home/ipc").exists())
        self.assertFalse((self.ctx.backup / "codex/latest/home/state.sqlite-wal").exists())
        codex.restore(self.ctx)
        with closing(sqlite3.connect(self.target / ".codex/state.sqlite")) as db:
            self.assertEqual(db.execute("SELECT value FROM sample").fetchone()[0], "committed in WAL")
        self.assertEqual((self.target / ".codex/link").resolve(), self.target / ".codex/config.toml")
        self.assertEqual((self.target / ".codex").stat().st_mode & 0o777, 0o700)

    def test_codex_corruption_and_nonempty_target_block_restore(self):
        source = self.fixture_codex()
        codex.export(self.ctx, source)
        (self.target / ".codex").mkdir()
        (self.target / ".codex/existing").write_text("keep")
        with self.assertRaisesRegex(ValueError, "现有数据"):
            codex.preflight(self.ctx)
        shutil.rmtree(self.target / ".codex")
        (self.ctx.backup / "codex/latest/home/config.toml").write_text("tampered")
        with self.assertRaisesRegex(ValueError, "校验失败"):
            codex.restore(self.ctx)
        self.assertFalse((self.target / ".codex").exists())

    def test_codex_rejects_recursive_backup_destination(self):
        source = self.fixture_codex()
        self.ctx.backup = source / "backup"
        with self.assertRaisesRegex(ValueError, "内部"):
            codex.export(self.ctx, source)


if __name__ == "__main__":
    unittest.main()
