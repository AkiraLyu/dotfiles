import { spawn } from 'node:child_process';

const script = {
  linux: 'build:arch',
  win32: 'build:win'
}[process.platform];

if (!script) {
  throw new Error(`当前平台暂不支持桌面打包：${process.platform}`);
}

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(command, ['run', script], {
  shell: process.platform === 'win32',
  stdio: 'inherit'
});

child.once('error', (error) => {
  console.error(`无法启动 ${script}：`, error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    console.error(`${script} 被信号 ${signal} 中止`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
