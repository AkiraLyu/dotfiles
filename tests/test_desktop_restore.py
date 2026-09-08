"""Copy isolation, source selection and boot firmware restoration contracts."""

from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "scripts"))
from restore_lib import firmware, kde, pacman, pkgbuilds
from restore_lib.common import Context, save_json

spec = importlib.util.spec_from_file_location("system_config", REPO / "scripts/system-config.py")
system_config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(system_config)


class DesktopRestoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="desktop-restore-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.home = self.root / "home"
        self.home.mkdir()
        self.ctx = Context(self.repo, self.root / "backup", self.home)
        output = redirect_stdout(io.StringIO())
        output.__enter__()
        self.addCleanup(output.__exit__, None, None, None)

    def write(self, path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data)

    def kde_fixture(self):
        self.write(self.home / ".config/plasmarc", f"[Wallpapers]\npath={self.home}/Pictures/a.png\n")
        self.write(self.home / ".config/kwinrc", "[Plugins]\nexampleEnabled=true\n")
        self.write(self.home / ".config/kwinoutputconfig.json", '{"edid":"not exported"}')
        self.write(self.repo / "qt-plasma/templates/org.kde.kate.desktop",
                   "[Desktop Entry]\nType=Application\nName=Kate\nExec=kate -b %U\n")
        kde.export(self.ctx)

    def test_kde_restore_copies_remaps_home_and_preserves_runtime_writes(self):
        self.kde_fixture()
        fresh = self.root / "new-home"
        fresh.mkdir()
        ctx = Context(self.repo, self.ctx.backup, fresh, True)
        kde.restore(ctx)
        self.assertEqual(list(fresh.iterdir()), [])
        ctx.check = False
        kde.restore(ctx)
        settings = fresh / ".config/plasmarc"
        self.assertFalse(settings.is_symlink())
        self.assertIn(str(fresh / "Pictures/a.png"), settings.read_text())
        self.assertFalse((fresh / ".config/kwinoutputconfig.json").exists())
        desktop = fresh / kde.DESKTOP
        desktop.write_text(desktop.read_text() + "Actions=Runtime;\n")
        kde.restore(ctx)
        self.assertIn("Actions=Runtime", desktop.read_text())
        self.assertNotIn("Actions=", (self.repo / "qt-plasma/templates/org.kde.kate.desktop").read_text())

    def test_kde_conflict_blocks_every_write_and_corruption_is_rejected(self):
        self.kde_fixture()
        self.write(self.home / ".config/kwinrc", "keep new settings")
        with self.assertRaisesRegex(ValueError, "未覆盖"):
            kde.restore(self.ctx)
        self.assertFalse((self.home / kde.DESKTOP).exists())
        self.write(self.repo / "qt-plasma/state/.config/kwinrc", "corrupt")
        with self.assertRaisesRegex(ValueError, "摘要"):
            kde.preflight(self.ctx)

    def test_kate_rejects_symlink_without_changing_its_source(self):
        self.kde_fixture()
        legacy = self.repo / "qt-plasma" / kde.DESKTOP
        text = "[Desktop Entry]\nExec=kate -b %U\nActions=Session bad;\n[Desktop Action Session bad]\nExec=kate -s private\n"
        self.write(legacy, text)
        dest = self.home / kde.DESKTOP
        dest.parent.mkdir(parents=True)
        dest.symlink_to(legacy)
        with self.assertRaisesRegex(ValueError, "独立文件"):
            kde.restore(self.ctx)
        self.assertTrue(dest.is_symlink())
        self.assertEqual(legacy.read_text(), text)

    def test_kde_export_removes_deleted_settings_from_snapshot(self):
        self.kde_fixture()
        (self.home / ".config/kwinrc").unlink()
        kde.export(self.ctx)
        self.assertFalse((self.repo / "qt-plasma/state/.config/kwinrc").exists())
        self.assertNotIn(".config/kwinrc", kde.inputs(self.ctx))

    def test_kde_export_restores_theme_choices_and_only_static_kate_settings(self):
        self.kde_fixture()
        self.write(self.home / ".local/state/theme/mode", "dark\n")
        self.write(self.home / ".local/state/theme/preset", "kvantum\n")
        self.write(self.home / ".local/state/theme/backups/old", "do not export")
        desktop = self.home / kde.DESKTOP
        content = ("[Desktop Entry]\nType=Application\nName=My Kate\nExec=kate -b %U\n"
                   "Actions=Session private;\n[Desktop Action Session private]\nExec=kate -s private\n")
        self.write(desktop, content)
        kde.export(self.ctx)
        fresh = self.root / "fresh-home"
        fresh.mkdir()
        kde.restore(Context(self.repo, self.ctx.backup, fresh))
        self.assertEqual((fresh / ".local/state/theme/mode").read_text(), "dark\n")
        self.assertEqual((fresh / ".local/state/theme/preset").read_text(), "kvantum\n")
        self.assertFalse((fresh / ".local/state/theme/mode").is_symlink())
        self.assertFalse((fresh / ".local/state/theme/backups").exists())
        self.assertIn("Name=My Kate", (fresh / kde.DESKTOP).read_text())
        self.assertNotIn("Session private", (fresh / kde.DESKTOP).read_text())
        self.assertEqual(desktop.read_text(), content)

    def firmware_fixture(self):
        data = b"AVS fixture"
        source = self.ctx.backup / firmware.SOURCE
        source.parent.mkdir(parents=True)
        source.write_bytes(data)
        save_json(self.repo / "hardware/avs-firmware.json", {
            "path": firmware.RELATIVE, "backup_path": firmware.SOURCE,
            "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        return data

    def test_firmware_check_copy_conflict_and_integrity(self):
        data = self.firmware_fixture()
        self.assertTrue(firmware.deploy(self.repo, self.ctx.backup, self.home))
        self.assertFalse((self.home / firmware.RELATIVE).exists())
        firmware.deploy(self.repo, self.ctx.backup, self.home, apply=True)
        dest = self.home / firmware.RELATIVE
        self.assertEqual(dest.read_bytes(), data)
        self.assertFalse(firmware.deploy(self.repo, self.ctx.backup, self.home, apply=True))
        dest.write_bytes(b"other firmware")
        with self.assertRaisesRegex(ValueError, "未覆盖"):
            firmware.deploy(self.repo, self.ctx.backup, self.home, apply=True)
        (self.ctx.backup / firmware.SOURCE).write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError, "SHA256"):
            firmware.payload(self.repo, self.ctx.backup)

    def test_firmware_cli_accepts_backup_directory_without_system_writes(self):
        # A missing backup must reach input validation, never crash on argparse attributes.
        result = subprocess.run([sys.executable, "-B", str(REPO / "scripts/restore-firmware.py"),
                                 "--backup-dir", str(self.root / "missing")],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("缺少 AVS 固件", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_etc_detaches_owned_links_but_preserves_new_machine_uuids(self):
        source = self.repo / "etc/cmdline.d/root.conf"
        source.parent.mkdir(parents=True)
        source.write_bytes((REPO / "etc/cmdline.d/root.conf").read_bytes())
        target = self.root / "etc"
        target_root = target / "cmdline.d/root.conf"
        import re
        content = re.sub(r"rd\.luks\.name=[^=\s]+", "rd.luks.name=11111111-2222-3333-4444-555555555555", source.read_text())
        self.write(target_root, content)
        self.write(self.repo / "etc/tlp.conf", "TLP_ENABLE=1\n")
        (target / "tlp.conf").symlink_to(self.repo / "etc/tlp.conf")
        changes = system_config.plan(self.repo, target)
        self.assertEqual([p.name for p, _, _ in changes], ["tlp.conf"])
        self.assertEqual(target_root.read_text(), content)
        (target / "tlp.conf").unlink()
        self.write(target / "tlp.conf", "TLP_ENABLE=0")
        with self.assertRaisesRegex(ValueError, "未覆盖"):
            system_config.plan(self.repo, target)

    def test_paru_regenerates_only_checkout_path_and_rejects_independent_changes(self):
        self.write(self.repo / "packages/paru.conf", "[options]\nProvides\n[pkgbuilds]\nUrl = https://example.invalid\n")
        folder = self.home / ".config/paru"
        pkgbuilds.configure(self.ctx)
        self.assertFalse(folder.is_symlink())
        config = folder / "paru.conf"
        self.assertIn(str(self.repo / "packages/pkgbuilds"), config.read_text())
        config.write_text(config.read_text().replace(str(self.repo), "/previous/checkout"))
        pkgbuilds.configure(self.ctx)
        self.assertIn(str(self.repo / "packages/pkgbuilds"), config.read_text())
        config.write_text(config.read_text() + "\nUnexpectedChange\n")
        with self.assertRaisesRegex(ValueError, "独立修改"):
            pkgbuilds.configure(self.ctx)

    def test_paru_rejects_symlink_configuration(self):
        self.write(self.repo / "packages/paru.conf", "[options]\n[pkgbuilds]\n")
        folder = self.home / ".config/paru"
        folder.parent.mkdir()
        folder.symlink_to(self.repo / "packages")
        with self.assertRaisesRegex(ValueError, "父目录"):
            pkgbuilds.configure(self.ctx)

    def test_package_policy_never_reinstalls_stock_or_deferred_packages(self):
        rules = {"local_packages": ["xwayland-satellite-akira", "niri-meta", "gamescope-anime4k", "foxvault-git"],
                 "built_packages": ["dotfiles-kde-plugins", "shiguang-diary"],
                 "replacements": {"xwayland-satellite": "xwayland-satellite-akira", "gamescope": "gamescope-anime4k"},
                 "deferred": {"fcitx5-pinyin-sougou-dict-git": "leave"}}
        save_json(self.repo / "packages/pacman-policy.json", rules)
        files = {"pkglist.txt": ["app", "xwayland-satellite", "gamescope"], "pkglist_deps.txt": ["library"],
                 "pkglist_aur.txt": ["niri-meta", "foxvault-git", "dotfiles-kde-plugins", "shiguang-diary", "fcitx5-pinyin-sougou-dict-git"],
                 "pkglist_aur_deps.txt": ["foreign-library"]}
        for name, names in files.items():
            self.write(self.ctx.backup / "pacman" / name, "\n".join(names))
        save_json(self.ctx.backup / "pacman/snapshot.json", {"architecture": __import__("platform").machine()})
        commands = []
        with patch.object(self.ctx, "run", side_effect=lambda *args, **kwargs: commands.append(args)):
            pacman.restore_repo(self.ctx)
            pacman.restore_foreign(self.ctx)
        installs = [c for c in commands if "-S" in c or "-Syu" in c]
        for command in installs:
            for name in (*rules["local_packages"], *rules["built_packages"], *rules["deferred"], *rules["replacements"]):
                self.assertNotIn(name, command)
        reasons = [c for c in commands if "-D" in c]
        self.assertTrue(any("xwayland-satellite-akira" in c for c in reasons))
        self.assertTrue(any("gamescope-anime4k" in c for c in reasons))
        self.assertTrue(any("foxvault-git" in c for c in reasons))
        self.assertTrue(any("shiguang-diary" in c for c in reasons))
        self.assertFalse(any("fcitx5-pinyin-sougou-dict-git" in c for c in reasons))


if __name__ == "__main__":
    unittest.main()
