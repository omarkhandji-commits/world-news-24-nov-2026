// world-news-20261124 — one front page for Tuesday 24 November 2026: thirty-three
// dispatches from six inhabited continents, a world map with a numbered pin for
// each, three lead stories with drawn pictures, and the rest in a dense list.
//
// Everything is drawn here with arithmetic: a small stroke alphabet, flat shapes,
// a coarse land table for the map and a hand-written PNG encoder. No fonts, no
// images, no network, and no randomness, so two runs write the same bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const W = 1024;
const H = 1024;
const SS = 2; // supersampling factor

type RGB = readonly [number, number, number];

const PAPER: RGB = [239, 230, 211];
const INK: RGB = [16, 19, 25];
const RED: RGB = [212, 56, 26];
const MUTED: RGB = [104, 96, 80];
const LINE: RGB = [198, 187, 165];

const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

// ---------------------------------------------------------------------------
// Canvas: flat fills, supersampled once at the end so every edge is clean.
// ---------------------------------------------------------------------------

class Canvas {
  readonly w: number;
  readonly h: number;
  readonly buf: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.buf = new Uint8Array(w * h * 3);
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.round(x * SS));
    const y0 = Math.max(0, Math.round(y * SS));
    const x1 = Math.min(this.w, Math.round((x + w) * SS));
    const y1 = Math.min(this.h, Math.round((y + h) * SS));
    for (let py = y0; py < y1; py++) {
      let i = (py * this.w + x0) * 3;
      for (let px = x0; px < x1; px++) {
        this.buf[i++] = c[0];
        this.buf[i++] = c[1];
        this.buf[i++] = c[2];
      }
    }
  }

  poly(pts: readonly (readonly [number, number])[], c: RGB): void {
    const n = pts.length;
    if (n < 3) return;
    const xs: number[] = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    const y0 = Math.max(0, Math.floor(minY * SS));
    const y1 = Math.min(this.h - 1, Math.ceil(maxY * SS));
    for (let py = y0; py <= y1; py++) {
      const sy = (py + 0.5) / SS;
      xs.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const a = pts[j];
        const b = pts[i];
        if (a[1] === b[1]) continue;
        if (sy >= Math.min(a[1], b[1]) && sy < Math.max(a[1], b[1])) {
          xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      if (!xs.length) continue;
      xs.sort((m, k) => m - k);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.round(xs[k] * SS));
        const xb = Math.min(this.w, Math.round(xs[k + 1] * SS));
        let idx = (py * this.w + xa) * 3;
        for (let px = xa; px < xb; px++) {
          this.buf[idx++] = c[0];
          this.buf[idx++] = c[1];
          this.buf[idx++] = c[2];
        }
      }
    }
  }

  disc(cx: number, cy: number, r: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor((cx - r) * SS));
    const x1 = Math.min(this.w - 1, Math.ceil((cx + r) * SS));
    const y0 = Math.max(0, Math.floor((cy - r) * SS));
    const y1 = Math.min(this.h - 1, Math.ceil((cy + r) * SS));
    const rr = r * r * SS * SS;
    for (let py = y0; py <= y1; py++) {
      const dy = py + 0.5 - cy * SS;
      for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - cx * SS;
        if (dx * dx + dy * dy <= rr) {
          const i = (py * this.w + px) * 3;
          this.buf[i] = c[0];
          this.buf[i + 1] = c[1];
          this.buf[i + 2] = c[2];
        }
      }
    }
  }

  annulus(cx: number, cy: number, r: number, t: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor((cx - r) * SS));
    const x1 = Math.min(this.w - 1, Math.ceil((cx + r) * SS));
    const y0 = Math.max(0, Math.floor((cy - r) * SS));
    const y1 = Math.min(this.h - 1, Math.ceil((cy + r) * SS));
    const ro = r * r * SS * SS;
    const ri = Math.max(0, r - t) * Math.max(0, r - t) * SS * SS;
    for (let py = y0; py <= y1; py++) {
      const dy = py + 0.5 - cy * SS;
      for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - cx * SS;
        const d = dx * dx + dy * dy;
        if (d <= ro && d >= ri) {
          const i = (py * this.w + px) * 3;
          this.buf[i] = c[0];
          this.buf[i + 1] = c[1];
          this.buf[i + 2] = c[2];
        }
      }
    }
  }

  stroke(pts: readonly (readonly [number, number])[], width: number, c: RGB): void {
    const r = width / 2;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len === 0) {
        this.disc(x1, y1, r, c);
        continue;
      }
      const nx = (-dy / len) * r;
      const ny = (dx / len) * r;
      this.poly(
        [
          [x1 + nx, y1 + ny],
          [x2 + nx, y2 + ny],
          [x2 - nx, y2 - ny],
          [x1 - nx, y1 - ny],
        ],
        c,
      );
      this.disc(x1, y1, r, c);
      this.disc(x2, y2, r, c);
    }
  }

  resolve(): Uint8Array {
    const ow = this.w / SS;
    const oh = this.h / SS;
    const out = new Uint8Array(ow * oh * 3);
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const i = ((y * SS + sy) * this.w + (x * SS + sx)) * 3;
            r += this.buf[i];
            g += this.buf[i + 1];
            b += this.buf[i + 2];
          }
        }
        const n = SS * SS;
        const o = (y * ow + x) * 3;
        out[o] = Math.round(r / n);
        out[o + 1] = Math.round(g / n);
        out[o + 2] = Math.round(b / n);
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// A monoline stroke alphabet on a 4 x 6 grid: technical lettering as geometry,
// so the program never needs a font file.
// ---------------------------------------------------------------------------

type Poly = readonly (readonly [number, number])[];

