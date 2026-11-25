// world-news-20261124 — one front page for Tuesday 24 November 2026: thirty
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
// List body copy: darker than the captions, so a sentence still has weight when
// the sheet is looked at three hundred pixels across, but short of the ink the
// bold keywords are set in.
const DARK: RGB = [62, 58, 50];
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
  $: [
    [[4, 1], [3, 0], [1, 0], [0, 1], [0, 2.2], [1, 3.1], [3, 3.1], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]],
    [[2, -0.7], [2, 6.7]],
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
  // Marks set inside a drawn badge of their own, which registers the badge.
  silent?: boolean;
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

// Every word that reaches the page registers its measured box here, so the
// build can refuse to write a sheet on which two labels collide.
interface TextBox {
  label: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const BOXES: TextBox[] = [];
const LAYOUT_ERRORS: string[] = [];

const fail = (msg: string): void => {
  LAYOUT_ERRORS.push(msg);
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
  if (s.trim() && !opts.silent) {
    BOXES.push({ label: s.trim(), x0: cursor, x1: cursor + total, y0: baseline - size, y1: baseline + size * 0.12 });
  }
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
      if (!g) fail(`no glyph for "${ch}" in "${s}"`);
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

// Set at one size, no shrinking: the list is measured afterwards, and the build
// stops if a block turns out taller than the row it was given.
const typeset = (s: string, maxW: number, size: number, leadRatio: number): Fitted => ({
  lines: wrap(s, size, maxW),
  size,
  lead: Math.round(size * leadRatio * 10) / 10,
});

const blockHeight = (f: Fitted, firstBaseline: number): number =>
  firstBaseline + (f.lines.length - 1) * f.lead + f.size * 0.24;

// Pairwise collision test over every recorded box. Text that sits on a drawn
// rule or a colour block is fine; two pieces of type on each other are not.
const checkLayout = (): void => {
  for (const b of BOXES) {
    if (b.x0 < 30 || b.x1 > W - 36 || b.y0 < 6 || b.y1 > H - 30) {
      fail(`"${b.label}" crosses the page edge (${b.x0.toFixed(1)}-${b.x1.toFixed(1)}, ${b.y0.toFixed(1)}-${b.y1.toFixed(1)})`);
    }
  }
  for (let i = 0; i < BOXES.length; i++) {
    for (let j = i + 1; j < BOXES.length; j++) {
      const a = BOXES[i];
      const b = BOXES[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 0.6 && oy > 0.6) {
        fail(`"${a.label}" and "${b.label}" overlap by ${ox.toFixed(1)} x ${oy.toFixed(1)} px`);
      }
    }
  }
  if (LAYOUT_ERRORS.length) {
    console.error(`layout check failed: ${LAYOUT_ERRORS.length} problem(s)`);
    for (const e of LAYOUT_ERRORS.slice(0, 40)) console.error(`  ${e}`);
    throw new Error('layout check failed');
  }
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

type Scene = (c: Canvas, x: number, y: number, w: number, h: number) => void;

// A hairline water line with a few ticks: the horizon shared by the sea scenes.
const waterline = (c: Canvas, x: number, y: number, w: number, h: number, at: number): number => {
  const wy = y + h * at;
  c.fillRect(x, wy, w, 0.9, mix(INK, PAPER, 0.5));
  for (let i = 0; i < 6; i++) {
    const wx = x + w * (0.04 + i * 0.17);
    c.fillRect(wx, wy + h * (0.12 + (i % 2) * 0.1), w * 0.06, 0.8, mix(INK, PAPER, 0.62));
  }
  return wy;
};

// A tanker as a flat silhouette: hull, bridge, a row of deck tanks.
const tanker = (c: Canvas, x: number, base: number, w: number, h: number, colour: RGB): void => {
  c.poly([
    [x, base - h * 0.34],
    [x + w, base - h * 0.34],
    [x + w * 0.9, base],
    [x + w * 0.1, base],
  ], colour);
  c.fillRect(x + w * 0.78, base - h * 0.9, w * 0.12, h * 0.58, colour);
  c.fillRect(x + w * 0.82, base - h * 1.12, w * 0.04, h * 0.24, colour);
  for (let i = 0; i < 3; i++) c.fillRect(x + w * (0.68 + i * 0.04), base - h * 0.62, w * 0.02, h * 0.2, mix(colour, PAPER, 0.55));
};

// 1. Hormuz: two tankers ablaze on the strait.
const sceneStrait: Scene = (c, x, y, w, h) => {
  const far = mix(INK, PAPER, 0.3);
  const water = waterline(c, x, y, w, h, 0.8);
  c.poly([
    [x, water], [x, water - h * 0.3], [x + w * 0.1, water - h * 0.5],
    [x + w * 0.18, water - h * 0.24], [x + w * 0.28, water - h * 0.4], [x + w * 0.36, water],
  ], far);
  tanker(c, x + w * 0.74, water, w * 0.22, h * 0.4, far);
  smoke(c, x + w * 0.84, water - h * 0.42, w * 0.09, h * 0.34, mix(INK, PAPER, 0.3));
  flame(c, x + w * 0.76, water - h * 0.16, w * 0.05, h * 0.2, RED, PAPER);
  tanker(c, x + w * 0.04, water, w * 0.46, h * 0.56, INK);
  smoke(c, x + w * 0.2, water - h * 0.46, w * 0.2, h * 0.44, mix(INK, PAPER, 0.36));
  flame(c, x + w * 0.1, water - h * 0.22, w * 0.12, h * 0.34, RED, PAPER);
  flame(c, x + w * 0.24, water - h * 0.22, w * 0.08, h * 0.24, RED, PAPER);
};

// 2. Riyadh: a broken tower, a drone overhead.
const sceneTower: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.95;
  const far = mix(INK, PAPER, 0.44);
  c.fillRect(x, base, w, 1.1, INK);
  c.fillRect(x + w * 0.02, y + h * 0.5, w * 0.13, base - (y + h * 0.5), far);
  c.fillRect(x + w * 0.17, y + h * 0.36, w * 0.11, base - (y + h * 0.36), far);
  c.fillRect(x + w * 0.31, y + h * 0.58, w * 0.12, base - (y + h * 0.58), INK);
  c.fillRect(x + w * 0.52, y + h * 0.24, w * 0.15, base - (y + h * 0.24), INK);
  c.poly([
    [x + w * 0.52, y + h * 0.24], [x + w * 0.595, y + h * 0.04], [x + w * 0.67, y + h * 0.24],
  ], INK);
  c.poly([
    [x + w * 0.56, y + h * 0.26], [x + w * 0.67, y + h * 0.32], [x + w * 0.65, y + h * 0.5],
    [x + w * 0.59, y + h * 0.42], [x + w * 0.56, y + h * 0.54],
  ], RED);
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 2; i++) c.fillRect(x + w * (0.545 + i * 0.075), y + h * (0.62 + r * 0.16), w * 0.035, h * 0.06, PAPER);
  }
  // drone: rotors, body, a red eye
  const dx = x + w * 0.24;
  const dy = y + h * 0.16;
  c.fillRect(dx - w * 0.13, dy, w * 0.26, 1.1, INK);
  c.fillRect(dx + w * 0.1, dy - h * 0.06, w * 0.03, h * 0.14, INK);
  c.fillRect(dx, dy - h * 0.02, w * 0.05, h * 0.14, INK);
  for (const s of [-0.13, 0.13]) c.disc(dx + w * s, dy, Math.max(1, h * 0.05), INK);
  c.fillRect(dx + w * 0.02, dy + h * 0.1, w * 0.02, h * 0.05, RED);
};

