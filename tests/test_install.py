"""Installer integration tests. All links go into temporary directories.

Run as a normal user: python3 -B -m unittest discover -s tests -v
Requires GNU Stow; run0 is replaced with a test double, and /etc is redirected.
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


REPO = Path(__file__).resolve().parents[1]
REAL_STOW = shutil.which("stow")
HOME_PACKAGES = ("fontconfig", "fish", "kitty", "chromium", "tools", "qt-plasma", "local", "nvim", "niri")
HELPER = Path("local/.local/scripts/apps/desktop/firefox-profile.sh")


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def snapshot(root):
    result = {}
    for path in sorted(root.rglob("*")):
        name = str(path.relative_to(root))
        if path.is_symlink():
            result[name] = ("link", os.readlink(path))
        elif path.is_file():
            result[name] = ("file", path.read_bytes())
        else:
            result[name] = ("dir",)
    return result


@unittest.skipUnless(REAL_STOW and os.geteuid() != 0, "requires GNU Stow and a normal user")
class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="dotfiles install test ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo with spaces"
        self.home = self.root / "target home"
        self.etc = self.root / "target etc"
        self.bin = self.root / "bin"
        self.log = self.root / "calls.jsonl"
        for path in (self.repo, self.home, self.etc, self.bin):
            path.mkdir()
        for relative in (Path("install.sh"), Path("RESTORE.md"), Path("scripts/firefox-profile.py"), HELPER):
            destination = self.repo / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(REPO / relative, destination)
        for package in HOME_PACKAGES:
            write(self.repo / package / f".config/{package}/config", f"{package}\n")
        write(self.repo / "etc/install-fixture.conf", "system config\n")
        write(self.repo / "firefox/user.js", "// fixture\n")
        write(self.repo / "firefox/chrome/userChrome.css", "/* fixture */\n")
        write(self.repo / "systemd/.config/systemd/user/fixture.service", "[Service]\nExecStart=/usr/bin/true\n")
        wants = self.repo / "systemd/.config/systemd/user/default.target.wants"
        wants.mkdir()
        (wants / "fixture.service").symlink_to("../fixture.service")
        write(self.repo / "backup/DO_NOT_DEPLOY", "private\n")
        write(self.repo / "future-module/DO_NOT_DEPLOY", "module\n")

        self.firefox_root = self.home / ".config/mozilla/firefox"
        self.profile = self.firefox_root / "chosen.default-release"
        self.profile.mkdir(parents=True)
        write(self.firefox_root / "profiles.ini", "[InstallTEST]\nDefault=chosen.default-release\n")

        # Real Stow handles all filesystem operations. Only the system target and
        # elevation are substituted; a write to the host /etc is never possible.
        wrapper = """#!/usr/bin/env python3
import json, os, subprocess, sys
from pathlib import Path
args = sys.argv[1:]
kind = Path(sys.argv[0]).name
with open(os.environ['INSTALL_TEST_LOG'], 'a') as stream:
    stream.write(json.dumps([kind, args]) + '\\n')
if kind == 'run0':
    sys.exit(subprocess.call(args))
for i in range(len(args) - 1):
    if args[i] == '--target' and args[i + 1] == '/etc':
        args[i + 1] = os.environ['INSTALL_TEST_ETC']
if '--simulate' not in args and args[-1] == os.environ.get('INSTALL_TEST_FAIL'):
    sys.exit(42)