const GLYPHS: Record<string, readonly Poly[]> = {
  A: [
    [[0, 6], [0, 1.7], [2, 0], [4, 1.7], [4, 6]],
    [[0.3, 3.7], [3.7, 3.7]],
  ],
  B: [
    [[0, 0], [0, 6]],
    [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]],
    [[0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6]],
  ],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  D: [
    [[0, 0], [0, 6]],
    [[0, 0], [3, 0], [4, 1], [4, 5], [3, 6], [0, 6]],
  ],
  E: [
    [[4, 0], [0, 0], [0, 6], [4, 6]],
    [[0, 3], [3, 3]],
  ],
  F: [
    [[4, 0], [0, 0], [0, 6]],
    [[0, 3], [3, 3]],
  ],
  G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.1], [2.1, 3.1]]],
  H: [
    [[0, 0], [0, 6]],
    [[4, 0], [4, 6]],
    [[0, 3], [4, 3]],
  ],
  I: [
    [[0.6, 0], [1.9, 0]],
    [[1.25, 0], [1.25, 6]],
    [[0.6, 6], [1.9, 6]],
  ],
  J: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]],
  K: [
    [[0, 0], [0, 6]],
    [[4, 0], [0, 3.5]],
    [[1.3, 2.7], [4, 6]],
  ],
  L: [[[0, 0], [0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3.4], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  P: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2.3], [3, 3.3], [0, 3.3]]],
  Q: [
    [[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]],
    [[2.6, 4.4], [4.2, 6.2]],
  ],
  R: [
    [[0, 6], [0, 0], [3, 0], [4, 1], [4, 2.3], [3, 3.3], [0, 3.3]],
    [[2, 3.3], [4, 6]],
  ],
  S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2.2], [1, 3.1], [3, 3.1], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  T: [
    [[0, 0], [4, 0]],
    [[2, 0], [2, 6]],
  ],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [0.9, 6], [2, 2.4], [3.1, 6], [4, 0]]],
  X: [
    [[0, 0], [4, 6]],
    [[4, 0], [0, 6]],
  ],
  Y: [
    [[0, 0], [2, 3.2], [4, 0]],
    [[2, 3.2], [2, 6]],
  ],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  '&': [
    [[3.7, 1.1], [3.1, 0], [1.5, 0], [0.8, 0.6], [0.8, 1.5], [1.6, 2.4], [3.8, 4.9], [3.1, 6], [1.4, 6], [0.7, 5.2], [0.8, 4.5], [3.6, 1.9]],
  ],
  '0': [
    [[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]],
    [[0.8, 4.9], [3.2, 1.1]],
  ],
  '1': [
    [[0.6, 1.2], [2, 0], [2, 6]],
    [[0.6, 6], [3.4, 6]],
  ],
  '2': [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2.2], [0, 6], [4, 6]]],
  '3': [[[0, 0], [4, 0], [2.1, 2.7], [3, 2.7], [4, 3.7], [4, 5], [3, 6], [1, 6], [0, 5]]],
  '4': [[[3, 6], [3, 0], [0, 4.3], [4, 4.3]]],
  '5': [[[4, 0], [0, 0], [0, 2.7], [3, 2.7], [4, 3.7], [4, 5], [3, 6], [1, 6], [0, 5]]],
  '6': [[[3.6, 0], [1, 0], [0, 1.6], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.7], [3, 2.7], [1, 2.7], [0, 3.7]]],
  '7': [[[0, 0], [4, 0], [1.3, 6]]],
  '8': [
    [[1, 0], [3, 0], [4, 0.9], [4, 2.1], [3, 3], [1, 3], [0, 2.1], [0, 0.9], [1, 0]],
    [[1, 3], [3, 3], [4, 4], [4, 5.1], [3, 6], [1, 6], [0, 5.1], [0, 4], [1, 3]],
  ],
  '9': [[[4, 2.3], [3, 3.3], [1, 3.3], [0, 2.3], [0, 1], [1, 0], [3, 0], [4, 1], [4, 4.4], [3, 6], [1, 6], [0.4, 5.6]]],
  '.': [[[1.7, 5.1], [2.3, 5.1], [2.3, 6], [1.7, 6], [1.7, 5.1]]],
  ',': [[[2.2, 4.9], [1.5, 6.6]]],
  ':': [
    [[1.7, 1.8], [2.3, 1.8], [2.3, 2.5], [1.7, 2.5], [1.7, 1.8]],
    [[1.7, 4.7], [2.3, 4.7], [2.3, 5.4], [1.7, 5.4], [1.7, 4.7]],
  ],
  '-': [[[0.6, 3.3], [3.4, 3.3]]],
  '/': [[[0, 6.3], [4, -0.3]]],
  "'": [[[1.9, -0.4], [1.9, 1.3]]],
  '(': [[[2.7, -0.4], [1.7, 1.2], [1.7, 4.8], [2.7, 6.4]]],
  ')': [[[1.3, -0.4], [2.3, 1.2], [2.3, 4.8], [1.3, 6.4]]],
  '!': [
    [[2, 0], [2, 4.2]],
    [[2, 5.2], [2, 6]],
  ],
  '?': [
    [[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [2, 3.3], [2, 4.3]],
    [[2, 5.3], [2, 6]],
  ],
  '+': [
    [[0.6, 3.4], [3.4, 3.4]],
    [[2, 2], [2, 4.8]],
  ],
  '%': [
    [[0.4, 6], [3.6, 0]],
    [[0.4, 0.2], [1.5, 0.2], [1.5, 1.4], [0.4, 1.4], [0.4, 0.2]],
    [[2.5, 4.6], [3.6, 4.6], [3.6, 5.8], [2.5, 5.8], [2.5, 4.6]],
  ],
  '°': [[[2.3, 0.3], [3.2, 0.3], [3.6, 0.8], [3.6, 1.6], [3.2, 2.1], [2.3, 2.1], [1.9, 1.6], [1.9, 0.8], [2.3, 0.3]]],
  '·': [[[1.6, 3], [2.4, 3], [2.4, 3.9], [1.6, 3.9], [1.6, 3]]],
  '—': [[[0, 3.3], [4, 3.3]]],
};

// Advance width in glyph units, per character: narrow marks keep their own
// sidebearings so they never crowd the letter that follows.
const WIDTHS: Record<string, number> = {
  I: 3.4,
  '.': 2.8,
  ',': 2.8,
  ':': 2.8,
  ';': 2.8,
  "'": 2.6,
  '!': 2.8,
  '°': 3.8,
  '·': 3.4,
  '(': 3.4,
  ')': 3.4,
  ' ': 2.3,
};

interface TypeOpts {
  weight?: number;
  tracking?: number;
  align?: 'left' | 'center' | 'right';
}

const advance = (ch: string, size: number, tracking: number): number => {
  const w = WIDTHS[ch] ?? 5.5;
  return (w / 6) * size + tracking * size;
};

const measure = (s: string, size: number, tracking = 0): number => {
  let w = 0;
  for (const ch of s) w += advance(ch, size, tracking);
  return w;
};

