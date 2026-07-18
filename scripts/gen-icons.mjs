// Generates the PWA/iOS PNG icons with zero dependencies (Node built-ins only).
// A simple original emblem: a little house + pine on a green field.
import zlib from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

// ---- tiny raster canvas ----
class Raster {
  constructor(size) {
    this.s = size;
    this.buf = Buffer.alloc(size * size * 4, 0);
  }
  set(x, y, [r, g, b, a = 255]) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.s || y >= this.s) return;
    const i = (y * this.s + x) * 4;
    // simple alpha over
    const ia = a / 255;
    this.buf[i] = this.buf[i] * (1 - ia) + r * ia;
    this.buf[i + 1] = this.buf[i + 1] * (1 - ia) + g * ia;
    this.buf[i + 2] = this.buf[i + 2] * (1 - ia) + b * ia;
    this.buf[i + 3] = Math.max(this.buf[i + 3], a);
  }
  rect(x, y, w, h, c) {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }
  disc(cx, cy, r, c) {
    for (let yy = cy - r; yy <= cy + r; yy++)
      for (let xx = cx - r; xx <= cx + r; xx++)
        if ((xx - cx) ** 2 + (yy - cy) ** 2 <= r * r) this.set(xx, yy, c);
  }
  // filled triangle (flat-ish), c
  tri(x0, y0, x1, y1, x2, y2, c) {
    const minY = Math.floor(Math.min(y0, y1, y2));
    const maxY = Math.ceil(Math.max(y0, y1, y2));
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      edge(x0, y0, x1, y1, y, xs);
      edge(x1, y1, x2, y2, y, xs);
      edge(x2, y2, x0, y0, y, xs);
      if (xs.length >= 2) {
        xs.sort((a, b) => a - b);
        for (let x = Math.floor(xs[0]); x <= Math.ceil(xs[xs.length - 1]); x++)
          this.set(x, y, c);
      }
    }
  }
}
function edge(ax, ay, bx, by, y, out) {
  if ((ay <= y && by > y) || (by <= y && ay > y)) {
    const t = (y - ay) / (by - ay);
    out.push(ax + (bx - ax) * t);
  }
}

function drawIcon(size, maskable) {
  const r = new Raster(size);
  const pad = maskable ? size * 0.14 : 0; // maskable safe zone
  const S = size - pad * 2;
  const ox = pad;
  const oy = pad;
  const px = (v) => ox + v * S;
  const py = (v) => oy + v * S;

  // sky / field background
  r.rect(0, 0, size, size, [59, 125, 79, 255]); // #3b7d4f
  // rounded darker ground
  r.rect(0, py(0.62) - oy, size, size, [45, 96, 60, 255]);
  // sun
  r.disc(px(0.78), py(0.22), S * 0.09, [246, 224, 140, 255]);

  // pine tree (left)
  const tx = px(0.3);
  r.rect(tx - S * 0.02, py(0.5), S * 0.04, S * 0.16, [92, 64, 40, 255]); // trunk
  r.tri(tx, py(0.24), tx - S * 0.13, py(0.44), tx + S * 0.13, py(0.44), [39, 77, 36, 255]);
  r.tri(tx, py(0.34), tx - S * 0.15, py(0.56), tx + S * 0.15, py(0.56), [45, 90, 43, 255]);

  // house (right)
  const hx = px(0.58);
  const hy = py(0.44);
  const hw = S * 0.3;
  const hh = S * 0.24;
  r.rect(hx, hy, hw, hh, [206, 168, 108, 255]); // wall
  r.tri(hx - hw * 0.12, hy, hx + hw + hw * 0.12, hy, hx + hw / 2, hy - hh * 0.62, [138, 74, 43, 255]); // roof
  r.rect(hx + hw * 0.38, hy + hh * 0.4, hw * 0.24, hh * 0.6, [92, 58, 34, 255]); // door

  return r;
}

function encodePng(raster) {
  const size = raster.s;
  const bytesPerRow = size * 4;
  const raw = Buffer.alloc((bytesPerRow + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (bytesPerRow + 1)] = 0; // filter: none
    raster.buf.copy(raw, y * (bytesPerRow + 1) + 1, y * bytesPerRow, (y + 1) * bytesPerRow);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-512-maskable.png', 512, true],
  ['apple-touch-icon.png', 180, false],
  ['favicon-64.png', 64, false],
];
for (const [name, size, maskable] of targets) {
  const png = encodePng(drawIcon(size, maskable));
  writeFileSync(join(OUT, name), png);
  console.log('wrote', name, `(${png.length} bytes)`);
}
