"""Boot/install safety contracts: no real block-device or service writes."""

from contextlib import redirect_stdout
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / 'scripts'))
import arch_install as arch
spec = importlib.util.spec_from_file_location('user_targets', REPO / 'scripts/user-targets.py')
user_targets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(user_targets)


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='arch-install-contract-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.target = self.root / 'target'
        self.target.mkdir()
        self.ctx = arch.Installation(REPO, Path('/dev/testdisk'), Path('/dev/testdisk1'),
                                     Path('/dev/testdisk2'), Path('/dev/testdisk3'), self.target)
        self.stdout = io.StringIO()
        self.redirect = redirect_stdout(self.stdout)
        self.redirect.__enter__()
        self.addCleanup(self.redirect.__exit__, None, None, None)
        self.root_uuid = '11111111-2222-3333-4444-555555555555'
        self.swap_uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
        firmware_input = patch('arch_install.firmware.payload', return_value=b'fixture AVS firmware')
        firmware_input.start()
        self.addCleanup(firmware_input.stop)

    def test_destructive_mode_requires_explicit_erase_before_any_commands(self):
        with patch.object(sys, 'argv', ['arch_install.py', 'arch-install', '--disk', '/dev/testdisk', '--apply']), \
                patch('arch_install.preflight') as check, patch('arch_install.install_system') as install:
            with self.assertRaises(SystemExit):
                arch.main()
            check.assert_not_called()
            install.assert_not_called()

    def test_live_root_device_is_rejected(self):
        def read(*args):
            if args[:4] == ('lsblk', '-dn', '-o', 'TYPE'):
                return 'disk' if args[-1] == self.ctx.disk else 'part'
            if 'PKNAME' in args:
                return 'testdisk'
            return '/' if args[-1] == self.ctx.root else ''
        with patch('arch_install.shutil.which', return_value='/fixture'), \
                patch.object(Path, 'is_block_device', return_value=True), patch('arch_install.read', side_effect=read):
            with self.assertRaisesRegex(ValueError, '正在使用'):
                arch.preflight(self.ctx, 'arch-install')

    def test_partition_from_another_disk_is_rejected(self):
        with patch('arch_install.shutil.which', return_value='/fixture'), \
                patch.object(Path, 'is_block_device', return_value=True), \
                patch('arch_install.read', side_effect=['disk', 'part', 'anotherdisk']):
            with self.assertRaisesRegex(ValueError, '不属于'):
                arch.preflight(self.ctx, 'arch-install')

    def test_missing_base_packages_stops_before_disk_writes(self):
        def read(*args):
            if args[:4] == ('lsblk', '-dn', '-o', 'TYPE'):
                return 'disk' if args[-1] == self.ctx.disk else 'part'
            return 'testdisk' if 'PKNAME' in args else ''
        exists = Path.exists
        with patch('arch_install.shutil.which', return_value='/fixture'), \
                patch.object(Path, 'is_block_device', return_value=True), \
                patch.object(Path, 'exists', lambda p: False if p.parent == Path('/dev/mapper') else exists(p)), \
                patch('arch_install.mounted', return_value=''), \
                patch('arch_install.read', side_effect=read), \
                patch('arch_install.subprocess.run', return_value=subprocess.CompletedProcess([], 1)) as execute:
            with self.assertRaisesRegex(ValueError, 'CachyOS.*未写入磁盘'):
                arch.preflight(self.ctx, 'arch-install')
        self.assertEqual(execute.call_count, 1)
        self.assertEqual(execute.call_args.args[0], ['pacman', '-Si', *arch.BASE_PACKAGES])
        self.assertEqual(list(self.target.iterdir()), [])

    def test_install_plan_uses_efi_and_three_selected_partitions_only(self):
        with patch('arch_install.mounted', return_value=''), patch('arch_install.subprocess.run') as execute:
            arch.install_system(self.ctx)
            execute.assert_not_called()
        output = self.stdout.getvalue()
        self.assertIn(f'mount -o fmask=0022,dmask=0022 /dev/testdisk1 {self.target}/efi', output)
        self.assertNotIn(str(self.target) + '/boot', output)
        self.assertNotIn('nvme0n1', output)
        self.assertEqual(list(self.target.iterdir()), [])

    def test_existing_wrong_mount_is_rejected_before_new_mounts(self):
        with patch('arch_install.mounted', return_value='/dev/other btrfs /@'), \
                patch.object(self.ctx, 'run') as run:
            with self.assertRaisesRegex(ValueError, '其他挂载'):
                arch.mount_system(self.ctx)
            run.assert_not_called()

    def test_boot_inputs_use_new_uuids_and_preserve_template_edid(self):
        self.ctx.apply = True
        arch.render_boot(self.ctx, self.root_uuid, self.swap_uuid)
        cmdline = (self.target / 'etc/cmdline.d/root.conf').read_text()
        self.assertIn(self.root_uuid, cmdline)
        self.assertIn(self.swap_uuid, cmdline)
        self.assertNotIn('06c08067', cmdline)
        active = '\n'.join(line for line in cmdline.splitlines() if not line.lstrip().startswith('#'))
        for option in ('quiet', 'splash', 'vt.global_cursor_default=0'):
            self.assertIn(option, active.split())
        template_edid = [line for line in (REPO / 'etc/cmdline.d/root.conf').read_text().splitlines() if 'edid' in line]
        self.assertEqual([line for line in cmdline.splitlines() if 'edid' in line], template_edid)
        self.assertIn('dsp_driver=4', (self.target / 'etc/modprobe.d/sound.conf').read_text())
        self.assertEqual((self.target / 'etc/initcpio/install/block').stat().st_mode & 0o777, 0o755)
        self.assertNotIn('luks,swap', (self.target / 'etc/crypttab').read_text())
        before = (self.target / 'etc/cmdline.d/root.conf').read_bytes()
        arch.render_boot(self.ctx, self.root_uuid, self.swap_uuid)
        self.assertEqual(before, (self.target / 'etc/cmdline.d/root.conf').read_bytes())

    def test_saved_boot_settings_keep_plymouth_without_a_uki_bitmap(self):
        self.ctx.apply = True
        dropin = self.target / 'etc/mkinitcpio.conf.d/90-dotfiles.conf'
        dropin.parent.mkdir(parents=True)
        dropin.write_text('HOOKS=(base systemd sd-encrypt)\n')
        arch.render_boot(self.ctx, self.root_uuid, self.swap_uuid)
        config = self.target / 'etc/mkinitcpio.conf'
        self.assertEqual(config.read_bytes(), (REPO / 'etc/mkinitcpio.conf').read_bytes())
        result = subprocess.run(['bash', '-c',
                                 'source "$1"; source "$2"; printf "%s\\n" "${HOOKS[*]}" "${FILES[*]}"',
                                 'fixture', str(config), str(dropin)],
                                text=True, capture_output=True, check=True)
        hooks, files = (line.split() for line in result.stdout.splitlines())
        self.assertLess(hooks.index('plymouth'), hooks.index('sd-encrypt'))
        self.assertIn('/etc/luks.key', files)
        self.assertIn('/' + arch.firmware.RELATIVE, files)
        self.assertIn('plymouth', arch.BASE_PACKAGES)
        for kernel in arch.KERNELS:
            relative = f'etc/mkinitcpio.d/{kernel}.preset'
            preset = self.target / relative
            self.assertEqual(preset.read_bytes(), (REPO / relative).read_bytes())
            result = subprocess.run(['bash', '-c',
                                     'source "$1"; printf "%s\\n" "$ALL_kver" "${PRESETS[*]}" '
                                     '"$default_uki" "${default_options-}" "${ALL_splash-}" "${default_splash-}"',
                                     'fixture', str(preset)], text=True, capture_output=True, check=True)
            kver, presets, uki, options, all_splash, default_splash = result.stdout.splitlines()
            self.assertEqual(kver, f'/boot/vmlinuz-{kernel}')
            self.assertEqual(presets, 'default')
            self.assertEqual(uki, f'/efi/EFI/Linux/arch-{kernel}.efi')
            self.assertNotIn('--splash', options)
            self.assertEqual((all_splash, default_splash), ('', ''))

    def test_post_install_writes_inputs_before_uki_and_keeps_existing_key(self):
        self.ctx.apply = True
        (self.target / 'etc').mkdir()
        (self.target / 'etc/locale.gen').write_text('#en_US.UTF-8 UTF-8\n#zh_CN.UTF-8 UTF-8\n')
        key = self.target / 'etc/luks.key'
        key.write_bytes(b'existing-key')
        calls = []
        def run(args, **kwargs):
            args = list(map(str, args))
            calls.append(args)
            if 'mkinitcpio' in args:
                self.assertIn(self.root_uuid, (self.target / 'etc/cmdline.d/root.conf').read_text())
                for relative in ('etc/crypttab', 'etc/initcpio/install/block', 'etc/mkinitcpio.conf',
                                 'etc/mkinitcpio.conf.d/90-dotfiles.conf'):
                    self.assertTrue((self.target / relative).is_file())
                self.assertEqual((self.target / arch.firmware.RELATIVE).read_bytes(), b'fixture AVS firmware')
                for kernel in ('linux', 'linux-cachyos'):
                    uki = self.target / f'efi/EFI/Linux/arch-{kernel}.efi'
                    uki.parent.mkdir(parents=True, exist_ok=True)
                    uki.write_bytes(b'fixture UKI')
            return subprocess.CompletedProcess(args, 0)
        with patch('arch_install.read', side_effect=[self.root_uuid, self.swap_uuid]), \
                patch('arch_install.subprocess.run', side_effect=run):
            arch.configure_system(self.ctx)
        self.assertEqual(key.read_bytes(), b'existing-key')
        self.assertFalse(any('luksAddKey' in c for c in calls))
        self.assertLess(calls.index(['arch-chroot', str(self.target), 'pacman', '-S', '--needed', 'plymouth']),
                        next(i for i,c in enumerate(calls) if 'mkinitcpio' in c))
        self.assertLess(next(i for i,c in enumerate(calls) if 'mkinitcpio' in c),
                        next(i for i,c in enumerate(calls) if 'bootctl' in c))
        self.assertFalse(any('systemctl' in c for c in calls))
        self.assertTrue(any('/usr/share/zoneinfo/Asia/Tokyo' in c for c in calls))
        self.assertEqual((self.target / 'etc/locale.conf').read_text(), 'LANG=zh_CN.UTF-8\n')
        self.assertEqual((self.target / 'efi/loader/loader.conf').read_text(),
                         'timeout 5\nconsole-mode keep\ndefault @saved\n')
        self.assertTrue(any('usermod' in c and '/usr/bin/fish' in c
                            and 'libvirt,video,render,kvm,input,audio,wheel' in c for c in calls))
        self.assertEqual((self.target / 'etc/security/limits.conf').read_bytes(),
                         (REPO / 'etc/security/limits.conf').read_bytes())
        self.assertEqual((self.target / 'etc/hosts').read_bytes(), (REPO / 'etc/hosts').read_bytes())

    def test_symlink_boot_config_is_not_overwritten(self):
        self.ctx.apply = True
        destination = self.target / 'etc/cmdline.d/root.conf'
        destination.parent.mkdir(parents=True)
        source = self.root / 'keep'
        source.write_text('keep')
        destination.symlink_to(source)
        with self.assertRaisesRegex(ValueError, '符号链接'):
            arch.render_boot(self.ctx, self.root_uuid, self.swap_uuid)
        self.assertEqual(source.read_text(), 'keep')

    def test_block_filter_preserves_other_modules_global_state_and_original_helper(self):
        upstream = self.root / 'block-upstream'
        upstream.write_text("build() { add_checked_modules '/drivers/mfd/'; add_checked_modules -f skip '/drivers/new/'; }\nhelp() { :; }\n")
        override = self.root / 'block'
        override.write_text((REPO / 'etc/initcpio/install/block').read_text().replace(
            'source /usr/lib/initcpio/install/block', 'source ' + str(upstream)))
        script = '''calls=()
add_checked_modules() { calls+=("$*"); }
source "$1"
build
printf '%s\\n' "${calls[@]}"
add_checked_modules /drivers/mfd/
printf 'restored:%s\\n' "${calls[-1]}"
'''
        result = subprocess.run(['bash', '-c', script, 'fixture', str(override)], text=True, capture_output=True, check=True)
        self.assertEqual(result.stdout.splitlines(), ['-f skip /drivers/new/', 'restored:/drivers/mfd/'])

    def user_fixture(self):
        repo = self.root / 'repo'
        source = repo / 'systemd/.config/systemd/user/personal.target'
        source.parent.mkdir(parents=True)
        source.write_text('[Unit]\nDescription=fixture\n')
        return repo, source, self.target / '.config/systemd/user/personal.target'

    def test_user_target_owned_absolute_links_are_portable_and_plan_is_read_only(self):
        repo, source, destination = self.user_fixture()
        destination.parent.mkdir(parents=True)
        destination.symlink_to(source)
        _, links = user_targets.plan(repo, self.target)
        self.assertEqual(len(links), 1)
        self.assertFalse(Path(links[0][1]).is_absolute())
        self.assertEqual(destination.readlink(), source)
        self.assertEqual((destination.parent / links[0][1]).resolve(), source)

    def test_user_target_unrelated_file_or_link_blocks_plan(self):
        repo, source, destination = self.user_fixture()
        destination.parent.mkdir(parents=True)
        destination.write_text('keep')
        with self.assertRaisesRegex(ValueError, '未覆盖'):
            user_targets.plan(repo, self.target)
        self.assertEqual(destination.read_text(), 'keep')
        destination.unlink()
        destination.symlink_to(self.root / 'other')
        with self.assertRaisesRegex(ValueError, '不同来源'):
            user_targets.plan(repo, self.target)


if __name__ == '__main__':
    unittest.main()