const drawText = (
  c: Canvas,
  s: string,
  x: number,
  baseline: number,
  size: number,
  color: RGB,
  opts: TypeOpts = {},
): void => {
  const weight = opts.weight ?? 0.85;
  const tracking = opts.tracking ?? 0;
  const align = opts.align ?? 'left';
  const total = measure(s, size, tracking);
  let cursor = align === 'left' ? x : align === 'center' ? x - total / 2 : x - total;
  const unit = size / 6;
  const sw = Math.max(1 / SS, weight * unit);
  for (const raw of s) {
    const ch = raw.toUpperCase();
    if (ch === ' ') {
      cursor += advance(ch, size, tracking);
      continue;
    }
    // Punctuation is set solid: hairline marks vanish at body sizes.
    const dot = 1.25 * unit;
    if (ch === '.') {
      c.fillRect(cursor + 0.75 * unit, baseline - dot, dot, dot, color);
    } else if (ch === ',') {
      c.poly(
        [
          [cursor + 0.8 * unit, baseline - dot * 0.6],
          [cursor + 1.9 * unit, baseline - dot * 0.6],
          [cursor + 1.2 * unit, baseline + dot * 0.9],
        ],
        color,
      );
    } else if (ch === ':') {
      c.fillRect(cursor + 0.75 * unit, baseline - dot * 2.4, dot, dot, color);
      c.fillRect(cursor + 0.75 * unit, baseline - dot, dot, dot, color);
    } else if (ch === ';') {
      c.fillRect(cursor + 0.75 * unit, baseline - dot * 2.4, dot, dot, color);
      c.poly(
        [
          [cursor + 0.8 * unit, baseline - dot * 0.6],
          [cursor + 1.9 * unit, baseline - dot * 0.6],
          [cursor + 1.2 * unit, baseline + dot * 0.9],
        ],
        color,
      );
    } else if (ch === "'") {
      c.poly(
        [
          [cursor + 0.9 * unit, baseline - 6 * unit],
          [cursor + 1.55 * unit, baseline - 6.1 * unit],
          [cursor + 1.45 * unit, baseline - 4.6 * unit],
          [cursor + 0.95 * unit, baseline - 4.8 * unit],
        ],
        color,
      );
    } else if (ch === '%') {
      c.stroke(
        [
          [cursor + 0.4 * unit, baseline],
          [cursor + 3.6 * unit, baseline - 6 * unit],
        ],
        sw,
        color,
      );
      c.fillRect(cursor + 0.2 * unit, baseline - 6 * unit, 1.3 * unit, 1.3 * unit, color);
      c.fillRect(cursor + 2.5 * unit, baseline - 1.4 * unit, 1.3 * unit, 1.3 * unit, color);
    } else if (ch === '·') {
      c.fillRect(cursor + 1.1 * unit, baseline - dot * 2.2, dot, dot, color);
    } else if (ch === '°') {
      c.annulus(cursor + 1.9 * unit, baseline - 5.3 * unit, 1.1 * unit, 0.55 * unit, color);
    } else {
      const g = GLYPHS[ch];
      if (g) {
        for (const poly of g) {
          const pts = poly.map(([gx, gy]) => [cursor + gx * unit, baseline + (gy - 6) * unit] as const);
          c.stroke(pts, sw, color);
        }
      }
    }
    cursor += advance(ch, size, tracking);
  }
};

const wrap = (s: string, size: number, maxWidth: number): string[] => {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (measure(next, size) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
};

interface Fitted {
  lines: string[];
  size: number;
  lead: number;
}

// Shrink until every line (single long words included) fits the box. The text is
// never cut: a shorter size is always preferred to a lost word.
const fit = (s: string, maxW: number, maxLines: number, size: number, minSize: number, leadRatio: number): Fitted => {
  let fs = size;
  let lines = wrap(s, fs, maxW);
  while (fs > minSize && (lines.length > maxLines || lines.some((l) => measure(l, fs) > maxW))) {
    fs -= 0.25;
    lines = wrap(s, fs, maxW);
  }
  return { lines, size: fs, lead: Math.round(fs * leadRatio * 10) / 10 };
};

const drawFitted = (
  c: Canvas,
  f: Fitted,
  x: number,
  firstBaseline: number,
  color: RGB,
  weight: number,
): void => {
  f.lines.forEach((ln, i) => drawText(c, ln, x, firstBaseline + i * f.lead, f.size, color, { weight }));
};

// ---------------------------------------------------------------------------
// PNG: 8-bit RGB, filter 0 rows, deflate, with real chunk checksums.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (b: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
};

const png = (rgb: Uint8Array, w: number, h: number): Uint8Array => {
  const stride = w * 3;
  const raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Drawn pictures: flat shapes in ink and vermilion, one visual language.
// ---------------------------------------------------------------------------

const hull = (
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  body: RGB,
  detail: RGB,
): void => {
  c.poly(
    [
      [x, y + h * 0.62],
      [x + w * 0.16, y + h * 0.62],
      [x + w * 0.22, y + h * 0.97],
      [x + w * 0.86, y + h * 0.97],
      [x + w, y + h * 0.62],
      [x + w * 0.8, y + h * 0.62],
    ],
    body,
  );
  c.fillRect(x + w * 0.6, y + h * 0.26, w * 0.2, h * 0.36, body);
  c.fillRect(x + w * 0.66, y + h * 0.1, w * 0.07, h * 0.18, body);
  c.stroke(
    [
      [x + w * 0.3, y + h * 0.62],
      [x + w * 0.3, y + h * 0.14],
    ],
    Math.max(1.5, w * 0.008),
    body,
  );
  c.stroke(
    [
      [x + w * 0.23, y + h * 0.16],
      [x + w * 0.37, y + h * 0.16],
    ],
    Math.max(1.5, w * 0.008),
    body,
  );
  for (let i = 0; i < 3; i++) {
    c.fillRect(x + w * (0.625 + i * 0.052), y + h * 0.32, w * 0.028, h * 0.06, detail);
  }
};

// A flame tongue: wide at the deck, tapering and leaning as it rises.
const tongue = (c: Canvas, cx: number, baseY: number, w: number, h: number, color: RGB, lean = 0.2): void => {
  const right: [number, number][] = [];
  const left: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const half = (w / 2) * Math.pow(1 - t, 0.65);
    const x = cx + lean * w * t * t;
    right.push([x + half, baseY - h * t]);
    left.push([x - half, baseY - h * t]);
  }
  c.poly([...right, ...left.reverse()], color);
};

