"""Diary package sources stay independent of personal data and dev caches."""

from contextlib import ExitStack, redirect_stdout
import io
import hashlib
import json
from pathlib import Path
import sys
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from restore_lib import diary
from restore_lib.common import Context
import manage


class DiaryRestoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.ctx = Context(self.root / "repo", self.root / "backup", self.root / "home", True)
        self.source = self.ctx.repo / diary.SOURCE
        for name in diary.FILES:
            self.write(name, b"source fixture")
        for name in diary.DIRECTORIES:
            self.write(f"{name}/fixture.txt", b"source fixture")
        self.write("PKGBUILD", b"pkgname=shiguang-diary\npkgver=1.0.0\npkgrel=2\n")
        self.write("package.json", b'{"name":"daylight-diary","version":"1.0.0"}')

    def write(self, name, data):
        path = self.source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def test_archive_excludes_diaries_credentials_dependencies_and_generated_files(self):
        for name in ("Diary/2026/private.md", ".shiguang/locations.sqlite3", ".env",
                     ".git/config", "node_modules/example/index.js", "01_private.md",
                     "build/native/output.so", "native/linux-wayland-blur/build/output.so"):
            self.write(name, b"private or generated")
        files = diary.preflight(self.ctx)
        work = self.root / "build"
        work.mkdir()
        diary.prepare(work, files, diary.source_manifest(files))
        with tarfile.open(work / "source.tar.gz") as archive:
            for member in archive.getmembers():
                self.assertNotIn(b"private or generated", archive.extractfile(member).read())
        self.assertTrue((work / "public/fixture.txt").is_file())
        self.assertTrue((work / "build/icon.png").is_file())

    def test_runtime_symlinks_and_mismatched_versions_block_restore(self):
        path = self.source / "electron/fixture.txt"
        path.unlink()
        path.symlink_to(self.write("Diary/private.md", b"private diary"))
        with self.assertRaisesRegex(ValueError, "独立源文件"):
            diary.preflight(self.ctx)
        path.unlink()
        self.write("electron/fixture.txt", b"app source")
        self.write("package.json", b'{"name":"daylight-diary","version":"2.0.0"}')
        with self.assertRaisesRegex(ValueError, "版本不一致"):
            diary.preflight(self.ctx)

    def test_check_is_read_only_and_source_changes_invalidate_package(self):
        before = set(self.root.rglob("*"))
        with patch.object(diary, "is_current", return_value=False), \
                patch.object(self.ctx, "run") as run, redirect_stdout(io.StringIO()):
            diary.restore(self.ctx)
        run.assert_not_called()
        self.assertEqual(set(self.root.rglob("*")), before)
        metadata = self.root / "source-manifest.json"
        manifest = diary.source_manifest(diary.preflight(self.ctx))
        metadata.write_text(json.dumps({**manifest, "built_against": ["electron 43", "wayland 1"]}))
        with patch.object(diary, "METADATA", metadata), \
                patch.object(diary, "capture", return_value="electron 43\nwayland 1"), \
                patch.object(diary.subprocess, "run") as command:
            command.return_value.returncode = 0
            self.assertTrue(diary.is_current(manifest))
            self.write("electron/fixture.txt", b"changed application")
            self.assertFalse(diary.is_current(diary.source_manifest(diary.preflight(self.ctx))))

    def test_install_retry_reuses_only_an_intact_matching_package(self):
        manifest = {**diary.source_manifest(diary.preflight(self.ctx)), "built_against": ["electron 43"]}
        output = self.ctx.backup / "packages" / diary.NAME
        output.mkdir(parents=True)
        (output / "source-manifest.json").write_text(json.dumps(manifest))
        package = output / "shiguang-diary-1.0.0-2-x86_64.pkg.tar.zst"
        package.write_bytes(b"verified package")
        (output / "manifest.json").write_text(json.dumps({
            "package": package.name, "sha256": hashlib.sha256(package.read_bytes()).hexdigest()}))
        self.assertEqual(diary.cached_package(self.ctx, manifest), package)
        self.assertIsNone(diary.cached_package(self.ctx, {**manifest, "built_against": ["electron 44"]}))
        package.write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError, "校验失败"):
            diary.cached_package(self.ctx, manifest)

    def test_stow_deploys_sources_without_diary_data_or_development_cache(self):
        self.write("Diary/2026/private.md", b"private diary")
        self.write("node_modules/electron/index.js", b"development dependency")
        self.write("01_private.md", b"private note")
        self.write("build/native/plugin.so", b"generated output")
        self.ctx.target.mkdir()
        rules = Path(__file__).resolve().parents[1] / "local/.stow-local-ignore"
        shutil.copy2(rules, self.ctx.repo / "local/.stow-local-ignore")
        subprocess.run(["stow", "--no-folding", "--dir", str(self.ctx.repo),
                        "--target", str(self.ctx.target), "local"], check=True, capture_output=True)
        target = self.ctx.target / ".local/src/diary"
        self.assertTrue((target / "public/fixture.txt").is_symlink())
        self.assertTrue((target / "build/icon.png").is_symlink())
        for name in ("Diary", "node_modules", "01_private.md", "build/native"):
            self.assertFalse((target / name).exists(), name)

    def test_pacman_restores_diary_once_before_foreign_packages(self):
        order = []
        handlers = (("repository", manage.pacman, "restore_repo"),
                    ("rust", manage.rust, "restore_rust"),
                    ("pkgbuilds", manage.pkgbuilds, "restore"),
                    ("kde", manage.kde_plugins, "restore"),
                    ("diary", manage.diary, "restore"),
                    ("foreign", manage.pacman, "restore_foreign"))
        with ExitStack() as stack:
            stack.enter_context(patch.object(sys, "argv", ["manage.py", "restore", "pacman", "diary", "kde-plugins", "pkgbuilds", "rust"]))
            stack.enter_context(patch("manage.os.geteuid", return_value=1000))
            stack.enter_context(redirect_stdout(io.StringIO()))
            for module in (manage.pacman, manage.rust, manage.pkgbuilds, manage.kde_plugins, manage.diary):
                stack.enter_context(patch.object(module, "preflight"))
            for label, module, name in handlers:
                stack.enter_context(patch.object(module, name, side_effect=lambda ctx, label=label: order.append(label)))
            manage.main()
        self.assertEqual(order, [item[0] for item in handlers])


if __name__ == "__main__":
    unittest.main()
