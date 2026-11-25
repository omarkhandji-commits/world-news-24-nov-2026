// world-news-20261124 — one front page for Tuesday 24 November 2026: twenty-four
// dispatches from six inhabited continents, a world map with a numbered square for
// each, twelve of them drawn as pictures and twelve set out in two brief columns.
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

// Scenes are drawn for a strip a little over two hundred pixels wide and about
// fifty deep, so each one is four or five big shapes: a mass, a horizon, and one
// vermilion mark. Anything smaller than three pixels is left out, because at this
// size it would only be noise.

const FAR = mix(INK, PAPER, 0.42);
const NEAR = INK;

// A building: a filled block with two window slots, which is all a block needs
// at fifty pixels.
const blockB = (c: Canvas, x: number, base: number, w: number, hgt: number, colour: RGB): void => {
  c.fillRect(x, base - hgt, w, hgt, colour);
  const win = Math.max(2, w * 0.18);
  for (let r = 0; r < 2; r++) {
    c.fillRect(x + w * 0.24, base - hgt + hgt * (0.22 + r * 0.34), win, Math.max(2, hgt * 0.12), PAPER);
  }
};

// The horizon: one rule, and a sea band below it.
const sea = (c: Canvas, x: number, y: number, w: number, h: number, at: number): number => {
  const sy = y + h * at;
  c.fillRect(x, sy, w, h - (sy - y), mix(INK, PAPER, 0.34));
  c.fillRect(x, sy, w, 2, INK);
  return sy;
};

// A ship: hull, bridge, funnel. Three shapes, no windows.
const ship = (c: Canvas, x: number, base: number, w: number, hh: number, colour: RGB): void => {
  c.poly(
    [
      [x, base - hh * 0.34],
      [x + w, base - hh * 0.34],
      [x + w * 0.88, base],
      [x + w * 0.12, base],
    ],
    colour,
  );
  c.fillRect(x + w * 0.7, base - hh, w * 0.16, hh * 0.68, colour);
  c.fillRect(x + w * 0.755, base - hh - hh * 0.2, w * 0.05, hh * 0.22, colour);
};

// 1. Hormuz: two tankers ablaze on the strait.
const sceneStrait: Scene = (c, x, y, w, h) => {
  const base = sea(c, x, y, w, h, 0.84);
  c.poly(
    [
      [x, base],
      [x, base - h * 0.16],
      [x + w * 0.08, base - h * 0.34],
      [x + w * 0.18, base - h * 0.18],
      [x + w * 0.26, base],
    ],
    FAR,
  );
  ship(c, x + w * 0.72, base, w * 0.24, h * 0.34, FAR);
  ship(c, x + w * 0.03, base, w * 0.42, h * 0.5, NEAR);
  smoke(c, x + w * 0.16, base - h * 0.46, w * 0.18, h * 0.4, mix(INK, PAPER, 0.3));
  flame(c, x + w * 0.1, base - h * 0.3, w * 0.14, h * 0.32, RED, PAPER);
  flame(c, x + w * 0.78, base - h * 0.26, w * 0.08, h * 0.2, RED, PAPER);
};

// 2. Riyadh: the tallest tower cut open, a drone over it.
const sceneTower: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.94;
  c.fillRect(x, base, w, 2, INK);
  blockB(c, x + w * 0.02, base, w * 0.14, h * 0.42, FAR);
  blockB(c, x + w * 0.2, base, w * 0.12, h * 0.58, FAR);
  blockB(c, x + w * 0.74, base, w * 0.16, h * 0.5, NEAR);
  const tw = w * 0.2;
  const tx = x + w * 0.46;
  const top = y + h * 0.2;
  c.fillRect(tx, top, tw, base - top, NEAR);
  c.poly([[tx, top], [tx + tw * 0.5, y], [tx + tw, top]], NEAR);
  c.poly(
    [[tx + tw * 0.2, top + h * 0.06], [tx + tw, top + h * 0.2], [tx + tw * 0.86, top + h * 0.44], [tx + tw * 0.2, top + h * 0.3]],
    RED,
  );
  const dx = x + w * 0.2;
  const dy = y + h * 0.14;
  c.fillRect(dx, dy, w * 0.2, 2, INK);
  c.disc(dx, dy, Math.max(2, h * 0.07), INK);
  c.disc(dx + w * 0.2, dy, Math.max(2, h * 0.07), INK);
};

// 3. Villavicencio: the burst between the blocks.
const sceneBomb: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.92;
  c.fillRect(x, base, w, 2, INK);
  blockB(c, x + w * 0.02, base, w * 0.22, h * 0.46, FAR);
  blockB(c, x + w * 0.78, base, w * 0.2, h * 0.62, NEAR);
  const bx = x + w * 0.5;
  const by = y + h * 0.44;
  const star: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? h * 0.24 : h * 0.52;
    star.push([bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.86]);
  }
  c.poly(star, RED);
  c.fillRect(x + w * 0.3, base - h * 0.16, w * 0.16, h * 0.1, NEAR);
  c.fillRect(x + w * 0.33, base - h * 0.26, w * 0.08, h * 0.1, NEAR);
  c.disc(x + w * 0.33, base - h * 0.04, Math.max(1.5, h * 0.045), NEAR);
  c.disc(x + w * 0.43, base - h * 0.04, Math.max(1.5, h * 0.045), NEAR);
};