const flame = (c: Canvas, x: number, baseY: number, w: number, h: number, outer: RGB, inner: RGB): void => {
  tongue(c, x + w * 0.24, baseY, w * 0.46, h * 0.86, outer, 0.18);
  tongue(c, x + w * 0.52, baseY, w * 0.4, h, outer, 0.24);
  tongue(c, x + w * 0.78, baseY, w * 0.38, h * 0.7, outer, 0.1);
  tongue(c, x + w * 0.5, baseY, w * 0.24, h * 0.62, inner, 0.2);
  tongue(c, x + w * 0.26, baseY, w * 0.2, h * 0.45, inner, 0.12);
};

// A plume of smoke: overlapping discs that read as one column.
const smoke = (c: Canvas, x: number, y: number, w: number, h: number, color: RGB): void => {
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const px = x + w * t * 0.85 + Math.sin(i * 1.6) * w * 0.09;
    const py = y - h * t;
    c.disc(px, py, w * (0.21 - 0.1 * t), color);
  }
};

// Lead picture: tankers burning in the strait, a mine in the water.
const drawStrait = (c: Canvas, x: number, y: number, w: number, h: number): void => {
  const water = y + h * 0.68;
  const far = mix(INK, PAPER, 0.22);
  const paper = PAPER;

  // far coast, then the water line
  c.poly(
    [
      [x, water],
      [x, water - h * 0.09],
      [x + w * 0.1, water - h * 0.16],
      [x + w * 0.2, water - h * 0.08],
      [x + w * 0.3, water - h * 0.18],
      [x + w * 0.38, water - h * 0.05],
      [x + w * 0.44, water],
    ],
    far,
  );

  // a second tanker, further off
  hull(c, x + w * 0.73, water - h * 0.17, w * 0.23, h * 0.18, far, INK);
  smoke(c, x + w * 0.78, water - h * 0.26, w * 0.13, h * 0.2, mix(INK, PAPER, 0.2));
  flame(c, x + w * 0.79, water - h * 0.09, w * 0.065, h * 0.14, RED, paper);

  // the lead tanker, large in the frame
  hull(c, x + w * 0.02, water - h * 0.37, w * 0.54, h * 0.38, paper, INK);
  smoke(c, x + w * 0.2, water - h * 0.36, w * 0.26, h * 0.26, mix(INK, PAPER, 0.32));
  flame(c, x + w * 0.07, water - h * 0.05, w * 0.18, h * 0.24, RED, paper);
  flame(c, x + w * 0.2, water - h * 0.05, w * 0.12, h * 0.18, RED, paper);

  c.stroke(
    [
      [x, water],
      [x + w, water],
    ],
    1.2,
    mix(INK, PAPER, 0.32),
  );
  for (let i = 0; i < 5; i++) {
    const wx = x + w * (0.04 + i * 0.2);
    const wy = water + h * 0.12 + (i % 2) * h * 0.09;
    c.stroke(
      [
        [wx, wy],
        [wx + w * 0.07, wy],
      ],
      1.4,
      mix(INK, PAPER, 0.45),
    );
  }

};


// ---------------------------------------------------------------------------
// Two more pictures, drawn the same way: flat shapes, two inks, no gradients.
// ---------------------------------------------------------------------------

// Khartoum: a skyline with one block torn open, a drone overhead, dust.
const drawSkyline = (c: Canvas, x: number, y: number, w: number, h: number): void => {
  const base = y + h * 0.9;
  const far = mix(INK, PAPER, 0.5);

  for (let i = 0; i < 4; i++) {
    c.disc(x + w * (0.6 + i * 0.07), y + h * (0.44 - i * 0.06), w * (0.045 + i * 0.004), mix(INK, PAPER, 0.3));
  }

  c.fillRect(x + w * 0.03, y + h * 0.5, w * 0.15, base - (y + h * 0.5), far);
  c.fillRect(x + w * 0.21, y + h * 0.38, w * 0.12, base - (y + h * 0.38), far);
  c.fillRect(x + w * 0.36, y + h * 0.58, w * 0.19, base - (y + h * 0.58), INK);

  c.poly(
    [
      [x + w * 0.57, base],
      [x + w * 0.57, y + h * 0.46],
      [x + w * 0.65, y + h * 0.46],
      [x + w * 0.67, y + h * 0.31],
      [x + w * 0.72, y + h * 0.39],
      [x + w * 0.78, y + h * 0.23],
      [x + w * 0.83, y + h * 0.41],
      [x + w * 0.88, base],
    ],
    INK,
  );

  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 2; i++) {
      c.fillRect(x + w * (0.4 + i * 0.075), y + h * (0.64 + r * 0.09), w * 0.03, h * 0.035, PAPER);
    }
  }

  // the burst itself, spiked, at the foot of the wound
  const bx = x + w * 0.72;
  const by = y + h * 0.76;
  const star: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 === 0 ? w * 0.15 : w * 0.06;
    star.push([bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.8]);
  }
  c.poly(star, RED);

  // drone: two rotors, a body, a red eye
  const dx = x + w * 0.13;
  const dy = y + h * 0.16;
  c.stroke([[dx - w * 0.11, dy - h * 0.05], [dx + w * 0.02, dy - h * 0.05]], 1.2, INK);
  c.stroke([[dx - w * 0.02, dy - h * 0.05], [dx + w * 0.1, dy - h * 0.05]], 1.2, INK);
  for (const s of [-0.11, 0.1]) c.disc(dx + w * s, dy - h * 0.05, w * 0.012, INK);
  c.fillRect(dx - w * 0.02, dy - h * 0.06, w * 0.04, h * 0.05, INK);
  c.fillRect(dx, dy, w * 0.012, h * 0.012, RED);

  c.fillRect(x, base, w, Math.max(1.1, h * 0.014), INK);
};

