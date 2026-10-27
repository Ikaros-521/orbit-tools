/* Generates build/icon.png (512x512) with zero dependencies — a hand-rolled
   PNG encoder (zlib deflate + CRC32) plus analytic shape rasterising, so the
   repo never needs a native image toolkit to reproduce its icon. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 512, H = 512;

/* --- PNG encoding --------------------------------------------------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const encodePNG = (w, h, rgba) => {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/* --- tiny raster helpers ---------------------------------------------------- */
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
// Coverage of a stroke whose signed pixel-distance to the edge is d (positive = inside).
const cover = d => clamp01(d + 0.5);
const mix = (a, b, t) => a + (b - a) * t;

const px = new Float64Array(W * H * 4);

function blend(x, y, color, cov) {
  if (cov <= 0) return;
  const i = (y * W + x) * 4;
  const sa = cov, da = px[i + 3];
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  px[i] = (color[0] * sa + px[i] * da * (1 - sa)) / oa;
  px[i + 1] = (color[1] * sa + px[i + 1] * da * (1 - sa)) / oa;
  px[i + 2] = (color[2] * sa + px[i + 2] * da * (1 - sa)) / oa;
  px[i + 3] = oa;
}

const AMBER = [1.0, 0.67, 0.18];
const GREEN = [0.37, 0.89, 0.63];

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;

    // Rounded-square badge with a soft vertical gradient.
    const r = 104, cx = Math.min(Math.max(x, r), W - 1 - r), cy = Math.min(Math.max(y, r), H - 1 - r);
    const dBadge = r - Math.hypot(x - cx, y - cy);
    const covB = cover(dBadge);
    if (covB > 0) {
      const g = y / H;
      const col = [mix(0.075, 0.035, g), mix(0.10, 0.05, g), mix(0.115, 0.06, g)];
      blend(x, y, col, covB);
    }

    // Orbit ring: an ellipse rotated -26°, stroked ~11px, anti-aliased analytically.
    const ox = x - 256, oy = y - 268;
    const th = (-26 * Math.PI) / 180, ct = Math.cos(th), st = Math.sin(th);
    const rx = (ox * ct + oy * st), ry = (-ox * st + oy * ct);
    const ex = rx / 158, ey = ry / 94;
    const e = Math.hypot(ex, ey) || 1e-6;
    const grad = Math.hypot(rx / (158 * 158), ry / (94 * 94)) || 1e-6; // |∇e| ≈ pixel scale
    const dRing = 5.5 - (Math.abs(e - 1) / grad);
    // The ring fades slightly where it passes "behind" the planet (top-right).
    const ang = Math.atan2(ey, ex);
    const behind = smooth(0.5 + 0.5 * Math.cos(ang - 2.62));
    const ringCov = cover(dRing) * mix(1, 0.38, behind);
    if (ringCov > 0) blend(x, y, AMBER, ringCov * 0.95);

    // Planet sitting on the ring's near side (upper-right), green with a glow.
    const pdx = x - 337, pdy = y - 218;
    const pd = Math.hypot(pdx, pdy);
    if (pd < 92) {
      const glow = smooth(1 - pd / 92) * 0.30;
      blend(x, y, GREEN, glow);
      blend(x, y, GREEN, cover(37 - pd));
      // inner highlight
      const hdx = x - 325, hdy = y - 206;
      const hd = Math.hypot(hdx, hdy);
      if (hd < 20) blend(x, y, [0.92, 1.0, 0.94], smooth(1 - hd / 20) * 0.5);
    }

    // Small amber moon at the opposite end of the orbit.
    const mdx = x - 172, mdy = y - 316;
    if (Math.hypot(mdx, mdy) < 20) blend(x, y, AMBER, cover(13 - Math.hypot(mdx, mdy)));
  }
}

const out = Buffer.alloc(W * H * 4);
for (let p = 0; p < W * H; p++) {
  out[p * 4] = Math.round(px[p * 4] * 255);
  out[p * 4 + 1] = Math.round(px[p * 4 + 1] * 255);
  out[p * 4 + 2] = Math.round(px[p * 4 + 2] * 255);
  out[p * 4 + 3] = Math.round(px[p * 4 + 3] * 255);
}

fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
const dest = path.join(__dirname, '..', 'build', 'icon.png');
fs.writeFileSync(dest, encodePNG(W, H, out));
console.log('icon →', dest, `${(fs.statSync(dest).size / 1024).toFixed(1)} KiB`);
