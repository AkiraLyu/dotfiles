"""Exercise launcher/mount behavior without starting apps or mounting remotes."""

import importlib.util
from importlib.machinery import SourceFileLoader
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch


REPO = Path(__file__).resolve().parents[1]


class ApplicationTests(unittest.TestCase):
    def notify_module(self):
        path = REPO / 'local/.local/bin/mirador-gmail-notify'
        loader = SourceFileLoader('mirador_notify', str(path))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_mirador_fetch_uses_saved_account_and_never_marks_mail_read(self):
        module = self.notify_module()
        with tempfile.TemporaryDirectory() as temp:
            config = Path(temp) / 'config.toml'
            config.write_text('''[accounts.saved]
default = true
folder = "Notifications"
backend.type = "imap"
backend.host = "imap.example.test"
backend.port = 993
backend.encryption.type = "tls"
backend.login = "saved@example.test"
backend.auth.cmd = "wallet-fixture"
''')
            client = Mock()
            client.select.return_value = ('OK', [b'1'])
            mail = (b'From: Sender <sender@example.test>\r\n'
                    b'Subject: $(touch /tmp/do-not-run)\r\n'
                    b'Content-Type: text/plain; charset=utf-8\r\n\r\nPreview body')
            client.uid.return_value = ('OK', [(b'1 (BODY[] {1}', mail), b')'])
            with patch.dict(os.environ, {'MIRADOR_CONFIG': str(config)}, clear=True), \
                    patch.object(module.subprocess, 'run', return_value=Mock(stdout='fixture-password\n')) as password, \
                    patch.object(module.imaplib, 'IMAP4_SSL', return_value=client) as connect:
                sender, subject, preview = module.fetch_message('42')
            connect.assert_called_once_with('imap.example.test', 993, timeout=10)
            client.login.assert_called_once_with('saved@example.test', 'fixture-password')
            client.select.assert_called_once_with('Notifications', readonly=True)
            client.uid.assert_called_once_with('fetch', '42', '(BODY.PEEK[]<0.131072>)')
            client.logout.assert_called_once()
            self.assertEqual(password.call_args.args[0], ['/bin/sh', '-c', 'wallet-fixture'])
            self.assertEqual((sender, subject, preview),
                             ('Sender <sender@example.test>', '$(touch /tmp/do-not-run)', 'Preview body'))

    def test_mirador_hook_accepts_only_a_numeric_uid(self):
        module = self.notify_module()
        with patch.object(module, 'fetch_message', return_value=('Sender', 'Subject', 'Body')) as fetch, \
                patch.object(module, 'show_notification') as notify:
            for args in [[], ['42; echo unsafe'], ['４２'], ['42', 'extra']]:
                with patch.object(module.sys, 'argv', ['notify', *args]):
                    self.assertEqual(module.main(), 2)
            fetch.assert_not_called()
            notify.assert_not_called()
            with patch.object(module.sys, 'argv', ['notify', '42']):
                self.assertEqual(module.main(), 0)
            fetch.assert_called_once_with('42')
            notify.assert_called_once_with('Sender', 'Subject', 'Body')

    def test_mirador_preview_failure_still_notifies_without_exposing_secret(self):
        module = self.notify_module()
        with patch.object(module.sys, 'argv', ['notify', '42']), \
                patch.object(module, 'fetch_message', side_effect=RuntimeError('secret-fixture')), \
                patch.object(module, 'show_notification') as notify:
            self.assertEqual(module.main(), 0)
            self.assertNotIn('secret-fixture', str(notify.call_args))
            notify.assert_called_once_with('', '新邮件（预览暂不可用）', '')

    def test_mirador_has_one_action_and_launches_installed_gmail_pwa(self):
        module = self.notify_module()
        icon = REPO / 'local/.local/share/icons/hicolor/256x256/apps/dotfiles-gmail.png'
        self.assertTrue(icon.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'))
        for action in ('default', 'open', ''):
            with self.subTest(action=action), \
                    patch.object(module.subprocess, 'run', return_value=Mock(stdout=action)) as notify, \
                    patch.object(module.subprocess, 'Popen') as launch:
                module.show_notification('Sender', '<unsafe subject>', 'body & preview')
                args = notify.call_args.args[0]
                self.assertIn(f'--icon={module.GMAIL_ICON}', args)
                self.assertIn(f'--app-icon={module.GMAIL_ICON}', args)
                self.assertEqual([arg for arg in args if arg.startswith('--action=')],
                                 ['--action=default=打开 Gmail'])
                self.assertIn(f'--hint=string:desktop-entry:{module.GMAIL_DESKTOP_ID}', args)
                self.assertIn('&lt;unsafe subject&gt;', args[-1])
                if action == 'default':
                    self.assertEqual(launch.call_args.args[0],
                                     ['gtk-launch', 'chrome-fmgjjmmmlfnkbppncabfkddbjimcfncm-Default'])
                else:
                    launch.assert_not_called()

    def test_encrypted_backup_mount_rejects_a_different_data_disk(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name, script in {
                'mountpoint': '#!/bin/bash\nexit 0\n',
                'findmnt': '#!/bin/bash\nprintf "other-disk-uuid\\n"\n',
                'run0': f'#!/bin/bash\ntouch {shlex.quote(str(root / "unexpected-write"))}\nexit 1\n',
            }.items():
                path = root / name
                path.write_text(script)
                path.chmod(0o755)
            env = {**os.environ, 'PATH': f'{root}:{os.environ["PATH"]}'}
            script = REPO / 'local/.local/scripts/backup/encrypted/mount.sh'
            result = subprocess.run(['/bin/bash', str(script)], env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('数据盘不匹配', result.stderr)
            self.assertFalse((root / 'unexpected-write').exists())

    def test_encrypted_backup_stops_on_mount_or_copy_failure(self):
        original = REPO / 'local/.local/scripts/backup/encrypted/system-backup.sh'
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            target = root / 'backup'
            script = root / 'system-backup.sh'
            script.write_text(original.read_text().replace(
                'BACKUP_DEST="/mnt/backup/BackUp"', f'BACKUP_DEST={shlex.quote(str(target))}').replace(
                '    "/data"\n', f'    {shlex.quote(str(root / "data"))}\n'))
            helper = root / 'mount.sh'
            helper.write_text('#!/bin/bash\nexit 1\n')
            helper.chmod(0o755)
            result = subprocess.run(['/bin/bash', str(script)], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(target.exists())

            helper.write_text('#!/bin/bash\nexit 0\n')
            home = root / 'home'
            (home / 'Desktop').mkdir(parents=True)
            bindir = root / 'bin'
            bindir.mkdir()
            rsync = bindir / 'rsync'
            rsync.write_text('#!/bin/bash\nprintf "copy failed\\n"\nexit 23\n')
            rsync.chmod(0o755)
            env = {**os.environ, 'HOME': str(home), 'PATH': f'{bindir}:{os.environ["PATH"]}'}
            result = subprocess.run(['/bin/bash', str(script)], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 23)
            self.assertIn('copy failed', (target / 'backup.log').read_text())
            self.assertNotIn('备份完成', result.stdout)

            rsync.write_text('#!/bin/bash\nprintf "%s\\n" "${@: -1}"\nexit 0\n')
            for _ in range(2):
                subprocess.run(['/bin/bash', str(script)], env=env, check=True, capture_output=True)
            self.assertEqual({p.name for p in target.iterdir()}, {'backup.log'})
            self.assertIn(str(target) + '/', (target / 'backup.log').read_text())
            self.assertEqual((target / 'backup.log').read_text().count('开始备份'), 1)

    def test_encrypted_backup_copies_data_and_linked_source_contents(self):
        original = REPO / 'local/.local/scripts/backup/encrypted/system-backup.sh'
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            home = root / 'home'
            home.mkdir()
            data = root / 'data'
            data.mkdir()
            (data / 'note.md').write_text('saved document\n')
            external = root / 'external.md'
            external.write_text('external document\n')
            (data / 'reference.md').symlink_to(external)
            (home / 'Desktop').symlink_to(data, target_is_directory=True)
            target = root / 'backup'
            script = root / 'system-backup.sh'
            script.write_text(original.read_text().replace(
                'BACKUP_DEST="/mnt/backup/BackUp"', f'BACKUP_DEST={shlex.quote(str(target))}').replace(
                '    "/data"\n', f'    {shlex.quote(str(data))}\n'))
            helper = root / 'mount.sh'
            helper.write_text('#!/bin/bash\nexit 0\n')
            helper.chmod(0o755)
            subprocess.run(['/bin/bash', str(script)], env={**os.environ, 'HOME': str(home)},
                           check=True, capture_output=True, text=True)
            for name in ('data', 'Desktop'):
                saved = target / name
                self.assertTrue(saved.is_dir())
                self.assertFalse(saved.is_symlink())
                self.assertEqual((saved / 'note.md').read_text(), 'saved document\n')
                self.assertTrue((saved / 'reference.md').is_symlink())
                self.assertEqual((saved / 'reference.md').readlink(), external)

    def test_onedrive_mount_only_never_starts_tray_or_file_manager(self):
        spec = importlib.util.spec_from_file_location("onedrive", REPO / "local/.local/scripts/cloud/rclone/onedrive.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with patch.object(module, "mount_onedrive", return_value=True), \
                patch.object(module, "run_tray") as tray, \
                patch.object(module, "open_mountpoint") as open_folder:
            self.assertEqual(module.main(["--mount-only"]), 0)
            tray.assert_not_called()
            open_folder.assert_not_called()

    def mock_commands(self, root):
        bindir = root / "bin"
        bindir.mkdir()
        script = '''#!/usr/bin/python3
import json,os,pathlib,sys
name=pathlib.Path(sys.argv[0]).name
with open(os.environ['CALL_LOG'],'a') as output:
    output.write(json.dumps([name,sys.argv[1:],os.environ.get('WINEPREFIX')])+"\\n")
sys.exit(int(os.environ.get('MOUNTED','1')) if name=='mountpoint' else int(os.environ.get('FAIL_MKDIR','0')) if name=='mkdir' else int(os.environ.get('FAIL_VKD3D','0')) if name=='setup_vkd3d_proton' else 0)
'''
        for name in ['mkdir','mountpoint','rclone','setup_vkd3d_proton','setup_dxvk']:
            path = bindir / name
            path.write_text(script)
            path.chmod(0o755)
        return {**os.environ, 'PATH': str(bindir), 'CALL_LOG': str(root / 'calls')}

    def test_webdav_remotes_have_separate_targets_and_failure_stops_mount(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            env = self.mock_commands(root)
            log = root / 'calls'
            mounts = []
            for name in ['webdav','webdav-remote']:
                path = REPO / f'local/.local/scripts/cloud/rclone/{name}.sh'
                subprocess.run(['/bin/sh', str(path)], env=env, check=True)
                calls = [json.loads(line) for line in log.read_text().splitlines()]
                mount = next(call[1] for call in calls if call[0] == 'rclone')
                mounts.append((mount[2], mount[mount.index('--cache-dir')+1]))
                log.unlink()
                subprocess.run(['/bin/sh', str(path)], env={**env,'MOUNTED':'0'}, check=True)
                self.assertNotIn('rclone', log.read_text())
                log.unlink()
                result = subprocess.run(['/bin/sh', str(path)], env={**env,'FAIL_MKDIR':'1'})
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('rclone', log.read_text())
                log.unlink()
            self.assertNotEqual(mounts[0][0], mounts[1][0])
            self.assertNotEqual(mounts[0][1], mounts[1][1])

    def test_wine_prefix_override_and_failed_first_install(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            env = self.mock_commands(root)
            env['HOME'] = str(root / 'home with space')
            env.pop('WINEPREFIX', None)
            log = root / 'calls'
            command = ['/bin/bash', str(REPO / 'local/.local/scripts/apps/wine/setup-graphics.sh')]
            for override in [None, str(root / 'another prefix')]:
                selected = env if override is None else {**env,'WINEPREFIX':override}
                subprocess.run(command, env=selected, check=True)
                calls = [json.loads(line) for line in log.read_text().splitlines()]
                self.assertEqual([call[0] for call in calls], ['setup_vkd3d_proton','setup_dxvk'])
                self.assertTrue(all(call[2] == (override or env['HOME'] + '/wine-pfx/default') for call in calls))
                log.unlink()
            result = subprocess.run(command, env={**env, 'FAIL_VKD3D':'1'})
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('setup_dxvk', log.read_text())


if __name__ == '__main__':
    unittest.main()