// Villavicencio: a block with a bite out of it, a leaning neighbour, debris.
const drawRubble = (c: Canvas, x: number, y: number, w: number, h: number): void => {
  const base = y + h * 0.9;

  for (let i = 0; i < 4; i++) {
    c.disc(x + w * (0.44 + i * 0.08), y + h * (0.4 - i * 0.07), w * (0.05 + i * 0.006), mix(INK, PAPER, 0.32));
  }

  c.fillRect(x + w * 0.03, y + h * 0.22, w * 0.42, base - (y + h * 0.22), INK);
  // the wound: a red tear through the upper storeys
  c.poly(
    [
      [x + w * 0.22, y + h * 0.24],
      [x + w * 0.43, y + h * 0.24],
      [x + w * 0.43, y + h * 0.6],
      [x + w * 0.38, y + h * 0.52],
      [x + w * 0.34, y + h * 0.66],
      [x + w * 0.3, y + h * 0.55],
      [x + w * 0.25, y + h * 0.62],
      [x + w * 0.22, y + h * 0.5],
    ],
    RED,
  );

  // windows on what is left
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 2; i++) {
      c.fillRect(x + w * (0.06 + i * 0.08), y + h * (0.3 + r * 0.12), w * 0.045, h * 0.05, PAPER);
    }
  }

  // the neighbour, leaning
  c.poly(
    [
      [x + w * 0.52, base],
      [x + w * 0.56, y + h * 0.4],
      [x + w * 0.74, y + h * 0.36],
      [x + w * 0.78, base],
    ],
    mix(INK, PAPER, 0.3),
  );
  c.poly(
    [
      [x + w * 0.8, base],
      [x + w * 0.82, y + h * 0.56],
      [x + w * 0.95, y + h * 0.6],
      [x + w * 0.96, base],
    ],
    INK,
  );

  // debris
  const bits: [number, number, number, number][] = [
    [0.02, 0.02, 0.05, 0.03],
    [0.12, 0.015, 0.04, 0.025],
    [0.33, 0.03, 0.06, 0.02],
    [0.5, 0.02, 0.03, 0.03],
    [0.66, 0.03, 0.05, 0.02],
    [0.86, 0.02, 0.04, 0.03],
  ];
  for (const [bx, by, bw, bh] of bits) {
    c.fillRect(x + w * bx, base - h * by, w * bw, h * bh, mix(INK, PAPER, 0.15));
  }

  c.fillRect(x, base, w, Math.max(1.1, h * 0.014), INK);
};

// ---------------------------------------------------------------------------
// The edition. Every line was read in reporting dated 24 November 2026; claims
// that are contested say who made them.
// ---------------------------------------------------------------------------

interface Story {
  n: number;
  place: string;
  beat: string;
  lat: number;
  lon: number;
  text: string;
  head?: string;
  lead?: string;
  art?: (c: Canvas, x: number, y: number, w: number, h: number) => void;
}

// Where each badge sits, relative to its dot: hand-placed once so that crowded
// regions (Europe, the Gulf, the Sahel) fan out instead of stacking.
const ANCHOR: Readonly<Record<number, readonly [number, number]>> = {
  1: [26, 17],
  2: [1, 19],
  3: [-19, 15],
  4: [22, -8],
  5: [-16, -17],
  6: [-9, -20],
  7: [18, 10],
  8: [18, 4],
  9: [-18, 12],
  10: [-22, -8],
  11: [26, -14],
  12: [-19, -16],
  13: [13, 2],
  14: [18, -32],
  15: [-8, -26],
  16: [-26, 7],
  17: [-42, -14],
  18: [-27, 11],
  19: [-25, 12],
  20: [18, 24],
  21: [-36, 6],
  22: [-28, 17],
  23: [34, 6],
  24: [30, 10],
  25: [22, 19],
  26: [15, 14],
  27: [14, -16],
  28: [-13, -15],
  29: [-18, 16],
  30: [-23, -13],
  31: [13, -15],
  32: [14, 5],
  33: [17, 4],
};

