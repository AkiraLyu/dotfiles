import net from 'node:net';

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

function registryBind(name, interfaceName, version, newId) {
  return message(2, 0, Buffer.concat([
    uint32(name),
    protocolString(interfaceName),
    uint32(version, newId)
  ]));
}

const socket = net.createConnection(process.env.WAYLAND_TEST_SOCKET);
socket.on('data', () => {});
socket.once('connect', () => {
  socket.write(Buffer.concat([
    message(1, 1, uint32(2)),
    registryBind(4, 'wl_compositor', 6, 4),
    registryBind(63, 'xdg_wm_base', 6, 36)
  ]));

  setTimeout(() => {
    socket.write(message(4, 0, uint32(50)));
  }, 120);

  setTimeout(() => {
    socket.write(Buffer.concat([
      message(36, 2, uint32(58, 50)),
      message(58, 1, uint32(59)),
      message(50, 6)
    ]));
  }, 280);
});

const deadline = setTimeout(() => {
  console.error('Wayland blur fixture timed out');
  process.exit(2);
}, 3000);

socket.once('close', () => {
  clearTimeout(deadline);
});

socket.once('error', (error) => {
  clearTimeout(deadline);
  console.error(error);
  process.exitCode = 1;
});
