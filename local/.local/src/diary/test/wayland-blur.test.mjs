import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EXT_INTERFACE = 'ext_background_effect_manager_v1';

function message(sender, opcode, payload = Buffer.alloc(0)) {
  const result = Buffer.alloc(8 + payload.length);
  result.writeUInt32LE(sender, 0);
  result.writeUInt32LE(opcode | (result.length << 16), 4);
  payload.copy(result, 8);
  return result;
}

function uint32(...values) {
  const result = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => result.writeUInt32LE(value, index * 4));
  return result;
}

function protocolString(value) {
  const encoded = Buffer.from(`${value}\0`);
  const result = Buffer.alloc(4 + Math.ceil(encoded.length / 4) * 4);
  result.writeUInt32LE(encoded.length, 0);
  encoded.copy(result, 4);
  return result;
}

function registryGlobal(name, interfaceName, version) {
  return message(2, 0, Buffer.concat([
    uint32(name),
    protocolString(interfaceName),
    uint32(version)
  ]));
}

function parseProtocolString(buffer, offset) {
  const length = buffer.readUInt32LE(offset);
  const start = offset + 4;
  const text = buffer.subarray(start, start + Math.max(0, length - 1)).toString();
  return {
    text,
    next: start + Math.ceil(length / 4) * 4
  };
}

test('Wayland bridge inserts ext-background-effect requests before the toplevel commit', {
  skip: process.platform !== 'linux',
  timeout: 8000
}, async (context) => {
  const scanner = spawnSync('wayland-scanner', ['--version'], { stdio: 'ignore' });
  if (scanner.error || scanner.status !== 0) {
    context.skip('wayland-scanner is not installed');
    return;
  }

  const temporary = await mkdtemp(join(ROOT, '.wayland-blur-test-'));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const build = spawnSync('sh', [
    join(ROOT, 'native', 'linux-wayland-blur', 'build.sh'),
    temporary
  ], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const displayName = `wayland-test-${process.pid}`;
  const socketPath = join(temporary, displayName);
  const received = [];
  let pending = Buffer.alloc(0);
  let sentRegistryState = false;
  let managerId = 0;
  let finished;
  const completion = new Promise((resolve, reject) => {
    finished = { resolve, reject };
  });

  const server = net.createServer((socket) => {
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 8) {
        const header = pending.readUInt32LE(4);
        const size = header >>> 16;
        if (size < 8 || size % 4 !== 0) {
          finished.reject(new Error(`invalid Wayland message size ${size}`));
          return;
        }
        if (pending.length < size) break;
        const current = pending.subarray(0, size);
        pending = pending.subarray(size);
        const sender = current.readUInt32LE(0);
        const opcode = header & 0xffff;
        const record = { sender, opcode, payload: current.subarray(8) };

        if (sender === 2 && opcode === 0 && size > 20) {
          const parsed = parseProtocolString(current, 12);
          record.interfaceName = parsed.text;
          record.newId = current.readUInt32LE(parsed.next + 4);
          if (record.interfaceName === EXT_INTERFACE) {
            managerId = record.newId;
            socket.write(message(managerId, 0, uint32(1)));
          }
        }
        received.push(record);

        const sawInitialBindings = received.some((entry) => entry.interfaceName === 'wl_compositor')
          && received.some((entry) => entry.interfaceName === 'xdg_wm_base');
        if (sawInitialBindings && !sentRegistryState) {
          sentRegistryState = true;
          socket.write(Buffer.concat([
            registryGlobal(58, EXT_INTERFACE, 1),
            message(1, 1, uint32(3)),
            message(1, 1, uint32(33)),
            message(1, 1, uint32(34))
          ]));
        }

        if (sender === 50 && opcode === 6) {
          socket.end();
          finished.resolve();
        }
      }
    });
    socket.once('error', finished.reject);
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
  } catch (error) {
    if (error?.code === 'EPERM') {
      context.skip('the sandbox does not permit Unix-domain test sockets');
      return;
    }
    throw error;
  }
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const child = spawn(process.execPath, [
    join(ROOT, 'test-fixtures', 'wayland-blur-client.mjs')
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      LD_PRELOAD: join(temporary, 'libshiguang-wayland-blur.so'),
      WAYLAND_DISPLAY: displayName,
      WAYLAND_TEST_SOCKET: socketPath,
      XDG_SESSION_TYPE: 'wayland'
    },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let childStderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    childStderr += chunk;
  });
  const childExitPromise = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  context.after(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  });

  await completion;
  const childExit = child.exitCode ?? await childExitPromise;
  assert.equal(childExit, 0, childStderr);
  assert.ok(managerId > 0, 'the bridge should bind the advertised manager');

  const commitIndex = received.findIndex((entry) => entry.sender === 50 && entry.opcode === 6);
  const createRegionIndex = received.findIndex((entry) => entry.sender === 4 && entry.opcode === 1);
  const getEffectIndex = received.findIndex((entry) => entry.sender === managerId && entry.opcode === 1);
  assert.ok(createRegionIndex >= 0 && createRegionIndex < commitIndex);
  assert.ok(getEffectIndex >= 0 && getEffectIndex < commitIndex);

  const createRegion = received[createRegionIndex];
  const regionId = createRegion.payload.readUInt32LE(0);
  const effect = received[getEffectIndex];
  const effectId = effect.payload.readUInt32LE(0);
  assert.equal(effect.payload.readUInt32LE(4), 50, 'blur belongs to the diary window surface');
  const beforeCommit = received.slice(0, commitIndex);
  const blur = beforeCommit.find((entry) => entry.sender === effectId && entry.opcode === 1);
  assert.ok(blur, 'the surface must receive a blur request before its commit');
  assert.equal(blur.payload.readUInt32LE(0), regionId);
  const region = beforeCommit.find((entry) => entry.sender === regionId && entry.opcode === 1);
  assert.ok(region, 'the blur region must have a visible area');
  assert.equal(region.payload.readInt32LE(0), 0);
  assert.equal(region.payload.readInt32LE(4), 0);
  assert.ok(region.payload.readInt32LE(8) > 0 && region.payload.readInt32LE(12) > 0);
});