const STORIES: Story[] = [
  {
    n: 1,
    place: 'STRAIT OF HORMUZ',
    beat: 'MIDDLE EAST / ENERGY',
    lat: 26.6,
    lon: 56.4,
    text: 'Three tankers struck mines, the Guard navy said; Washington widened sanctions.',
    head: 'MINES SET THREE TANKERS ABLAZE',
    lead: "Iran's Guard navy said three tankers hit mines in the strait it closed in July. Washington widened sanctions on more than two dozen Iranian firms.",
    art: drawStrait,
  },
  {
    n: 2,
    place: 'KHARTOUM',
    beat: 'AFRICA / CONFLICT',
    lat: 15.6,
    lon: 32.5,
    text: 'Drones hit the airport and a UN building, killing at least four; the grid is failing.',
    head: 'DRONES STRIKE KHARTOUM',
    lead: 'Drones hit the airport and a UN building, killing at least four. The army said it downed more; the power grid is near collapse.',
    art: drawSkyline,
  },
  {
    n: 3,
    place: 'VILLAVICENCIO',
    beat: 'SOUTH AMERICA / SECURITY',
    lat: 4.1,
    lon: -73.6,
    text: 'A car bomb wounded 25 and wrecked 80 buildings, the president said.',
    head: 'CAR BOMB ROCKS COLOMBIA',
    lead: 'A car bomb wounded 25 and wrecked more than 80 buildings; the president blamed FARC dissidents.',
    art: drawRubble,
  },
  {
    n: 4,
    place: 'WASHINGTON',
    beat: 'NORTH AMERICA / MARKETS',
    lat: 38.9,
    lon: -77.0,
    text: 'Nasdaq fell 1.5% to 23,733.54; the Dow gained 423.39 to 50,018.70.',
  },
  {
    n: 5,
    place: 'SANTA CLARA',
    beat: 'NORTH AMERICA / TECH',
    lat: 37.35,
    lon: -121.95,
    text: "Nvidia reinstated Jensen Huang as chief executive after Trump's pressure.",
  },
  {
    n: 6,
    place: 'IOWA',
    beat: 'NORTH AMERICA / DEFENCE',
    lat: 41.9,
    lon: -93.6,
    text: 'The Army will detonate lead-contaminated munitions at a depot on Wednesday.',
  },
  {
    n: 7,
    place: 'MEXICO CITY',
    beat: 'NORTH AMERICA / JUSTICE',
    lat: 19.4,
    lon: -99.1,
    text: "Mexico refused to extradite 'El Chapo Isidro' to the US after his arrest.",
  },
  {
    n: 8,
    place: 'BRASILIA',
    beat: 'SOUTH AMERICA / ECONOMY',
    lat: -15.8,
    lon: -47.9,
    text: "The lower house passed Lula's spending curbs; the real rose 1.3% on the relief.",
  },
  {
    n: 9,
    place: 'LIMA',
    beat: 'SOUTH AMERICA / CLIMATE',
    lat: -12.0,
    lon: -77.0,
    text: '10,877 sea lions have died this year as El Nino warms the sea, wildlife data show.',
  },
  {
    n: 10,
    place: 'HAVANA',
    beat: 'CARIBBEAN / TOURISM',
    lat: 23.1,
    lon: -82.4,
    text: 'Cuba drew 507,083 visitors in ten months, down 65.7%, as US pressure bites.',
  },
  {
    n: 11,
    place: 'ZAPORIZHZHIA',
    beat: 'EUROPE / WAR',
    lat: 47.8,
    lon: 35.2,
    text: 'A guided bomb hit an apartment block, killing two and wounding more than 40.',
  },
  {
    n: 12,
    place: 'TALLINN',
    beat: 'EUROPE / SECURITY',
    lat: 59.4,
    lon: 24.8,
    text: "Estonia said Russia was waging 'open war'.",
  },
  {
    n: 13,
    place: 'BLACK SEA',
    beat: 'EUROPE / SHIPPING',
    lat: 43.5,
    lon: 34.0,
    text: 'At the UN, Moscow accused Kyiv of hitting more than 200 commercial vessels.',
  },
  {
    n: 14,
    place: 'KYIV',
    beat: 'EUROPE / CHILDREN',
    lat: 50.45,
    lon: 30.5,
    text: 'UNICEF says 1,144 Ukrainian children have been killed or injured in 2026.',
  },
  {
    n: 15,
    place: 'WOLFSBURG',
    beat: 'EUROPE / LABOUR',
    lat: 52.4,
    lon: 10.8,
    text: "Volkswagen's talks with its unions ended without a deal; strikes loom in January.",
  },
  {
    n: 16,
    place: 'PARIS',
    beat: 'EUROPE / POLITICS',
    lat: 48.9,
    lon: 2.3,
    text: 'Prosecutors opened a probe into public funds at a body chaired by a candidate.',
  },
  {
    n: 17,
    place: 'LONDON',
    beat: 'EUROPE / COURTS',
    lat: 51.5,
    lon: -0.12,
    text: 'The GTA VI hacker was released on licence part-way through a seven-year term.',
  },
  {
    n: 18,
    place: 'SUDAN',
    beat: 'AFRICA / HUNGER',
    lat: 13.0,
    lon: 29.5,
    text: '19.5 million Sudanese face crisis hunger, 135,000 of them catastrophic, WFP says.',
  },
  {
    n: 19,
    place: 'ITURI',
    beat: 'AFRICA / HEALTH',
    lat: 1.6,
    lon: 30.2,
    text: 'Ebola responders sheltered in a hospital for 24 hours; 5,775 have died.',
  },
  {
    n: 20,
    place: 'ALAMATA',
    beat: 'AFRICA / RIGHTS',
    lat: 12.4,
    lon: 39.6,
    text: 'Amnesty sought a war crimes inquiry into shelling that killed 14 civilians.',
  },
  {
    n: 21,
    place: 'BENGHAZI',
    beat: 'AFRICA / LIBYA',
    lat: 32.1,
    lon: 20.1,
    text: 'Blasts blamed on drones hit a Russian warship and a cargo ship at the port.',
  },
  {
    n: 22,
    place: 'KHAN YOUNIS',
    beat: 'MIDDLE EAST / GAZA',
    lat: 31.3,
    lon: 34.3,
    text: 'A strike on a police post killed three; Oxfam says 99% of Gaza is contaminated.',
  },
  {
    n: 23,
    place: 'SANAA',
    beat: 'MIDDLE EAST / YEMEN',
    lat: 15.4,
    lon: 44.2,
    text: 'At least 41 civilians were killed across Yemen in a day, the Houthi ministry said.',
  },
  {
    n: 24,
    place: 'TEHRAN',
    beat: 'MIDDLE EAST / IRAN',
    lat: 35.7,
    lon: 51.4,
    text: "Iran vowed to use 'all available tools' against the US naval blockade.",
  },
  {
    n: 25,
    place: 'SINGAPORE',
    beat: 'ASIA / ECONOMY',
    lat: 1.35,
    lon: 103.8,
    text: 'Third-quarter growth of 6.1% beat forecasts; the 2026 outlook rose to about 6%.',
  },
  {
    n: 26,
    place: 'TAIPEI',
    beat: 'ASIA / MARKETS',
    lat: 25.0,
    lon: 121.5,
    text: 'The TAIEX jumped 8.99% as Jensen Huang returned; October output set a record.',
  },
  {
    n: 27,
    place: 'SEOUL',
    beat: 'ASIA / DEFENCE',
    lat: 37.6,
    lon: 127.0,
    text: 'Fighter jets scrambled after Russian warplanes entered the air-defence zone.',
  },
  {
    n: 28,
    place: 'DHAKA',
    beat: 'ASIA / POLITICS',
    lat: 23.8,
    lon: 90.4,
    text: 'Sheikh Hasina is to return home on 16 December to face a tribunal verdict.',
  },
  {
    n: 29,
    place: 'JAKARTA',
    beat: 'ASIA / POLICE',
    lat: -6.2,
    lon: 106.8,
    text: 'A former police chief was named a treason suspect over alleged wiretapping.',
  },
  {
    n: 30,
    place: 'KUALA LUMPUR',
    beat: 'ASIA / REFUGEES',
    lat: 3.1,
    lon: 101.7,
    text: 'Malaysia will repatriate another 6,803 Burmese refugees, the government said.',
  },
  {
    n: 31,
    place: 'HONIARA',
    beat: 'OCEANIA / SECURITY',
    lat: -9.4,
    lon: 160.0,
    text: 'The Solomons will not renew its China security pact; an Australia treaty is due.',
  },
  {
    n: 32,
    place: "NUKU'ALOFA",
    beat: 'OCEANIA / DROUGHT',
    lat: -21.1,
    lon: -175.2,
    text: "Tonga declared a 27-day state of emergency as drought grips Ha'apai.",
  },
  {
    n: 33,
    place: 'CANBERRA',
    beat: 'OCEANIA / JOBS',
    lat: -35.3,
    lon: 149.1,
    text: 'The treasurer warned unemployment will climb above 5% as rate rises bite.',
  },
];

// ---------------------------------------------------------------------------
// The world, coarse on purpose: land is a stipple of dots, 2.5 degrees of
// longitude by four of latitude, drawn from the bands below.
// ---------------------------------------------------------------------------

