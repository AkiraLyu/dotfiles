import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZE = 512;
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const pixels = Buffer.alloc(SIZE * SIZE * 4);

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const right = left + width - 1;
  const bottom = top + height - 1;
  const nearestX = Math.max(left + radius, Math.min(x, right - radius));
  const nearestY = Math.max(top + radius, Math.min(y, bottom - radius));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function paint(test, color) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!test(x, y)) continue;
      const offset = (y * SIZE + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3] ?? 255;
    }
  }
}

paint((x, y) => insideRoundedRect(x, y, 16, 16, 480, 480, 122), [101, 85, 143]);
paint((x, y) => insideRoundedRect(x, y, 126, 92, 270, 330, 28), [250, 248, 252]);
paint((x, y) => insideRoundedRect(x, y, 126, 334, 270, 88, 28), [229, 219, 247]);
paint((x, y) => insideRoundedRect(x, y, 155, 360, 241, 62, 24), [250, 248, 252]);
paint((x, y) => insideRoundedRect(x, y, 180, 170, 160, 18, 9), [189, 175, 219]);
paint((x, y) => insideRoundedRect(x, y, 180, 214, 122, 18, 9), [211, 200, 232]);
paint((x, y) => insideRoundedRect(x, y, 180, 258, 146, 18, 9), [211, 200, 232]);

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const target = y * (size * 4 + 1);
    scanlines[target] = 0;
    rgba.copy(scanlines, target + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function resizeNearest(source, sourceSize, targetSize) {
  const target = Buffer.alloc(targetSize * targetSize * 4);
  for (let y = 0; y < targetSize; y += 1) {
    for (let x = 0; x < targetSize; x += 1) {
      const sourceX = Math.floor(x * sourceSize / targetSize);
      const sourceY = Math.floor(y * sourceSize / targetSize);
      const sourceOffset = (sourceY * sourceSize + sourceX) * 4;
      const targetOffset = (y * targetSize + x) * 4;
      source.copy(target, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return target;
}

function createIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0;
  entry[1] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

const png = encodePng(SIZE, pixels);
const windowsPng = encodePng(256, resizeNearest(pixels, SIZE, 256));
const targets = [
  [join(ROOT, 'build', 'icon.png'), png],
  [join(ROOT, 'build', 'icon.ico'), createIco(windowsPng)]
];
await mkdir(dirname(targets[0][0]), { recursive: true });
await Promise.all(targets.map(([target, data]) => writeFile(target, data)));
console.log(`Generated ${targets.map(([target]) => target).join(' and ')}`);