// 3. Villavicencio: the burst between two blocks, a car at the kerb.
const sceneBomb: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.93;
  const far = mix(INK, PAPER, 0.36);
  c.fillRect(x, base, w, 1.1, INK);
  c.fillRect(x + w * 0.02, y + h * 0.3, w * 0.28, base - (y + h * 0.3), far);
  c.fillRect(x + w * 0.7, y + h * 0.2, w * 0.26, base - (y + h * 0.2), INK);
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 2; i++) {
      c.fillRect(x + w * (0.05 + i * 0.08), y + h * (0.38 + r * 0.16), w * 0.04, h * 0.06, PAPER);
      c.fillRect(x + w * (0.74 + i * 0.075), y + h * (0.3 + r * 0.16), w * 0.035, h * 0.055, PAPER);
    }
  }
  c.poly([
    [x + w * 0.7, y + h * 0.24], [x + w * 0.72, y + h * 0.5], [x + w * 0.76, y + h * 0.36],
    [x + w * 0.8, y + h * 0.54], [x + w * 0.85, y + h * 0.34], [x + w * 0.94, y + h * 0.44],
    [x + w * 0.96, y + h * 0.2],
  ], RED);
  const bx = x + w * 0.54;
  const by = y + h * 0.52;
  const star: [number, number][] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = i % 2 ? h * 0.2 : h * 0.48;
    star.push([bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.9]);
  }
  c.poly(star, RED);
  smoke(c, x + w * 0.5, y + h * 0.4, w * 0.11, h * 0.34, mix(INK, PAPER, 0.3));
  c.fillRect(x + w * 0.34, base - h * 0.16, w * 0.13, h * 0.12, INK);
  c.fillRect(x + w * 0.37, base - h * 0.24, w * 0.06, h * 0.1, INK);
  c.disc(x + w * 0.37, base - h * 0.03, Math.max(1, h * 0.04), INK);
  c.disc(x + w * 0.45, base - h * 0.03, Math.max(1, h * 0.04), INK);
};

// 4. Washington: a closing tape, down.
const sceneMarket: Scene = (c, x, y, w, h) => {
  const g = mix(INK, PAPER, 0.76);
  for (let i = 0; i < 4; i++) c.fillRect(x, y + h * (0.16 + i * 0.2), w * 0.66, 0.7, g);
  for (let i = 0; i < 5; i++) c.fillRect(x + w * (0.02 + i * 0.14), y + h * 0.12, 0.7, h * 0.66, g);
  const pts: [number, number][] = [
    [x + w * 0.02, y + h * 0.2], [x + w * 0.14, y + h * 0.32], [x + w * 0.22, y + h * 0.27],
    [x + w * 0.34, y + h * 0.46], [x + w * 0.42, y + h * 0.41], [x + w * 0.54, y + h * 0.62],
    [x + w * 0.62, y + h * 0.57], [x + w * 0.7, y + h * 0.76],
  ];
  c.stroke(pts, 2, INK);
  for (const p of pts.slice(1)) c.disc(p[0], p[1], 1.5, RED);
  const ax = x + w * 0.86;
  c.stroke([[ax, y + h * 0.16], [ax, y + h * 0.6]], 3.4, RED);
  c.poly([
    [ax, y + h * 0.86], [ax - w * 0.055, y + h * 0.58], [ax + w * 0.055, y + h * 0.58],
  ], RED);
  for (let i = 0; i < 7; i++) {
    c.fillRect(x + w * (0.02 + i * 0.07), y + h * 0.9, w * 0.035, h * 0.06, i % 3 === 0 ? RED : mix(INK, PAPER, 0.5));
  }
};

// 5. Tennessee: the ballot and the seat count.
const sceneBallot: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.94;
  c.fillRect(x, base, w, 1.1, INK);
  const bw = w * 0.3;
  const bh = h * 0.5;
  const bx = x + w * 0.03;
  const by = base - bh;
  c.fillRect(bx, by, bw, bh, INK);
  c.fillRect(bx + bw * 0.14, by + bh * 0.14, bw * 0.72, 1.7, PAPER);
  const sw = bw * 0.46;
  c.fillRect(bx + bw * 0.2, by - h * 0.42, sw, h * 0.48, PAPER);
  c.stroke([
    [bx + bw * 0.2, by - h * 0.42], [bx + bw * 0.2 + sw, by - h * 0.42],
    [bx + bw * 0.2 + sw, by + h * 0.02],
  ], 1.1, INK);
  for (let i = 0; i < 3; i++) c.fillRect(bx + bw * 0.3, by - h * 0.34 + i * h * 0.1, bw * 0.24, 1.2, INK);
  const sq = w * 0.052;
  for (let i = 0; i < 7; i++) {
    const sx = x + w * 0.46 + i * (sq + w * 0.022);
    if (i < 5) {
      c.fillRect(sx, base - sq, sq, sq, i === 0 ? RED : INK);
    } else {
      c.fillRect(sx, base - sq, sq, 1.1, INK);
      c.fillRect(sx, base - 1.1, sq, 1.1, INK);
      c.fillRect(sx, base - sq, 1.1, sq, INK);
      c.fillRect(sx + sq - 1.1, base - sq, 1.1, sq, INK);
    }
  }
};

// 6. Brasilia: the chamber and the tally.
const sceneVote: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.92;
  c.fillRect(x, base + h * 0.06, w, 1.1, mix(INK, PAPER, 0.35));
  const cx = x + w * 0.26;
  const cy = base + h * 0.12;
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      const rad = h * (0.3 + r * 0.22);
      c.disc(cx + Math.cos(a) * rad * 1.7, cy + Math.sin(a) * rad, Math.max(1, h * 0.045), mix(INK, PAPER, r === 0 ? 0 : 0.25));
    }
  }
  c.fillRect(x + w * 0.58, base - h * 0.56, w * 0.38, h * 0.15, INK);
  c.fillRect(x + w * 0.58, base - h * 0.32, w * 0.15, h * 0.15, RED);
  c.fillRect(x + w * 0.58, base - h * 0.06, w * 0.38, 1, mix(INK, PAPER, 0.55));
  for (let i = 0; i < 3; i++) c.fillRect(x + w * (0.6 + i * 0.12), base - h * 0.6, 0.9, h * 0.22, PAPER);
};

// 7. Wolfsburg: the gate, the banner, the stopped line.
const sceneFactory: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.93;
  c.fillRect(x, base, w, 1.1, INK);
  c.poly([
    [x + w * 0.02, base], [x + w * 0.02, y + h * 0.52], [x + w * 0.13, y + h * 0.34],
    [x + w * 0.13, y + h * 0.52], [x + w * 0.24, y + h * 0.34], [x + w * 0.24, y + h * 0.52],
    [x + w * 0.35, y + h * 0.34], [x + w * 0.35, base],
  ], INK);
  c.fillRect(x + w * 0.4, y + h * 0.1, w * 0.045, h * 0.83, INK);
  c.fillRect(x + w * 0.49, y + h * 0.26, w * 0.04, h * 0.67, INK);
  smoke(c, x + w * 0.42, y + h * 0.12, w * 0.06, h * 0.22, mix(INK, PAPER, 0.45));
  c.fillRect(x + w * 0.66, base - h * 0.4, w * 0.05, h * 0.4, INK);
  c.fillRect(x + w * 0.9, base - h * 0.4, w * 0.05, h * 0.4, INK);
  c.fillRect(x + w * 0.64, base - h * 0.56, w * 0.34, h * 0.12, RED);
  for (let i = 0; i < 3; i++) c.fillRect(x + w * (0.6 + i * 0.07), base - h * 0.24, w * 0.045, h * 0.06, mix(INK, PAPER, 0.3));
};

// 8. Ituri: the maternity ward, a red cross, the responders.
const sceneClinic: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.93;
  c.fillRect(x, base, w, 1.1, mix(INK, PAPER, 0.4));
  c.poly([[x + w * 0.05, base], [x + w * 0.27, y + h * 0.14], [x + w * 0.49, base]], INK);
  c.poly([[x + w * 0.23, base], [x + w * 0.27, y + h * 0.5], [x + w * 0.31, base]], PAPER);
  c.fillRect(x + w * 0.253, y + h * 0.28, w * 0.034, h * 0.22, RED);
  c.fillRect(x + w * 0.235, y + h * 0.36, w * 0.07, h * 0.07, RED);
  for (const px of [0.64, 0.8]) {
    c.disc(x + w * px, y + h * 0.38, Math.max(1.4, h * 0.1), INK);
    c.poly([
      [x + w * px - w * 0.06, base], [x + w * px, y + h * 0.48], [x + w * px + w * 0.06, base],
    ], px > 0.7 ? mix(INK, PAPER, 0.2) : INK);
  }
  c.stroke([[x + w * 0.56, y + h * 0.66], [x + w * 0.95, y + h * 0.56]], 1.2, RED);
};