sys.exit(subprocess.call([os.environ['INSTALL_TEST_STOW'], *args]))
"""
        for name in ("stow", "run0"):
            path = self.bin / name
            write(path, wrapper)
            path.chmod(0o755)
        self.env = dict(os.environ, PATH=f"{self.bin}:{os.environ['PATH']}",
                        INSTALL_TEST_LOG=str(self.log), INSTALL_TEST_ETC=str(self.etc),
                        INSTALL_TEST_STOW=REAL_STOW)

    def run_install(self, *args, success=True, helper=False):
        script = self.repo / (HELPER if helper else "install.sh")
        command = [str(script), "--target", str(self.home), *map(str, args)]
        result = subprocess.run(command, cwd=self.root, env=self.env, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout)
        return result

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def assert_only_checks(self):
        for name, args in self.calls():
            self.assertEqual(name, "stow")
            self.assertIn("--simulate", args)

    def test_all_dry_run_is_read_only(self):
        before = [snapshot(path) for path in (self.repo, self.home, self.etc)]
        self.run_install("--dry-run", "--all")
        self.assertEqual(before, [snapshot(path) for path in (self.repo, self.home, self.etc)])
        self.assert_only_checks()
        self.assertEqual(len(self.calls()), 3)

    def test_default_excludes_opt_in_packages_and_new_directories(self):
        self.run_install()
        for package in HOME_PACKAGES:
            config = self.home / f".config/{package}/config"
            self.assertTrue(config.is_symlink())
            self.assertEqual(config.read_text(), f"{package}\n")
            self.assertFalse(config.parent.is_symlink())
        self.assertFalse((self.home / ".config/systemd").exists())
        self.assertFalse((self.profile / "user.js").exists())
        self.assertEqual(snapshot(self.etc), {})
        self.assertFalse((self.home / "DO_NOT_DEPLOY").exists())
        self.assertFalse((self.home / "scripts").exists())
        for name, args in self.calls():
            self.assertEqual(name, "stow")
            self.assertNotIn("backup", args)
            self.assertNotIn("future-module", args)

    def test_full_deployment_order_and_repeatability(self):
        self.run_install("systemd", "firefox", "etc", *reversed(HOME_PACKAGES))
        applied = [args[-1] for name, args in self.calls() if name == "stow" and "--simulate" not in args]
        self.assertEqual(applied, ["niri", "etc", "firefox", "systemd"])
        self.assertEqual(sum(name == "run0" for name, _ in self.calls()), 1)
        self.assertTrue((self.etc / "install-fixture.conf").is_symlink())
        self.assertTrue((self.profile / "user.js").is_symlink())
        unit = self.home / ".config/systemd/user/default.target.wants/fixture.service"
        self.assertTrue(unit.is_file())
        self.assertTrue(unit.is_symlink())
        before = [snapshot(path) for path in (self.repo, self.home, self.etc)]
        self.run_install("--all")
        self.assertEqual(before, [snapshot(path) for path in (self.repo, self.home, self.etc)])

    def test_missing_firefox_blocks_earlier_deployment(self):
        shutil.rmtree(self.firefox_root)
        before = snapshot(self.home)
        result = self.run_install("--all", success=False)
        self.assertIn("没有已登记", result.stdout)
        self.assertEqual(before, snapshot(self.home))
        self.assert_only_checks()

    def test_all_conflicts_reported_before_any_write(self):
        write(self.home / ".config/fish/config", "keep home\n")
        write(self.etc / "install-fixture.conf", "keep system\n")
        write(self.profile / "user.js", "keep firefox\n")
        before = [snapshot(path) for path in (self.repo, self.home, self.etc)]
        result = self.run_install("--all", success=False)
        for expected in (".config/fish/config", "install-fixture.conf", "user.js", "预检未通过"):
            self.assertIn(expected, result.stdout)
        self.assertEqual(before, [snapshot(path) for path in (self.repo, self.home, self.etc)])
        self.assert_only_checks()

    def test_systemd_cross_package_conflict_blocks_home(self):
        write(self.repo / "systemd/.config/fish/config", "other package\n")
        before = snapshot(self.home)
        self.run_install("fish", "systemd", success=False)
        self.assertEqual(before, snapshot(self.home))
        self.assert_only_checks()

    def test_apply_failure_stops_later_stages_without_success(self):
        self.env["INSTALL_TEST_FAIL"] = "etc"
        result = self.run_install("--all", success=False)
        self.assertIn("系统配置部署 失败", result.stdout)
        self.assertNotIn("所选配置链接部署完成", result.stdout)
        self.assertFalse((self.profile / "user.js").exists())
        self.assertFalse((self.home / ".config/systemd").exists())
        self.assertTrue((self.home / ".config/fish/config").is_symlink())

    def test_invalid_arguments_do_not_call_stow(self):
        cases = (("backup",), ("../fish",), ("--unknown",), ("--all", "fish"),
                 ("--target",), ("--target", self.repo), ("--target", self.root / "absent"),
                 ("--firefox-profile", self.profile), ("--target", self.home, "--plan"))
        for args in cases:
            with self.subTest(args=args):
                self.run_install(*args, success=False)
                self.assertEqual(self.calls(), [])

    def test_plan_and_help_from_another_working_directory(self):
        for option in ("--plan", "--help"):
            for entry in (self.repo / "install.sh", self.repo / HELPER):
                result = subprocess.run([str(entry), option], cwd=self.root, env=self.env,
                                        text=True, capture_output=True, timeout=20)
                self.assertEqual(result.returncode, 0, result.stderr)
                if option == "--plan":
                    self.assertEqual(result.stdout, (self.repo / "RESTORE.md").read_text())
        self.assertEqual(self.calls(), [])

    def test_install_default_wins_over_legacy_default(self):
        legacy = self.firefox_root / "old.default"
        legacy.mkdir()
        write(self.firefox_root / "profiles.ini", "[InstallTEST]\nDefault=chosen.default-release\n"
              "[Profile0]\nPath=old.default\nIsRelative=1\nDefault=1\n")
        write(self.firefox_root / "installs.ini", "[TEST]\nDefault=chosen.default-release\n")
        self.run_install("firefox")
        self.assertTrue((self.profile / "user.js").is_symlink())
        self.assertFalse((legacy / "user.js").exists())

    def test_legacy_location_and_absolute_profile_path(self):
        shutil.rmtree(self.firefox_root)
        external = self.root / "external profile 100%"
        external.mkdir()
        write(self.home / ".mozilla/firefox/profiles.ini",
              f"[Profile0]\nPath={external}\nIsRelative=0\nDefault=1\n")
        self.run_install("--check", helper=True)
        self.assert_only_checks()
        self.run_install(helper=True)
        self.assertTrue((external / "user.js").is_symlink())

    def test_ambiguous_profiles_require_explicit_path(self):
        other = self.firefox_root / "other.default-release"
        other.mkdir()
        write(self.firefox_root / "profiles.ini", "[InstallA]\nDefault=chosen.default-release\n"
              "[InstallB]\nDefault=other.default-release\n")
        result = self.run_install("firefox", success=False)
        self.assertIn("选择不唯一", result.stdout)
        self.assertEqual(self.calls(), [])
        self.run_install("firefox", "--firefox-profile", other)
        self.assertTrue((other / "user.js").is_symlink())
        self.assertFalse((self.profile / "user.js").exists())

    def test_relative_profile_uses_callers_working_directory(self):
        external = self.root / "relative profile"
        external.mkdir()
        self.run_install("firefox", "--firefox-profile", "relative profile")
        self.assertTrue((external / "user.js").is_symlink())
        self.assertFalse((self.profile / "user.js").exists())

    def test_missing_declared_profile_does_not_fall_back(self):
        write(self.firefox_root / "profiles.ini", "[InstallTEST]\nDefault=absent\n")
        result = self.run_install("firefox", success=False)
        self.assertIn("目录不存在", result.stdout)
        self.assertEqual(self.calls(), [])

    def test_directory_name_alone_does_not_select_profile(self):
        (self.firefox_root / "profiles.ini").unlink()
        self.run_install("firefox", success=False)
        self.assertEqual(self.calls(), [])

    def test_malformed_ini_has_actionable_error(self):
        write(self.firefox_root / "profiles.ini", "not an ini file\n")
        result = self.run_install("firefox", success=False)
        self.assertIn("错误", result.stdout)
        self.assertNotIn("Traceback", result.stdout)
        self.assertEqual(self.calls(), [])


if __name__ == "__main__":
    unittest.main()
