"""Exercise launcher/mount behavior without starting apps or mounting remotes."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


REPO = Path(__file__).resolve().parents[1]


class ApplicationTests(unittest.TestCase):
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