// 9. Khan Younis: the drone over the tents.
const sceneDrone: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.94;
  c.fillRect(x, base, w, 1.1, INK);
  for (const tx of [0.06, 0.3]) {
    c.poly([[x + w * tx, base], [x + w * (tx + 0.09), y + h * 0.5], [x + w * (tx + 0.18), base]], INK);
    c.fillRect(x + w * (tx + 0.08), base - h * 0.16, w * 0.02, h * 0.16, PAPER);
  }
  const bx = x + w * 0.55;
  const by = y + h * 0.5;
  const star: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 ? h * 0.2 : h * 0.45;
    star.push([bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.9]);
  }
  c.poly(star, RED);
  const dx = x + w * 0.68;
  const dy = y + h * 0.18;
  c.fillRect(dx - w * 0.14, dy, w * 0.28, 1.2, INK);
  for (const s of [-0.14, 0.14]) {
    c.fillRect(dx + w * s, dy - h * 0.06, w * 0.025, h * 0.14, INK);
    c.disc(dx + w * s, dy - h * 0.04, Math.max(1, h * 0.04), INK);
  }
  c.fillRect(dx - w * 0.045, dy - h * 0.03, w * 0.09, h * 0.12, INK);
  c.fillRect(dx - w * 0.015, dy + h * 0.09, w * 0.03, h * 0.05, RED);
};

// 10. Baghdad: derricks, a pipeline, a flare.
const sceneDerrick: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.9;
  c.fillRect(x, base, w, 1.1, mix(INK, PAPER, 0.3));
  const derrick = (dx: number, dw: number, dh: number) => {
    c.stroke([[dx, base], [dx + dw * 0.5, base - dh]], 2, INK);
    c.stroke([[dx + dw, base], [dx + dw * 0.5, base - dh]], 2, INK);
    for (let i = 1; i < 4; i++) {
      const yy = base - (dh * i) / 4;
      c.fillRect(dx + dw * 0.5 * (i / 4), yy, dw * (1 - i / 2), 1, INK);
    }
    c.fillRect(dx + dw * 0.4, base - dh - 1, dw * 0.2, 1.4, INK);
  };
  derrick(x + w * 0.05, w * 0.17, h * 0.74);
  derrick(x + w * 0.28, w * 0.15, h * 0.56);
  c.fillRect(x + w * 0.16, base - h * 0.2, w * 0.55, h * 0.1, INK);
  c.fillRect(x + w * 0.7, base - h * 0.2, w * 0.025, h * 0.22, INK);
  c.fillRect(x + w * 0.8, base - h * 0.14, w * 0.07, h * 0.14, INK);
  flame(c, x + w * 0.815, base - h * 0.14, w * 0.07, h * 0.42, RED, PAPER);
};

// 11. Jiuquan: the stack clear of the tower.
const sceneRocket: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.94;
  c.fillRect(x, base, w, 1.2, INK);
  c.fillRect(x + w * 0.6, base - h * 0.06, w * 0.16, h * 0.06, INK);
  const gx = x + w * 0.28;
  for (let i = 0; i < 3; i++) c.fillRect(gx + i * w * 0.045, y + h * 0.1, 1.2, base - (y + h * 0.1), INK);
  for (let i = 1; i < 4; i++) c.fillRect(gx, y + h * (0.1 + i * 0.2), w * 0.09, 1, INK);
  const rx = x + w * 0.52;
  const rw = w * 0.1;
  c.poly([
    [rx, y + h * 0.62], [rx, y + h * 0.24], [rx + rw * 0.5, y + h * 0.06],
    [rx + rw, y + h * 0.24], [rx + rw, y + h * 0.62],
  ], INK);
  c.poly([[rx - w * 0.025, y + h * 0.62], [rx, y + h * 0.44], [rx, y + h * 0.62]], INK);
  c.poly([[rx + rw + w * 0.025, y + h * 0.62], [rx + rw, y + h * 0.44], [rx + rw, y + h * 0.62]], INK);
  tongue(c, rx + rw * 0.5, y + h * 0.64, rw * 0.9, h * 0.3, RED, 0.06);
  tongue(c, rx + rw * 0.5, y + h * 0.64, rw * 0.45, h * 0.2, PAPER, 0.1);
  for (let i = 0; i < 3; i++) c.disc(x + w * (0.14 + i * 0.1), y + h * (0.78 - i * 0.04), h * 0.06, mix(INK, PAPER, 0.4));
};

// 12. Canberra: the pact piped under the seabed.
const sceneCarbon: Scene = (c, x, y, w, h) => {
  const sea = waterline(c, x, y, w, h, 0.34);
  c.poly([
    [x + w * 0.04, sea], [x + w * 0.24, sea], [x + w * 0.22, sea - h * 0.16], [x + w * 0.06, sea - h * 0.16],
  ], INK);
  c.fillRect(x + w * 0.15, sea - h * 0.28, w * 0.05, h * 0.12, INK);
  for (let i = 0; i < 3; i++) c.fillRect(x, y + h * (0.58 + i * 0.13), w, 0.9, mix(INK, PAPER, 0.62));
  c.stroke([
    [x + w * 0.17, sea], [x + w * 0.5, y + h * 0.5], [x + w * 0.78, y + h * 0.62], [x + w * 0.86, y + h * 0.82],
  ], 2.6, INK);
  c.poly([
    [x + w * 0.9, y + h * 0.9], [x + w * 0.81, y + h * 0.74], [x + w * 0.94, y + h * 0.76],
  ], RED);
  for (let i = 0; i < 4; i++) {
    c.disc(x + w * (0.33 + i * 0.05), y + h * (0.46 - i * 0.06), Math.max(1, h * 0.04), mix(INK, PAPER, 0.35));
  }
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
  a?: readonly [number, number];
  key?: string;
  icon?: (c: Canvas, x: number, y: number) => void;
  head?: string;
  deck?: string;
  theme?: Theme;
  art?: Scene;
}

// Five beats, five inks: the band at the head of a card says which one it is
// before a word is read.
type Theme = 'CONFLICT' | 'POLITICS' | 'ECONOMY' | 'HEALTH' | 'CLIMATE';
const THEME_INK: Readonly<Record<Theme, RGB>> = {
  CONFLICT: RED,
  POLITICS: [74, 92, 126],
  ECONOMY: [150, 108, 44],
  HEALTH: [40, 116, 104],
  CLIMATE: [78, 120, 66],
};

// Pictograms for the list. Each is 13 by 11 and built from the same flat fills
// and hairlines as the rest of the sheet, so a reader at thumbnail size can tell
// a ballot box from a derrick before reading a word of the sentence below. Every
// one of the twenty-seven is a different drawing, and the build checks that
// claim rather than trusting it (see iconSignature).
const IW = 13;
const IH = 11;

// A pictogram's fingerprint: draw it alone on paper, then record which of its 13
// by 11 cells carry ink. Two entries with the same string are the same mark, and
// the build refuses to write a sheet that repeats one.
const iconSignature = (draw: (c: Canvas, x: number, y: number) => void): string => {
  const c = new Canvas(IW * SS, IH * SS);
  c.fillRect(0, 0, IW, IH, PAPER);
  draw(c, 0, 0);
  const res = c.resolve();
  let bits = '';
  for (let gy = 0; gy < IH; gy++) {
    for (let gx = 0; gx < IW; gx++) {
      let shade = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((gy * SS + sy) * (IW * SS) + (gx * SS + sx)) * 3;
          shade += PAPER[0] - res[i] + (PAPER[1] - res[i + 1]) + (PAPER[2] - res[i + 2]);
        }
      }
      bits += shade > 90 ? '1' : '0';
    }
  }
  return bits;
};

const icoChart = (c: Canvas, x: number, y: number): void => {
  c.fillRect(x + 1, y + 5, 3, 6, INK);
  c.fillRect(x + 5, y + 2.5, 3, 8.5, INK);
  c.fillRect(x + 9, y + 0.5, 3, 10.5, RED);
};

const icoDome = (c: Canvas, x: number, y: number): void => {
  c.disc(x + 6.5, y + 8.6, 4.8, INK);
  c.fillRect(x + 0.6, y + 8.6, 11.8, 1.5, INK);
  c.fillRect(x + 5.4, y + 6.2, 2.2, 4, PAPER);
};

const icoNote = (c: Canvas, x: number, y: number): void => {
  c.fillRect(x + 0.5, y + 2.4, 12, 1.1, INK);
  c.fillRect(x + 0.5, y + 7.7, 12, 1.1, INK);
  c.fillRect(x + 0.5, y + 2.4, 1.1, 6.4, INK);
  c.fillRect(x + 11.4, y + 2.4, 1.1, 6.4, INK);
  c.disc(x + 6.5, y + 5.5, 1.9, INK);
};

const icoBurst = (c: Canvas, x: number, y: number): void => {
  const pts: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12 - Math.PI / 2;
    const r = i % 2 ? 2.7 : 6.3;
    pts.push([x + 6.5 + Math.cos(a) * r, y + 5.5 + Math.sin(a) * r]);
  }
  c.poly(pts, INK);
};