const LAND: readonly (readonly (readonly [number, number])[])[] = [
  [[-45, -20], [10, 25], [90, 105]],
  [[-60, -20], [8, 25], [45, 60], [88, 105], [100, 115]],
  [[-58, -20], [-125, -70], [10, 25], [52, 62], [80, 115], [135, 155]],
  [[-165, -140], [-135, -62], [-55, -22], [15, 180]],
  [[-166, -141], [-140, -60], [-50, -22], [-22, -14], [5, 180]],
  [[-166, -140], [-140, -55], [-45, -20], [-23, -14], [5, 180]],
  [[-166, -135], [-135, -55], [-7, -2], [5, 180]],
  [[-175, -160], [-130, -55], [-10, 0], [8, 15], [20, 180]],
  [[-125, -55], [-6, 2], [0, 25], [25, 180]],
  [[-125, -65], [0, 25], [28, 48], [48, 90], [90, 135], [138, 145]],
  [[-125, -70], [0, 3], [8, 18], [26, 45], [45, 60], [60, 80], [80, 125], [126, 130], [130, 142]],
  [[-122, -75], [-9, -1], [10, 16], [20, 44], [44, 62], [62, 75], [75, 122], [126, 129], [130, 141]],
  [[-118, -78], [-8, 10], [35, 48], [48, 62], [65, 78], [78, 121], [131, 140]],
  [[-110, -80], [-10, 32], [34, 48], [45, 56], [68, 88], [88, 122], [130, 140]],
  [[-110, -80], [-14, 35], [36, 56], [68, 122]],
  [[-105, -88], [-17, 37], [38, 58], [69, 110], [120, 125]],
  [[-100, -88], [-17, 38], [42, 53], [72, 85], [94, 108], [120, 125]],
  [[-92, -83], [-17, 44], [43, 52], [74, 80], [95, 108], [120, 125]],
  [[-85, -77], [-14, 51], [76, 82], [98, 107], [120, 126]],
  [[-78, -72], [-11, 47], [80, 82], [96, 118], [122, 126]],
  [[-76, -60], [8, 42], [98, 120], [135, 150]],
  [[-75, -50], [10, 42], [100, 120], [135, 150]],
  [[-75, -35], [12, 40], [100, 120], [138, 150]],
  [[-75, -35], [13, 40], [105, 120], [140, 150]],
  [[-70, -38], [12, 40], [48, 50], [126, 142]],
  [[-70, -39], [12, 40], [45, 50], [121, 147]],
  [[-72, -41], [15, 35], [44, 50], [113, 152]],
  [[-72, -48], [16, 32], [44, 48], [113, 153]],
  [[-72, -50], [18, 30], [115, 153]],
  [[-72, -53], [18, 26], [115, 151], [173, 178]],
  [[-72, -57], [140, 150], [173, 178]],
  [[-73, -63], [145, 148], [170, 176]],
  [[-74, -66], [166, 172]],
  [[-75, -68]],
  [[-74, -68]],
  [],
];

const MAP = { x: 40, y: 208, w: 944, h: 262, top: 64, bottom: -56 };
const SEA_LAND: RGB = mix(LINE, PAPER, 0.18);
const lonX = (lon: number): number => MAP.x + ((lon + 180) / 360) * MAP.w;
const latY = (lat: number): number => MAP.y + ((MAP.top - lat) / (MAP.top - MAP.bottom)) * MAP.h;

// Land is a stack of latitude bands, each one a bar: a low-resolution world
// that reads as a silhouette, with hairline gaps to keep the print texture.
const drawWorld = (c: Canvas): void => {
  const bandH = (4 * MAP.h) / (MAP.top - MAP.bottom);
  LAND.forEach((bands, r) => {
    const yc = latY(82 - 4 * r);
    const top = Math.max(MAP.y, yc - bandH / 2);
    const bot = Math.min(MAP.y + MAP.h, yc + bandH / 2);
    if (bot - top < 1) return;
    // one-degree cells, so the coast steps sideways by about 2.6 pixels
    for (let lon = -180; lon < 180; lon += 1) {
      const mid = lon + 0.5;
      if (bands.some(([a, b]) => mid >= a && mid <= b)) {
        c.fillRect(lonX(lon), top, 2.7, bot - top + 0.1, SEA_LAND);
      }
    }
  });
};

// Badges start where each story's dot is and push each other apart, so a
// crowded region fans out along leader lines instead of stacking up.
interface Pin {
  x: number;
  y: number;
  ax: number;
  ay: number;
  s: Story;
}

const placePins = (): Pin[] => {
  const pins: Pin[] = STORIES.map((s) => {
    const [ox, oy] = ANCHOR[s.n] ?? [0, -13];
    const ax = lonX(s.lon) + ox;
    const ay = latY(s.lat) + oy;
    return { x: ax, y: ay, ax, ay, s };
  });
  for (let it = 0; it < 260; it++) {
    for (let i = 0; i < pins.length; i++) {
      for (let j = i + 1; j < pins.length; j++) {
        const a = pins[i];
        const b = pins[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
          if (Math.abs(dx) >= Math.abs(dy)) {
            const push = (dx >= 0 ? 1 : -1) * (15 - Math.abs(dx)) * 0.5;
            a.x -= push;
            b.x += push;
          } else {
            const push = (dy >= 0 ? 1 : -1) * (15 - Math.abs(dy)) * 0.5;
            a.y -= push;
            b.y += push;
          }
        }
      }
    }
    for (const p of pins) {
      p.x += (p.ax - p.x) * 0.035;
      p.y += (p.ay - p.y) * 0.035;
      p.x = Math.max(MAP.x + 11, Math.min(MAP.x + MAP.w - 11, p.x));
      p.y = Math.max(MAP.y + 9, Math.min(MAP.y + MAP.h - 9, p.y));
    }
  }
  return pins;
};

const drawPin = (c: Canvas, p: Pin): void => {
  const x = lonX(p.s.lon);
  const y = latY(p.s.lat);
  c.stroke([[x, y], [p.x, p.y]], 0.7, RED);
  c.disc(x, y, 1.6, RED);
  c.fillRect(p.x - 7, p.y - 7, 14, 14, RED);
  drawText(c, String(p.s.n), p.x, p.y + 3.2, 6.6, PAPER, { align: 'center', weight: 0.72 });
};

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

const M = 40;
const RIGHT = W - M;
const CONTENT = RIGHT - M;

const rule = (c: Canvas, x: number, y: number, w: number, color: RGB, t = 1): void => {
  c.fillRect(x, y, w, t, color);
};

const stamp = (c: Canvas, n: number, x: number, y: number): void => {
  c.fillRect(x, y, 13, 13, RED);
  drawText(c, String(n), x + 6.5, y + 9.4, 7.4, PAPER, { align: 'center', weight: 0.78 });
};