// 4. Washington: the market's fall, one thick line and an arrow.
const sceneMarket: Scene = (c, x, y, w, h) => {
  c.fillRect(x, y + h * 0.86, w, 2, mix(INK, PAPER, 0.4));
  const pts: [number, number][] = [
    [x + w * 0.02, y + h * 0.2],
    [x + w * 0.22, y + h * 0.34],
    [x + w * 0.36, y + h * 0.26],
    [x + w * 0.56, y + h * 0.54],
    [x + w * 0.68, y + h * 0.46],
    [x + w * 0.82, y + h * 0.82],
  ];
  c.stroke(pts, Math.max(3, h * 0.09), INK);
  const ax = x + w * 0.82;
  const ay = y + h * 0.82;
  c.poly([[ax + w * 0.1, ay + h * 0.02], [ax - w * 0.03, ay + h * 0.04], [ax + w * 0.02, ay - h * 0.16]], RED);
  for (let i = 0; i < 4; i++) {
    c.fillRect(x + w * (0.04 + i * 0.24), y + h * 0.9, w * 0.1, Math.max(2, h * 0.05), i === 1 ? RED : mix(INK, PAPER, 0.42));
  }
};

// 5. Tennessee: the ballot in the box, the seat tally beside it.
const sceneBallot: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.96;
  c.fillRect(x, base, w, 2, INK);
  const bw = w * 0.32;
  const bh = h * 0.5;
  const bx = x + w * 0.02;
  c.fillRect(bx, base - bh, bw, bh, NEAR);
  c.fillRect(bx, base - bh, bw, Math.max(3, h * 0.08), PAPER);
  const pw = bw * 0.4;
  const ph = h * 0.4;
  const px = bx + bw * 0.3;
  const py = base - bh - h * 0.34;
  c.fillRect(px, py, pw, ph, PAPER);
  c.stroke(
    [[px, py], [px + pw, py], [px + pw, py + ph], [px, py + ph], [px, py]],
    Math.max(2, w * 0.011),
    INK,
  );
  c.stroke(
    [[px + pw * 0.14, py + ph * 0.58], [px + pw * 0.42, py + ph * 0.86], [px + pw * 0.88, py + ph * 0.16]],
    Math.max(3, w * 0.016),
    INK,
  );
  const sq = Math.max(8, h * 0.2);
  for (let i = 0; i < 4; i++) {
    c.fillRect(x + w * 0.46 + i * (sq + w * 0.035), base - sq, sq, sq, i === 0 ? RED : NEAR);
  }
};

// 6. Brasilia: the vote, as two bars of the tally.
const sceneVote: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.92;
  c.fillRect(x, base, w, 2, mix(INK, PAPER, 0.35));
  const barH = Math.max(8, h * 0.16);
  const top = base - h * 0.78;
  c.fillRect(x + w * 0.02, top, w * 0.66, barH, NEAR);
  c.fillRect(x + w * 0.02, top + barH * 1.7, w * 0.24, barH, RED);
  c.fillRect(x + w * 0.76, top, Math.max(3, w * 0.02), h * 0.78, mix(INK, PAPER, 0.35));
};

// 7. Wolfsburg: the gate, the banner across it.
const sceneFactory: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.92;
  c.fillRect(x, base, w, 2, INK);
  c.poly(
    [
      [x + w * 0.02, base],
      [x + w * 0.02, y + h * 0.38],
      [x + w * 0.12, y + h * 0.16],
      [x + w * 0.12, y + h * 0.38],
      [x + w * 0.22, y + h * 0.16],
      [x + w * 0.22, y + h * 0.38],
      [x + w * 0.32, y + h * 0.16],
      [x + w * 0.32, base],
    ],
    NEAR,
  );
  c.fillRect(x + w * 0.38, y + h * 0.02, Math.max(4, w * 0.045), h * 0.9, NEAR);
  smoke(c, x + w * 0.4, y + h * 0.04, w * 0.06, h * 0.2, mix(INK, PAPER, 0.45));
  c.fillRect(x + w * 0.62, base - h * 0.36, Math.max(4, w * 0.04), h * 0.36, NEAR);
  c.fillRect(x + w * 0.9, base - h * 0.36, Math.max(4, w * 0.04), h * 0.36, NEAR);
  c.fillRect(x + w * 0.6, base - h * 0.56, w * 0.36, h * 0.14, RED);
  c.fillRect(x + w * 0.6, base - h * 0.24, w * 0.36, Math.max(3, h * 0.08), mix(INK, PAPER, 0.2));
};

// 8. Ituri: the ward, the cross on it.
const sceneClinic: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.94;
  c.fillRect(x, base, w, 2, mix(INK, PAPER, 0.4));
  const tx = x + w * 0.06;
  const tw = w * 0.44;
  c.poly([[tx, base], [tx + tw * 0.5, y + h * 0.06], [tx + tw, base]], NEAR);
  c.poly(
    [[tx + tw * 0.36, base], [tx + tw * 0.5, y + h * 0.4], [tx + tw * 0.64, base]],
    PAPER,
  );
  const cx = tx + tw * 0.5;
  const cy = y + h * 0.56;
  const s = Math.max(5, h * 0.13);
  c.fillRect(cx - s * 0.5, cy - s * 1.5, s, s * 3, RED);
  c.fillRect(cx - s * 1.5, cy - s * 0.5, s * 3, s, RED);
  c.disc(x + w * 0.72, y + h * 0.34, Math.max(2.5, h * 0.11), NEAR);
  c.poly([[x + w * 0.64, base], [x + w * 0.72, y + h * 0.48], [x + w * 0.8, base]], NEAR);
  c.disc(x + w * 0.88, y + h * 0.4, Math.max(2.5, h * 0.1), mix(INK, PAPER, 0.2));
  c.poly([[x + w * 0.81, base], [x + w * 0.88, y + h * 0.52], [x + w * 0.95, base]], mix(INK, PAPER, 0.2));
};