const icoBomb = (c: Canvas, x: number, y: number): void => {
  c.disc(x + 5.2, y + 6.6, 3.4, INK);
  c.stroke([[x + 7.8, y + 4.2], [x + 9.4, y + 2.2]], 1.3, INK);
  c.poly([[x + 9.4, y + 0.8], [x + 11.8, y + 0.4], [x + 11.2, y + 2.6]], INK);
};

const icoDerrick = (c: Canvas, x: number, y: number): void => {
  c.stroke([[x + 2.4, y + 10.4], [x + 5.6, y + 1.6]], 1.9, INK);
  c.stroke([[x + 11, y + 10.4], [x + 7.4, y + 1.6]], 1.9, INK);
  c.fillRect(x + 4.6, y + 0.6, 3.6, 1.2, INK);
  c.fillRect(x + 4.2, y + 4.4, 4.6, 0.9, INK);
  c.fillRect(x + 3.4, y + 7, 6.2, 0.9, INK);
  c.fillRect(x + 1.6, y + 9.8, 9.8, 1.2, INK);
};

// A crate of imports with a cap across it: the quota, not the cargo.
const icoQuota = (c: Canvas, x: number, y: number): void => {
  c.fillRect(x + 0.4, y + 2.8, 8.6, 6.6, INK);
  for (let i = 0; i < 3; i++) c.fillRect(x + 1.7 + i * 2.3, y + 3.5, 0.9, 5.2, PAPER);
  c.fillRect(x + 9.6, y + 0.8, 2.8, 9.8, RED);
};

const icoPlacard = (c: Canvas, x: number, y: number): void => {
  c.stroke([[x + 6.4, y + 10.4], [x + 5.2, y + 1.8]], 2, INK);
  c.fillRect(x + 1.8, y + 1, 7.4, 4.6, INK);
  c.fillRect(x + 3.2, y + 2.6, 4.4, 0.9, PAPER);
  c.fillRect(x + 3.2, y + 4, 3.2, 0.9, PAPER);
};

const icoRoundel = (c: Canvas, x: number, y: number): void => {
  c.disc(x + 6.5, y + 5.6, 4.8, INK);
  c.disc(x + 6.5, y + 5.6, 2.8, PAPER);
  c.fillRect(x + 1, y + 4.7, 11, 1.9, RED);
};

const icoCross = (c: Canvas, x: number, y: number): void => {
  c.fillRect(x + 5.2, y + 0.8, 2.6, 9.6, INK);
  c.fillRect(x + 1.4, y + 4.3, 10.2, 2.6, INK);
};

const icoCrowd = (c: Canvas, x: number, y: number): void => {
  c.disc(x + 2.6, y + 3.2, 1.9, INK);
  c.disc(x + 6.5, y + 1.8, 1.9, INK);
  c.disc(x + 10.4, y + 3.2, 1.9, INK);
  c.poly([[x + 0.2, y + 10.4], [x + 2.6, y + 5.6], [x + 5, y + 10.4]], INK);
  c.poly([[x + 4.2, y + 10.4], [x + 6.5, y + 4.2], [x + 8.8, y + 10.4]], INK);
  c.poly([[x + 8, y + 10.4], [x + 10.4, y + 5.6], [x + 12.8, y + 10.4]], INK);
};

const icoPerson = (c: Canvas, x: number, y: number): void => {
  c.disc(x + 6.5, y + 2.4, 2.3, INK);
  c.poly([[x + 3, y + 10.6], [x + 6.5, y + 5.4], [x + 10, y + 10.6]], INK);
  c.fillRect(x + 1.6, y + 6.2, 9.8, 1.4, INK);
};

const icoIngot = (c: Canvas, x: number, y: number): void => {
  c.poly([[x + 0.6, y + 9.6], [x + 12.4, y + 9.6], [x + 10.4, y + 4], [x + 2.6, y + 4]], INK);
  c.fillRect(x + 3.2, y + 5.2, 6.6, 1, PAPER);
};

const icoDrone = (c: Canvas, x: number, y: number): void => {
  c.stroke([[x + 2.2, y + 2.2], [x + 10.8, y + 9]], 1.6, INK);
  c.stroke([[x + 10.8, y + 2.2], [x + 2.2, y + 9]], 1.6, INK);
  c.disc(x + 2.2, y + 2.2, 1.7, INK);
  c.disc(x + 10.8, y + 2.2, 1.7, INK);
  c.disc(x + 2.2, y + 9, 1.7, INK);
  c.disc(x + 10.8, y + 9, 1.7, INK);
  c.disc(x + 6.5, y + 5.6, 2, RED);
};

const icoFlame = (c: Canvas, x: number, y: number): void => {
  c.poly(
    [[x + 6.5, y + 0.4], [x + 9.6, y + 5.4], [x + 9.2, y + 8.4], [x + 6.5, y + 10.6], [x + 3.8, y + 8.4], [x + 3.4, y + 5.4]],
    INK,
  );
  c.poly([[x + 6.5, y + 5], [x + 8.2, y + 7.6], [x + 6.5, y + 9.6], [x + 4.8, y + 7.6]], PAPER);
};

const icoPlane = (c: Canvas, x: number, y: number): void => {
  c.poly(
    [
      [x + 6.5, y + 0.4], [x + 7.9, y + 5], [x + 12.6, y + 7.2], [x + 12.4, y + 8.6],
      [x + 7.9, y + 7.4], [x + 7.9, y + 9.4], [x + 9.4, y + 10.6], [x + 9.2, y + 10.9],
      [x + 6.5, y + 10], [x + 3.8, y + 10.9], [x + 3.6, y + 10.6], [x + 5.1, y + 9.4],
      [x + 5.1, y + 7.4], [x + 0.6, y + 8.6], [x + 0.4, y + 7.2], [x + 5.1, y + 5],
    ],
    INK,
  );
};

// A pickaxe, handle planted: the mark for land opened up for a mine.
const icoPick = (c: Canvas, x: number, y: number): void => {
  c.stroke([[x + 1.6, y + 10.4], [x + 7, y + 3.1]], 1.7, INK);
  c.poly(
    [
      [x + 4.2, y + 3.2], [x + 7, y + 0.2], [x + 12.6, y + 1.2], [x + 12.8, y + 2.8],
      [x + 8.2, y + 2.3], [x + 5.9, y + 4.6],
    ],
    INK,
  );
};

// A refinery: a column, a tank beside it, burning at the top.
const icoRefinery = (c: Canvas, x: number, y: number): void => {
  c.fillRect(x + 1.2, y + 3.6, 4.2, 6.8, INK);
  c.fillRect(x + 6.8, y + 5.4, 4.2, 5, INK);
  c.fillRect(x + 5.4, y + 6.8, 1.4, 1.4, INK);
  c.poly(
    [
      [x + 3.3, y + 0.2], [x + 5, y + 2.2], [x + 4.7, y + 3.4], [x + 3.3, y + 3.7],
      [x + 1.9, y + 3.4], [x + 1.6, y + 2.2],
    ],
    RED,
  );
};

// A megaphone with sound coming out of it.
const icoMegaphone = (c: Canvas, x: number, y: number): void => {
  c.poly([[x + 0.8, y + 4], [x + 8, y + 1.4], [x + 8, y + 8.8], [x + 0.8, y + 6.2]], INK);
  c.fillRect(x + 3, y + 7.6, 1.8, 2.8, INK);
  c.stroke([[x + 10, y + 3.4], [x + 11.6, y + 5]], 1.6, INK);
  c.stroke([[x + 10, y + 6.6], [x + 11.6, y + 5]], 1.6, INK);
};

// A radar screen, one sweep lit.
const icoRadar = (c: Canvas, x: number, y: number): void => {
  c.fillRect(x + 0.6, y + 0.6, 10.8, 10.2, INK);
  c.fillRect(x + 2, y + 2, 8, 7.4, PAPER);
  c.annulus(x + 6, y + 5.7, 2.9, 0.9, INK);
  c.annulus(x + 6, y + 5.7, 1.4, 0.9, INK);
  c.poly([[x + 6, y + 5.7], [x + 9.4, y + 2.2], [x + 9.4, y + 5.7]], RED);
};

// An arrow doubling back on itself: a return.
const icoReturn = (c: Canvas, x: number, y: number): void => {
  c.stroke([[x + 1.4, y + 3], [x + 8.4, y + 3], [x + 10.8, y + 5.2], [x + 8.4, y + 7.4], [x + 4, y + 7.4]], 2, INK);
  c.poly([[x + 4, y + 5.2], [x + 0.6, y + 7.4], [x + 4, y + 9.6]], INK);
};