const render = (): Uint8Array => {
  const c = new Canvas(W * SS, H * SS);
  c.fillRect(0, 0, W, H, PAPER);

  // Masthead
  drawText(c, 'WORLD NEWS', M, 58, 20, INK, { weight: 1.3, tracking: 0.16 });
  drawText(c, 'SIX CONTINENTS · THIRTY-THREE DISPATCHES', RIGHT, 56, 9.5, MUTED, { align: 'right', tracking: 0.16 });
  rule(c, M, 66, CONTENT, INK, 3);

  // The day
  drawText(c, 'TUESDAY', M + 2, 92, 10.5, RED, { weight: 1.1, tracking: 0.26 });
  drawText(c, '24', M - 6, 186, 92, INK, { weight: 0.72 });
  c.fillRect(214, 100, 3, 86, RED);
  drawText(c, 'NOVEMBER', 228, 136, 24, INK, { weight: 1.05, tracking: 0.04 });
  drawText(c, '2026', 228, 168, 24, RED, { weight: 1.05, tracking: 0.04 });

  // Standfirst
  const stand = fit(
    'Every item was reported on the day. Contested figures are credited to whoever gave them.',
    176,
    4,
    7.6,
    6.8,
    1.38,
  );
  rule(c, 420, 98, 1, LINE, 88);
  drawFitted(c, stand, 432, 108, MUTED, 0.7);

  // The day in numbers
  const NX = 620;
  drawText(c, 'THE DAY IN NUMBERS', NX, 92, 8, MUTED, { tracking: 0.18 });
  const figures: [string, string][] = [
    ['3', 'TANKERS ABLAZE, IRGC NAVY'],
    ['1,144', 'KILLED OR HURT, UNICEF'],
    ['19.5M', 'HUNGRY IN SUDAN, WFP'],
    ['8.99%', 'TAIEX JUMPS, TAIPEI TIMES'],
  ];
  figures.forEach(([fig, label], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = NX + col * 182;
    const cy = 96 + row * 52;
    drawText(c, fig, cx, cy + 22, 18.5, i === 0 ? RED : INK, { weight: 0.92, tracking: 0.02 });
    drawText(c, label, cx, cy + 33, 6.6, MUTED, { tracking: 0.04, weight: 0.68 });
  });
  rule(c, NX + 176, 96, 1, LINE, 88);

  // Where it happened
  rule(c, M, 204, CONTENT, LINE, 1);
  rule(c, M, 204, 1, LINE, 264);
  rule(c, RIGHT, 204, 1, LINE, 264);
  drawWorld(c);
  drawText(c, 'WHERE IT HAPPENED', M + 4, 452, 8, MUTED, { tracking: 0.18 });
  drawText(c, 'SCHEMATIC MAP, 64°N TO 56°S. ONE MARK FOR EACH DISPATCH', M + 4, 463, 6.4, MUTED, { tracking: 0.08 });
  for (const p of placePins()) drawPin(c, p);

  // Three leads
  const LEAD_TOP = 478;
  const LW = 306;
  const gap = (CONTENT - LW * 3) / 2;
  STORIES.filter((s) => s.head).forEach((s, i) => {
    const x = M + i * (LW + gap);
    rule(c, x, LEAD_TOP - 8, LW, INK, 2);
    stamp(c, s.n, x, LEAD_TOP);
    drawText(c, s.place, x + 18, LEAD_TOP + 9.6, 8, INK, { weight: 1.05, tracking: 0.1 });
    drawText(c, s.beat, x + LW, LEAD_TOP + 9.6, 6.6, MUTED, { align: 'right', tracking: 0.1 });

    s.art?.(c, x + 230, LEAD_TOP + 16, 76, 76);

    const head = fit(s.head ?? '', 222, 2, 12.5, 9.5, 1.3);
    drawFitted(c, head, x, LEAD_TOP + 36, INK, 1.0);
    const lead = fit(s.lead ?? '', 222, 4, 7.5, 6.6, 1.3);
    const leadY = LEAD_TOP + 36 + (head.lines.length - 1) * head.lead + 14;
    drawFitted(c, lead, x, leadY, MUTED, 0.7);
  });

  // Also today: three columns of ten
  rule(c, M, 584, CONTENT, INK, 1);
  drawText(c, 'ALSO TODAY', M, 594, 8.4, INK, { weight: 1.15, tracking: 0.18 });
  drawText(c, 'THIRTY MORE DISPATCHES', RIGHT, 594, 7, MUTED, { align: 'right', tracking: 0.14 });
  const LIST_TOP = 602;
  const ROW = 32.8;
  const colW = 300;
  const colGap = (CONTENT - colW * 3) / 2;
  const rest = STORIES.filter((s) => !s.head);
  rest.forEach((s, i) => {
    const col = Math.floor(i / 10);
    const row = i % 10;
    const x = M + col * (colW + colGap);
    const y = LIST_TOP + row * ROW;
    drawText(c, String(s.n), x, y + 8.2, 8.2, RED, { weight: 1.05, tracking: 0.02 });
    drawText(c, s.place, x + 17, y + 8.2, 7.9, INK, { weight: 1.05, tracking: 0.1 });
    const body = fit(s.text, colW - 17, 2, 7.5, 6.8, 1.24);
    drawFitted(c, body, x + 17, y + 19.6, MUTED, 0.68);
  });

  // Footer
  rule(c, M, 934, CONTENT, INK, 2);
  drawText(
    c,
    'SOURCES READ FOR THIS EDITION, ALL DATED 24 NOVEMBER 2026: AP · REUTERS · ANADOLU · DEMOCRACY NOW! · CNBC · BLOOMBERG · NIKKEI ASIA · THE JAPAN TIMES',
    M,
    950,
    6.8,
    MUTED,
    { tracking: 0.04 },
  );
  drawText(
    c,
    'G1 · EURONEWS · THE RIO TIMES · XINHUA · ALLAFRICA · AL JAZEERA · TAIPEI TIMES · LIBERTY TIMES · DAWN · ABC NEWS · RNZ · AMNESTY INTERNATIONAL',
    M,
    962,
    6.8,
    MUTED,
    { tracking: 0.04 },
  );
  drawText(
    c,
    'DISPUTED FIGURES ARE CREDITED TO WHOEVER GAVE THEM. COMPILED AS THE DAY CLOSED, IN ANY TIME ZONE.',
    M,
    976,
    6.8,
    MUTED,
    { tracking: 0.04 },
  );
  drawText(c, '24 · 11 · 2026', RIGHT, 976, 7.6, RED, { align: 'right', weight: 1.1, tracking: 0.1 });

  return c.resolve();
};

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const rgb = render();
writeFileSync(join(outDir, 'entry.png'), png(rgb, W, H));
