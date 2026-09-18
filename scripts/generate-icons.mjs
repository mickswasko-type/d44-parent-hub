#!/usr/bin/env node
/**
 * Generates the PWA home-screen icons from scratch — no binary assets checked
 * in that nobody can regenerate, and no image dependency.
 *
 * The mark is deliberately generic (a calendar glyph, not a district crest):
 * this site must never be mistaken for an official D44 app.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const BG = [164, 22, 26];      // --accent
const FG = [255, 255, 255];

const crc32 = (buf) => {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size);
      raw[o++] = r; raw[o++] = g; raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The calendar glyph. `bleed` fills the whole canvas instead of drawing a
 * rounded square on a light backdrop.
 *
 * Android masks a "maskable" icon to whatever shape the launcher uses, and iOS
 * rounds the home-screen icon itself. Either will slice the corners off — and
 * with a light backdrop behind the rounded square, those corners show up as
 * pale wedges around the icon. Full bleed avoids that; the glyph stays inside
 * the centre 80% safe zone so masking never clips it.
 */
function glyph(x, y, size, bleed) {
  const u = x / size;
  const v = y / size;
  if (!bleed) {
    const r = 0.18;
    const cx = Math.min(Math.max(u, r), 1 - r);
    const cy = Math.min(Math.max(v, r), 1 - r);
    if (Math.hypot(u - cx, v - cy) > r) return [245, 244, 243];
  }

  const inBody = u > 0.24 && u < 0.76 && v > 0.3 && v < 0.74;
  const inHeader = inBody && v < 0.42;
  const inTab = v > 0.24 && v < 0.32 && ((u > 0.34 && u < 0.4) || (u > 0.6 && u < 0.66));
  if (inTab) return FG;
  if (inHeader) return FG;
  if (inBody) {
    const col = Math.floor((u - 0.26) / 0.166);
    const row = Math.floor((v - 0.46) / 0.11);
    const dotU = (u - 0.26) / 0.166 - col;
    const dotV = (v - 0.46) / 0.11 - row;
    const isDot = dotU > 0.12 && dotU < 0.62 && dotV > 0.15 && dotV < 0.7 && row < 2 && col < 3;
    return isDot ? FG : BG;
  }
  return BG;
}

const rounded = (x, y, size) => glyph(x, y, size, false);
const fullBleed = (x, y, size) => glyph(x, y, size, true);

const OUT = path.resolve(import.meta.dirname, '../public');

// Browser tab / "any" purpose: the rounded square reads as an icon on its own.
for (const size of [192, 512]) {
  writeFileSync(path.join(OUT, `icon-${size}.png`), png(size, rounded));
  console.log(`[icons] wrote public/icon-${size}.png`);
}

// iOS home screen and Android maskable: full bleed, shaped by the OS.
writeFileSync(path.join(OUT, 'icon-180.png'), png(180, fullBleed));
console.log('[icons] wrote public/icon-180.png (full bleed, iOS)');
writeFileSync(path.join(OUT, 'icon-maskable-512.png'), png(512, fullBleed));
console.log('[icons] wrote public/icon-maskable-512.png (full bleed, Android)');

writeFileSync(
  path.join(OUT, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Calendar">
  <rect width="64" height="64" rx="14" fill="#a4161a"/>
  <g fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round">
    <rect x="15" y="18" width="34" height="30" rx="4"/>
    <path d="M15 27h34M23 14v6M41 14v6"/>
  </g>
  <g fill="#fff"><circle cx="24" cy="35" r="2.3"/><circle cx="32" cy="35" r="2.3"/><circle cx="40" cy="35" r="2.3"/><circle cx="24" cy="42" r="2.3"/><circle cx="32" cy="42" r="2.3"/></g>
</svg>\n`,
);
console.log('[icons] wrote public/icon.svg');