const icoArrow = (c: Canvas, x: number, y: number): void => {
  c.stroke([[x + 6.5, y + 10.6], [x + 6.5, y + 2.8]], 2.4, INK);
  c.poly([[x + 6.5, y + 0.4], [x + 11, y + 5.2], [x + 2, y + 5.2]], INK);
};

const icoWarship = (c: Canvas, x: number, y: number): void => {
  c.poly([[x + 0.4, y + 6.8], [x + 12.6, y + 6.8], [x + 10.6, y + 10.4], [x + 2.4, y + 10.4]], INK);
  c.fillRect(x + 4.2, y + 3.8, 3.2, 3, INK);
  c.fillRect(x + 5.5, y + 1, 0.9, 2.8, INK);
  c.fillRect(x + 8.4, y + 5.4, 3.2, 1.1, INK);
};

const icoScale = (c: Canvas, x: number, y: number): void => {
  c.stroke([[x + 6.5, y + 0.8], [x + 6.5, y + 10]], 1.7, INK);
  c.fillRect(x + 1.4, y + 0.8, 10.2, 1.2, INK);
  c.poly([[x + 1.4, y + 2], [x + 3.8, y + 2], [x + 2.6, y + 5]], INK);
  c.poly([[x + 9.2, y + 2], [x + 11.6, y + 2], [x + 10.4, y + 5]], INK);
  c.fillRect(x + 3, y + 9.8, 7, 1.3, INK);
};

const icoRocket = (c: Canvas, x: number, y: number): void => {
  c.poly([[x + 6.5, y + 0.2], [x + 8.6, y + 4], [x + 8.6, y + 8], [x + 4.4, y + 8], [x + 4.4, y + 4]], INK);
  c.poly([[x + 4.4, y + 5.6], [x + 2.2, y + 9.4], [x + 4.4, y + 8.4]], INK);
  c.poly([[x + 8.6, y + 5.6], [x + 10.8, y + 9.4], [x + 8.6, y + 8.4]], INK);
  c.poly([[x + 5.2, y + 8.6], [x + 6.5, y + 11], [x + 7.8, y + 8.6]], RED);
};

// A pipe driven down into rock layers: carbon put underground, offshore.
const icoCarbon = (c: Canvas, x: number, y: number): void => {
  c.fillRect(x + 5.7, y + 0.4, 1.6, 3.4, INK);
  c.poly([[x + 6.5, y + 6.7], [x + 3.3, y + 3.4], [x + 9.7, y + 3.4]], INK);
  c.fillRect(x + 0.4, y + 7.5, 12.2, 1.3, INK);
  c.fillRect(x + 2.4, y + 10, 8.2, 0.9, INK);
};

const icoGlobe = (c: Canvas, x: number, y: number): void => {
  c.disc(x + 6.5, y + 5.6, 5, INK);
  c.fillRect(x + 1.7, y + 5.1, 9.6, 1, PAPER);
  c.fillRect(x + 5.9, y + 0.7, 1.2, 9.8, PAPER);
  c.fillRect(x + 3.4, y + 2.6, 6.2, 0.9, PAPER);
  c.fillRect(x + 3.4, y + 8.2, 6.2, 0.9, PAPER);
};

// Where each badge sits, relative to its dot: hand-placed once so that crowded
// regions (Europe, the Gulf, the Sahel) fan out instead of stacking.
const ANCHOR: Readonly<Record<number, readonly [number, number]>> = {
  1: [26, 17],
  2: [14, -18],
  3: [-22, 14],
  4: [-30, 10],
  5: [12, 18],
  6: [-20, -16],
  7: [22, 10],
  8: [-18, 12],
  9: [26, 4],
  10: [-6, 6],
  11: [-24, 4],
  12: [-14, -14],
  13: [10, -14],
  14: [-16, 18],
  15: [20, -8],
  16: [12, -22],
  17: [-16, -18],
  18: [-26, 10],
  19: [-26, 6],
  20: [24, -6],
  21: [22, -10],
  22: [-24, 8],
  23: [-24, 12],
  24: [24, 4],
  25: [4, 22],
  26: [-20, -10],
  27: [26, 10],
  28: [0, -22],
  29: [26, -4],
  30: [10, -14],
  31: [8, 10],
  32: [-40, 24],
  33: [-14, -16],
};