// 9. Khan Younis: the tents, the burst above them, the drone.
const sceneDrone: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.94;
  c.fillRect(x, base, w, 2, INK);
  for (const tx of [0.04, 0.26]) {
    c.poly([[x + w * tx, base], [x + w * (tx + 0.1), y + h * 0.48], [x + w * (tx + 0.2), base]], NEAR);
    c.fillRect(x + w * (tx + 0.09), base - h * 0.16, Math.max(3, w * 0.02), h * 0.16, PAPER);
  }
  const bx = x + w * 0.56;
  const by = y + h * 0.44;
  const star: [number, number][] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = i % 2 ? h * 0.2 : h * 0.44;
    star.push([bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.9]);
  }
  c.poly(star, RED);
  const dx = x + w * 0.74;
  const dy = y + h * 0.14;
  c.fillRect(dx, dy, w * 0.2, 2.4, INK);
  c.disc(dx, dy, Math.max(2, h * 0.07), INK);
  c.disc(dx + w * 0.2, dy, Math.max(2, h * 0.07), INK);
  c.fillRect(dx + w * 0.06, dy - h * 0.06, w * 0.08, h * 0.12, INK);
};

// 10. Baghdad: derricks, a pipeline, the flare.
const sceneDerrick: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.88;
  c.fillRect(x, base, w, 2, mix(INK, PAPER, 0.3));
  // A derrick is a tapered tower: solid enough to read as steel at this size.
  const derrick = (dx: number, dw: number, dh: number, colour: RGB, bars: RGB): void => {
    const topW = dw * 0.24;
    c.poly(
      [
        [dx, base],
        [dx + dw * 0.5 - topW * 0.5, base - dh],
        [dx + dw * 0.5 + topW * 0.5, base - dh],
        [dx + dw, base],
      ],
      colour,
    );
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const wid = dw * (1 - t * 0.78);
      c.fillRect(dx + (dw - wid) * 0.5, base - dh * (1 - t * 0.9), wid, Math.max(2.5, dh * 0.06), bars);
    }
    c.fillRect(dx + dw * 0.36, base - dh - Math.max(4, h * 0.1), dw * 0.28, Math.max(4, h * 0.1), colour);
  };
  derrick(x + w * 0.38, w * 0.15, h * 0.56, mix(INK, PAPER, 0.45), PAPER);
  derrick(x + w * 0.06, w * 0.19, h * 0.94, NEAR, PAPER);
  c.fillRect(x + w * 0.2, base - h * 0.1, w * 0.56, Math.max(5, h * 0.12), NEAR);
  c.fillRect(x + w * 0.78, base - h * 0.44, Math.max(4, w * 0.026), h * 0.44, NEAR);
  flame(c, x + w * 0.75, base - h * 0.44, w * 0.12, h * 0.46, RED, PAPER);
};

// 11. Jiuquan: the stack, clear of the tower.
const sceneRocket: Scene = (c, x, y, w, h) => {
  const base = y + h * 0.94;
  c.fillRect(x, base, w, 2.4, INK);
  c.fillRect(x + w * 0.62, base - h * 0.06, w * 0.2, h * 0.06, INK);
  const gx = x + w * 0.24;
  for (let i = 0; i < 3; i++) c.fillRect(gx + i * w * 0.05, y + h * 0.02, Math.max(2, w * 0.014), base - (y + h * 0.02), INK);
  for (let i = 1; i < 4; i++) c.fillRect(gx, y + h * (0.04 + i * 0.22), w * 0.11, 2, INK);
  // The stack: a narrow body with fins, and a flame that reaches the pad.
  const rx = x + w * 0.52;
  const rw = w * 0.085;
  const rTop = y + h * 0.12;
  const rBot = base - h * 0.16;
  c.poly(
    [
      [rx, rBot],
      [rx, rTop],
      [rx + rw * 0.5, y],
      [rx + rw, rTop],
      [rx + rw, rBot],
    ],
    NEAR,
  );
  c.fillRect(rx + rw * 0.3, rTop + h * 0.16, rw * 0.4, h * 0.1, PAPER);
  c.poly([[rx - w * 0.03, rBot], [rx, rBot - h * 0.2], [rx, rBot]], NEAR);
  c.poly([[rx + rw + w * 0.03, rBot], [rx + rw, rBot - h * 0.2], [rx + rw, rBot]], NEAR);
  tongue(c, rx + rw * 0.5, rBot, rw * 1.2, h * 0.4, RED, 0.06);
  tongue(c, rx + rw * 0.5, rBot, rw * 0.55, h * 0.24, PAPER, 0.1);
  c.disc(x + w * 0.16, y + h * 0.7, Math.max(3, h * 0.09), mix(INK, PAPER, 0.5));
  c.disc(x + w * 0.24, y + h * 0.6, Math.max(3, h * 0.1), mix(INK, PAPER, 0.4));
};

