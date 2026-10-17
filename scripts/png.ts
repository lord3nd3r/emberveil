/** Minimal RGBA PNG writer, so asset generators need no image dependency. */
import { deflateSync } from "node:zlib";

export type RGBA = [number, number, number, number];

export class Canvas {
  readonly data: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8Array(w * h * 4);
  }
  px(x: number, y: number, c: RGBA): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
  }
  at(x: number, y: number): RGBA {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  rect(x: number, y: number, w: number, h: number, c: RGBA): void {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.px(x + dx, y + dy, c);
  }
}

export function shade(c: RGBA, f: number): RGBA {
  return [
    Math.max(0, Math.min(255, Math.round(c[0] * f))),
    Math.max(0, Math.min(255, Math.round(c[1] * f))),
    Math.max(0, Math.min(255, Math.round(c[2] * f))),
    c[3],
  ];
}

/** Deterministic value noise, so regenerating assets never shuffles the texture. */
export function noise(x: number, y: number, seed = 0): number {
  let n = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

/**
 * A 16-bit style value ramp: one hue resolved into shadow/base/light/spec steps.
 * Sprites of this era get their depth from a small number of fixed steps rather than
 * smooth gradients, so everything here picks from a ramp instead of scaling freely.
 */
export function ramp(base: RGBA, steps = 5): RGBA[] {
  const factors = [0.52, 0.72, 1, 1.18, 1.34].slice(0, steps);
  return factors.map((f) => shade(base, f));
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));

/**
 * Ordered dither between two tones: the proportion of `b` ramps from top to bottom,
 * which is how 16-bit art fakes a gradient inside a tiny palette. `bias` shifts where
 * the ramp sits, so 0.5 is an even blend and lower values keep more of `a`.
 */
export function dither(c: Canvas, x: number, y: number, w: number, h: number, a: RGBA, b: RGBA, bias = 0.5): void {
  for (let dy = 0; dy < h; dy++) {
    const t = (h <= 1 ? 0.5 : dy / (h - 1)) * (bias * 2);
    for (let dx = 0; dx < w; dx++) {
      const threshold = BAYER[(y + dy) & 3][(x + dx) & 3];
      c.px(x + dx, y + dy, t > threshold ? b : a);
    }
  }
}

/** Wraps a drawn silhouette in a 1px line, which is what stops art reading as blocks. */
export function outline(c: Canvas, ox: number, oy: number, w: number, h: number, line: RGBA): void {
  const filled = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= c.w || y >= c.h) return false;
    return c.data[(y * c.w + x) * 4 + 3] > 0;
  };
  const edge: [number, number][] = [];
  for (let y = oy; y < oy + h; y++) {
    for (let x = ox; x < ox + w; x++) {
      if (filled(x, y)) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) edge.push([x, y]);
    }
  }
  for (const [x, y] of edge) c.px(x, y, line);
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

export function encodePng(c: Canvas): Uint8Array {
  const raw = new Uint8Array(c.h * (c.w * 4 + 1));
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * 4 + 1)] = 0;
    raw.set(c.data.subarray(y * c.w * 4, (y + 1) * c.w * 4), y * (c.w * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, c.w);
  hv.setUint32(4, c.h);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