// Every entry below was read on a page dated 24 November 2026. Figures are
// quoted as that page gave them, and contested figures are credited in the copy.
const STORIES: Story[] = [
  {
    n: 1,
    place: 'STRAIT OF HORMUZ',
    beat: 'MIDDLE EAST / SHIPPING',
    lat: 26.6,
    lon: 56.4,
    text: 'The Guard navy said three tankers hit mines; Washington widened sanctions.',
    key: 'MINES',
    head: 'MINES HIT TANKERS',
    deck: "Guard navy: three tankers hit mines; the US widened sanctions",
    theme: 'CONFLICT',
    art: sceneStrait,
  },
  {
    n: 2,
    place: 'RIYADH',
    beat: 'MIDDLE EAST / YEMEN WAR',
    lat: 24.7,
    lon: 46.7,
    text: "Saudi-led coalition: drone hit the capital's tallest tower; civil defence: at least 11 wounded.",
    key: 'STRIKE',
    head: 'DRONE HITS TOWER',
    deck: 'Coalition: drone hit tallest tower; at least 11 wounded',
    theme: 'CONFLICT',
    art: sceneTower,
  },
  {
    n: 3,
    place: 'VILLAVICENCIO',
    beat: 'SOUTH AMERICA / SECURITY',
    lat: 4.1,
    lon: -73.6,
    text: 'A car bomb outside regional government offices hurt at least 23, authorities said.',
    key: 'BOMB',
    head: 'CAR BOMB HURTS 23',
    deck: 'Authorities: at least 23 hurt in a car bomb at offices',
    theme: 'CONFLICT',
    art: sceneBomb,
  },
  {
    n: 4,
    place: 'WASHINGTON',
    beat: 'NORTH AMERICA / MARKETS',
    lat: 38.9,
    lon: -77.0,
    text: 'S&P 500 -0.5%, Nasdaq -1.5%; Dow +0.9% to 50,018.70',
    head: 'STOCKS END MIXED',
    deck: 'S&P 500 -0.5%, Nasdaq -1.5%; Dow +0.9% to 50,018.70',
    theme: 'ECONOMY',
    art: sceneMarket,
  },
  {
    n: 5,
    place: 'TENNESSEE',
    beat: 'NORTH AMERICA / CONGRESS',
    lat: 35.9,
    lon: -86.4,
    text: "Broderick wins the 4th district; Democrats reach 259 seats",
    head: 'DEMOCRATS TAKE 259',
    deck: "Broderick wins the 4th district; Democrats reach 259 seats",
    theme: 'POLITICS',
    art: sceneBallot,
  },
  {
    n: 6,
    key: 'MINING',
    icon: icoPick,
    place: 'TORONTO',
    beat: 'NORTH AMERICA / MINING',
    lat: 43.7,
    lon: -79.4,
    text: 'Ontario said it plans to legislate to fast-track new and expanded mines.',
  },
  {
    n: 7,
    place: 'BRASILIA',
    beat: 'SOUTH AMERICA / ECONOMY',
    lat: -15.8,
    lon: -47.9,
    text: 'Fiscal bill passes 353-128; the real slips near R$6',
    head: 'FISCAL BILL PASSES',
    deck: 'Fiscal bill passes 353-128; the real slips near R$6',
    theme: 'ECONOMY',
    art: sceneVote,
  },
  {
    n: 8,
    key: 'ATTACK',
    icon: icoBurst,
    place: 'ZAPORIZHZHIA',
    beat: 'EUROPE / WAR',
    lat: 47.8,
    lon: 35.2,
    text: 'A Russian strike killed two and wounded 22, a regional defence official said.',
  },
  {
    n: 9,
    key: 'REFINERY',
    icon: icoRefinery,
    place: 'MOSCOW',
    beat: 'EUROPE / ENERGY WAR',
    lat: 55.75,
    lon: 37.6,
    text: "Putin said retaliation for Ukrainian refinery strikes was 'inevitable'.",
  },
  {
    n: 10,
    key: 'WAR',
    icon: icoBomb,
    place: 'RIGA',
    beat: 'EUROPE / WAR',
    lat: 56.95,
    lon: 24.1,
    text: "Latvia's president said the war's tipping point could come next spring or summer.",
  },
  {
    n: 11,
    key: 'QUOTAS',
    icon: icoQuota,
    place: 'BRUSSELS',
    beat: 'EUROPE / TRADE',
    lat: 50.85,
    lon: 4.35,
    text: 'EU Commission set 200-day provisional quotas on hybrid cars from China, the UK, Japan and others.',
  },
  {
    n: 13,
    place: 'WOLFSBURG',
    beat: 'EUROPE / LABOUR',
    lat: 52.4,
    lon: 10.8,
    text: 'VW talks end without a deal; strikes possible 1 January',
    key: 'TALKS',
    head: 'VW TALKS FAIL',
    deck: 'VW talks end without a deal; strikes possible 1 January',
    theme: 'ECONOMY',
    art: sceneFactory,
  },
  {
    n: 14,
    key: 'TUBE',
    icon: icoRoundel,
    place: 'LONDON',
    beat: 'EUROPE / TRANSPORT',
    lat: 51.5,
    lon: -0.12,
    text: 'Tube drivers will begin rolling 24-hour strikes on Thursday, the RMT said.',
  },
  {
    n: 15,
    place: 'ITURI',
    beat: 'AFRICA / HEALTH',
    lat: 1.6,
    lon: 30.2,
    text: 'WHO staff shelter in a maternity ward since Saturday',
    head: 'EBOLA TRAPPED',
    deck: 'WHO staff shelter in a maternity ward since Saturday',
    theme: 'HEALTH',
    art: sceneClinic,
  },
  {
    n: 16,
    key: 'CURFEW',
    icon: icoMegaphone,
    place: 'DELTA STATE',
    beat: 'AFRICA / ELECTIONS',
    lat: 6.2,
    lon: 6.7,
    text: 'Delta state declared a curfew after four died at a political rally, AFP reported.',
  },
  {
    n: 17,
    key: 'ABDUCTED',
    icon: icoPerson,
    place: 'ED DAMAZIN',
    beat: 'AFRICA / SUDAN',
    lat: 11.8,
    lon: 34.35,
    text: 'The SIHA Network said 28 women and girls were abducted in Blue Nile state.',
  },
  {
    n: 18,
    key: 'GOLD',
    icon: icoIngot,
    place: 'WEST AFRICA',
    beat: 'AFRICA / GOLD',
    lat: 7.5,
    lon: -5.0,
    text: "Planned refining capacity above 1,000 tons a year tops the region's 585, Reuters found.",
  },
  {
    n: 19,
    place: 'KHAN YOUNIS',
    beat: 'MIDDLE EAST / GAZA',
    lat: 31.3,
    lon: 34.3,
    text: 'Jordan News: a drone kills 3 and wounds 5 at al-Mawasi',
    head: 'DRONE KILLS THREE',
    deck: 'Jordan News: a drone kills 3 and wounds 5 at al-Mawasi',
    theme: 'CONFLICT',
    art: sceneDrone,
  },
  {
    n: 20,
    place: 'BAGHDAD',
    beat: 'MIDDLE EAST / OIL',
    lat: 33.3,
    lon: 44.4,
    text: 'Iraq PM: ministry to take over oilfields, shut crossings',
    head: 'IRAQ MOVES ON OIL',
    deck: 'Iraq PM: ministry to take over oilfields, shut crossings',
    theme: 'CLIMATE',
    art: sceneDerrick,
  },
  {
    n: 21,
    key: 'JETS',
    icon: icoRadar,
    place: 'SEOUL',
    beat: 'ASIA / DEFENCE',
    lat: 37.6,
    lon: 127.0,
    text: 'Jets scrambled after Russian aircraft entered the zone, South Korea said.',
  },
  {
    n: 22,
    key: 'RETURN',
    icon: icoReturn,
    place: 'DHAKA',
    beat: 'ASIA / POLITICS',
    lat: 23.8,
    lon: 90.4,
    text: 'Hasina announced a 16 December return; a state minister said she must be extradited.',
  },
  {
    n: 23,
    key: 'GROWTH',
    icon: icoArrow,
    place: 'SINGAPORE',
    beat: 'ASIA / ECONOMY',
    lat: 1.35,
    lon: 103.8,
    text: 'The trade ministry said Q3 growth was 6.1% year on year, ahead of the 5.4% estimate.',
  },
  {
    n: 24,
    key: 'DRILL',
    icon: icoWarship,
    place: 'MANILA',
    beat: 'ASIA / MARITIME',
    lat: 14.6,
    lon: 121.0,
    text: 'Philippines practised holding the Luzon Strait with warships and BrahMos missiles.',
  },
  {
    n: 26,
    key: 'BLAST',
    icon: icoFlame,
    place: 'HANOI',
    beat: 'ASIA / DISASTER',
    lat: 21.03,
    lon: 105.85,
    text: 'A suspected gas explosion at an eatery killed six and hurt 10, officials said.',
  },
  {
    n: 27,
    key: 'COURT',
    icon: icoScale,
    place: 'TOKYO',
    beat: 'ASIA / JUSTICE',
    lat: 35.7,
    lon: 139.7,
    text: 'Japan pledged to pay its 2027 ICC dues by year-end, ahead of US sanctions due in April.',
  },
  {
    n: 28,
    place: 'JIUQUAN',
    beat: 'ASIA / SPACE',
    lat: 39.7,
    lon: 98.5,
    text: "Shenzhou-24 lifted off with Pakistan's Zeeshan Ali, China's first foreign astronaut bound for Tiangong.",
    head: 'SHENZHOU LIFTS OFF',
    deck: "Shenzhou-24 lifted off with Pakistan's Zeeshan Ali, China's first foreign astronaut bound for Tiangong.",
    theme: 'HEALTH',
    art: sceneRocket,
  },
  {
    n: 29,
    key: 'BOEING',
    icon: icoPlane,
    place: 'XIAMEN',
    beat: 'ASIA / AVIATION',
    lat: 24.5,
    lon: 118.1,
    text: 'Xiamen signed to buy 50 Boeing 737-8s at $7.4bn list price, pending approval.',
  },
  {
    n: 30,
    place: 'CANBERRA',
    beat: 'OCEANIA / DIPLOMACY',
    lat: -35.3,
    lon: 149.1,
    text: "Ministry: the two countries signed a CO2 and supply pact",
    head: 'CO2 PACT SIGNED',
    deck: "Ministry: the two countries signed a CO2 and supply pact",
    theme: 'CLIMATE',
    art: sceneCarbon,
  },
  {
    n: 32,
    key: 'CLIMATE',
    icon: icoGlobe,
    place: 'SUVA',
    beat: 'OCEANIA / CLIMATE',
    lat: -18.14,
    lon: 178.44,
    text: "Pacific Elders' Voice said Australia sided with fossil fuel producers and lobbyists.",
  },
  {
    n: 33,
    key: 'REFUGEES',
    icon: icoCrowd,
    place: 'KUALA LUMPUR',
    beat: 'ASIA / REFUGEES',
    lat: 3.1,
    lon: 101.7,
    text: 'Malaysia will send 6,803 more Myanmar nationals home despite an ICJ ruling.',
  },
];

// The list above is the running order. Badges take their offset from the
// hand-placed table, then the numbers are closed up so the page carries no gap.
for (const s of STORIES) s.a = ANCHOR[s.n] ?? [0, -13];
STORIES.forEach((s, i) => {
  s.n = i + 1;
});

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

// The sheet's top edge: the masthead, then a band that states the day in type
// big enough to survive a three-hundred-pixel view, then the world.
const MAP_Y = 66;
const MAP_H = 76;
const MAP = { x: 40, y: MAP_Y, w: 944, h: MAP_H, top: 72, bottom: -48 };
const SEA_FIELD: RGB = mix(PAPER, [116, 138, 148], 0.1);
const SEA_LAND: RGB = mix([150, 138, 114], PAPER, 0.22);
const lonX = (lon: number): number => MAP.x + ((lon + 180) / 360) * MAP.w;
const latY = (lat: number): number => MAP.y + ((MAP.top - lat) / (MAP.top - MAP.bottom)) * MAP.h;

// Six regions, six inks. A pin carries its region's colour, so the map can be
// read by area as well as by number, and the key under it is six words long.
const REGIONS = ['AMERICAS', 'EUROPE', 'AFRICA', 'MIDDLE EAST', 'ASIA', 'OCEANIA'] as const;
type Region = (typeof REGIONS)[number];
const REGION_INK: Readonly<Record<Region, RGB>> = {
  AMERICAS: [150, 92, 62],
  EUROPE: [72, 92, 128],
  AFRICA: [138, 112, 48],
  'MIDDLE EAST': [168, 80, 52],
  ASIA: [80, 116, 80],
  OCEANIA: [112, 90, 128],
};
const regionOf = (s: Story): Region => {
  const top = s.beat.split('/')[0].trim();
  if (top.includes('AMERICA')) return 'AMERICAS';
  return (REGIONS as readonly string[]).includes(top) ? (top as Region) : 'ASIA';
};