// 12. Canberra: the pipe into the seabed.
const sceneCarbon: Scene = (c, x, y, w, h) => {
  const line = sea(c, x, y, w, h, 0.3);
  c.fillRect(x + w * 0.04, line - h * 0.18, w * 0.22, h * 0.18, NEAR);
  c.fillRect(x + w * 0.13, line - h * 0.32, Math.max(4, w * 0.05), h * 0.16, NEAR);
  for (let i = 0; i < 2; i++) c.fillRect(x, y + h * (0.62 + i * 0.15), w, Math.max(1.5, h * 0.035), mix(INK, PAPER, 0.62));
  c.stroke(
    [[x + w * 0.14, line], [x + w * 0.46, y + h * 0.56], [x + w * 0.7, y + h * 0.68], [x + w * 0.8, y + h * 0.9]],
    Math.max(5, h * 0.11),
    NEAR,
  );
  c.poly([[x + w * 0.88, y + h * 0.94], [x + w * 0.74, y + h * 0.74], [x + w * 0.92, y + h * 0.78]], RED);
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

// Where each numbered square starts, relative to its dot: hand-placed so the
// crowded regions (Europe, the Gulf, South-East Asia) fan out along a hairline
// instead of stacking on top of one another.
const ANCHOR: Readonly<Record<number, readonly [number, number]>> = {
  1: [18, 14],
  2: [-16, -16],
  3: [-20, 12],
  4: [10, 16],
  5: [16, 12],
  6: [22, -2],
  7: [-26, -6],
  8: [-14, 16],
  9: [-22, 8],
  10: [16, -14],
  11: [-8, -18],
  12: [8, 16],
  13: [-30, 2],
  14: [18, -8],
  15: [-16, 14],
  16: [-34, 14],
  17: [14, 4],
  18: [10, 16],
  19: [16, -12],
  20: [18, 6],
  21: [-14, -14],
  22: [-6, 16],
  23: [16, 8],
  24: [-12, 14],
};

// Every entry below was read on a page dated 24 November 2026. Figures are
// quoted as that page gave them; where a card headline cannot hold the
// attribution or the figure, `stories.json` carries the page's own wording.
const STORIES: Story[] = [
  {
    n: 1,
    place: 'STRAIT OF HORMUZ',
    beat: 'MIDDLE EAST / SHIPPING',
    lat: 26.6,
    lon: 56.4,
    key: 'MINES',
    head: 'IRAN SAYS MINES HIT 3 TANKERS',
    theme: 'CONFLICT',
    art: sceneStrait,
  },
  {
    n: 2,
    place: 'RIYADH',
    beat: 'MIDDLE EAST / YEMEN WAR',
    lat: 24.7,
    lon: 46.7,
    key: 'DRONE',
    head: 'DRONE HITS RIYADH TOWER',
    theme: 'CONFLICT',
    art: sceneTower,
  },
  {
    n: 3,
    place: 'VILLAVICENCIO',
    beat: 'SOUTH AMERICA / SECURITY',
    lat: 4.1,
    lon: -73.6,
    key: 'BOMB',
    head: 'CAR BOMB HURTS 23',
    deck: 'At regional offices',
    theme: 'CONFLICT',
    art: sceneBomb,
  },
  {
    n: 4,
    place: 'WASHINGTON',
    beat: 'NORTH AMERICA / MARKETS',
    lat: 38.9,
    lon: -77.0,
    key: 'MARKETS',
    head: 'DOW UP 0.9%, NASDAQ -1.5%',
    theme: 'ECONOMY',
    art: sceneMarket,
  },
  {
    n: 5,
    place: 'TENNESSEE',
    beat: 'NORTH AMERICA / CONGRESS',
    lat: 35.9,
    lon: -86.4,
    key: 'SEATS',
    head: 'DEMOCRATS REACH 259 SEATS',
    theme: 'POLITICS',
    art: sceneBallot,
  },
  {
    n: 6,
    place: 'BRASILIA',
    beat: 'SOUTH AMERICA / ECONOMY',
    lat: -15.8,
    lon: -47.9,
    key: 'VOTE',
    head: 'FISCAL BILL PASSES 353-128',
    theme: 'ECONOMY',
    art: sceneVote,
  },
  {
    n: 7,
    place: 'WOLFSBURG',
    beat: 'EUROPE / LABOUR',
    lat: 52.4,
    lon: 10.8,
    key: 'TALKS',
    head: 'VW TALKS FAIL',
    deck: 'Strikes 1 January',
    theme: 'ECONOMY',
    art: sceneFactory,
  },
  {
    n: 8,
    place: 'ITURI',
    beat: 'AFRICA / HEALTH',
    lat: 1.6,
    lon: 30.2,
    key: 'EBOLA',
    head: 'EBOLA: WHO STAFF TRAPPED',
    theme: 'HEALTH',
    art: sceneClinic,
  },
  {
    n: 9,
    place: 'KHAN YOUNIS',
    beat: 'MIDDLE EAST / GAZA',
    lat: 31.3,
    lon: 34.3,
    key: 'STRIKE',
    head: 'JORDAN NEWS: DRONE KILLS 3',
    theme: 'CONFLICT',
    art: sceneDrone,
  },
  {
    n: 10,
    place: 'BAGHDAD',
    beat: 'MIDDLE EAST / OIL',
    lat: 33.3,
    lon: 44.4,
    key: 'OIL',
    head: 'IRAQ PM MOVES ON KURDISH OIL',
    theme: 'CLIMATE',
    art: sceneDerrick,
  },
  {
    n: 11,
    place: 'JIUQUAN',
    beat: 'ASIA / SPACE',
    lat: 39.7,
    lon: 98.5,
    key: 'SPACE',
    head: 'CHINA PUTS PAKISTANI IN ORBIT',
    theme: 'HEALTH',
    art: sceneRocket,
  },
  {
    n: 12,
    place: 'CANBERRA',
    beat: 'OCEANIA / DIPLOMACY',
    lat: -35.3,
    lon: 149.1,
    key: 'PACT',
    head: 'AUSTRALIA, SINGAPORE: CO2 PACT',
    theme: 'CLIMATE',
    art: sceneCarbon,
  },
  {
    n: 13,
    key: 'QUOTAS',
    place: 'BRUSSELS',
    beat: 'EUROPE / TRADE',
    lat: 50.85,
    lon: 4.35,
    text: 'EU sets 200-day quotas on hybrid cars from China.',
  },
  {
    n: 14,
    key: 'REFINERY',
    place: 'MOSCOW',
    beat: 'EUROPE / ENERGY WAR',
    lat: 55.75,
    lon: 37.6,
    text: 'Putin: retaliation for refinery strikes is inevitable.',
  },
  {
    n: 15,
    key: 'ATTACK',
    place: 'ZAPORIZHZHIA',
    beat: 'EUROPE / WAR',
    lat: 47.8,
    lon: 35.2,
    text: 'Strike kills two and wounds 22, Ukraine official says.',
  },
  {
    n: 16,
    key: 'TUBE',
    place: 'LONDON',
    beat: 'EUROPE / TRANSPORT',
    lat: 51.5,
    lon: -0.12,
    text: 'Tube drivers to start 24-hour strikes on Thursday.',
  },
  {
    n: 17,
    key: 'CURFEW',
    place: 'DELTA STATE',
    beat: 'AFRICA / ELECTIONS',
    lat: 6.2,
    lon: 6.7,
    text: 'Delta state declares curfew after four die at rally.',
  },
  {
    n: 18,
    key: 'ABDUCTED',
    place: 'ED DAMAZIN',
    beat: 'AFRICA / SUDAN',
    lat: 11.8,
    lon: 34.35,
    text: 'Group says 28 women and girls abducted in Blue Nile.',
  },
  {
    n: 19,
    key: 'GROWTH',
    place: 'SINGAPORE',
    beat: 'ASIA / ECONOMY',
    lat: 1.35,
    lon: 103.8,
    text: 'Singapore Q3 growth 6.1%, ahead of 5.4% estimate.',
  },
  {
    n: 20,
    key: 'COURT',
    place: 'TOKYO',
    beat: 'ASIA / JUSTICE',
    lat: 35.7,
    lon: 139.7,
    text: 'Japan to pay 2027 ICC dues before US sanctions.',
  },
  {
    n: 21,
    key: 'DRILL',
    place: 'MANILA',
    beat: 'ASIA / MARITIME',
    lat: 14.6,
    lon: 121.0,
    text: 'Philippines drills to hold Luzon Strait with BrahMos.',
  },
  {
    n: 22,
    key: 'BLAST',
    place: 'HANOI',
    beat: 'ASIA / DISASTER',
    lat: 21.03,
    lon: 105.85,
    text: 'Gas blast at Hanoi eatery kills six, injures 10.',
  },
  {
    n: 23,
    key: 'BOEING',
    place: 'XIAMEN',
    beat: 'ASIA / AVIATION',
    lat: 24.5,
    lon: 118.1,
    text: 'Xiamen orders 50 Boeing 737-8s at $7.4bn list.',
  },
  {
    n: 24,
    key: 'REFUGEES',
    place: 'KUALA LUMPUR',
    beat: 'ASIA / REFUGEES',
    lat: 3.1,
    lon: 101.7,
    text: 'Malaysia to send 6,803 more Myanmar nationals home.',
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

// ---------------------------------------------------------------------------
// The world: land as latitude strata at close to the true proportions of a
// world map, every dispatch a numbered square in its region's colour, and a
// legend beside it that names the six regions and counts their dispatches.
// ---------------------------------------------------------------------------

const MAP = { x: 40, y: 68, w: 680, h: 130, top: 72, bottom: -48 };
const SEA_FIELD: RGB = mix(PAPER, [116, 138, 148], 0.1);
const SEA_LAND: RGB = mix([150, 138, 114], PAPER, 0.04);
const lonX = (lon: number): number => MAP.x + ((lon + 180) / 360) * MAP.w;
const latY = (lat: number): number => MAP.y + ((MAP.top - lat) / (MAP.top - MAP.bottom)) * MAP.h;

// Six regions, six inks. A pin carries its region's colour, so the map can be
// read by area as well as by number, and the legend names each one.
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

// Land is a stack of latitude bands: one bar per band and per latitude run, so
// the sheet carries a silhouette rather than a scatter of dots, and the shape of
// a continent is still there at three hundred pixels across.
const drawWorld = (c: Canvas): void => {
  c.fillRect(MAP.x, MAP.y, MAP.w, MAP.h, SEA_FIELD);
  const bandH = (4 * MAP.h) / (MAP.top - MAP.bottom);
  LAND.forEach((bands, r) => {
    const yc = latY(82 - 4 * r);
    const top = Math.max(MAP.y, yc - bandH / 2);
    const bot = Math.min(MAP.y + MAP.h, yc + bandH / 2);
    if (bot - top < 1.6) return;
    // A square per degree: a dither that reads as the continent, not as a bar.
    for (const [a, b] of bands) {
      const x1 = Math.max(MAP.x, lonX(a));
      const x2 = Math.min(MAP.x + MAP.w, lonX(b));
      if (x2 - x1 < 1) continue;
      c.fillRect(x1, top, x2 - x1, Math.max(2.4, bot - top - 0.5), SEA_LAND);
    }
  });
  const edge = mix(INK, PAPER, 0.45);
  c.fillRect(MAP.x, MAP.y, MAP.w, 1, edge);
  c.fillRect(MAP.x, MAP.y + MAP.h - 1, MAP.w, 1, edge);
  c.fillRect(MAP.x, MAP.y, 1, MAP.h, edge);
  c.fillRect(MAP.x + MAP.w - 1, MAP.y, 1, MAP.h, edge);
};

// A real legend: the six regions, their colours, and how many dispatches each
// carries. Set at reading size, not as a caption; the counts add to the number
// in the masthead and the build checks that they do.
const drawLegend = (c: Canvas): void => {
  const x = MAP.x + MAP.w + 24;
  const y = MAP.y;
  const w = RIGHT - x;
  c.fillRect(x, y, w, 1.2, INK);
  drawText(c, 'SIX REGIONS', x, y + 11, 9.4, INK, { weight: 1.25, tracking: 0.1 });
  c.fillRect(x, y + 16, w, 1, mix(INK, PAPER, 0.4));
  REGIONS.forEach((r, i) => {
    const ry = y + 22 + i * 18.6;
    c.fillRect(x, ry, 10, 10, REGION_INK[r]);
    drawText(c, r, x + 16, ry + 8.4, 11, INK, { weight: 1.05, tracking: 0.02 });
    drawText(c, String(REGION_COUNT[r]), x + w, ry + 8.4, 11, MUTED, { align: 'right', weight: 1.1 });
  });
  c.fillRect(x, y + MAP.h - 1.2, w, 1.2, INK);
};

const REGION_COUNT: Readonly<Record<Region, number>> = (() => {
  const n = { AMERICAS: 0, EUROPE: 0, AFRICA: 0, 'MIDDLE EAST': 0, ASIA: 0, OCEANIA: 0 } as Record<Region, number>;
  for (const s of STORIES) n[regionOf(s)] += 1;
  return n;
})();

// Badges start at the hand-placed offset and push each other apart, so a crowded
// region fans out instead of stacking up.
interface Pin {
  x: number;
  y: number;
  ax: number;
  ay: number;
  s: Story;
}

const PINSZ = 13;

const placePins = (): Pin[] => {
  const pins: Pin[] = STORIES.map((s) => {
    const [ox, oy] = s.a ?? [0, -13];
    const ax = lonX(s.lon) + ox * 0.5;
    const ay = latY(s.lat) + oy * 0.5;
    return { x: ax, y: ay, ax, ay, s };
  });
  for (let it = 0; it < 300; it++) {
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
      p.x = Math.max(MAP.x + 2, Math.min(MAP.x + MAP.w - 2 - PINSZ, p.x));
      p.y = Math.max(MAP.y + 2, Math.min(MAP.y + MAP.h - 2 - PINSZ, p.y));
    }
  }
  return pins;
};

// One mark per dispatch: a numbered square in its region's colour, joined to the
// place by a hairline when it has moved off it.
const drawPin = (c: Canvas, p: Pin): void => {
  const x = lonX(p.s.lon);
  const y = latY(p.s.lat);
  const ink = REGION_INK[regionOf(p.s)];
  if (Math.hypot(p.x - x, p.y - y) > 6) {
    c.stroke([[x, y], [p.x + PINSZ / 2, p.y + PINSZ / 2]], 0.7, mix(ink, PAPER, 0.25));
  }
  c.disc(x, y, 1.4, ink);
  c.fillRect(p.x, p.y, PINSZ, PINSZ, ink);
  drawText(c, String(p.s.n), p.x + PINSZ / 2, p.y + 9.6, 8.4, PAPER, {
    align: 'center',
    weight: 0.85,
    silent: true,
  });
  BOXES.push({ label: `pin ${p.s.n}`, x0: p.x, x1: p.x + PINSZ, y0: p.y, y1: p.y + PINSZ });
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

// A body line that starts with a bold keyword: the first line is indented past
// the keyword, the rest run the full width of the column.
const wrapAfter = (text: string, size: number, firstW: number, restW: number): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  let room = firstW;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (!line || measure(next, size) <= room) {
      line = next;
    } else {
      lines.push(line);
      line = word;
      room = restW;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const render = (): Uint8Array => {
  const c = new Canvas(W * SS, H * SS);
  c.fillRect(0, 0, W, H, PAPER);

  // Masthead: the paper's name, and the count the sheet actually carries.
  drawText(c, 'WORLD NEWS', M, 21, 15, INK, { weight: 1.35, tracking: 0.16 });
  drawText(c, 'TWENTY-FOUR DISPATCHES · SIX CONTINENTS', RIGHT, 19, 9.4, MUTED, {
    align: 'right',
    weight: 1.1,
    tracking: 0.12,
  });
  rule(c, M, 23, CONTENT, INK, 2.2);

  // The day, in a band of its own, at the largest size on the sheet.
  const BAND_Y = 26;
  const BAND_H = 36;
  c.fillRect(M, BAND_Y, CONTENT, BAND_H, INK);
  c.fillRect(M, BAND_Y, 7, BAND_H, RED);
  drawText(c, 'TUESDAY 24 NOVEMBER 2026', M + 18, BAND_Y + 26, 26, PAPER, {
    weight: 1.1,
    tracking: 0.05,
  });

  // The world and its legend.
  drawWorld(c);
  drawLegend(c);
  if (REGIONS.reduce((n, r) => n + REGION_COUNT[r], 0) !== STORIES.length) {
    fail('the legend counts do not add up to the number of dispatches');
  }
  for (const p of placePins()) drawPin(c, p);

  // -------------------------------------------------------------------------
  // Briefs are measured first, from the foot of the page up, so each of the
  // twelve can be set at reading size and the cards take the room that is left.
  // -------------------------------------------------------------------------

  const BRIEF_SZ = 15;
  const BRIEF_KEY = 15;
  const BRIEF_LEAD = 19;
  const BRIEF_COLS = 2;
  const BRIEF_ROWS = 6;
  const BRIEF_COL_GAP = 32;
  const BRIEF_ROW_GAP = 3;
  const BRIEF_BOTTOM = 946;
  const BRIEF_W = (CONTENT - BRIEF_COL_GAP * (BRIEF_COLS - 1)) / BRIEF_COLS;

  const briefs = STORIES.filter((s) => !s.head);
  const cards = STORIES.filter((s) => s.head);
  if (briefs.length !== 12) fail(`the brief column carries ${briefs.length} dispatches, not twelve`);
  if (cards.length !== 12) fail(`the card grid carries ${cards.length} dispatches, not twelve`);
  if (STORIES.length !== 24) fail(`the sheet carries ${STORIES.length} dispatches, not twenty-four`);
  if (BRIEF_SZ < 15) fail('the brief sentences are smaller than fifteen pixels');

  const typed = briefs.map((s) => {
    if (!s.key) fail(`brief ${s.n} ${s.place}: no keyword`);
    const kw = `${s.key ?? ''}:`;
    const kwW = measure(kw, BRIEF_KEY) + 9;
    const lines = wrapAfter(s.text, BRIEF_SZ, BRIEF_W - kwW, BRIEF_W);
    if (lines.length > 2) {
      fail(`brief ${s.n} ${s.place}: sentence takes ${lines.length} lines at ${BRIEF_SZ}px`);
    }
    for (const ln of lines) {
      if (measure(ln, BRIEF_SZ) > BRIEF_W) fail(`brief ${s.n}: line wider than its column ("${ln}")`);
    }
    return { s, kw, kwW, lines };
  });

  const rowH: number[] = [];
  for (let r = 0; r < BRIEF_ROWS; r++) {
    let h = 0;
    for (let k = 0; k < BRIEF_COLS; k++) {
      const it = typed[r * BRIEF_COLS + k];
      if (!it) continue;
      h = Math.max(h, BRIEF_SZ + (it.lines.length - 1) * BRIEF_LEAD + BRIEF_SZ * 0.14);
    }
    rowH.push(h);
  }
  const briefsH = rowH.reduce((a, b) => a + b, 0) + (BRIEF_ROWS - 1) * BRIEF_ROW_GAP;
  const briefsTop = BRIEF_BOTTOM - briefsH;
  const briefsLabelY = briefsTop - 10;
  if (briefsTop < 700) fail(`the brief column starts at ${briefsTop.toFixed(1)}, too high`);

  rule(c, M, briefsLabelY - 12, CONTENT, INK, 1.2);
  drawText(c, 'ALSO TODAY', M, briefsLabelY, 10, INK, { weight: 1.3, tracking: 0.16 });
  drawText(c, 'TWELVE MORE DISPATCHES, ONE SENTENCE EACH', RIGHT, briefsLabelY, 8.6, MUTED, {
    align: 'right',
    tracking: 0.12,
  });

  // -------------------------------------------------------------------------
  // Twelve cards: picture, headline, and a figure line where it adds one.
  // -------------------------------------------------------------------------

  const CARD_TOP = 204;
  const CARD_GAP = 8;
  const CARD_COLS = 4;
  const CARD_W = (CONTENT - CARD_GAP * (CARD_COLS - 1)) / CARD_COLS;
  const cardsBottom = briefsLabelY - 20;
  const CARD_H = (cardsBottom - CARD_TOP - CARD_GAP * 2) / 3;
  const HEAD_SZ = 24;
  const HEAD_LEAD = 31;
  const DECK_SZ = 13.5;
  const BAND_H2 = 13;
  // The picture takes a third and a half of the card, drawn for that shape.
  const ART_H = Math.round(CARD_H * 0.3 * 10) / 10;

  if (CARD_H < 140) fail(`only ${CARD_H.toFixed(1)}px for each card; the grid needs 140`);

  cards.forEach((s, i) => {
    const col = i % CARD_COLS;
    const row = Math.floor(i / CARD_COLS);
    const x = M + col * (CARD_W + CARD_GAP);
    const y = CARD_TOP + row * (CARD_H + CARD_GAP);
    const theme = s.theme as Theme;
    if (!s.head) fail(`card ${s.n}: no headline`);
    if (!s.art) fail(`card ${s.n}: no picture`);
    const head = typeset(s.head ?? '', CARD_W - 2, HEAD_SZ, HEAD_LEAD / HEAD_SZ);
    const deck = s.deck ? typeset(s.deck, CARD_W - 2, DECK_SZ, 1.15) : null;
    const headBase = y + BAND_H2 + ART_H + 2 + HEAD_SZ;
    const deckBase = headBase + (head.lines.length - 1) * HEAD_LEAD + 3 + DECK_SZ + 4;
    const bottom = deck ? blockHeight(deck, deckBase) : blockHeight(head, headBase);

    if (head.lines.length > 3) {
      fail(`card ${s.n} ${s.place}: headline takes ${head.lines.length} lines at ${HEAD_SZ}px: ${head.lines.join(' | ')}`);
    }
    for (const ln of head.lines) {
      if (measure(ln, HEAD_SZ) > CARD_W - 2) fail(`card ${s.n}: headline line wider than the card ("${ln}")`);
    }
    if (deck) {
      if (DECK_SZ < 13) fail('card sub-lines are smaller than thirteen pixels');
      if (deck.lines.length > 1) fail(`card ${s.n} ${s.place}: sub-line takes ${deck.lines.length} lines`);
      if (head.lines.length > 2) fail(`card ${s.n} ${s.place}: no room for a sub-line under ${head.lines.length} headline lines`);
      if (measure(deck.lines[0], DECK_SZ) > CARD_W - 2) fail(`card ${s.n}: sub-line wider than the card`);
    }
    if (bottom > y + CARD_H) {
      fail(`card ${s.n} ${s.place}: content ends at ${(bottom - y).toFixed(1)} in a ${CARD_H.toFixed(1)}px card`);
    }

    // The picture sits under its band, at a size fixed by the card's height.
    s.art?.(c, x, y + BAND_H2, CARD_W, ART_H);
    BOXES.push({ label: `scene ${s.n}`, x0: x, x1: x + CARD_W, y0: y + BAND_H2, y1: y + BAND_H2 + ART_H });
    c.fillRect(x, y, CARD_W, BAND_H2, THEME_INK[theme]);
    const numW = measure(String(s.n), 9.4, 0.02);
    drawText(c, String(s.n), x + 5, y + 10, 9.4, PAPER, { weight: 1.25, tracking: 0.02, silent: true });
    drawText(c, s.place, x + 9 + numW, y + 10, 8.6, PAPER, { weight: 1.05, tracking: 0.08 });
    drawText(c, s.key ?? '', x + CARD_W - 4, y + 10, 8.6, PAPER, {
      align: 'right',
      tracking: 0.08,
      weight: 1.4,
    });
    // Each block is set line by line and registered as one box: a headline's
    // own lines sit closer than the collision rule allows for two labels, and
    // they are one piece of type, not two.
    head.lines.forEach((ln, li) =>
      drawText(c, ln, x, headBase + li * head.lead, HEAD_SZ, INK, { weight: 1.08, silent: true }),
    );
    BOXES.push({
      label: `head ${s.n}`,
      x0: x,
      x1: x + CARD_W - 2,
      y0: headBase - HEAD_SZ,
      y1: headBase + (head.lines.length - 1) * head.lead + HEAD_SZ * 0.12,
    });
    if (deck) {
      deck.lines.forEach((ln, li) =>
        drawText(c, ln, x, deckBase + li * deck.lead, DECK_SZ, DARK, { weight: 0.9, silent: true }),
      );
      BOXES.push({
        label: `deck ${s.n}`,
        x0: x,
        x1: x + CARD_W - 2,
        y0: deckBase - DECK_SZ,
        y1: deckBase + (deck.lines.length - 1) * deck.lead + DECK_SZ * 0.12,
      });
    }
  });

  // -------------------------------------------------------------------------
  // Twelve briefs: two columns of six, keyword and sentence at reading size.
  // -------------------------------------------------------------------------

  let by = briefsTop;
  for (let r = 0; r < BRIEF_ROWS; r++) {
    for (let k = 0; k < BRIEF_COLS; k++) {
      const it = typed[r * BRIEF_COLS + k];
      if (!it) continue;
      const x = M + k * (BRIEF_W + BRIEF_COL_GAP);
      const base = by + BRIEF_SZ;
      // Full ink, not the lighter body grey: at a third of the sheet's size the
      // difference is the sentence being there or not.
      drawText(c, it.kw, x, base, BRIEF_KEY, INK, { weight: 1.5, tracking: 0.02 });
      drawText(c, it.lines[0], x + it.kwW, base, BRIEF_SZ, INK, { weight: 1.0 });
      for (let i = 1; i < it.lines.length; i++) {
        drawText(c, it.lines[i], x, base + i * BRIEF_LEAD, BRIEF_SZ, INK, { weight: 1.0 });
      }
    }
    by += rowH[r] + BRIEF_ROW_GAP;
  }
  if (briefsTop + briefsH > BRIEF_BOTTOM + 0.01) fail('the brief column runs past its foot');

  // Footer: who every dispatch came from, and where the pages are listed.
  rule(c, M, 952, CONTENT, INK, 2);
  drawText(
    c,
    'SOURCES, EACH A PAGE DATED 24 NOVEMBER 2026: CNBC · REUTERS VIA YAHOO · YAHOO NEWS · AP VIA GLOBE AND MAIL · GUARDIAN VIA AOL · VALOR · ANADOLU',
    M,
    964,
    6.6,
    MUTED,
    { tracking: 0.04 },
  );
  drawText(
    c,
    'UN NEWS · JORDAN NEWS · OUTLOOK · SPACE.COM · SINGAPORE MFA · THE NEWS · DAILY TIMES · AFP VIA EWN · DABANGA · ASIAONE · USNI · AEROSPACE · THE STAR',
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