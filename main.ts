// world-news-20261124 — draws one image summing up Tuesday 24 November 2026.
//
// Everything is drawn here with arithmetic: a small stroke alphabet, flat shapes
// and a hand-written PNG encoder. No fonts, no images, no network, and no
// randomness, so two runs write the same bytes.
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
    [[1, 0], [3, 0]],
    [[2, 0], [2, 6]],
    [[1, 6], [3, 6]],
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
  '0': [
    [[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]],
    [[0.8, 4.9], [3.2, 1.1]],
  ],
  '1': [
    [[0.8, 1.2], [2.2, 0], [2.2, 6]],
    [[0.8, 6], [3.6, 6]],
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

const NARROW = new Set(['I', '1', '.', ',', ':', ';', "'", '!', '|', '·', '°', '(', ')']);

interface TypeOpts {
  weight?: number;
  tracking?: number;
  align?: 'left' | 'center' | 'right';
}

const advance = (ch: string, size: number, tracking: number): number => {
  const w = ch === ' ' ? 2.3 : NARROW.has(ch) ? 2.6 : 5.5;
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
    const g = GLYPHS[ch];
    if (g) {
      for (const poly of g) {
        const pts = poly.map(([gx, gy]) => [cursor + gx * unit, baseline + (gy - 6) * unit] as const);
        c.stroke(pts, sw, color);
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
// The day's six dispatches. Every fact was read from reporting dated
// 24 November 2026: AP, Reuters, Anadolu, Democracy Now!, CNBC.
// ---------------------------------------------------------------------------

interface Dispatch {
  n: string;
  place: string;
  beat: string;
  head: string;
  fact: string;
}

const DISPATCHES: Dispatch[] = [
  {
    n: '01',
    place: 'STRAIT OF HORMUZ',
    beat: 'MIDDLE EAST / ENERGY',
    head: 'MINES SET THREE TANKERS ABLAZE',
    fact: "Iran's Guard navy said three tankers hit mines in the strait it closed in July; Washington widened sanctions on more than two dozen Iranian firms.",
  },
  {
    n: '02',
    place: 'ZAPORIZHZHIA',
    beat: 'EUROPE / WAR',
    head: 'BOMB KILLS TWO IN ZAPORIZHZHIA',
    fact: 'A guided bomb hit an apartment block overnight, wounding more than 40. UNICEF counts 1,144 Ukrainian children killed or injured in 2026.',
  },
  {
    n: '03',
    place: 'KHARTOUM',
    beat: 'AFRICA / CONFLICT',
    head: 'DRONES STRIKE KHARTOUM',
    fact: 'Strikes hit the airport and a UN facility, killing at least four, as the army said it downed more drones. The power grid is near collapse.',
  },
  {
    n: '04',
    place: 'NEW YORK',
    beat: 'MARKETS / TECH',
    head: 'AI STOCKS SLIDE AGAIN',
    fact: 'The S&P 500 fell 0.5% to 7,201.09 and the Nasdaq 1.5% to 23,733.54; the Dow added 423 points to 50,018.70.',
  },
  {
    n: '05',
    place: 'SINGAPORE',
    beat: 'ASIA / ECONOMY',
    head: 'SINGAPORE RAISES GROWTH FORECAST',
    fact: 'Third-quarter growth of 6.1% beat forecasts on AI-driven trade and manufacturing; the 2026 forecast rose to about 6%.',
  },
  {
    n: '06',
    place: 'AL-MAWASI, GAZA',
    beat: 'HUMANITARIAN',
    head: 'OXFAM: 99% OF GAZA CONTAMINATED',
    fact: 'Oxfam says heavy metals, explosive residue and asbestos pollute almost all of the territory. A strike on a police post killed three, medics said.',
  },
];

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
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const px = x + w * t + Math.sin(i * 1.6) * w * 0.12;
    const py = y - h * t;
    c.disc(px, py, w * (0.15 - 0.08 * t), color);
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
  hull(c, x + w * 0.73, water - h * 0.2, w * 0.23, h * 0.21, far, INK);
  smoke(c, x + w * 0.785, water - h * 0.3, w * 0.13, h * 0.2, mix(INK, PAPER, 0.2));
  flame(c, x + w * 0.805, water - h * 0.13, w * 0.065, h * 0.16, RED, paper);

  // the lead tanker, large in the frame
  hull(c, x + w * 0.02, water - h * 0.39, w * 0.54, h * 0.4, paper, INK);
  smoke(c, x + w * 0.2, water - h * 0.45, w * 0.26, h * 0.26, mix(INK, PAPER, 0.32));
  flame(c, x + w * 0.07, water - h * 0.15, w * 0.18, h * 0.32, RED, paper);
  flame(c, x + w * 0.2, water - h * 0.15, w * 0.12, h * 0.24, RED, paper);

  c.stroke(
    [
      [x, water],
      [x + w, water],
    ],
    1.2,
    mix(INK, PAPER, 0.32),
  );
  for (let i = 0; i < 9; i++) {
    const wx = x + w * (0.02 + i * 0.11);
    const wy = water + h * 0.1 + (i % 3) * h * 0.07;
    c.stroke(
      [
        [wx, wy],
        [wx + w * 0.05, wy],
      ],
      1.4,
      mix(INK, PAPER, 0.3),
    );
  }

};


const drawBomb = (c: Canvas, x: number, y: number, w: number, h: number): void => {
  const bw = w * 0.46;
  const bh = h * 0.84;
  const bx = x + w * 0.02;
  const by = y + h - bh;
  c.fillRect(bx, by, bw, bh, INK);
  for (let r = 0; r < 5; r++) {
    for (let col = 0; col < 3; col++) {
      if (r === 1 && col === 2) continue;
      c.fillRect(bx + bw * (0.14 + col * 0.26), by + bh * (0.08 + r * 0.16), bw * 0.15, bh * 0.09, PAPER);
    }
  }
  c.poly(
    [
      [bx + bw * 0.56, by + bh * 0.32],
      [bx + bw, by + bh * 0.28],
      [bx + bw, by + bh * 0.5],
      [bx + bw * 0.74, by + bh * 0.44],
      [bx + bw * 0.64, by + bh * 0.52],
      [bx + bw * 0.56, by + bh * 0.4],
    ],
    RED,
  );
  c.fillRect(bx + bw * 0.14, by + bh, w * 0.055, h * 0.02, INK);
  c.fillRect(bx + bw * 0.42, by + bh - h * 0.01, w * 0.04, h * 0.02, INK);

  const dx = x + w * 0.76;
  const dy = y + h * 0.22;
  c.stroke(
    [
      [dx - w * 0.1, dy],
      [dx + w * 0.1, dy],
    ],
    2,
    INK,
  );
  c.stroke(
    [
      [dx, dy - h * 0.04],
      [dx, dy + h * 0.05],
    ],
    2,
    INK,
  );
  for (const s of [-1, 1]) c.annulus(dx + s * w * 0.1, dy - h * 0.01, w * 0.042, 1.6, INK);
  for (let i = 0; i < 3; i++) {
    c.stroke(
      [
        [dx - w * 0.02, dy + h * 0.12 + i * h * 0.06],
        [dx + w * 0.02, dy + h * 0.14 + i * h * 0.06],
      ],
      1.5,
      RED,
    );
  }
};

const drawGrid = (c: Canvas, x: number, y: number, w: number, h: number): void => {
  const px = x + w * 0.46;
  const top = y + h * 0.1;
  const base = y + h * 0.88;
  const legW = w * 0.19;
  // lattice
  c.stroke(
    [
      [px - legW * 0.35, top],
      [px - legW, base],
    ],
    2.2,
    INK,
  );
  c.stroke(
    [
      [px + legW * 0.35, top],
      [px + legW, base],
    ],
    2.2,
    INK,
  );
  for (let i = 0; i < 5; i++) {
    const t0 = i / 5;
    const t1 = (i + 1) / 5;
    const y0 = top + (base - top) * t0;
    const y1 = top + (base - top) * t1;
    const x0 = legW * (0.35 + 0.65 * t0);
    const x1 = legW * (0.35 + 0.65 * t1);
    c.stroke(
      [
        [px - x0, y0],
        [px + x1, y1],
      ],
      1.4,
      INK,
    );
    c.stroke(
      [
        [px + x0, y0],
        [px - x1, y1],
      ],
      1.4,
      INK,
    );
  }
  c.stroke(
    [
      [px - legW * 1.15, top + h * 0.05],
      [px + legW * 1.15, top + h * 0.05],
    ],
    2.2,
    INK,
  );
  c.stroke(
    [
      [px - legW * 0.85, top + h * 0.16],
      [px + legW * 0.85, top + h * 0.16],
    ],
    1.8,
    INK,
  );
  c.stroke(
    [
      [px - legW * 1.1, top + h * 0.05],
      [x + w * 0.02, top + h * 0.2],
    ],
    1.4,
    INK,
  );
  c.stroke(
    [
      [px + legW * 1.1, top + h * 0.05],
      [x + w * 0.95, top + h * 0.12],
      [x + w * 0.9, top + h * 0.34],
    ],
    1.4,
    INK,
  );
  c.poly(
    [
      [x + w * 0.76, y + h * 0.36],
      [x + w * 0.64, y + h * 0.54],
      [x + w * 0.74, y + h * 0.54],
      [x + w * 0.62, y + h * 0.72],
      [x + w * 0.8, y + h * 0.5],
      [x + w * 0.7, y + h * 0.5],
    ],
    RED,
  );
  const sy = y + h * 0.88;
  c.fillRect(x + w * 0.6, sy - h * 0.16, w * 0.1, h * 0.16, INK);
  c.fillRect(x + w * 0.74, sy - h * 0.1, w * 0.09, h * 0.1, INK);
  c.fillRect(x + w * 0.86, sy - h * 0.22, w * 0.1, h * 0.22, INK);
  c.fillRect(x, sy, w * 0.5, h * 0.022, INK);
};

const drawChip = (c: Canvas, x: number, y: number, w: number, h: number): void => {
  const s = Math.min(w * 0.42, h * 0.56);
  const cx = x + w * 0.02;
  const cy = y + (h - s) / 2;
  c.fillRect(cx, cy, s, s, INK);
  const inner = s * 0.52;
  c.fillRect(cx + (s - inner) / 2, cy + (s - inner) / 2, inner, inner, PAPER);
  c.fillRect(cx + (s - inner) / 2, cy + (s - inner) / 2 + inner * 0.62, inner, inner * 0.38, RED);
  for (let i = 0; i < 4; i++) {
    const off = s * (0.14 + i * 0.22);
    c.fillRect(cx + off, cy - s * 0.11, s * 0.07, s * 0.11, INK);
    c.fillRect(cx + off, cy + s, s * 0.07, s * 0.11, INK);
    c.fillRect(cx - s * 0.11, cy + off, s * 0.11, s * 0.07, INK);
    c.fillRect(cx + s, cy + off, s * 0.11, s * 0.07, INK);
  }
  c.stroke(
    [
      [x + w * 0.56, y + h * 0.26],
      [x + w * 0.66, y + h * 0.46],
      [x + w * 0.74, y + h * 0.38],
      [x + w * 0.88, y + h * 0.7],
    ],
    2.4,
    RED,
  );
  c.poly(
    [
      [x + w * 0.92, y + h * 0.72],
      [x + w * 0.83, y + h * 0.73],
      [x + w * 0.9, y + h * 0.58],
    ],
    RED,
  );
  c.stroke(
    [
      [x + w * 0.56, y + h * 0.66],
      [x + w * 0.68, y + h * 0.6],
      [x + w * 0.8, y + h * 0.66],
    ],
    1.6,
    mix(INK, PAPER, 0.5),
  );
};

const drawPort = (c: Canvas, x: number, y: number, w: number, h: number): void => {
  const baseY = y + h * 0.82;
  const cx = x + w * 0.16;
  c.stroke(
    [
      [cx, baseY],
      [cx, y + h * 0.2],
    ],
    2.6,
    INK,
  );
  c.stroke(
    [
      [cx - w * 0.04, baseY],
      [cx + w * 0.04, baseY],
    ],
    2.6,
    INK,
  );
  c.stroke(
    [
      [cx - w * 0.1, y + h * 0.2],
      [cx + w * 0.32, y + h * 0.2],
    ],
    2.6,
    INK,
  );
  c.stroke(
    [
      [cx, y + h * 0.08],
      [cx + w * 0.15, y + h * 0.2],
    ],
    1.8,
    INK,
  );
  c.stroke(
    [
      [cx + w * 0.26, y + h * 0.2],
      [cx + w * 0.26, y + h * 0.4],
    ],
    1.4,
    INK,
  );
  c.fillRect(cx + w * 0.225, y + h * 0.4, w * 0.07, h * 0.06, RED);
  const cols = [0.34, 0.45, 0.56];
  cols.forEach((f, i) => {
    const ch = h * 0.09;
    c.fillRect(x + w * f, baseY - ch, w * 0.095, ch, INK);
    c.fillRect(x + w * f, baseY - ch * 2 - 1.5, w * 0.095, ch, i === 1 ? RED : mix(INK, PAPER, 0.45));
  });
  c.fillRect(x + w * 0.34, baseY - h * 0.02, w * 0.31, h * 0.02, INK);
  c.stroke(
    [
      [x + w * 0.84, y + h * 0.66],
      [x + w * 0.84, y + h * 0.22],
    ],
    2.4,
    RED,
  );
  c.poly(
    [
      [x + w * 0.84, y + h * 0.1],
      [x + w * 0.92, y + h * 0.27],
      [x + w * 0.76, y + h * 0.27],
    ],
    RED,
  );
};

const drawTent = (c: Canvas, x: number, y: number, w: number, h: number): void => {
  const baseY = y + h * 0.8;
  const tw = w * 0.44;
  const tx = x + w * 0.02;
  c.stroke(
    [
      [tx, baseY],
      [tx + tw / 2, y + h * 0.18],
      [tx + tw, baseY],
    ],
    2.6,
    INK,
  );
  c.poly(
    [
      [tx + tw * 0.43, baseY],
      [tx + tw * 0.5, y + h * 0.4],
      [tx + tw * 0.57, baseY],
    ],
    INK,
  );
  c.stroke(
    [
      [tx, baseY],
      [tx + tw, baseY],
    ],
    2,
    INK,
  );
  for (let i = 0; i < 8; i++) {
    const rx = x + w * (0.1 + (i % 4) * 0.095);
    const ry = y + h * (0.1 + Math.floor(i / 4) * 0.1);
    c.stroke(
      [
        [rx, ry],
        [rx - w * 0.012, ry + h * 0.07],
      ],
      1.5,
      mix(INK, PAPER, 0.55),
    );
  }
  c.poly(
    [
      [x + w * 0.02, baseY + h * 0.11],
      [x + w * 0.18, baseY + h * 0.08],
      [x + w * 0.42, baseY + h * 0.13],
      [x + w * 0.18, baseY + h * 0.16],
    ],
    mix(INK, PAPER, 0.35),
  );
  const hx = x + w * 0.79;
  const hy = y + h * 0.46;
  c.poly(
    [
      [hx, hy - h * 0.22],
      [hx + w * 0.13, hy + h * 0.12],
      [hx - w * 0.13, hy + h * 0.12],
    ],
    RED,
  );
  drawText(c, '!', hx, hy + h * 0.07, h * 0.18, PAPER, { align: 'center', weight: 1.0 });
};

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

const M = 40;
const RIGHT = W - M;
const BODY_TOP = 288;
const BODY_BOTTOM = 930;

const kicker = (c: Canvas, d: Dispatch, x: number, y: number, width: number, onInk: boolean): void => {
  const inkCol = onInk ? PAPER : INK;
  const mutedCol = onInk ? mix(INK, PAPER, 0.55) : MUTED;
  c.fillRect(x, y - 13, 17, 17, RED);
  drawText(c, d.n, x + 8.5, y, 8.5, PAPER, { align: 'center', weight: 1.0, tracking: 0 });
  drawText(c, d.place, x + 25, y, 11, inkCol, { weight: 1.0, tracking: 0.1 });
  let beatSize = 9.5;
  while (beatSize > 7 && measure(d.beat, beatSize, 0.14) > width * 0.44) beatSize -= 0.5;
  drawText(c, d.beat, x + width, y, beatSize, mutedCol, { align: 'right', tracking: 0.14 });
};

const rule = (c: Canvas, x: number, y: number, w: number, color: RGB, t = 1): void => {
  c.fillRect(x, y, w, t, color);
};

const render = (): Uint8Array => {
  const c = new Canvas(W * SS, H * SS);
  const contentW = RIGHT - M;

  c.fillRect(0, 0, W, H, PAPER);

  // Masthead
  drawText(c, 'WORLD NEWS', M, 62, 19, INK, { weight: 1.3, tracking: 0.16 });
  drawText(c, 'ONE DAY · SIX DISPATCHES', RIGHT, 60, 10.5, MUTED, { align: 'right', tracking: 0.2 });
  rule(c, M, 74, contentW, INK, 3);

  // The day
  drawText(c, 'TUESDAY', M, 96, 12, RED, { weight: 1.1, tracking: 0.24 });
  drawText(c, '24', M - 6, 270, 148, INK, { weight: 0.72, tracking: 0 });
  c.fillRect(300, 138, 3, 120, RED);
  drawText(c, 'NOVEMBER', 320, 198, 30, INK, { weight: 1.05, tracking: 0.04 });
  drawText(c, '2026', 320, 240, 30, RED, { weight: 1.05, tracking: 0.04 });

  // The day in numbers
  const NX = 596;
  const NW = RIGHT - NX;
  drawText(c, 'THE DAY IN NUMBERS', NX, 98, 9, MUTED, { tracking: 0.18 });
  const figures: [string, string][] = [
    ['3', 'TANKERS SET ABLAZE, IRGC NAVY SAYS'],
    ['1,144', 'CHILDREN KILLED OR HURT IN UKRAINE, UNICEF'],
    ['41', 'CIVILIANS KILLED IN YEMEN IN A DAY, HOUTHIS SAY'],
    ['6.1%', "SINGAPORE'S THIRD-QUARTER GROWTH"],
  ];
  const cellW = NW / 2;
  const cellH = 72;
  figures.forEach(([fig, label], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = NX + col * cellW;
    const cy = 112 + row * cellH;
    drawText(c, fig, cx, cy + 34, 30, col === 0 && row === 0 ? RED : INK, { weight: 0.95, tracking: 0.02 });
    const lab = fit(label, cellW - 18, 2, 8, 7, 1.22);
    drawFitted(c, lab, cx, cy + 50, MUTED, 0.8);
  });
  rule(c, NX + cellW - 8, 112, 1, LINE, 138);
  rule(c, NX, 178, NW, LINE, 1);

  // ---- Left column: the lead, then Gaza ----
  const LX = M;
  const LW = 456;
  const heroY = BODY_TOP;
  const heroH = 448;
  const HX = LX + 22;
  const HW = LW - 44;

  c.fillRect(LX, heroY, LW, heroH, INK);
  c.fillRect(LX, heroY, 5, heroH, RED);
  drawText(c, 'LEAD DISPATCH · 24 NOVEMBER 2026', HX, heroY + 24, 8.5, mix(INK, PAPER, 0.62), { tracking: 0.18 });
  kicker(c, DISPATCHES[0], HX, heroY + 52, HW, true);

  drawStrait(c, HX, heroY + 66, HW, 176);

  const heroHead = fit(DISPATCHES[0].head, HW, 2, 30, 22, 1.4);
  drawFitted(c, heroHead, HX, heroY + 284, PAPER, 1.08);
  const heroFactY = heroY + 284 + (heroHead.lines.length - 1) * heroHead.lead + 34;
  const heroFact = fit(DISPATCHES[0].fact, HW, 4, 13, 10, 1.55);
  drawFitted(c, heroFact, HX, heroFactY, mix(INK, PAPER, 0.78), 0.8);

  // Gaza panel
  const gY = heroY + heroH + 16;
  const gH = BODY_BOTTOM - gY;
  rule(c, LX, gY, LW, INK, 2);
  kicker(c, DISPATCHES[5], LX, gY + 24, 316, false);
  const gHead = fit(DISPATCHES[5].head, 316, 2, 22, 16, 1.36);
  drawFitted(c, gHead, LX, gY + 54, INK, 1.02);
  const gFactY = gY + 54 + (gHead.lines.length - 1) * gHead.lead + 22;
  const gFact = fit(DISPATCHES[5].fact, 316, 4, 11, 9, 1.34);
  drawFitted(c, gFact, LX, gFactY, MUTED, 0.76);
  drawTent(c, LX + 330, gY + 26, 126, gH - 44);

  // ---- Right column: four dispatches ----
  const RX = M + LW + 18;
  const RW = RIGHT - RX;
  const gap = 12;
  const ph = (BODY_BOTTOM - BODY_TOP - gap * 3) / 4;
  const icons = [drawBomb, drawGrid, drawChip, drawPort];
  let headSize = 20;
  while (headSize > 15 && DISPATCHES.slice(1, 5).some((d) => wrap(d.head, headSize, RW - 112).length > 2)) {
    headSize -= 0.5;
  }
  for (let i = 0; i < 4; i++) {
    const d = DISPATCHES[i + 1];
    const py = BODY_TOP + i * (ph + gap);
    rule(c, RX, py, RW, LINE, 1);
    kicker(c, d, RX, py + 20, RW, false);
    icons[i](c, RX + RW - 100, py + 24, 100, 62);
    const head = { lines: wrap(d.head, headSize, RW - 112), size: headSize, lead: headSize * 1.4 };
    drawFitted(c, head, RX, py + 48, INK, 1.02);
    const fact = fit(d.fact, RW, 3, 10.5, 9, 1.32);
    drawFitted(c, fact, RX, py + 100, MUTED, 0.74);
  }

  // Footer
  rule(c, M, H - 84, contentW, INK, 2);
  drawText(
    c,
    'REPORTS OF 24 NOVEMBER 2026: AP · REUTERS · ANADOLU · DEMOCRACY NOW! · CNBC',
    M,
    H - 58,
    9.5,
    MUTED,
    { tracking: 0.1 },
  );
  drawText(c, 'COMPILED AS THE DAY CLOSED, IN ANY TIME ZONE', M, H - 38, 8.5, MUTED, { tracking: 0.1 });
  drawText(c, '24 · 11 · 2026', RIGHT, H - 38, 10.5, RED, { align: 'right', weight: 1.1, tracking: 0.12 });

  return c.resolve();
};

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const rgb = render();
writeFileSync(join(outDir, 'entry.png'), png(rgb, W, H));