// Land is a stack of latitude bands, each one a bar: a low-resolution world
// that reads as a silhouette, with hairline gaps to keep the print texture.
const drawWorld = (c: Canvas): void => {
  c.fillRect(MAP.x, MAP.y, MAP.w, MAP.h, SEA_FIELD);
  c.fillRect(MAP.x, MAP.y, MAP.w, 0.8, mix(INK, PAPER, 0.55));
  c.fillRect(MAP.x, MAP.y + MAP.h - 0.8, MAP.w, 0.8, mix(INK, PAPER, 0.55));
  const bandH = (4 * MAP.h) / (MAP.top - MAP.bottom);
  LAND.forEach((bands, r) => {
    const yc = latY(82 - 4 * r);
    const top = Math.max(MAP.y, yc - bandH / 2);
    const bot = Math.min(MAP.y + MAP.h, yc + bandH / 2);
    if (bot - top < 1) return;
    // One dot per degree of land: a halftone coast, which at this height reads
    // as a world rather than as a band of bars.
    for (let lon = -180; lon < 180; lon += 1) {
      const mid = lon + 0.5;
      if (bands.some(([a, b]) => mid >= a && mid <= b)) {
        c.disc(lonX(lon) + 1.3, (top + bot) / 2, 1.15, SEA_LAND);
      }
    }
  });
};

// Badges start where each story's dot is and push each other apart, so a
// crowded region fans out along a hairline instead of stacking up.
interface Pin {
  x: number;
  y: number;
  ax: number;
  ay: number;
  s: Story;
}

const PINSZ = 11;

const placePins = (): Pin[] => {
  const pins: Pin[] = STORIES.map((s) => {
    const [ox, oy] = s.a ?? [0, -13];
    const ax = lonX(s.lon) + ox * 0.5;
    const ay = latY(s.lat) + oy * 0.5;
    return { x: ax, y: ay, ax, ay, s };
  });
  for (let it = 0; it < 260; it++) {
    for (let i = 0; i < pins.length; i++) {
      for (let j = i + 1; j < pins.length; j++) {
        const a = pins[i];
        const b = pins[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.abs(dx) < PINSZ + 3 && Math.abs(dy) < PINSZ + 3) {
          if (Math.abs(dx) >= Math.abs(dy)) {
            const push = (dx >= 0 ? 1 : -1) * (PINSZ + 3 - Math.abs(dx)) * 0.5;
            a.x -= push;
            b.x += push;
          } else {
            const push = (dy >= 0 ? 1 : -1) * (PINSZ + 3 - Math.abs(dy)) * 0.5;
            a.y -= push;
            b.y += push;
          }
        }
      }
    }
    for (const p of pins) {
      p.x += (p.ax - p.x) * 0.05;
      p.y += (p.ay - p.y) * 0.05;
      p.x = Math.max(MAP.x + 6, Math.min(MAP.x + MAP.w - 6 - PINSZ, p.x));
      p.y = Math.max(MAP.y + 5, Math.min(MAP.y + MAP.h - 5 - PINSZ, p.y));
    }
  }
  return pins;
};

// One mark per dispatch: an eleven-pixel square in its region's colour, the
// number reversed out. A hairline joins it to the place only when it moved.
const drawPin = (c: Canvas, p: Pin): void => {
  const x = lonX(p.s.lon);
  const y = latY(p.s.lat);
  const ink = REGION_INK[regionOf(p.s)];
  const dx = p.x - x;
  const dy = p.y - y;
  if (Math.hypot(dx, dy) > 5) c.stroke([[x, y], [p.x + PINSZ / 2, p.y + PINSZ / 2]], 0.6, mix(ink, PAPER, 0.35));
  c.disc(x, y, 1.1, ink);
  c.fillRect(p.x, p.y, PINSZ, PINSZ, ink);
  drawText(c, String(p.s.n), p.x + PINSZ / 2, p.y + 8.1, 7.2, PAPER, { align: 'center', weight: 0.8, silent: true });
  BOXES.push({ label: `pin ${p.s.n}`, x0: p.x, x1: p.x + PINSZ, y0: p.y, y1: p.y + PINSZ });
};
// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

const M = 40;
const RIGHT = W - M;
const CONTENT = RIGHT - M;

const rule = (c: Canvas, x: number, y: number, w: number, color: RGB, t = 1): void => {
  c.fillRect(x, y, w, t, color);
};

