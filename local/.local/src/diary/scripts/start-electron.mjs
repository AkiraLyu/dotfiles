import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const environment = { ...process.env };
const isWayland = process.platform === 'linux'
  && environment.XDG_SESSION_TYPE === 'wayland'
  && Boolean(environment.WAYLAND_DISPLAY);

if (isWayland && environment.SHIGUANG_DISABLE_WAYLAND_BLUR !== '1') {
  const nativeOutput = join(projectRoot, 'build', 'native', 'linux-wayland-blur');
  const nativeLibrary = join(nativeOutput, 'libshiguang-wayland-blur.so');
  const build = spawnSync('sh', [
    join(projectRoot, 'native', 'linux-wayland-blur', 'build.sh'),
    nativeOutput
  ], {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  if (build.error) throw build.error;
  if (build.status !== 0) process.exit(build.status ?? 1);
  environment.LD_PRELOAD = environment.LD_PRELOAD
    ? `${nativeLibrary}:${environment.LD_PRELOAD}`
    : nativeLibrary;
}

const localElectron = join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron'
);
const electron = existsSync(localElectron)
  ? localElectron
  : process.platform === 'linux' && existsSync('/usr/bin/electron')
    ? '/usr/bin/electron'
    : process.platform === 'win32'
      ? 'electron.cmd'
      : 'electron';

const child = spawn(electron, ['.', ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: environment,
  shell: process.platform === 'win32',
  stdio: 'inherit'
});

child.once('error', (error) => {
  console.error('无法启动 Electron：', error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