const render = (): Uint8Array => {
  const c = new Canvas(W * SS, H * SS);
  c.fillRect(0, 0, W, H, PAPER);

  // Masthead
  drawText(c, 'WORLD NEWS', M, 21, 15, INK, { weight: 1.35, tracking: 0.16 });
  // The map's key sits in the masthead, where it costs no room.
  const keyW = REGIONS.reduce((n, r) => n + 9 + measure(r, 6.4, 0.1) + 20, -20);
  let kx = RIGHT - keyW;
  for (const r of REGIONS) {
    c.fillRect(kx, 12, 6.2, 6.2, REGION_INK[r]);
    drawText(c, r, kx + 9, 18, 6.4, MUTED, { tracking: 0.1, weight: 0.8 });
    kx += 9 + measure(r, 6.4, 0.1) + 20;
  }
  rule(c, M, 23, CONTENT, INK, 2.2);

  // The day, in a band of its own: the date has to survive a three-hundred-
  // pixel view, so it is the largest thing above the cards.
  const BAND_Y = 26;
  const BAND_H = 36;
  c.fillRect(M, BAND_Y, CONTENT, BAND_H, INK);
  c.fillRect(M, BAND_Y, 7, BAND_H, RED);
  drawText(c, 'TUESDAY 24 NOVEMBER 2026', M + 18, BAND_Y + 26, 26, PAPER, { weight: 1.1, tracking: 0.05 });
  drawText(c, 'THIRTY DISPATCHES · SIX CONTINENTS', RIGHT - 14, BAND_Y + 25, 8, PAPER, {
    align: 'right',
    tracking: 0.16,
  });

  // The world, small and clean, each pin in its region's colour.
  drawWorld(c);
  for (const lat of [23.5, 0, -23.5]) {
    c.fillRect(MAP.x, latY(lat), MAP.w, 0.5, mix(INK, PAPER, 0.78));
  }
  for (const p of placePins()) drawPin(c, p);

  // -------------------------------------------------------------------------
  // The briefs are measured first, from the foot of the page up, so the cards
  // can take exactly the room that is left.
  // -------------------------------------------------------------------------

  const BODY = 11;
  const KEY = 16;
  const BRIEF_COLS = 6;
  const BRIEF_GAP = 6;
  const BRIEF_W = (CONTENT - BRIEF_GAP * (BRIEF_COLS - 1)) / BRIEF_COLS;
  const BRIEF_BOTTOM = 946;
  const BRIEF_ROWS = 3;
  const briefs = STORIES.filter((s) => !s.head);
  if (briefs.length !== 18) fail(`the compact list carries ${briefs.length} dispatches, not eighteen`);
  if (STORIES.filter((s) => s.head).length !== 12) fail('the card grid does not carry twelve dispatches');

  const perRow = Math.ceil(briefs.length / BRIEF_ROWS);
  const briefRows = [] as { s: Story; f: Fitted; h: number }[][];
  for (let r = 0; r < BRIEF_ROWS; r++) {
    briefRows.push(
      briefs.slice(r * perRow, (r + 1) * perRow).map((s) => {
        const f = typeset(s.text, BRIEF_W - 2, BODY, 1.16);
        return { s, f, h: KEY + 13 + (f.lines.length - 1) * f.lead + BODY * 0.12 + 1 };
      }),
    );
  }
  const briefsH =
    briefRows.reduce((n, row) => n + Math.max(...row.map((it) => it.h)) + 4, 0) - 4;
  const briefsTop = BRIEF_BOTTOM - briefsH;
  const briefLabelY = briefsTop - 3;
  if (briefsTop < 560) fail(`the compact list starts at ${briefsTop.toFixed(1)}, too high above the foot`);

  rule(c, M, briefLabelY - 15, CONTENT, INK, 1);
  drawText(c, 'ALSO TODAY', M, briefLabelY, 8.4, INK, { weight: 1.15, tracking: 0.18 });
  drawText(c, 'EIGHTEEN MORE DISPATCHES, EACH WITH ITS PICTOGRAM', RIGHT, briefLabelY, 7.2, MUTED, {
    align: 'right',
    tracking: 0.14,
  });

  // -------------------------------------------------------------------------
  // Twelve cards: scene, headline, deck, number.
  // -------------------------------------------------------------------------

  const CARD_TOP = 158;
  const CARD_GAP = 8;
  const CARD_COLS = 4;
  const CARD_W = (CONTENT - CARD_GAP * (CARD_COLS - 1)) / CARD_COLS;
  const cards = STORIES.filter((s) => s.head);
  const cardsBottom = briefLabelY - 26;
  const CARD_H = (cardsBottom - CARD_TOP - CARD_GAP * 2) / 3;
  const HEAD_SZ = 24;

  rule(c, M, CARD_TOP - 15, CONTENT, INK, 1);
  drawText(c, 'TWELVE DISPATCHES IN PICTURES', M, CARD_TOP - 5, 8, INK, { weight: 1.15, tracking: 0.18 });
  const beats: [Theme, string][] = [
    ['CONFLICT', 'CONFLICT'],
    ['POLITICS', 'POLITICS'],
    ['ECONOMY', 'ECONOMY'],
    ['HEALTH', 'HEALTH & SCIENCE'],
    ['CLIMATE', 'CLIMATE & ENERGY'],
  ];
  const beatsW = beats.reduce((n, [, label]) => n + 8 + measure(label, 6.4, 0.1) + 12, -12);
  let bx = RIGHT - beatsW;
  for (const [theme, label] of beats) {
    c.fillRect(bx, CARD_TOP - 11, 6, 6, THEME_INK[theme]);
    drawText(c, label, bx + 8, CARD_TOP - 5, 6.4, MUTED, { tracking: 0.1, weight: 0.85 });
    bx += 8 + measure(label, 6.4, 0.1) + 12;
  }

  if (CARD_H < 134) fail(`only ${CARD_H.toFixed(1)}px for each card; the grid needs 134`);

  cards.forEach((s, i) => {
    const col = i % CARD_COLS;
    const row = Math.floor(i / CARD_COLS);
    const x = M + col * (CARD_W + CARD_GAP);
    const y = CARD_TOP + row * (CARD_H + CARD_GAP);
    const theme = s.theme as Theme;
    const head = typeset(s.head ?? '', CARD_W - 2, HEAD_SZ, 1.13);
    const deck = typeset(s.deck ?? '', CARD_W - 2, 8.2, 1.16);
    const headY = y + 65;
    const deckY = headY + (head.lines.length - 1) * head.lead + 14;
    const bottom = blockHeight(deck, deckY);

    if (head.lines.length > 2) {
      fail(`card ${s.n} ${s.place}: headline takes ${head.lines.length} lines at ${HEAD_SZ}px: ${head.lines.join(' | ')}`);
    }
    for (const ln of head.lines) {
      if (measure(ln, HEAD_SZ) > CARD_W - 2) fail(`card ${s.n}: headline line wider than the card ("${ln}")`);
    }
    for (const ln of deck.lines) {
      if (measure(ln, 8.2) > CARD_W - 2) fail(`card ${s.n}: deck line wider than the card ("${ln}")`);
    }
    // Every deck is a line or two; the Jiuquan deck is the wording the editor
    // dictated, so it is allowed the extra lines rather than cut.
    const deckMax = s.place === 'JIUQUAN' ? 4 : 2;
    if (deck.lines.length > deckMax) fail(`card ${s.n} ${s.place}: deck takes ${deck.lines.length} lines`);
    if (bottom > y + CARD_H) {
      fail(`card ${s.n} ${s.place}: content ends at ${(bottom - y).toFixed(1)} in a ${CARD_H.toFixed(1)}px card`);
    }

    // The scene goes down first and the band is laid over its head, so a plume
    // that rises past the top of the picture cannot reach the label.
    s.art?.(c, x, y + 13, CARD_W, 24);
    BOXES.push({ label: `scene ${s.n}`, x0: x, x1: x + CARD_W, y0: y + 13, y1: y + 37 });
    c.fillRect(x, y, CARD_W, 14, THEME_INK[theme]);
    const numW = measure(String(s.n), 9, 0.02);
    drawText(c, String(s.n), x + 5, y + 10.4, 9, PAPER, { weight: 1.2, tracking: 0.02, silent: true });
    drawText(c, s.place, x + 9 + numW, y + 10.4, 8.4, PAPER, { weight: 1.05, tracking: 0.08 });
    drawText(c, s.key ?? '', x + CARD_W - 4, y + 10.4, 8.4, PAPER, {
      align: 'right',
      tracking: 0.08,
      weight: 1.35,
    });
    drawFitted(c, head, x, headY, INK, 1.05);
    drawFitted(c, deck, x, deckY, MUTED, 0.72);
  });

  // -------------------------------------------------------------------------
  // Eighteen briefs: number, pictogram, keyword, sentence.
  // -------------------------------------------------------------------------

  const sigs = new Map<string, number>();
  let y = briefsTop;
  briefRows.forEach((row) => {
    const rowH = Math.max(...row.map((it) => it.h));
    row.forEach((it, col) => {
      const { s, f } = it;
      const x = M + col * (BRIEF_W + BRIEF_GAP);
      const keyBase = y + KEY;
      const numW = measure(String(s.n), 9, 0.02);
      const kwW = measure(s.key ?? '', KEY, 0);
      if (!s.key) fail(`brief ${s.n} ${s.place}: no keyword`);
      if (!s.icon) fail(`brief ${s.n} ${s.place}: no pictogram`);
      if (numW + 2 + IW > BRIEF_W - kwW) {
        fail(`brief ${s.n} ${s.place}: number and pictogram leave no room for "${s.key}"`);
      }
      if (keyBase - KEY < y) fail(`brief ${s.n}: keyword rises above its row`);
      if (it.h > rowH + 0.01) fail(`brief ${s.n}: block taller than its row`);
      if (KEY < 16) fail('keyword below sixteen pixels');
      if (BODY < 11) fail('brief sentence below eleven pixels');
      if (s.icon) {
        const sig = iconSignature(s.icon);
        const seen = sigs.get(sig);
        if (seen !== undefined) fail(`brief ${s.n} ${s.place}: pictogram repeats dispatch ${seen}`);
        else sigs.set(sig, s.n);
      }
      drawText(c, String(s.n), x, keyBase, 9, RED, { weight: 1.1, tracking: 0.02 });
      s.icon?.(c, x + numW + 2, keyBase - 10);
      BOXES.push({ label: `pictogram ${s.n}`, x0: x + numW + 2, x1: x + numW + 2 + IW, y0: keyBase - 10, y1: keyBase + 1 });
      drawText(c, s.key ?? '', x + numW + 2 + IW + 4, keyBase, KEY, INK, { weight: 1.35 });
      drawFitted(c, f, x, keyBase + 13, DARK, 0.92);
    });
    y += rowH + 4;
  });

  // Footer
  rule(c, M, 952, CONTENT, INK, 2);
  drawText(
    c,
    'SOURCES, EACH A PAGE DATED 24 NOVEMBER 2026: CNBC · REUTERS VIA YAHOO · AP VIA GLOBE AND MAIL · THE GUARDIAN VIA AOL · SPACE.COM · ANADOLU · UKRINFORM',
    M,
    964,
    6.6,
    MUTED,
    { tracking: 0.04 },
  );
  drawText(
    c,
    'UN NEWS · ASIAONE · THE STAR · OUTLOOK · YENI SAFAK · DABANGA · AFP VIA EWN · FIJI SUN · USNI · AEROSPACE · ONTARIO GOVERNMENT · SINGAPORE MFA',
    M,
    975,
    6.6,
    MUTED,
    { tracking: 0.04 },
  );
  drawText(
    c,
    'FIGURES ARE CREDITED TO WHOEVER GAVE THEM; CLAIMS ARE ATTRIBUTED, NOT ASSERTED. STORIES.JSON LISTS EVERY PAGE.',
    M,
    986,
    6.6,
    MUTED,
    { tracking: 0.04 },
  );
  drawText(c, '24 · 11 · 2026', RIGHT, 985, 7.6, RED, { align: 'right', weight: 1.1, tracking: 0.1 });

  checkLayout();
  return c.resolve();
};

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const rgb = render();
writeFileSync(join(outDir, 'entry.png'), png(rgb, W, H));